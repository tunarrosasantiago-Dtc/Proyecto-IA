# Seguridad de KAIROS

## Protección incluida

- Cada usuario puede cambiar la contraseña verificando la actual; al hacerlo se cierran las demás sesiones. La eliminación de cuenta exige contraseña y la frase `ELIMINAR`, y quita el perfil, el plan y las sesiones.
- El modo instalable almacena recursos estáticos. El service worker excluye `/api/` y no cachea actividades, bitácoras ni respuestas privadas.

- Las contraseñas se guardan como derivaciones `scrypt`; nunca se devuelven en la API.
- Las consultas SQL usan parámetros y las operaciones del plan requieren una sesión autenticada. Cada lectura y escritura filtra por el identificador de la cuenta de esa sesión.
- Las sesiones se guardan en PostgreSQL y usan cookies `HttpOnly`, `SameSite=Lax` y `Secure` en producción.
- Las solicitudes que modifican datos validan el origen; la autenticación limita intentos y el servidor limita el cuerpo recibido.
- La API evita almacenar respuestas privadas en la caché del navegador. Se aplican CSP, protección contra marcos, `nosniff` y otras cabeceras.
- GitHub Actions ejecuta auditorías de dependencias y Dependabot propone actualizaciones.

## Al publicar

1. Configura únicamente secretos en el panel del proveedor: `DATABASE_URL` y `SESSION_SECRET`. No los guardes en GitHub, capturas, mensajes ni archivos compartidos.
2. Usa la URL interna de PostgreSQL del proveedor y mantén la base fuera del acceso público cuando sea posible.
3. Mantén `APP_ORIGIN` igual al dominio HTTPS desde el que se usa la aplicación. Si cambia el dominio, actualiza la variable y vuelve a desplegar.
4. Configura una base de datos persistente con copias de seguridad antes de guardar información real. Los planes gratuitos pueden caducar, suspenderse o carecer de copias.
5. El prototipo aún no tiene verificación de correo, recuperación de contraseña por email ni revisión de seguridad independiente. No hay servicio de correo transaccional conectado.

## Asistente de IA (opcional)

- `N8N_WEBHOOK_URL` y `N8N_SHARED_SECRET` son secretos: solo en el panel del proveedor. El navegador nunca recibe la URL ni la clave de n8n.
- El texto del chat sale hacia n8n y el modelo de lenguaje configurado. No lo uses con información sensible y revisa la política de datos del proveedor del modelo antes de usar datos reales.
- Con un único token de Moodle (piloto), el agente consulta los datos de una sola persona para quien lo use. Define `AGENT_ALLOWED_EMAILS` con las cuentas autorizadas; vacío significa que todas las cuentas podrían ver esos datos. El token de Moodle se guarda solo como credencial de n8n y se revoca desde *Claves de seguridad* si se expone.
- El webhook de n8n exige la cabecera `x-kairos-key`; no lo dejes abierto ni con CORS `*`.
- La respuesta del agente se trata como no confiable: se muestra con `textContent` y el servidor limita su tamaño y número de acciones. Ninguna acción se ejecuta sin confirmación.

## Reportar un problema

No publiques contraseñas, datos personales ni detalles que permitan explotar una vulnerabilidad en un issue público. Contacta de forma privada al propietario del repositorio y comparte los pasos para reproducir el problema sin incluir datos reales.
