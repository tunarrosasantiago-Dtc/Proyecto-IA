# Historial y pasos realizados

Este documento resume las etapas que construyeron el proyecto y lo que queda conectado en esta entrega.

## Actualización KAIROS Ciencias de Datos — 25 de octubre de 2026

- Se sustituyeron los datos de demostración de Danzas por materias y actividades ficticias de Python/pandas, estadística, SQL, aprendizaje automático y visualización. Las cuentas vacías reciben el ejemplo una sola vez; las muestras antiguas solo se actualizan si no fueron modificadas. El resto de los datos personales se conserva.
- Se agregó un cuaderno de experimentos vinculado a cada cuenta, con campos para pregunta, fuente de datos, método, métrica, resultado, límites y siguiente paso. Los registros se pueden editar, eliminar y exportar como CSV.
- Se añadieron cambio de contraseña, invalidación de las otras sesiones y eliminación de cuenta con comprobación de contraseña.
- Se preparó el modo instalable (PWA), que almacena recursos estáticos para abrir la interfaz; el inicio de sesión y los datos privados siguen requiriendo conexión.
- Se actualizaron las interfaces Node y Python, los CSV de ejemplo y las guías.

1. **Base académica:** se partió de los materiales de tutoría académica y del proyecto sustentado de la electiva de danzas. Se diseñó la app alrededor de materias, actividades, notas de contexto, fechas de entrega y horas estimadas.
2. **Organización académica:** se añadieron tareas con confirmación manual, filtros, búsqueda, agenda, recomendación de prioridades y cinco sistemas seleccionables de priorización.
3. **Plan semanal:** se creó la disponibilidad por día, las acciones para repartir o limpiar horas y la propuesta de sesiones de hasta 90 minutos según fechas y carga.
4. **Cuenta y almacenamiento:** se añadió registro e inicio de sesión con contraseñas protegidas, sesiones persistidas y almacenamiento de datos por cuenta en PostgreSQL.
5. **Interfaz:** se incorporaron tema oscuro de alto contraste, tipografías locales Inter y Poppins, navegación entre vistas, controles interactivos y diseño adaptable.
6. **Concentración:** se añadió un temporizador con duración personalizada, pausa, continuación, reinicio, registro de sesiones y alarma sonora configurable.
7. **Datos y plataformas:** se incorporaron importación manual de archivos `.ics` y `.csv`, revisión de los datos antes de priorizar y copia/restauración JSON.
8. **Exportación del horario:** el plan semanal puede descargarse como CSV para abrir en Excel o importar a Google Calendar. Se elige la hora inicial; las sesiones se secuencian con pausas breves. No es una sincronización en vivo.
9. **Dos servidores:** se conservó la implementación Node.js/Express y se creó una implementación Python/Waitress, ambas compatibles con PostgreSQL y ejecutables en Windows con sus archivos `.bat`.
10. **Preparación para IA:** se dejó `ai-agent.js` como punto de extensión. No hay un modelo probabilístico ni proveedor de IA conectado; el análisis actual usa reglas locales y no transmite información académica.
11. **Preparación de publicación:** se documentaron requisitos, configuración y pasos de inicio; se añadieron CSV de prueba y reglas de Git para excluir secretos, dependencias, cachés y bases locales.
12. **Revisión de los cuatro documentos del proyecto:** se normalizaron nueve tipos de actividad, se añadió un revisor local de texto para extraer candidatos y señalar ambigüedad, y se reforzó la confirmación humana antes de usar datos.
13. **Optimización explicable:** los escenarios ahora seleccionan la combinación de actividades que mejor cabe según el criterio activo y la capacidad disponible; muestran por actividad qué queda fuera, sin calcular una nota perdida ficticia. La mejora se comparte entre Node.js y Python.
14. **Corrección de controles inactivos (24 de octubre de 2026):** se corrigió una comilla faltante en `app.js` que impedía ejecutar todo el archivo y conectar los botones del organizador. La inicialización ahora valida que los módulos principales estén activos antes de mostrar el panel y presenta el error si algo falla. También se permite el alias local `127.0.0.1`/`localhost` en desarrollo, manteniendo la validación estricta en producción.
15. **Preparación web y endurecimiento de seguridad (25 de octubre de 2026):** se añadió un Blueprint de Render para la versión Node.js, con HTTPS/origen de producción, secreto generado, base PostgreSQL configurada como variable privada y chequeo de salud. Se reforzaron las cabeceras y la política de caché; se limitaron solicitudes de inicio de sesión demasiado grandes; la versión Python ahora protege también el cierre de sesión, los encabezados detrás del proxy y la memoria del limitador. Se corrigió una dependencia Node.js señalada por `npm audit`; GitHub Actions y Dependabot revisan futuras dependencias vulnerables.

## Pendiente para integraciones institucionales

La conexión directa a Moodle, Canvas, Teams u otros sistemas requiere identificar la plataforma y versión, confirmar que la institución permite acceso por API y configurar OAuth o credenciales oficiales. Hasta que eso exista, la transferencia es manual mediante archivos de calendario.

## 2026-10 — Actualización con documentación académica

- Se incorpora KAIROS-P-1.0: índice explicable por importancia, urgencia y ponderación confirmada; los componentes ausentes no se inventan y el cálculo renormaliza los disponibles.
- Se muestran niveles, componentes y revisión de supuestos. Los cinco criterios ordenan el plan de forma independiente del índice fijo.
- El plan reconoce actividades sin fecha, estima horas desde el catálogo y ajusta los valores con sesiones personales registradas.
- Se añaden alertas dentro de la app, filtros por materia/tipo y estados reales de integración institucional; las notificaciones externas y conectores siguen pendientes de autorización.
- Se sincronizan las versiones Node.js, Python y Render con la misma interfaz.

## 2026-10-27 — Asistente conectado a n8n

- Se añadió la ruta `POST /api/agent` (exige sesión, valida origen, limita a 12 consultas por minuto, tiempo máximo de 55 s) que firma la petición con `N8N_SHARED_SECRET` y reenvía a `N8N_WEBHOOK_URL`. La identidad del estudiante sale de la sesión del servidor, no del navegador.
- `ai-agent.js` incorpora `chat()`; la revisión local sigue funcionando sin IA. Nueva vista **Asistente** (`agent-chat.js`) con aviso de privacidad y aceptación previa; las respuestas se muestran como texto, no como HTML.
- Se documentó la configuración de n8n en `docs/N8N-AGENTE.md`. Moodle por estudiante, Khan Academy y recordatorios por correo siguen pendientes.
- La versión `python/` no incluye este cambio.
