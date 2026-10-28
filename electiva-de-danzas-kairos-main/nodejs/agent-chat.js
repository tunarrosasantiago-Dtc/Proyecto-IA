/* Vista "Asistente" de KAIROS.
 * Se inyecta en la interfaz existente sin modificar app.js.
 * Todo el texto del modelo se muestra con textContent (nunca innerHTML).
 */
(() => {
  "use strict";
  const CONSENT_KEY = "kairos.agent.consent";
  const history = [];
  let busy = false;

  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };

  function init() {
    const nav = document.querySelector(".sidebar nav");
    const content = document.querySelector(".content");
    if (!nav || !content || document.getElementById("view-assistant")) return;

    // Botón de navegación
    const button = el("button", "nav");
    button.dataset.view = "assistant";
    button.append("✳ ", el("span", "", "Asistente"));
    const before = nav.querySelector('[data-view="subjects"]');
    nav.insertBefore(button, before || null);
    // Corrige el título de la barra superior (app.js solo conoce sus propias vistas)
    button.addEventListener("click", () => setTimeout(() => {
      const label = document.getElementById("page-label");
      if (label) label.textContent = "Asistente";
      focusInput();
    }, 0));

    // Vista
    const view = el("section", "view");
    view.id = "view-assistant";
    view.innerHTML = [
      '<div class="view-title"><div><small>AGENTE DE IA</small><h1>Asistente académico</h1>',
      "<p>Pregunta qué hacer primero, pide un plan de estudio o pega una instrucción para revisarla. El asistente orienta; tú decides.</p></div></div>",
      '<section class="card chat-card">',
      '<div id="chat-consent" class="chat-consent" hidden><b>Antes de empezar</b>',
      "<span>Al enviar un mensaje, su texto y los datos que KAIROS detecte en él se envían al agente de IA (n8n y el modelo de lenguaje configurado) para generar la respuesta. No pegues contraseñas ni datos personales de terceros.</span>",
      '<button id="chat-consent-ok" class="primary" type="button">Entiendo y acepto</button></div>',
      '<div id="chat-status" class="chat-status" role="status"></div>',
      '<div id="chat-log" class="chat-log" aria-live="polite"></div>',
      '<form id="chat-form" class="chat-form"><textarea id="chat-input" rows="2" maxlength="4000" placeholder="Ej. ¿Qué debería hacer primero esta semana?" aria-label="Mensaje para el asistente"></textarea>',
      '<button id="chat-send" class="primary" type="submit">Enviar</button></form>',
      '<p class="fine">El asistente puede equivocarse. Verifica fechas y ponderaciones en tu plataforma antes de decidir. Las acciones que proponga requieren tu confirmación.</p>',
      "</section>"
    ].join("");
    content.appendChild(view);

    const log = document.getElementById("chat-log");
    const form = document.getElementById("chat-form");
    const input = document.getElementById("chat-input");

    addBubble("assistant", "Hola, soy tu asistente académico. Puedo ayudarte a priorizar actividades, interpretar instrucciones ambiguas y proponer un plan de estudio. No hago tus trabajos.");

    const consent = document.getElementById("chat-consent");
    const consented = () => { try { return sessionStorage.getItem(CONSENT_KEY) === "1"; } catch { return false; } };
    consent.hidden = consented();
    document.getElementById("chat-consent-ok").addEventListener("click", () => {
      try { sessionStorage.setItem(CONSENT_KEY, "1"); } catch { /* sin almacenamiento */ }
      consent.hidden = true;
      input.focus();
    });

    form.addEventListener("submit", event => { event.preventDefault(); send(); });
    input.addEventListener("keydown", event => {
      if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); send(); }
    });

    checkStatus();
  }

  function focusInput() { const input = document.getElementById("chat-input"); if (input) input.focus(); }

  function setStatus(text, ok) {
    const box = document.getElementById("chat-status");
    if (box) { box.textContent = text; box.dataset.state = ok ? "ok" : "warn"; box.hidden = !text; }
    const side = document.getElementById("agent-status");
    if (side) side.textContent = ok ? "Conectado" : "Revisión local";
  }

  async function checkStatus() {
    try {
      const response = await fetch("/api/agent/status", { credentials: "same-origin" });
      if (!response.ok) return setStatus("", false);
      const data = await response.json();
      setStatus(data.configured ? "" : "El asistente aún no está configurado en el servidor. La revisión local de instrucciones sigue disponible en Actividades.", Boolean(data.configured));
    } catch { setStatus("", false); }
  }

  function addBubble(role, text) {
    const log = document.getElementById("chat-log");
    const bubble = el("div", "chat-bubble " + role);
    String(text || "").split(/\n{2,}/).forEach(part => { if (part.trim()) bubble.appendChild(el("p", "", part.trim())); });
    log.appendChild(bubble);
    log.scrollTop = log.scrollHeight;
    return bubble;
  }

  function addWarnings(bubble, warnings) {
    if (!warnings || !warnings.length) return;
    const box = el("div", "chat-warnings");
    box.appendChild(el("b", "", "Revisión local"));
    warnings.forEach(w => box.appendChild(el("span", "", w)));
    bubble.appendChild(box);
  }

  function describeAction(action) {
    const tipo = String(action.tipo || "acción");
    const datos = Array.isArray(action.datos) ? action.datos : [];
    if (!datos.length) return tipo;
    return tipo + ": " + datos.slice(0, 8).map(item => {
      if (item && typeof item === "object") {
        return [item.titulo || item.title || item.nombre, item.curso, item.vence ? "vence " + String(item.vence).slice(0, 10) : "", item.prioridad !== undefined ? "prioridad " + item.prioridad : ""].filter(Boolean).join(" · ");
      }
      return String(item);
    }).join(" | ");
  }

  function addActions(bubble, actions) {
    if (!actions || !actions.length) return;
    const box = el("div", "chat-actions");
    box.appendChild(el("b", "", "Propuestas del asistente"));
    actions.forEach(a => box.appendChild(el("span", "", describeAction(a))));
    box.appendChild(el("small", "", "Son sugerencias. Revísalas y regístralas tú en Actividades si estás de acuerdo."));
    bubble.appendChild(box);
  }

  async function send() {
    if (busy) return;
    const input = document.getElementById("chat-input");
    const sendButton = document.getElementById("chat-send");
    const text = input.value.trim();
    if (!text) return;
    try { if (sessionStorage.getItem(CONSENT_KEY) !== "1") { document.getElementById("chat-consent").hidden = false; return; } } catch { /* continuar */ }
    if (!window.KairosAgent || typeof window.KairosAgent.chat !== "function") { addBubble("error", "El asistente no está disponible en esta página."); return; }

    busy = true; sendButton.disabled = true; input.value = "";
    addBubble("user", text);
    const pending = addBubble("assistant pending", "Pensando…");
    try {
      const result = await window.KairosAgent.chat(text);
      pending.remove();
      const bubble = addBubble("assistant", result.texto || "No recibí una respuesta del asistente.");
      addActions(bubble, result.acciones);
      addWarnings(bubble, result.advertencias);
      history.push({ role: "user", text }, { role: "assistant", text: result.texto });
    } catch (error) {
      pending.remove();
      addBubble("error", error && error.message ? error.message : "No pude contactar al asistente.");
    } finally {
      busy = false; sendButton.disabled = false; input.focus();
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
