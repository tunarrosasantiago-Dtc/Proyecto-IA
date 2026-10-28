/* Revisor local de instrucciones.
 * No es un modelo generativo ni envía texto a un servicio externo.
 * Extrae candidatos con reglas simples; el estudiante valida cada dato.
 */
(() => {
  "use strict";
  const fold = value => String(value || "").toLocaleLowerCase("es-CO").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const catalog = {
    INF: { label: "Información o aviso", level: 1, priorHours: 0.25 },
    ACT: { label: "Actividad de clase", level: 2, priorHours: 1 },
    TAR: { label: "Tarea", level: 3, priorHours: 2 },
    TAL: { label: "Taller", level: 3, priorHours: 3 },
    QUI: { label: "Quiz o evaluación corta", level: 4, priorHours: 1.5 },
    EXP: { label: "Exposición", level: 4, priorHours: 4 },
    PRO: { label: "Proyecto", level: 4, priorHours: 8 },
    PAR: { label: "Parcial o examen", level: 5, priorHours: 4 },
    FIN: { label: "Entrega final", level: 5, priorHours: 8 }
  };
  const typeRules = [
    ["FIN", /\b(entrega final|proyecto final|trabajo final|examen final)\b/],
    ["PAR", /\b(parcial|examen|sustentacion)\b/],
    ["QUI", /\b(quiz|prueba corta|evaluacion corta)\b/],
    ["EXP", /\b(exposicion|presentacion oral)\b/],
    ["PRO", /\b(proyecto)\b/],
    ["TAL", /\b(taller)\b/],
    ["ACT", /\b(actividad|ejercicio|lectura)\b/],
    ["INF", /\b(aviso|informacion|comunicado)\b/],
    ["TAR", /\b(tarea|trabajo escrito|entrega)\b/]
  ];
  const months = { enero:1, febrero:2, marzo:3, abril:4, mayo:5, junio:6, julio:7, agosto:8, septiembre:9, setiembre:9, octubre:10, noviembre:11, diciembre:12 };
  function isoDate(year, month, day) {
    const date = new Date(Number(year), Number(month)-1, Number(day), 18, 0, 0, 0);
    if (date.getFullYear() !== Number(year) || date.getMonth() !== Number(month)-1 || date.getDate() !== Number(day)) return null;
    return String(date.getFullYear())+"-"+String(date.getMonth()+1).padStart(2,"0")+"-"+String(date.getDate()).padStart(2,"0")+"T18:00";
  }
  function dateValue(raw) {
    let m = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (m) return isoDate(m[1],m[2],m[3]);
    m = raw.match(/^(\d{1,2})[.\/-](\d{1,2})(?:[.\/-](\d{2,4}))?$/);
    if (m) { if (!m[3]) return null; let year=Number(m[3]); if(year<100) year+=2000; return isoDate(year,m[2],m[1]); }
    m = raw.toLocaleLowerCase("es-CO").match(/^(\d{1,2})\s+de\s+([a-záéíóú]+)(?:\s+de\s+(\d{4}))?$/i);
    if (m && m[3] && months[fold(m[2])]) return isoDate(m[3],months[fold(m[2])],m[1]);
    return null;
  }
  function extractDates(text) {
    const re = /\b(\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[.\/-]\d{1,2}(?:[.\/-]\d{2,4})?|\d{1,2}\s+de\s+(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)(?:\s+de\s+\d{4})?)\b/gi;
    const results=[]; let match;
    while((match=re.exec(text))){
      const raw=match[1], start=match.index, context=text.slice(Math.max(0,start-48),Math.min(text.length,start+raw.length+48)), nearby=fold(context);
      const role=/\b(borrador|avance|preentrega|realimentacion|feedback|punto extra|opcional)\b/.test(nearby)?"Posible avance u opción":/\b(entrega final|fecha limite|vence|fecha de entrega|obligatorio)\b/.test(nearby)?"Posible fecha principal":"Fecha sin clasificar";
      if(!results.some(item=>item.raw.toLowerCase()===raw.toLowerCase())) results.push({raw,value:dateValue(raw),role,context:context.trim()});
    }
    return results;
  }
  function extractPercentages(text) {
    const re=/(\d{1,3}(?:[.,]\d+)?)\s*(%|por\s+ciento)/gi, results=[]; let match;
    while((match=re.exec(text))){
      const start=match.index, context=text.slice(Math.max(0,start-48),Math.min(text.length,start+match[0].length+48)), nearby=fold(context);
      const gradeCue=/\b(nota|corte|calificacion|ponderacion|pondera|pesa|vale|representa|porcentaje|peso)\b/.test(nearby);
      const extraPoint=/\bpuntos?\s+extra\b/.test(nearby), value=Number(match[1].replace(",","."));
      if(!results.some(item=>item.value===value&&item.context===context.trim())) results.push({raw:match[0],value,valid:gradeCue&&!extraPoint&&value>=0&&value<=100,context:context.trim()});
    }
    return results;
  }
  function extractHours(text) {
    const re=/(\d+(?:[.,]\d+)?)\s*(h|horas?|hrs?)\b/gi, results=[]; let match;
    while((match=re.exec(text))){
      const value=Number(match[1].replace(",","."));
      if(value>0&&value<=168&&!results.some(item=>item.value===value)) results.push({raw:match[0],value,context:text.slice(Math.max(0,match.index-38),Math.min(text.length,match.index+match[0].length+38)).trim()});
    }
    return results;
  }
  function analyze(sourceText) {
    const text=String(sourceText||"").trim(), normalized=fold(text);
    const type=typeRules.find(([,pattern])=>pattern.test(normalized));
    const dates=extractDates(text), percentages=extractPercentages(text), hours=extractHours(text), warnings=[];
    const optional=/\b(opcional|voluntari[oa]|no obligatorio)\b/.test(normalized);
    const critical=/\b(vital|indispensable|obligatori[oa]|critico|critica|imprescindible)\b/.test(normalized);
    if(dates.length>1) warnings.push("Aparecen varias fechas. Identifica en la fuente cuál es el plazo final y cuáles son avances o fechas opcionales.");
    if(dates.some(d=>d.role==="Posible avance u opción")&&dates.some(d=>d.role==="Posible fecha principal")) warnings.push("El texto mezcla fechas de avance y una posible fecha principal; no se elige ninguna automáticamente.");
    if(percentages.length>1) warnings.push("Aparecen varios porcentajes; confirma cuál corresponde a esta actividad y a qué corte pertenece.");
    if(percentages.some(p=>!p.valid)) warnings.push("Algún porcentaje no está claramente asociado a la nota o parece un punto extra; no lo tomaré como ponderación.");
    if(optional&&critical) warnings.push("El texto combina opcionalidad con importancia crítica. La palabra «opcional» no reduce automáticamente su prioridad.");
    if(optional&&!critical&&/\b(obligatori[oa]|requerid[oa])\b/.test(normalized)) warnings.push("El texto contiene instrucciones potencialmente contradictorias sobre si la actividad es opcional.");
    return {
      available:true,
      method:"reglas-locales",
      candidates:{
        category:type?[{value:type[0],label:type[0]+" · "+catalog[type[0]].label+" ("+catalog[type[0]].level+"/5)",context:"Tipo sugerido a partir del título y el texto."}]:[],
        dates,
        weights:percentages.filter(p=>p.valid),
        hours
      },
      warnings,
      signals:{optional,critical},
      message:"Revisión local orientativa. Ningún dato se guarda ni se confirma automáticamente."
    };
  }
  window.KairosAgent=Object.freeze({status:"local-review",catalog,analyzeActivityCandidates:async sourceText=>analyze(sourceText)});
})();
