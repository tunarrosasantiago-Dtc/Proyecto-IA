# KAIROS — Organizador de Ciencias de Datos

Entorno de estudio para estudiantes de Ciencia de Datos: planifica materias y entregas, registra sesiones de enfoque y documenta experimentos en una bitácora privada. Incluye dos implementaciones del servidor: **Node.js + PostgreSQL** y **Python + PostgreSQL**. Ambas versiones comparten la misma interfaz y el mismo formato de datos.

## Versiones incluidas

- [`nodejs/`](nodejs/): servidor Express, registro e inicio de sesión, PostgreSQL, interfaz y lanzador de Windows.
- [`python/`](python/): servidor Python/Waitress con las mismas rutas de API, PostgreSQL y lanzador de Windows.
- [`ejemplos/`](ejemplos/): CSV de actividades para probar la importación de la aplicación y CSV de ejemplo para importar en Google Calendar.
- [`HISTORIAL-Y-PASOS.md`](HISTORIAL-Y-PASOS.md): resumen del desarrollo y pasos que se realizaron.

## Funciones actuales

- Registro e inicio de sesión por cuenta; cada usuario guarda sus propios datos en PostgreSQL.
- Materias con nota de contexto y actividades con fecha, ponderación, horas estimadas y confirmación manual.
- Índice oficial explicable KAIROS-P-1.0 y cinco criterios seleccionables para ordenar el plan; la fórmula P no cambia cuando se elige otro criterio. Categorías normalizadas: INF, ACT, TAR, TAL, QUI, EXP, PRO, PAR y FIN.
- Revisión local de instrucciones: propone candidatos de tipo, fechas, porcentajes y horas; señala contradicciones como «opcional» y «vital». Las propuestas requieren confirmación manual y no se envían a servicios externos (el chat del asistente es aparte y solo envía lo que escribas en él).
- Comparación de escenarios con una optimización por capacidad y fecha límite; muestra por actividad qué cabe y qué queda pendiente sin inventar una nota perdida. Las actividades sin fecha o ponderación conservan el dato como desconocido; el índice renormaliza solo componentes disponibles.
- Plan semanal editable por día, que distribuye actividades confirmadas en sesiones de hasta 90 minutos.
- Exportación del plan semanal como CSV con encabezados compatibles con la importación de Google Calendar. La persona elige la hora de inicio; el plan se ordena en secuencia con pausas breves.
- Temporizador de concentración configurable con pausa, continuación y alarma sonora.
- Importación local de calendarios `.ics` y actividades `.csv`; copia/restauración de datos.
- Materias y actividades de ejemplo para programación con pandas, estadística, SQL, aprendizaje automático y visualización. Los datos, notas, ponderaciones y fechas son ficticios.
- Cuaderno privado de experimentos con pregunta, fuente, método, métrica, resultado, límites y siguiente paso; permite editar, eliminar y exportar los registros como CSV.
- Cambio de contraseña con invalidación de otras sesiones y eliminación de cuenta verificada con contraseña y frase de confirmación.
- Aplicación web instalable (PWA) que almacena los recursos estáticos; el inicio de sesión, la bitácora y la sincronización requieren conexión.
- Asistente de IA (vista **Asistente**): chat que reenvía el mensaje y los candidatos del revisor local a un agente de n8n a través del servidor (`/api/agent`). Es opcional: sin `N8N_WEBHOOK_URL` y `N8N_SHARED_SECRET` queda desactivado. Al usarlo, el texto escrito en el chat sale hacia n8n y el modelo de lenguaje configurado; la interfaz pide aceptación antes del primer envío. Guía en [`docs/N8N-AGENTE.md`](docs/N8N-AGENTE.md). Las conexiones institucionales (Moodle, Teams, Classroom) todavía no están conectadas.

La integración con Google Calendar es por archivo CSV. El revisor de texto es determinista y local; no es todavía un modelo de IA ni una conexión institucional. Moodle, Canvas, Teams u otros portales institucionales no están conectados en vivo: eso requiere APIs oficiales y autorización de cada institución.

## Requisitos

- PostgreSQL instalado y ejecutándose.
- **Node.js** versión 20 o posterior para `nodejs/`.
- **Python** para `python/`; el lanzador crea un entorno virtual e instala las dependencias declaradas.

Crea una base PostgreSQL llamada `electiva_danzas` desde pgAdmin (**Databases → Create → Database**) o con `psql`. Las tablas de la aplicación se crean al iniciar el servidor; no las crees manualmente.

## Ejecutar la versión Node.js

