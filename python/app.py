"""Servidor Python para KAIROS Ciencias de Datos.

Conserva la API usada por la interfaz web y guarda usuarios, sesiones y
planificacion en PostgreSQL. La primera version no incluye el agente de IA.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import logging
import os
import secrets
import threading
import time
import uuid
from collections import defaultdict, deque
from datetime import timedelta
from functools import wraps
from pathlib import Path
import re
from urllib.parse import urlsplit

from dotenv import load_dotenv
from flask import Flask, jsonify, request, send_from_directory
from flask.sessions import SessionInterface, SessionMixin
from itsdangerous import URLSafeSerializer
from psycopg import errors
from psycopg.types.json import Jsonb
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool
from werkzeug.datastructures import CallbackDict
from werkzeug.exceptions import BadRequest, RequestEntityTooLarge
from waitress import serve


BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"
load_dotenv(BASE_DIR / ".env")

PORT = int(os.getenv("PORT", "3001"))
APP_ENV = os.getenv("APP_ENV", "development").lower()
PRODUCTION = APP_ENV == "production"
HOST = os.getenv("HOST", "0.0.0.0" if PRODUCTION else "127.0.0.1")
APP_ORIGIN = os.getenv("APP_ORIGIN") or os.getenv("RENDER_EXTERNAL_URL") or f"http://localhost:{PORT}"
DATABASE_URL = os.getenv("DATABASE_URL", "")
SESSION_SECRET = os.getenv("SESSION_SECRET", "")
SESSION_LIFETIME = timedelta(hours=8)
MAX_BODY_BYTES = 2 * 1024 * 1024
DB_POOL_MAX = int(os.getenv("DB_POOL_MAX", "30"))
if not 5 <= DB_POOL_MAX <= 100:
    raise RuntimeError("DB_POOL_MAX debe estar entre 5 y 100.")
ORIGIN_PARTS = urlsplit(APP_ORIGIN)
if PRODUCTION and (ORIGIN_PARTS.scheme != "https" or not ORIGIN_PARTS.netloc or ORIGIN_PARTS.path not in ("", "/") or ORIGIN_PARTS.query or ORIGIN_PARTS.fragment):
    raise RuntimeError("APP_ORIGIN debe ser la URL HTTPS pública, sin ruta, parámetros ni fragmento.")
EXPECTED_ORIGIN = f"{ORIGIN_PARTS.scheme}://{ORIGIN_PARTS.netloc}".lower()

if not DATABASE_URL:
    raise RuntimeError("Configura DATABASE_URL en el archivo .env antes de iniciar.")
if len(SESSION_SECRET) < 32 or "REEMPLAZA_ESTO" in SESSION_SECRET:
    raise RuntimeError("Configura SESSION_SECRET con un secreto aleatorio de al menos 32 caracteres en .env.")

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("kairos")

pool = ConnectionPool(
    conninfo=DATABASE_URL,
    min_size=1,
    max_size=DB_POOL_MAX,
    timeout=10,
    kwargs={"row_factory": dict_row},
    open=False,
)


class PgSession(CallbackDict, SessionMixin):
    """Sesion Flask ligera cuyo contenido vive en PostgreSQL."""

    def __init__(self, initial=None, sid=None, new=False):
        def on_update(_session):
            _session.modified = True

        super().__init__(initial or {}, on_update)
        self.sid = sid or secrets.token_urlsafe(32)
        self.new = new
        self.modified = False


class PostgresSessionInterface(SessionInterface):
    cookie_name = "kairos.python.sid"

    def __init__(self, database_pool: ConnectionPool, secret: str):
        self.pool = database_pool
        self.serializer = URLSafeSerializer(secret, salt="kairos-python-postgres-session")

    def open_session(self, app, req):
        cookie = req.cookies.get(self.get_cookie_name(app))
        if not cookie:
            return PgSession(new=True)
        try:
            sid = self.serializer.loads(cookie)
        except Exception:
            return PgSession(new=True)
        try:
            with self.pool.connection() as conn:
                row = conn.execute(
                    "SELECT data FROM kairos_python_sessions WHERE sid = %s AND expires_at > NOW()",
                    (sid,),
                ).fetchone()
        except Exception:
            logger.exception("No se pudo consultar la sesion en PostgreSQL")
            raise
        if not row:
            return PgSession(new=True)
        return PgSession(row["data"], sid=sid)

    def save_session(self, app, sess, response):
        name = self.get_cookie_name(app)
        if not sess:
            if getattr(sess, "sid", None) and not getattr(sess, "new", False):
                with self.pool.connection() as conn:
                    conn.execute("DELETE FROM kairos_python_sessions WHERE sid = %s", (sess.sid,))
            response.delete_cookie(
                name,
                path=self.get_cookie_path(app),
                domain=self.get_cookie_domain(app),
                secure=self.get_cookie_secure(app),
                httponly=self.get_cookie_httponly(app),
                samesite=self.get_cookie_samesite(app),
            )
            return

        expires_at = "NOW() + (%s * INTERVAL '1 second')"
        with self.pool.connection() as conn:
            conn.execute(
                "INSERT INTO kairos_python_sessions(sid,data,expires_at) "
                f"VALUES (%s,%s,{expires_at}) "
                "ON CONFLICT (sid) DO UPDATE SET data=EXCLUDED.data, expires_at=EXCLUDED.expires_at",
                (sess.sid, Jsonb(dict(sess)), int(SESSION_LIFETIME.total_seconds())),
            )
        response.set_cookie(
            name,
            self.serializer.dumps(sess.sid),
            max_age=int(SESSION_LIFETIME.total_seconds()),
            expires=self.get_expiration_time(app, sess),
            httponly=self.get_cookie_httponly(app),
            secure=self.get_cookie_secure(app),
            samesite=self.get_cookie_samesite(app),
            path=self.get_cookie_path(app),
            domain=self.get_cookie_domain(app),
        )

    def regenerate(self, sess):
        old_sid = sess.sid
        sess.sid = secrets.token_urlsafe(32)
        sess.new = True
        sess.modified = True
        with self.pool.connection() as conn:
            conn.execute("DELETE FROM kairos_python_sessions WHERE sid = %s", (old_sid,))


app = Flask(__name__, static_folder=None)
app.config.update(
    SECRET_KEY=SESSION_SECRET,
    SESSION_COOKIE_NAME=PostgresSessionInterface.cookie_name,
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SECURE=PRODUCTION,
    SESSION_COOKIE_SAMESITE="Lax",
    SESSION_REFRESH_EACH_REQUEST=True,
    MAX_CONTENT_LENGTH=MAX_BODY_BYTES,
)
app.session_interface = PostgresSessionInterface(pool, SESSION_SECRET)


def public_user(row):
    return {"id": row["id"], "name": row["name"], "email": row["email"]}


def valid_email(value):
    return (
        isinstance(value, str)
        and len(value) <= 254
        and re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", value) is not None
    )


def password_hash(password: str) -> str:
    # Compatible con el formato scrypt$sal-hex$hash-hex usado por la version Node.
    salt = secrets.token_bytes(16).hex()
    key = hashlib.scrypt(
        password.encode("utf-8"),
        salt=salt.encode("ascii"),
        n=16384,
        r=8,
        p=1,
        dklen=64,
        maxmem=64 * 1024 * 1024,
    )
    return f"scrypt${salt}${key.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        algorithm, salt, expected_hex = stored.split("$", 2)
        if algorithm != "scrypt":
            return False
        expected = bytes.fromhex(expected_hex)
        actual = hashlib.scrypt(
            password.encode("utf-8"),
            salt=salt.encode("ascii"),
            n=16384,
            r=8,
            p=1,
            dklen=64,
            maxmem=64 * 1024 * 1024,
        )
        return hmac.compare_digest(expected, actual)
    except (ValueError, TypeError, UnicodeError):
        return False


def auth_required(fn):
    @wraps(fn)
    def wrapped(*args, **kwargs):
        if not session_data().get("user_id"):
            return jsonify(error="Inicia sesión para continuar."), 401
        return fn(*args, **kwargs)

    return wrapped


def session_data():
    # Flask's session proxy is obtained lazily to keep the custom DB interface explicit.
    from flask import session

    return session


def same_origin():
    origin = request.headers.get("Origin")
    allowed = bool(origin and origin.rstrip("/").lower() == EXPECTED_ORIGIN)
    if origin and not allowed and not PRODUCTION:
        try:
            requested = urlsplit(origin)
            loopback_hosts = {"localhost", "127.0.0.1", "::1"}
            requested_port = requested.port or (443 if requested.scheme.lower() == "https" else 80)
            configured_port = ORIGIN_PARTS.port or (443 if ORIGIN_PARTS.scheme.lower() == "https" else 80)
            allowed = (
                requested.scheme.lower() == ORIGIN_PARTS.scheme.lower()
                and requested_port == configured_port
                and requested.hostname in loopback_hosts
                and ORIGIN_PARTS.hostname in loopback_hosts
                and requested.path in ("", "/")
                and not requested.query
                and not requested.fragment
            )
        except ValueError:
            allowed = False
    if not allowed:
        return jsonify(error="Origen de solicitud no permitido."), 403
    return None


AUTH_ATTEMPTS = defaultdict(deque)
AUTH_LOCK = threading.Lock()
AUTH_WINDOW_SECONDS = 15 * 60
AUTH_MAX_ATTEMPTS = 12
AUTH_LIMITER_CHECKS = 0


def rate_limit_auth():
    global AUTH_LIMITER_CHECKS
    now = time.monotonic()
    key = request.remote_addr or "unknown"
    with AUTH_LOCK:
        AUTH_LIMITER_CHECKS += 1
        if AUTH_LIMITER_CHECKS % 128 == 0 or len(AUTH_ATTEMPTS) >= 10000:
            for address, queue in list(AUTH_ATTEMPTS.items()):
                while queue and now - queue[0] >= AUTH_WINDOW_SECONDS:
                    queue.popleft()
                if not queue:
                    AUTH_ATTEMPTS.pop(address, None)
            while len(AUTH_ATTEMPTS) >= 10000 and key not in AUTH_ATTEMPTS:
                AUTH_ATTEMPTS.pop(next(iter(AUTH_ATTEMPTS)))
        attempts = AUTH_ATTEMPTS[key]
        while attempts and now - attempts[0] >= AUTH_WINDOW_SECONDS:
            attempts.popleft()
        if len(attempts) >= AUTH_MAX_ATTEMPTS:
            return jsonify(error="Demasiados intentos. Espera unos minutos y prueba otra vez."), 429
        attempts.append(now)
    return None


def request_object():
    body = request.get_json(silent=True)
    return body if isinstance(body, dict) else {}


@app.get("/api/health")
def health():
    with pool.connection() as conn:
        conn.execute("SELECT 1")
    return jsonify(status="ok")


@app.post("/api/auth/register")
def register():
    rejected = same_origin() or rate_limit_auth()
    if rejected:
        return rejected
    body = request_object()
    name = str(body.get("name") or "").strip()
    email = str(body.get("email") or "").strip().lower()
    password = str(body.get("password") or "")
    if not 1 <= len(name) <= 80:
        return jsonify(error="Escribe un nombre de 1 a 80 caracteres."), 400
    if not valid_email(email):
        return jsonify(error="Escribe un correo electrónico válido."), 400
    if len(password) < 10 or len(password.encode("utf-8")) > 256:
        return jsonify(error="La contraseña debe tener al menos 10 caracteres."), 400

    user_id = str(uuid.uuid4())
    hashed = password_hash(password)
    try:
        with pool.connection() as conn:
            row = conn.execute(
                "INSERT INTO app_users(id,name,email,password_hash) VALUES (%s,%s,%s,%s) "
                "RETURNING id,name,email",
                (user_id, name, email, hashed),
            ).fetchone()
    except errors.UniqueViolation:
        return jsonify(error="Ese correo ya está registrado."), 409
    from flask import session

    app.session_interface.regenerate(session)
    session["user_id"] = user_id
    return jsonify(user=public_user(row)), 201


@app.post("/api/auth/login")
def login():
    rejected = same_origin() or rate_limit_auth()
    if rejected:
        return rejected
    body = request_object()
    email = str(body.get("email") or "").strip().lower()
    password = str(body.get("password") or "")
    if not valid_email(email) or not password or len(password.encode("utf-8")) > 256:
        return jsonify(error="Correo o contraseña incorrectos."), 401
    with pool.connection() as conn:
        row = conn.execute(
            "SELECT id,name,email,password_hash FROM app_users WHERE email=%s",
            (email,),
        ).fetchone()
    if not row or not verify_password(password, row["password_hash"]):
        return jsonify(error="Correo o contraseña incorrectos."), 401
    from flask import session

    app.session_interface.regenerate(session)
    session["user_id"] = row["id"]
    return jsonify(user=public_user(row))


@app.get("/api/auth/me")
@auth_required
def current_user():
    from flask import session

    user_id = session_data().get("user_id")
    with pool.connection() as conn:
        row = conn.execute(
            "SELECT id,name,email FROM app_users WHERE id=%s", (user_id,)
        ).fetchone()
    if not row:
        session.clear()
        return jsonify(error="La cuenta ya no existe."), 401
    return jsonify(user=public_user(row))


@app.post("/api/auth/logout")
@auth_required
def logout():
    rejected = same_origin()
    if rejected:
        return rejected
    from flask import session

    session.clear()
    return jsonify(ok=True)


@app.post("/api/auth/password")
@auth_required
def change_password():
    rejected = same_origin() or rate_limit_auth()
    if rejected:
        return rejected
    body = request_object()
    current = str(body.get("currentPassword") or "")
    new_password = str(body.get("newPassword") or "")
    user_id = session_data().get("user_id")
    if len(current.encode("utf-8")) > 256:
        return jsonify(error="La contraseña actual no es correcta."), 401
    if len(new_password) < 10 or len(new_password.encode("utf-8")) > 256:
        return jsonify(error="La nueva contraseña debe tener al menos 10 caracteres."), 400
    with pool.connection() as conn:
        row = conn.execute(
            "SELECT password_hash FROM app_users WHERE id=%s", (user_id,)
        ).fetchone()
    if not row or not verify_password(current, row["password_hash"]):
        return jsonify(error="La contraseña actual no es correcta."), 401
    with pool.connection() as conn:
        conn.execute(
            "UPDATE app_users SET password_hash=%s WHERE id=%s",
            (password_hash(new_password), user_id),
        )
        conn.execute(
            "DELETE FROM kairos_python_sessions WHERE data->>'user_id'=%s AND sid<>%s",
            (user_id, session_data().sid),
        )
        if conn.execute(
            "SELECT to_regclass('web_sessions') IS NOT NULL AS present"
        ).fetchone()["present"]:
            conn.execute(
                "DELETE FROM web_sessions WHERE sess->>'userId'=%s", (user_id,)
            )
    app.session_interface.regenerate(session_data())
    return jsonify(ok=True, message="Contraseña actualizada. Se cerraron las demás sesiones.")


@app.delete("/api/auth/account")
@auth_required
def delete_account():
    rejected = same_origin() or rate_limit_auth()
    if rejected:
        return rejected
    body = request_object()
    password = str(body.get("password") or "")
    if str(body.get("confirmation") or "") != "ELIMINAR":
        return jsonify(error="Escribe ELIMINAR para confirmar."), 400
    user_id = session_data().get("user_id")
    with pool.connection() as conn:
        row = conn.execute(
            "SELECT password_hash FROM app_users WHERE id=%s", (user_id,)
        ).fetchone()
    if not row or not verify_password(password, row["password_hash"]):
        return jsonify(error="La contraseña no es correcta."), 401
    with pool.connection() as conn:
        conn.execute(
            "DELETE FROM kairos_python_sessions WHERE data->>'user_id'=%s", (user_id,)
        )
        if conn.execute(
            "SELECT to_regclass('web_sessions') IS NOT NULL AS present"
        ).fetchone()["present"]:
            conn.execute(
                "DELETE FROM web_sessions WHERE sess->>'userId'=%s", (user_id,)
            )
        conn.execute("DELETE FROM app_users WHERE id=%s", (user_id,))
    session_data().clear()
    return jsonify(ok=True)


@app.get("/api/planner/state")
@auth_required
def get_planner_state():
    user_id = session_data().get("user_id")
    with pool.connection() as conn:
        row = conn.execute(
            "SELECT data FROM planner_data WHERE user_id=%s", (user_id,)
        ).fetchone()
    return jsonify(data=row["data"] if row else None)


@app.put("/api/planner/state")
@auth_required
def put_planner_state():
    rejected = same_origin()
    if rejected:
        return rejected
    body = request_object()
    data = body.get("data")
    if (
        not isinstance(data, dict)
        or not isinstance(data.get("subjects"), list)
        or not isinstance(data.get("tasks"), list)
        or not isinstance(data.get("settings"), dict)
    ):
        return jsonify(error="Los datos de planificación no tienen un formato válido."), 400
    try:
        encoded = json.dumps(data, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    except (TypeError, ValueError):
        return jsonify(error="Los datos de planificación no tienen un formato válido."), 400
    if len(encoded) > MAX_BODY_BYTES:
        return jsonify(error="La copia de planificación supera el límite de 2 MB."), 413
    with pool.connection() as conn:
        conn.execute(
            "INSERT INTO planner_data(user_id,data,updated_at) VALUES (%s,%s,NOW()) "
            "ON CONFLICT(user_id) DO UPDATE SET data=EXCLUDED.data,updated_at=NOW()",
            (session_data().get("user_id"), Jsonb(data)),
        )
    return jsonify(ok=True)


PUBLIC_FILES = {
    "index.html", "styles.css", "ai-agent.js", "priority-engine.js", "auth-client.js", "app.js", "enhancements.js",
    "lab.js", "manifest.webmanifest", "service-worker.js", "icon-192.svg", "icon-512.svg",
    "icon-192.png", "icon-512.png",
    "fonts/inter-variable-latin.woff2", "fonts/poppins-400-latin.woff2",
    "fonts/poppins-500-latin.woff2", "fonts/poppins-600-latin.woff2",
    "fonts/poppins-700-latin.woff2", "fonts/poppins-800-latin.woff2",
}


@app.get("/")
@app.get("/<path:filename>")
def static_file(filename="index.html"):
    if filename not in PUBLIC_FILES:
        return jsonify(error="No encontrado."), 404
    response = send_from_directory(STATIC_DIR, filename)
    if filename == "service-worker.js":
        response.headers["Service-Worker-Allowed"] = "/"
        response.headers["Cache-Control"] = "no-cache"
    return response


@app.after_request
def security_headers(response):
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    response.headers.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
    response.headers.setdefault("Cross-Origin-Opener-Policy", "same-origin")
    response.headers.setdefault("Cross-Origin-Resource-Policy", "same-origin")
    if request.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-store"
        response.headers["Pragma"] = "no-cache"
    if PRODUCTION and request.is_secure:
        response.headers.setdefault("Strict-Transport-Security", "max-age=31536000")
    response.headers.setdefault(
        "Content-Security-Policy",
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; "
        "img-src 'self' data:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'"
        + ("; upgrade-insecure-requests" if PRODUCTION else ""),
    )
    return response


@app.errorhandler(RequestEntityTooLarge)
def too_large(_error):
    return jsonify(error="La solicitud supera el límite de 2 MB."), 413


@app.errorhandler(BadRequest)
def malformed_request(_error):
    return jsonify(error="La solicitud no tiene un formato válido."), 400


@app.errorhandler(Exception)
def unexpected_error(error):
    logger.exception("Error al atender solicitud: %s", error)
    return jsonify(error="Ocurrió un error del servidor. Inténtalo de nuevo."), 500


def initialize_database():
    with pool.connection() as conn:
        conn.execute(
            "CREATE TABLE IF NOT EXISTS app_users("
            "id TEXT PRIMARY KEY,name VARCHAR(80) NOT NULL,email VARCHAR(254) NOT NULL UNIQUE,"
            "password_hash TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())"
        )
        conn.execute(
            "CREATE TABLE IF NOT EXISTS planner_data("
            "user_id TEXT PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,"
            "data JSONB NOT NULL,updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())"
        )
        conn.execute(
            "CREATE TABLE IF NOT EXISTS kairos_python_sessions("
            "sid TEXT PRIMARY KEY,data JSONB NOT NULL,expires_at TIMESTAMPTZ NOT NULL)"
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS kairos_python_sessions_expiry_idx "
            "ON kairos_python_sessions(expires_at)"
        )
        conn.execute("DELETE FROM kairos_python_sessions WHERE expires_at <= NOW()")


def main():
    if PRODUCTION:
        from werkzeug.middleware.proxy_fix import ProxyFix

        # Trust only the single HTTPS proxy in front of the app (for example Render).
        app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1)
    pool.open()
    pool.wait(timeout=15)
    initialize_database()
    logger.info("KAIROS Ciencias de Datos disponible en http://%s:%s", HOST, PORT)
    logger.info("Concurrencia web: Waitress; conexiones PostgreSQL máx.: %s", pool.max_size)
    serve(app, host=HOST, port=PORT, threads=int(os.getenv("WEB_THREADS", "32")))


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        logger.info("Servidor detenido por el usuario.")
    except Exception as exc:
        logger.error("No pude iniciar el servidor: %s", exc)
        raise SystemExit(1) from exc
    finally:
        if pool.closed is False:
            pool.close()
