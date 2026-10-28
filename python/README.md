# KAIROS — Ciencias de Datos (Python)

Versión Python del organizador KAIROS para estudiantes de Ciencias de Datos. Incluye materias y actividades ficticias de Python/pandas, estadística, bases de datos, aprendizaje automático y visualización; planificador por cuenta, cronómetro con alarma, cinco modos de priorización, cuaderno privado de experimentos, controles de cuenta y aplicación instalable. Incluye el mismo revisor local de instrucciones que la versión Node.js; no es un modelo de IA conectado ni transmite texto.

El servidor Python sustituye a Express y conserva las rutas `/api` que usa la interfaz. Las cuentas y los planes se guardan en PostgreSQL usando las mismas tablas `app_users` y `planner_data`; la sesión del servidor Python usa su propia tabla `kairos_python_sessions`. La versión Node puede seguir en la misma carpeta original y usar la misma base de datos. Esta copia abre por defecto en el puerto **3001**, para que las dos versiones puedan convivir.

## Inicio rápido en Windows

1. Instala PostgreSQL y crea la base de datos `electiva_danzas` si todavía no existe. En pgAdmin: clic derecho en **Databases → Create → Database**, escribe `electiva_danzas` y guarda. No hace falta crear tablas manualmente.
2. Haz doble clic en `INICIAR-PYTHON.bat`.
3. La primera vez el programa genera automáticamente una clave de sesión y abre `.env` en el Bloc de notas. Reemplaza `TU_PASSWORD` por la contraseña de PostgreSQL. Guarda y cierra el archivo.
4. Ejecuta `INICIAR-PYTHON.bat` otra vez. El programa crea `.venv`, descarga las bibliotecas y arranca el servidor.
5. Abre **http://localhost:3001** en el navegador y crea tu cuenta.

Si la contraseña de PostgreSQL contiene caracteres especiales como `@`, `:` o `/`, codifícalos para URL dentro de `DATABASE_URL` (por ejemplo, `@` se escribe `%40`). Si tu usuario, servidor o nombre de base son distintos, actualiza también esa parte de `DATABASE_URL`. El archivo `.env` es privado y está excluido del ZIP.

## Abrir y trabajar en Visual Studio Code

Abre esta carpeta desde VS Code con **Archivo → Abrir carpeta…**. Selecciona `electiva-de-danzas-python`. También puedes abrir una terminal en esta carpeta y ejecutar `code .`.

Después de crear `.venv`, selecciona como intérprete `.venv\Scripts\python.exe` desde **Python: Select Interpreter**. El archivo `.vscode/launch.json` permite iniciar el servidor con **F5** una vez que `.env` esté configurado. El lanzador por lotes ofrece la ruta más sencilla para el uso normal.

## Variables de entorno

| Variable | Uso | Valor inicial |
| --- | --- | --- |
| `DATABASE_URL` | Conexión a PostgreSQL | `postgresql://postgres:TU_PASSWORD@localhost:5432/electiva_danzas` |
| `SESSION_SECRET` | Firma y protección de sesiones | Secreto aleatorio de al menos 32 caracteres |
| `APP_ORIGIN` | Protección contra solicitudes de otro sitio | `http://localhost:3001` |
| `HOST` y `PORT` | Dirección de escucha local | `127.0.0.1` y `3001` |
| `DB_POOL_MAX` | Conexiones PostgreSQL máximas | `30` |
| `WEB_THREADS` | Hilos HTTP de Waitress | `32` |

`preparar_configuracion.py` genera automáticamente un secreto aleatorio seguro cuando crea `.env`.

## Instalación manual

Desde esta carpeta, configura `.env` a partir de `.env.example` y ejecuta:

```powershell
py -3 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe app.py
```

La app crea las tablas necesarias al iniciar; no es necesario usar pgAdmin para crear las tablas a mano. El servidor informa un error claro si no logra conectarse a PostgreSQL.

## Capacidad y despliegue

Waitress ejecuta la aplicación con hilos y el pool de PostgreSQL reutiliza conexiones. Puede guardar más de 100 cuentas con uso normal; no se ha hecho una prueba de carga que garantice 100 conexiones simultáneas. DB_POOL_MAX permite ajustar el pool entre 5 y 100 (30 por defecto); no lo aumentes por encima del límite de conexiones de tu proveedor. Para publicar la aplicación a un grupo institucional se debe desplegar en un servidor con HTTPS, configurar APP_ENV=production, APP_ORIGIN con el dominio real, HOST=0.0.0.0 detrás de un proxy confiable, y dimensionar el pool y el número de hilos según el servidor. El equipo local no debe exponerse directamente a Internet.

En producción Python confía un solo proxy frontal para obtener la IP cliente y el protocolo HTTPS. Conserva ese límite: no configures `ProxyFix` para confiar todos los proxies ni expongas Waitress directamente a Internet. El servidor aplica límites de intentos de autenticación por IP, poda las entradas antiguas de ese limitador, rechaza contraseñas de inicio de sesión mayores al límite admitido, protege las respuestas de API contra caché y requiere el origen correcto también al cerrar sesión. Para producción, usa PostgreSQL con almacenamiento persistente y copias de seguridad; la base gratuita de Render caduca a los 30 días.

## Estructura

- `app.py`: autenticación, sesiones PostgreSQL, almacenamiento del plan, API y servidor Waitress.
- Interfaz web compartida con Node, con cuaderno de datos, exportación CSV y modo instalable.
- `requirements.txt`: dependencias Python.
- `.env.example`: plantilla de configuración; duplica como `.env` para uso local.
- `.vscode/launch.json`: configuración para depurar con VS Code.
- `INICIAR-PYTHON.bat`: prepara las dependencias la primera vez y ejecuta la app.

## Revisión de instrucciones y prioridad

En el editor de actividades puedes analizar localmente texto copiado desde un aula virtual. Se muestran candidatos de fechas, porcentajes, horas y categorías normalizadas; varias fechas, pesos o expresiones opuestas quedan señaladas para que revises la fuente. Seleccionar un candidato solo lo copia al formulario; todavía debes verificar y confirmar. El planificador compara combinaciones que caben según el criterio seleccionado y el tiempo disponible, sin estimar una nota perdida ni sumar porcentajes de materias distintas. El plan semanal también admite actividades confirmadas sin fecha límite, sin asignarles una fecha artificial.

## Prioridad y estimaciones

La pantalla Actividades explica los componentes I, U y W, el resultado P y la versión de la fórmula. Si falta una fecha o una ponderación confirmada, no asigna un valor ficticio: excluye el componente y renormaliza los pesos restantes. Las horas sugeridas usan el catálogo de tipos y se ajustan con sesiones de enfoque completadas, acercándose gradualmente al historial personal. Las alertas se muestran dentro de la aplicación; no envían correo ni notificaciones push.

## Exportar el horario semanal

Desde **Plan semanal** puedes descargar las sesiones propuestas como CSV compatible con la importación de Google Calendar. Elige una hora inicial; las sesiones se ordenan en secuencia con pausas breves. Revisa los horarios antes de importarlos: la app propone bloques y no sincroniza cambios en vivo.
