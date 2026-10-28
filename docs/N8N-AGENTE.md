# Configurar el agente de n8n para KAIROS

El navegador **nunca** llama a n8n. El flujo es:

```
Navegador → POST /api/agent (servidor KAIROS, exige sesión) → Webhook de n8n → Agente → respuesta { texto, acciones }
```

El servidor KAIROS agrega la identidad del estudiante desde su sesión (`estudianteId` y `sessionId` = id de la cuenta) y firma la petición con una clave compartida. n8n solo acepta peticiones con esa clave.

## 1. Variables en Render (Environment)

| Variable | Valor |
|---|---|
| `N8N_WEBHOOK_URL` | URL de **Production** del webhook, `https://TU-N8N/webhook/kairos-chat` (no la de `webhook-test`) |
| `N8N_SHARED_SECRET` | Texto aleatorio largo (32+ caracteres). Genéralo con `openssl rand -hex 32` |

Sin estas variables el chat muestra "no configurado" y el resto de KAIROS sigue funcionando. En local, ponlas en `nodejs/.env`.

## 2. Nodo Webhook ("Mensaje desde la web")

- HTTP Method: `POST`
- Path: `kairos-chat`
- Authentication: **Header Auth**. Crea una credencial con Name `x-kairos-key` y Value = el mismo `N8N_SHARED_SECRET`.
- Respond: **Using 'Respond to Webhook' Node**
- No necesitas CORS: la llamada la hace el servidor, no el navegador.

Cuerpo que recibe (`$json.body`):

```json
{
  "mensaje": "texto del estudiante",
  "estudianteId": "uuid de la cuenta",
  "sessionId": "uuid de la cuenta",
  "candidatos": { "category": [], "dates": [], "weights": [], "hours": [] },
  "advertencias": ["..."]
}
```

`candidatos` y `advertencias` son la extracción del revisor local (`ai-agent.js`); pueden venir `null`.

## 3. Nodo del agente: campo Message

```
[estudianteId: {{ $json.body.estudianteId }}]
{{ $json.body.mensaje }}
Candidatos detectados por el revisor local: {{ JSON.stringify($json.body.candidatos) }}
Advertencias del revisor local: {{ JSON.stringify($json.body.advertencias) }}
```

Session ID de la memoria (Simple Memory): `{{ $json.body.sessionId }}`.

> `moodleUserId` **no** viaja desde KAIROS todavía: la app no guarda ese dato por cuenta. Ver "Pendiente" más abajo.

## 4. System Message del agente

```
Eres EduPriority, el asistente académico de KAIROS. Respondes siempre en español.

REGLAS
- No haces los trabajos del estudiante: orientas, organizas y priorizas.
- La prioridad se calcula SOLO con la herramienta de priorización (P = 0.45·I + 0.35·U + 0.20·W). No inventes prioridades, fechas ni ponderaciones.
- Si falta la ponderación, no la inventes: indica que el cálculo usa solo los datos disponibles.
- Si el texto es ambiguo (varias fechas, "opcional" y "vital" a la vez, porcentajes sin contexto), pregunta al estudiante antes de concluir.
- Explica siempre por qué una actividad es más importante que otra.
- Nunca ejecutes acciones con efectos (enviar correos, entregas) sin confirmación explícita.
- Si una herramienta falla, dilo; no inventes datos.

FORMATO DE SALIDA
Responde con texto para el estudiante. Si propones acciones, agrégalas AL FINAL en este bloque exacto:
<acciones>[{"tipo":"actividad","datos":[{"titulo":"...","curso":"...","vence":"2026-11-15T18:00","prioridad":82}]}]</acciones>
```

## 5. Nodo Code "Separar texto y acciones"

```javascript
const item = $input.first().json;
const salida = String(item.output ?? item.text ?? "");
const m = salida.match(/<acciones>([\s\S]*?)<\/acciones>/);
let acciones = [];
if (m) {
  try { const p = JSON.parse(m[1]); if (Array.isArray(p)) acciones = p; } catch (e) { /* bloque inválido: se ignora */ }
}
const texto = salida.replace(/<acciones>[\s\S]*?<\/acciones>/g, "").trim();
return [{ json: { texto, acciones } }];
```

## 6. Nodo Respond to Webhook

- Respond With: `JSON`
- Response Body (Expression): `{{ { texto: $json.texto, acciones: $json.acciones } }}`

Luego pulsa **Publish** en el workflow. La URL de producción solo responde con el workflow publicado.

## 7. Probar sin la web

```bash
curl -X POST "https://TU-N8N/webhook/kairos-chat" \
  -H "Content-Type: application/json" \
  -H "x-kairos-key: TU_SECRETO" \
  -d '{"mensaje":"¿Qué hago primero esta semana?","estudianteId":"prueba","sessionId":"prueba"}'
```

Debe devolver `{"texto":"...","acciones":[...]}`. Un `403` indica que la clave no coincide.

## Pendiente (decisiones tuyas)

1. **Moodle por estudiante.** Hoy el subflujo de Moodle no sabe de qué estudiante leer. Opciones: (a) piloto con un solo token de Moodle guardado en credenciales de n8n; (b) guardar por cuenta, cifrado y en el servidor, el token de cada estudiante. La (b) exige una tabla nueva y una pantalla para vincular; no se implementó sin conocer tu Moodle.
2. **Khan Academy** no tiene API pública de tareas: usar ingreso manual o importar desde Teams/Classroom.
3. **Recordatorios por correo**: requieren un servicio de correo autorizado y confirmación del estudiante.
