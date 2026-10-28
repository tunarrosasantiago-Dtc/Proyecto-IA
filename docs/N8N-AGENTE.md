# Agente de n8n + piloto con Moodle

Flujo completo:

```
Navegador → POST /api/agent (servidor KAIROS: sesión, origen, límite, lista de piloto)
          → Webhook n8n "asistente-academico" (exige la clave x-kairos-key)
          → Agente "Asistente Académico Moodle + Recursos"
                 └─ herramienta Moodle → subflujo "Moodle - Actividades del estudiante" → API REST de Moodle
          → Código "Separar texto y acciones" → Respond to Webhook → { texto, respuesta, acciones }
```

Los workflows corregidos están en la carpeta [`n8n/`](../n8n/).

## 1. Qué se corrigió en tus workflows

| Workflow / nodo | Antes | Ahora | Por qué |
|---|---|---|---|
| Web · Webhook | Sin autenticación, CORS `*` | **Header Auth** (`x-kairos-key`), sin CORS | Con la URL abierta cualquiera podía gastar tu cuota del modelo y consultar Moodle. La llamada la hace el servidor, no el navegador. |
| Web · Mensaje al agente | Solo `moodleUserId` y mensaje | Añade `candidatos` y `advertencias` del revisor local | El agente recibe la extracción ya hecha y no decide entre fechas ambiguas. |
| Web · Separar texto y acciones | Devolvía `respuesta` | Devuelve `texto` **y** `respuesta`; acepta ` ```acciones ` y `<acciones>` | El servidor KAIROS lee `texto` (y acepta `respuesta`). |
| Web · Responder | `JSON.stringify($json)` + cabecera CORS | `{{ $json }}`, sin CORS | Innecesario en llamada servidor a servidor. |
| Moodle · HTTP Request | "Simplified Custom Auth" (causaba el triángulo rojo), URL de ejemplo | Credencial **Query Auth** `wstoken`; `On Error: Continue` | Más simple y verificable; un fallo de red llega al agente como mensaje y no rompe el flujo. |
| Moodle · Formatear | `tipo` genérico (`examen`, `tarea`…) | Añade `codigo` (INF…FIN), `nivel_importancia`, `dias_restantes`, `ponderacion: null`, `requiere_confirmacion` | Usa tu catálogo de nueve tipos. Limpia sufijos de Moodle ("vence", "is due"). Si solo se clasificó por el módulo, pide confirmar. |

`ponderacion` va en `null` a propósito: el calendario de Moodle **no** informa cuánto vale cada actividad. No se inventa; el cálculo de prioridad renormaliza sin ese componente, como dice tu ficha.

## 2. Aplicar los cambios en n8n

Recomendado: **editar tus workflows en el lugar** (así el agente conserva la referencia a su subflujo). Cada cambio está completo en los JSON de `n8n/`; copia los valores de ahí.

**Workflow "Moodle - Actividades del estudiante"**
1. Nodo *Leer actividades próximas de Moodle*: URL = `https://TU-MOODLE/webservice/rest/server.php`. Authentication = *Generic Credential Type* → *Query Auth* → crea la credencial con **Name** `wstoken` y **Value** = el token (sección 3). *Settings → On Error* = *Continue (using regular output)*.
2. Nodo *Formatear actividades*: reemplaza el código por el de `n8n/Moodle - Actividades del estudiante.json`.

**Workflow "Web del estudiante - Chat con Asistente Académico"**
1. Nodo *Mensaje desde la web*: Authentication = *Header Auth* → credencial **Name** `x-kairos-key`, **Value** = el valor de `N8N_SHARED_SECRET`. Borra *Allowed Origins*.
2. Nodo *Asistente Académico*: cambia el campo Message por el del JSON.
3. Nodo *Separar texto y acciones*: reemplaza el código por el del JSON.
4. Nodo *Responder a la web*: Response Body = `{{ $json }}` y borra la cabecera `Access-Control-Allow-Origin`.
5. **Publish**.

**Agente** (no viaja en el JSON exportado; revísalo en la interfaz):
- La herramienta "Moodle actividades" debe apuntar al subflujo de Moodle y mapear `dias`.
- Sus instrucciones deben decir que las acciones propuestas van en un bloque ` ```acciones [ ... ] ``` ` al final, con objetos como `{"tipo":"actividad","actividad":"...","fecha_iso":"...","prioridad":82}`; y que no ejecute acciones con efectos sin confirmación.
- Debe indicar que la prioridad se calcula solo con la herramienta de priorización y que, si `requiere_confirmacion` es `true` o hay `advertencias`, pregunte al estudiante.

