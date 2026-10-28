"""Crea la configuracion local y genera una clave de sesion segura."""

from pathlib import Path
import secrets

folder = Path(__file__).resolve().parent
env_file = folder / ".env"
example = folder / ".env.example"

if not env_file.exists():
    text = example.read_text(encoding="utf-8")
else:
    text = env_file.read_text(encoding="utf-8")

placeholder = "REEMPLAZA_ESTO_POR_UN_SECRETO_ALEATORIO_DE_32_CARACTERES_O_MAS"
if placeholder in text:
    text = text.replace(placeholder, secrets.token_urlsafe(48))

env_file.write_text(text, encoding="utf-8")
print(f"Configuracion lista: {env_file}")
