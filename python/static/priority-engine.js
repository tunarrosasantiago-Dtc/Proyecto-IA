(() => {
  "use strict";

  const VERSION = "KAIROS-P-1.0";
  const WEIGHTS = { importance: 0.45, urgency: 0.35, gradeWeight: 0.20 };
  const REFERENCE_WEIGHT = 30;
  const LEVELS = [
    { min: 0.8, label: "Crítica", icon: "🔴" },
    { min: 0.6, label: "Alta", icon: "🟠" },
    { min: 0.4, label: "Media", icon: "🟡" },
    { min: 0, label: "Baja", icon: "⚪" }
  ];
  const TYPE_LEVELS = { INF: 1, ACT: 2, TAR: 3, TAL: 3, QUI: 4, EXP: 4, PRO: 4, PAR: 5, FIN: 5 };
  const TYPE_HINTS = [
    [5, /\b(parcial|examen|prueba final|entrega final|proyecto final)\b/],
    [4, /\b(quiz|exposicion|presentacion|proyecto|sustentacion)\b/],
    [3, /\b(taller|tarea|trabajo|entrega)\b/],
    [2, /\b(actividad|ejercicio|lectura|practica)\b/],
    [1, /\b(aviso|informacion|comunicado)\b/]
  ];

  function fold(value) {
    return String(value || "").toLocaleLowerCase("es-CO").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }

  // datetime-local values are stored as Bogotá wall time (UTC-5), independent of the browser's zone.
  function academicDate(value) {
    if (!value) return null;
    const raw = String(value);
    const local = raw.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);
    const date = local
      ? new Date(Date.UTC(+local[1], +local[2] - 1, +local[3], +local[4] + 5, +local[5], +(local[6] || 0)))
      : new Date(raw);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function urgencyForDate(value, now = new Date()) {
    const due = academicDate(value);
    if (!due) return null;
    const hours = (due.getTime() - now.getTime()) / 3600000;
    if (hours <= 24) return { value: 1, hours };
    if (hours <= 48) return { value: 0.85, hours };
    if (hours <= 72) return { value: 0.70, hours };
    if (hours <= 168) return { value: 0.50, hours };
    if (hours <= 336) return { value: 0.25, hours };
    return { value: 0.10, hours };
  }

  function cautiousImportance(task, catalog) {
    const category = String(task.category || "TAR").toUpperCase();
    const chosen = Number(catalog?.[category]?.level || TYPE_LEVELS[category] || 3);
    if (task.confirmed) return { level: chosen, cautious: false, candidates: [category] };

    const text = fold([task.title, task.source].filter(Boolean).join(" "));
    const candidates = [chosen];
    const plausible = [];
    for (const [level, pattern] of TYPE_HINTS) {
      if (pattern.test(text)) {
        candidates.push(level);
        plausible.push(level);
      }
    }
    // If the type cannot be inferred safely, use the upper bound until the student reviews it.
    const level = plausible.length ? Math.max(...candidates) : chosen;
    return { level, cautious: true, candidates: plausible };
  }

  function calculate(task = {}, options = {}) {
    const catalog = options.catalog || {};
    const now = options.now instanceof Date ? options.now : new Date();
    const type = cautiousImportance(task, catalog);
    const importance = Math.max(0, Math.min(1, type.level / 5));
    const urgency = urgencyForDate(task.due, now);
    const numericWeight = task.weight === null || task.weight === undefined || task.weight === "" ? null : Number(task.weight);
    const weightConfirmed = task.confirmed === true || task.weightDeclared === true || task.weightConfirmed === true;
    const hasWeight = weightConfirmed && Number.isFinite(numericWeight) && numericWeight >= 0 && numericWeight <= 100;
    const gradeWeight = hasWeight ? Math.min(1, numericWeight / REFERENCE_WEIGHT) : null;

    const available = [["importance", importance, WEIGHTS.importance]];
    if (urgency) available.push(["urgency", urgency.value, WEIGHTS.urgency]);
    if (gradeWeight !== null) available.push(["gradeWeight", gradeWeight, WEIGHTS.gradeWeight]);
    const denominator = available.reduce((sum, item) => sum + item[2], 0);
    const score = available.reduce((sum, item) => sum + item[1] * item[2], 0) / denominator;
    const level = LEVELS.find(item => score >= item.min) || LEVELS[LEVELS.length - 1];

    return {
      version: VERSION,
      computedAt: now.toISOString(),
      score,
      percent: Math.round(score * 100),
      level: level.label,
      icon: level.icon,
      components: {
        importance: { value: importance, typeLevel: type.level, weight: WEIGHTS.importance, cautious: type.cautious, candidates: type.candidates },
        urgency: urgency ? { value: urgency.value, hoursUntilDue: urgency.hours, weight: WEIGHTS.urgency } : null,
        gradeWeight: gradeWeight === null ? null : { value: gradeWeight, declaredPercent: numericWeight, referencePercent: REFERENCE_WEIGHT, weight: WEIGHTS.gradeWeight }
      },
      missing: [!urgency ? "fecha límite" : null, gradeWeight === null ? "ponderación confirmada" : null].filter(Boolean),
      normalizedWeight: denominator,
      weightConfirmed
    };
  }

  const api = { VERSION, REFERENCE_WEIGHT, TYPE_LEVELS, academicDate, urgencyForDate, calculate };
  if (typeof window !== "undefined") window.KairosPriority = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