Si prefieres importar los JSON como workflows nuevos, vuelve a seleccionar el subflujo en la herramienta del agente, porque el ID cambia.

## 3. Token de Moodle (piloto de un solo usuario)

El token identifica **a una persona** y se comporta como su contraseña para la API. Opciones:
- *Preferencias → Seguridad → Claves de seguridad* → clave de "Moodle mobile web service" (si aparece).
- Con usuario y contraseña propios (no sirve si entras por Google/Microsoft/SSO; en ese caso pídelo al administrador):
  `curl -d "username=USUARIO" -d "password=CLAVE" -d "service=moodle_mobile_app" https://TU-MOODLE/login/token.php`
- Si Moodle responde `accessexception` en la prueba, la función `core_calendar_get_action_events_by_timesort` no está habilitada para el servicio: el administrador debe permitirla o la universidad no admite este acceso.

Guárdalo **solo** en la credencial de n8n. No lo pegues en el chat, el código ni GitHub. Si se expone, revócalo en la misma página de claves.

## 4. Variables en Render

| Variable | Valor |
|---|---|
| `N8N_WEBHOOK_URL` | `https://TU-N8N/webhook/asistente-academico` (URL de **Production**, no `webhook-test`) |
| `N8N_SHARED_SECRET` | Texto aleatorio de 32+ caracteres (`openssl rand -hex 32`); el mismo valor de la credencial `x-kairos-key` |
| `AGENT_ALLOWED_EMAILS` | **Tu correo de KAIROS** (varios, separados por comas). Ver advertencia. |

> **Advertencia del piloto.** Con un solo token, el agente lee el Moodle de *una* persona sin importar quién escribe en el chat. Si `AGENT_ALLOWED_EMAILS` queda vacío, **cualquier cuenta de KAIROS vería tus actividades de Moodle**. Mientras uses un token único, deja ahí solo las cuentas de quienes están autorizados a verlas. En esa lista el servidor compara el correo de la cuenta; las demás reciben "piloto, cuenta no habilitada".

## 5. Prueba paso a paso

**A. Subflujo de Moodle aislado.** En el workflow de Moodle, *Execute workflow* con entrada `{"moodleUserId":"piloto","dias":14}`.
- Esperado: nodo HTTP verde; *Formatear* devuelve `total` > 0 y `error: null`.
- Si `error` dice token inválido o `accessexception`, ver sección 3. Si dice `ENOTFOUND`, revisa la URL.

**B. Webhook con la clave.** Con el workflow publicado:
```bash
curl -s -X POST "https://TU-N8N/webhook/asistente-academico" \
  -H "Content-Type: application/json" -H "x-kairos-key: TU_SECRETO" \
  -d '{"mensaje":"¿Qué tengo pendiente en los próximos 14 días y qué debo hacer primero?","estudianteId":"prueba","sessionId":"prueba"}'
```
- Esperado: JSON con `texto` que menciona actividades reales de tu Moodle, y `acciones` (puede ir vacío).

**C. Seguridad del webhook.** Repite B **sin** el encabezado `x-kairos-key`: debe responder `403` (o `401`), nunca una respuesta del agente.

**D. Ambigüedad.** Mensaje: *"El taller es opcional pero vital para el parcial. Entrega 05/11/2026 (avance) y 10/11/2026, vale 15%"*.
- Esperado: el agente no elige una fecha por su cuenta, explica la contradicción y pide confirmar.

**E. Desde KAIROS.** Con las variables en Render y tu correo en `AGENT_ALLOWED_EMAILS`: inicia sesión → **Asistente** → acepta el aviso → repite la pregunta de B.
- Con otra cuenta no incluida en la lista: debe mostrar "cuenta aún no habilitada".

## 6. Límites conocidos

- Khan Academy no tiene API pública de tareas: ingreso manual o desde Teams/Classroom.
- Moodle por estudiante (un token por cuenta, cifrado) sigue pendiente; el piloto no lo sustituye.
- Recordatorios por correo: requieren servicio autorizado y confirmación del estudiante.
- El tiempo de espera total es de 55 s. Si n8n o Render están "dormidos", la primera respuesta puede tardar.