1. Abre `nodejs/`.
2. Ejecuta `INICIAR-ELECTIVA.bat`. La primera vez prepara la configuración; completa en `.env` la conexión a PostgreSQL y guarda el archivo.
3. Vuelve a ejecutar el lanzador y deja abierta la ventana del servidor.
4. Abre <http://localhost:3000> y crea una cuenta.

Alternativa manual desde la carpeta `nodejs/`: duplica `.env.example` como `.env`, actualiza `DATABASE_URL`, `APP_ORIGIN` y `SESSION_SECRET`, ejecuta `npm install` y `npm start`.

## Publicar en internet con Render

El archivo [`render.yaml`](render.yaml) configura el servidor Node.js de esta carpeta como servicio web. El despliegue público necesita una base PostgreSQL alojada en internet; la PostgreSQL instalada en tu computador solo sirve para desarrollo local.

1. En Render crea una base PostgreSQL y elige su región. Copia la **Internal Database URL**; la aplicación debe conectarse por la red privada de Render.
2. En Render usa **New → Blueprint** y conecta este repositorio de GitHub. El asistente encuentra `render.yaml`; al solicitar `DATABASE_URL`, pega la Internal Database URL. Render genera `SESSION_SECRET` y conecta `APP_ORIGIN` a la URL pública del servicio.
3. Al terminar, abre la URL `onrender.com` y crea una cuenta. Si luego agregas un dominio propio, actualiza `APP_ORIGIN` con ese dominio en la configuración del servicio.
4. Render usa el plan web gratuito para esta demostración; puede tardar alrededor de un minuto en despertar después de inactividad. Para guardar información real a largo plazo, elige una base de datos con almacenamiento persistente y copias de seguridad, y revisa el precio que aparece en Render antes de crearla.

La base PostgreSQL gratuita de Render es temporal: vence a los 30 días y no incluye copias de seguridad. Úsala solo para probar la publicación; no guardes allí información académica real. El repositorio no incluye contraseñas ni claves de producción.

## Ejecutar la versión Python

1. Abre `python/`.
2. Ejecuta `INICIAR-PYTHON.bat`. La primera vez genera la configuración y abre `.env` para que completes la contraseña de PostgreSQL.
3. Guarda y cierra `.env`; vuelve a ejecutar el lanzador. Este crea `.venv`, instala requisitos y arranca el servidor.
4. Abre <http://localhost:3001> y crea una cuenta.

La versión Python reutiliza las tablas `app_users` y `planner_data` y usa una tabla separada para sus sesiones. Las dos versiones pueden convivir en puertos distintos.

## Probar importación y exportación

1. En la aplicación, abre **Conectar plataformas**.
2. Carga `ejemplos/plantilla-prueba-electiva.csv`, asigna una materia e importa las cuatro actividades.
3. En **Actividades**, revisa y confirma manualmente la fecha y la ponderación de cada actividad. Solo las confirmadas entran al plan.
4. Abre **Plan semanal**, asigna disponibilidad, elige la hora inicial y descarga el horario CSV.
5. Para probar en Google Calendar, en un computador abre **Configuración → Importar y exportar**, elige el CSV descargado, selecciona un calendario y pulsa **Importar**. También puedes probar la importación con `ejemplos/horario-prueba-google-calendar.csv`.

Los CSV de Google Calendar requieren encabezados en inglés. La importación crea eventos en el calendario elegido y no mantiene sincronización automática.

## Seguridad y datos

Los archivos `.env`, entornos virtuales, dependencias instaladas, cachés y bases de datos locales están excluidos del repositorio. No publiques tu contraseña de PostgreSQL ni copies tu `.env` a GitHub. Usa `.env.example` como plantilla y coloca tus propios datos solo en el `.env` local.

El servidor Node aplica límites a los intentos de registro e inicio de sesión, valida el origen de las solicitudes que cambian datos, protege las sesiones con cookies `HttpOnly` y `SameSite`, requiere HTTPS y un origen configurado al ejecutarse en producción, añade cabeceras de seguridad y evita guardar respuestas privadas de la API en caché. El servidor Python comparte las protecciones de origen, sesión y cabeceras, limita el tamaño de las solicitudes y ahora comprueba el origen al cerrar sesión. GitHub Actions revisa semanalmente las dependencias de Node.js y Python; Dependabot propone actualizaciones de dependencias y acciones.

Estas medidas reducen riesgos comunes, pero no sustituyen una auditoría de seguridad antes de almacenar información personal de una institución. Activa HTTPS, usa una base con copias de seguridad y define reglas de privacidad y recuperación de cuenta antes de invitar usuarios reales.

Consulta [SECURITY.md](SECURITY.md) para las pautas de despliegue, secretos y reporte de problemas.

Las materias, calificaciones, tareas y fechas de demostración son ficticias; verifica los datos académicos con tus docentes.
