(() => {
"use strict";
const $=s=>document.querySelector(s), $$=s=>Array.from(document.querySelectorAll(s));
let totalSeconds=Math.max(60,Math.min(240*60,Number(window.Electiva?.getState?.().settings?.focusMinutes||25)*60)),remaining=totalSeconds,timer=null,deadline=0,running=false,completedCycle=false,staged=[],alarmContext=null,planExportDays=[];
const app=()=>window.Electiva, state=()=>app().getState();
function pad(n){return String(n).padStart(2,"0")}
function dateKey(d){return d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate())}
function localInputDate(d){const p=new Intl.DateTimeFormat("en-CA",{timeZone:"America/Bogota",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(d).reduce((o,x)=>(o[x.type]=x.value,o),{});return p.year+"-"+p.month+"-"+p.day+"T"+p.hour+":"+p.minute}
function escapeHtml(v){return String(v||"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function renderFocus(){
 const st=state(),select=$("#focus-task"),old=select.value;
 const tasks=st.tasks.filter(t=>!t.done);
 select.innerHTML='<option value="">Sesión libre · sin actividad</option>'+tasks.map(t=>'<option value="'+escapeHtml(t.id)+'">'+escapeHtml(t.title)+'</option>').join("");
 if(old&&tasks.some(t=>t.id===old))select.value=old;
 const importSelect=$("#import-subject"),importOld=importSelect.value;
 importSelect.innerHTML=st.subjects.length?'<option value="">Elige una materia</option>'+st.subjects.map(x=>'<option value="'+escapeHtml(x.id)+'">'+escapeHtml(x.name)+'</option>').join(""):'<option value="">Crea una materia primero</option>';
 if(importOld&&st.subjects.some(x=>x.id===importOld))importSelect.value=importOld;
 $("#import-confirm").disabled=!importSelect.value;
 $("#focus-sound").checked=st.settings.focusSound!==false;
 if(document.activeElement!==$("#focus-custom-minutes"))$("#focus-custom-minutes").value=Math.round(totalSeconds/60);
 const sessions=st.focusSessions||[],today=dateKey(new Date()),todays=sessions.filter(s=>s.endedAt&&dateKey(new Date(s.endedAt))===today);
 const mins=todays.reduce((n,s)=>n+Number(s.minutes||0),0);
 $("#focus-today").textContent=mins+" min hoy";$("#focus-count").textContent=todays.length+" sesiones";
 const minsByTask={};sessions.forEach(s=>{if(s.taskId)minsByTask[s.taskId]=(minsByTask[s.taskId]||0)+Number(s.minutes||0)});
 $$(".task").forEach(card=>{const id=card.querySelector("[data-done]")?.dataset.done,meta=card.querySelector(".task-meta");if(id&&meta&&minsByTask[id]&&!meta.querySelector(".focus-total")){const span=document.createElement("span");span.className="focus-total";span.textContent="Estudio registrado: "+minsByTask[id]+" min";meta.append(span)}});
 $$(".subject").forEach(card=>{const del=card.querySelector("[data-delete-subject]"),group=del?.parentElement;if(group&&!group.querySelector("[data-edit-subject]")){const edit=document.createElement("button");edit.className="mini";edit.dataset.editSubject=del.dataset.deleteSubject;edit.textContent="Editar";group.insertBefore(edit,del)}});
 paintTimer();
}
function paintTimer(){
 const mins=Math.floor(remaining/60),secs=remaining%60,clock=$("#focus-clock");
 clock.textContent=pad(mins)+":"+pad(secs);clock.style.setProperty("--timer-angle",Math.round((totalSeconds?1-remaining/totalSeconds:0)*360)+"deg");clock.setAttribute("aria-label",pad(mins)+" minutos y "+pad(secs)+" segundos restantes");
 const started=remaining<totalSeconds&&!completedCycle,mini=$("#focus-mini");
 $("#focus-start").textContent=running?"Pausar":(completedCycle?"Empezar de nuevo":(started?"Continuar":"Iniciar sesión"));
 $("#focus-stop").disabled=(!started&&!running)||completedCycle;$("#focus-reset").disabled=running&&remaining===totalSeconds;
 $("#focus-task").disabled=running||started;$("#focus-custom-minutes").disabled=running||started;$("#focus-apply").disabled=running||started;
 $$("[data-focus-minutes]").forEach(b=>{b.disabled=running||started;b.classList.toggle("selected",Number(b.dataset.focusMinutes)*60===totalSeconds)});
 $("#focus-state").textContent=running?"EN MARCHA":(completedCycle?"BLOQUE COMPLETADO":(started?"EN PAUSA":"LISTO PARA EMPEZAR"));$("#focus-state").classList.toggle("running",running);
 mini.hidden=!running&&(!started||completedCycle);$("#focus-mini-time").textContent=pad(mins)+":"+pad(secs);mini.classList.toggle("is-running",running);
 document.title=running?pad(mins)+":"+pad(secs)+" · En concentración":(completedCycle?"¡Bloque completado! · KAIROS · Ciencias de Datos":"KAIROS · Ciencias de Datos · Organizador académico");
}
function setDuration(minutes){if(running||remaining<totalSeconds)return;const n=Math.round(Number(minutes));if(!Number.isFinite(n)||n<1||n>240){app().toast("Elige entre 1 y 240 minutos.");return}totalSeconds=n*60;remaining=totalSeconds;completedCycle=false;$("#focus-custom-minutes").value=n;state().settings.focusMinutes=n;app().save();$("#focus-message").textContent="Bloque preparado para "+n+" minutos.";paintTimer()}
async function prepareAudio(){const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)return false;if(!alarmContext)alarmContext=new Audio();if(alarmContext.state==="suspended")await alarmContext.resume();return alarmContext.state==="running"}
async function playAlarm(){try{if(!await prepareAudio()){app().toast("Este navegador no permite reproducir la alarma.");return}const now=alarmContext.currentTime;[880,660,880,1046].forEach((hz,i)=>{const start=now+i*.48,osc=alarmContext.createOscillator(),gain=alarmContext.createGain();osc.type="sine";osc.frequency.setValueAtTime(hz,start);gain.gain.setValueAtTime(.0001,start);gain.gain.exponentialRampToValueAtTime(.18,start+.035);gain.gain.exponentialRampToValueAtTime(.0001,start+.34);osc.connect(gain);gain.connect(alarmContext.destination);osc.start(start);osc.stop(start+.36)})}catch(e){app().toast("No pude reproducir el sonido. Usa “Probar sonido” para comprobar el audio.")}}
function finishSession(completed){
 if(running)remaining=Math.max(0,Math.ceil((deadline-Date.now())/1000));
 if(timer){clearInterval(timer);timer=null}
 running=false;completedCycle=completed;
 const elapsed=Math.floor((totalSeconds-remaining)/60),st=state();
 if(elapsed>=1){st.focusSessions=st.focusSessions||[];st.focusSessions.push({id:app().uid(),taskId:$("#focus-task").value||null,minutes:elapsed,plannedMinutes:Math.round(totalSeconds/60),completed,endedAt:new Date().toISOString()});app().save()}
 if(completed&&st.settings.focusSound!==false)playAlarm();
 if(!completed)remaining=totalSeconds;app().render();
 $("#focus-message").textContent=completed?"¡Tiempo cumplido! Toma un respiro antes del siguiente bloque.":(elapsed>=1?"Sesión guardada. Puedes empezar otro bloque cuando quieras.":"Bloque terminado; duró menos de un minuto y no se registró.");
 if(elapsed>=1)app().toast(completed?"¡Bloque completado! Registré "+elapsed+" minutos.":"Sesión guardada: "+elapsed+" minutos.");else app().toast("La sesión fue demasiado corta para registrarla.");
}
function startOrPause(){
 if(running){remaining=Math.max(0,Math.ceil((deadline-Date.now())/1000));if(remaining===0){finishSession(true);return}clearInterval(timer);timer=null;running=false;paintTimer();$("#focus-message").textContent="En pausa. Continúa cuando quieras.";return}
 prepareAudio().catch(()=>{});if(completedCycle){remaining=totalSeconds;completedCycle=false}if(remaining<=0)remaining=totalSeconds;
 running=true;deadline=Date.now()+remaining*1000;paintTimer();$("#focus-message").textContent="Tu bloque está en marcha. Puedes cambiar de pantalla; el tiempo seguirá corriendo.";
 if(timer)clearInterval(timer);timer=setInterval(()=>{remaining=Math.max(0,Math.ceil((deadline-Date.now())/1000));paintTimer();if(remaining===0)finishSession(true)},200);
}
function bindFocus(){
 $$("[data-focus-minutes]").forEach(b=>b.addEventListener("click",()=>setDuration(b.dataset.focusMinutes)));
 $("#focus-apply").addEventListener("click",()=>setDuration($("#focus-custom-minutes").value));
 $("#focus-custom-minutes").addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();setDuration(e.target.value)}});
 $("#focus-start").addEventListener("click",startOrPause);
 $("#focus-stop").addEventListener("click",()=>finishSession(false));
 $("#focus-reset").addEventListener("click",()=>{if(running)remaining=Math.max(0,Math.ceil((deadline-Date.now())/1000));if(remaining<totalSeconds&&!confirm("¿Reiniciar el bloque y descartar los minutos que llevas? Para guardarlos, pulsa Guardar."))return;if(timer){clearInterval(timer);timer=null}running=false;completedCycle=false;remaining=totalSeconds;paintTimer();$("#focus-message").textContent="Temporizador reiniciado."});
 $("#focus-sound").addEventListener("change",e=>{state().settings.focusSound=e.target.checked;app().save();app().toast(e.target.checked?"Alarma activada.":"Alarma desactivada.")});
 $("#focus-test-alarm").addEventListener("click",playAlarm);
 $("#focus-mini").addEventListener("click",()=>{app().switchView("dashboard");setTimeout(()=>$("#focus-card").scrollIntoView({behavior:"smooth",block:"center"}),80)});
 document.addEventListener("visibilitychange",()=>{if(running&&document.visibilityState==="visible"){remaining=Math.max(0,Math.ceil((deadline-Date.now())/1000));paintTimer();if(!remaining)finishSession(true)}});
 window.addEventListener("pageshow",()=>{if(running){remaining=Math.max(0,Math.ceil((deadline-Date.now())/1000));paintTimer();if(!remaining)finishSession(true)}});
}

function parseCsv(text){
 const first=text.split(/\r?\n/,1)[0]||"",delimiter=(first.match(/;/g)||[]).length>(first.match(/,/g)||[]).length?";":",",rows=[];let row=[],cell="",quote=false;
 for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quote&&text[i+1]==='"'){cell+='"';i++}else quote=!quote}else if(c===delimiter&&!quote){row.push(cell);cell=""}else if((c==="\n"||c==="\r")&&!quote){if(c==="\r"&&text[i+1]==="\n")i++;row.push(cell);if(row.some(x=>x.trim()))rows.push(row);row=[];cell=""}else cell+=c}
 row.push(cell);if(row.some(x=>x.trim()))rows.push(row);return rows;
}
function norm(s){return String(s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"").trim()}
function column(headers,names){return headers.findIndex(h=>names.includes(norm(h)))}
function parseHumanDate(raw){
 const s=String(raw||"").trim();if(!s)return "";
 let m=s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})(?:[ ,T]+(\d{1,2}):(\d{2}))?$/);
 if(m)return m[3]+"-"+pad(m[2])+"-"+pad(m[1])+"T"+pad(m[4]||23)+":"+pad(m[5]||59);
 m=s.match(/^(\d{4})-(\d{2})-(\d{2})$/);if(m)return m[1]+"-"+m[2]+"-"+m[3]+"T23:59";
 const d=new Date(s);return isNaN(d.getTime())?"":localInputDate(d);
}
function parseIcsDate(raw){
 if(!raw)return "";
 const v=String(raw).trim(),m=v.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/);
 if(!m){return parseHumanDate(v)}
 if(!m[4])return m[1]+"-"+m[2]+"-"+m[3]+"T23:59";
 if(m[7])return localInputDate(new Date(Date.UTC(Number(m[1]),Number(m[2])-1,Number(m[3]),Number(m[4]),Number(m[5]),Number(m[6]||0))));
 return m[1]+"-"+m[2]+"-"+m[3]+"T"+m[4]+":"+m[5];
}
function decodeIcs(s){return String(s||"").replace(/\\n/gi," · ").replace(/\\,/g,",").replace(/\\;/g,";").replace(/\\\\/g,"\\").trim()}
function parseIcs(text){
 const lines=text.replace(/\r\n/g,"\n").replace(/\r/g,"\n").split("\n"),unfolded=[];
 lines.forEach(line=>{if(/^[ \t]/.test(line)&&unfolded.length)unfolded[unfolded.length-1]+=line.slice(1);else unfolded.push(line)});
 const events=[];let e=null;
 unfolded.forEach(line=>{if(line==="BEGIN:VEVENT"||line==="BEGIN:VTODO"){e={};return}if(line==="END:VEVENT"||line==="END:VTODO"){if(e)events.push(e);e=null;return}if(!e)return;const ix=line.indexOf(":");if(ix<0)return;const left=line.slice(0,ix),key=left.split(";")[0].toUpperCase(),value=line.slice(ix+1);e[key]=value});
 return events.map(e=>{const title=decodeIcs(e.SUMMARY),due=parseIcsDate(e.DUE||e.DTSTART),desc=decodeIcs(e.DESCRIPTION);return{title,due,weight:extractWeight(desc),hours:extractHours(desc),description:desc,sourceUrl:e.URL||""}}).filter(x=>x.title)
}
function extractWeight(text){const m=String(text||"").match(/(?:ponderaci[oó]n|peso|vale)?\s*(\d{1,3}(?:[.,]\d+)?)\s*%/i);return m?Number(m[1].replace(",",".")):null}
function extractHours(text){const m=String(text||"").match(/(?:duraci[oó]n|estimad[oa])\s*(\d+(?:[.,]\d+)?)\s*(?:h|horas?)/i);return m?Number(m[1].replace(",",".")):null}
function parseCsvEvents(text){
 const rows=parseCsv(text);if(rows.length<2)throw Error("El CSV no contiene filas de datos.");
 const h=rows[0],ti=column(h,["title","summary","subject","assignment","assignmentname","activity","actividad","tarea","nombre"]),di=column(h,["due","duedate","deadline","fecha","fechalimite","date","fechaentrega"]),wi=column(h,["weight","ponderacion","porcentaje","percentage","gradeweight"]),hi=column(h,["hours","horas","estimatedhours","tiempoestimado"]),si=column(h,["description","descripcion","notes","notas","details","detalle"]),ui=column(h,["url","link","enlace"]);
 if(ti<0)throw Error("No reconocí la columna de actividad/título del CSV.");
 const events=rows.slice(1).map(r=>{const due=di>=0?parseHumanDate(r[di]):"",rawWeight=wi>=0&&r[wi]?Number(r[wi].replace("%","").replace(",",".")):null,weight=Number.isFinite(rawWeight)&&rawWeight>=0&&rawWeight<=100?rawWeight:null,rawHours=hi>=0&&r[hi]?Number(r[hi].replace(",",".")):null;return{title:(r[ti]||"").trim(),due:due&&isFinite(new Date(due).getTime())?due:null,weight,hours:Number.isFinite(rawHours)&&rawHours>0?rawHours:null,description:si>=0?(r[si]||"").trim():"",sourceUrl:ui>=0?(r[ui]||"").trim():""}}).filter(x=>x.title);
 return {events,skipped:rows.length-1-events.length}
}
function parseCalendarFile(name,text){
 if(name.toLowerCase().endsWith(".ics"))return {events:parseIcs(text),skipped:0,kind:"ICS"};
 return Object.assign(parseCsvEvents(text),{kind:"CSV"})
}
function renderPreview(events,skipped,name){
 const box=$("#import-preview");box.hidden=false;
 const dup=events.filter(e=>state().tasks.some(t=>t.title.toLowerCase()===e.title.toLowerCase()&&(t.due||null)===(e.due||null)));
 const good=events.filter(e=>!dup.includes(e));staged=good.map(e=>({...e,fileName:name}));
 $("#import-message").textContent=(good.length?""+good.length+" actividad(es) detectadas":"No encontré actividades nuevas.")+(skipped?", "+skipped+" fila(s) sin título omitidas.":"")+(dup.length?", "+dup.length+" duplicado(s) omitidos.":"")+" Los campos sin fecha o peso siguen vacíos.";
 box.innerHTML=good.slice(0,18).map(e=>'<div class="preview-row"><b>'+escapeHtml(e.title)+'</b><small>'+(e.due?escapeHtml(new Intl.DateTimeFormat("es-CO",{timeZone:"America/Bogota",day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"}).format(app().academicDate(e.due))):"Sin fecha · no se asigna urgencia")+(e.weight===null?" · peso por confirmar":" · "+e.weight+"% por confirmar")+'</small></div>').join("")+(good.length>18?'<div class="preview-row"><b>+'+(good.length-18)+' más</b><small>Se importarán también</small></div>':"");
 $("#import-confirm").hidden=!good.length;$("#import-confirm").disabled=!$("#import-subject").value;
}
async function loadCalendar(file){
 if(!file)return;try{
  const parsed=parseCalendarFile(file.name,await file.text());
  if(!state().subjects.length){app().toast("Primero crea una materia para asignar las actividades.");return}
  renderPreview(parsed.events,parsed.skipped,file.name);if(parsed.kind==="ICS")$("#import-message").textContent+=" En eventos .ics uso la fecha DUE; si no existe, uso DTSTART.";
 }catch(e){$("#import-preview").hidden=true;$("#import-confirm").hidden=true;$("#import-message").textContent=e.message||"No pude leer ese archivo.";app().toast("No pude importar el archivo.")}
}
function bindImport(){
 $("#calendar-file").addEventListener("change",e=>loadCalendar(e.target.files[0]));
 $("#import-subject").addEventListener("change",()=>{$("#import-confirm").disabled=!$("#import-subject").value});
 $("#import-confirm").addEventListener("click",()=>{
  const sid=$("#import-subject").value;if(!sid||!staged.length)return;
  const st=state(),known=new Set(st.tasks.map(t=>t.title.toLowerCase()+"|"+t.due));let count=0;
  staged.forEach(e=>{const key=e.title.toLowerCase()+"|"+e.due;if(known.has(key))return;known.add(key);
   const missing=e.weight===null||!isFinite(e.weight);
   st.tasks.push({id:app().uid(),title:e.title,subjectId:sid,category:"TAR",due:e.due||null,weight:missing?null:e.weight,hours:e.hours&&isFinite(e.hours)?e.hours:app().estimateHoursForCategory("TAR").hours,optional:false,done:false,confirmed:false,imported:true,source:"Importado desde "+e.fileName+(e.due?". Fecha por verificar.":". El archivo no declara fecha.")+(missing?" Ponderación no indicada; queda vacía.":" Ponderación detectada; confirma el dato con la fuente.")+((e.description)?" "+e.description:"")+(e.sourceUrl?" "+e.sourceUrl:"")});
   count++;
  });
  app().save();app().render();staged=[];$("#calendar-file").value="";$("#import-preview").hidden=true;$("#import-confirm").hidden=true;$("#import-message").textContent="Importadas "+count+" actividad(es). Completa los datos y confirma cada una en Actividades → Por confirmar.";app().toast(count+" actividad(es) importadas para revisar.");
 });
 $("#import-backup").addEventListener("change",async e=>{const f=e.target.files[0];if(!f)return;try{if(f.size>2*1024*1024)throw Error("La copia supera el límite de 2 MB.");const data=JSON.parse(await f.text());if(!Array.isArray(data.tasks)||!Array.isArray(data.subjects))throw Error("El archivo no parece ser una copia válida de KAIROS.");if(!confirm("La copia reemplazará las materias, actividades y sesiones guardadas. ¿Continuar?"))return;data.settings=data.settings||{availableHours:5,reminders:true,changes:true};data.focusSessions=Array.isArray(data.focusSessions)?data.focusSessions:[];data.labEntries=Array.isArray(data.labEntries)?data.labEntries:[];app().replaceState(data);app().toast("Copia restaurada en tu cuenta.")}catch(err){app().toast(err.message||"No pude leer esa copia.")}finally{e.target.value=""}});
}
function bindSubjectEdit(){
 $("#add-subject").addEventListener("click",()=>{$("#subject-id").value="";$("#subject-modal-title").textContent="Nueva materia"},true);
 $("#subjects-list").addEventListener("click",e=>{const b=e.target.closest("[data-edit-subject]");if(!b)return;e.stopImmediatePropagation();const s=state().subjects.find(x=>x.id===b.dataset.editSubject);if(!s)return;$("#subject-form").reset();$("#subject-id").value=s.id;$("#subject-modal-title").textContent="Editar materia";$("#subject-name").value=s.name;$("#subject-grade").value=s.grade;$("#subject-modal").hidden=false;$("#subject-name").focus()},true);
 $("#subject-form").addEventListener("submit",e=>{const id=$("#subject-id").value;if(!id)return;e.preventDefault();e.stopImmediatePropagation();const st=state(),s=st.subjects.find(x=>x.id===id),name=$("#subject-name").value.trim();if(st.subjects.some(x=>x.id!==id&&x.name.toLowerCase()===name.toLowerCase())){app().toast("Esa materia ya está registrada.");return}s.name=name;s.grade=Number($("#subject-grade").value);app().save();$("#subject-modal").hidden=true;$("#subject-id").value="";app().render();app().toast("Materia actualizada.")},true);
}
function defaultWeekHours(total){
 const map={0:0,1:0,2:0,3:0,4:0,5:0,6:0},order=[1,2,3,4,5,6,0];
 let ticks=Math.max(0,Math.round((Number(total)||0)*2)),i=0;
 while(ticks>0){map[order[i%order.length]]+=.5;ticks--;i++}
 return map;
}
function ensureWeekHours(){
 const st=state(),current=st.settings.weekdayHours;
 if(!current||typeof current!=="object"||Array.isArray(current)){st.settings.weekdayHours=defaultWeekHours(st.settings.availableHours);app().save();return}
 let changed=false;
 for(let i=0;i<7;i++){if(!Number.isFinite(Number(current[i]))||Number(current[i])<0){current[i]=0;changed=true}else current[i]=Math.min(24,Number(current[i]))}
 if(changed)app().save();
}
function academicTodayStart(){const p=new Intl.DateTimeFormat("en-US",{timeZone:"America/Bogota",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date()).reduce((o,x)=>(o[x.type]=x.value,o),{});return new Date(Date.UTC(Number(p.year),Number(p.month)-1,Number(p.day),5))}
function dateDiff(a,b){const day=date=>{const p=new Intl.DateTimeFormat("en-US",{timeZone:"America/Bogota",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(date).reduce((o,x)=>(o[x.type]=x.value,o),{});return Date.UTC(Number(p.year),Number(p.month)-1,Number(p.day))};return Math.round((day(b)-day(a))/86400000)}
function dueOffset(base,task){if(!task.due)return 6;const date=app().academicDate(task.due);return date?dateDiff(base,date):6}
function fmtHours(n){return Number(n.toFixed(2)).toLocaleString("es-CO",{maximumFractionDigits:2})}
function optimizeDeadlineTasks(tasks,capacity,base,rank){
 const daySlots=capacity.map(hours=>Math.floor(Math.max(0,Number(hours)||0)*4+1e-8)),maxSlots=daySlots.reduce((sum,n)=>sum+n,0),sorted=tasks.slice().sort((a,b)=>dueOffset(base,a)-dueOffset(base,b)||rank(b)-rank(a));
 const dp=Array(maxSlots+1).fill(-Infinity),choices=[];dp[0]=0;
 for(let i=0;i<sorted.length;i++){
  const task=sorted[i],dueIndex=Math.max(0,Math.min(6,dueOffset(base,task))),allowed=daySlots.slice(0,dueIndex+1).reduce((sum,n)=>sum+n,0),cost=Math.max(1,Math.ceil(app().estimateHours(task)*4-1e-8)),value=Math.max(0,Number(rank(task))||0),chosen=new Uint8Array(maxSlots+1);
  for(let space=allowed;space>=cost;space--){if(dp[space-cost]===-Infinity)continue;const proposal=dp[space-cost]+value;if(proposal>dp[space]+1e-9){dp[space]=proposal;chosen[space]=1}}
  choices.push(chosen);
 }
 let best=0;for(let space=1;space<=maxSlots;space++)if(dp[space]>dp[best]+1e-9)best=space;
 const selected=new Set();let space=best;
 for(let i=sorted.length-1;i>=0;i--){if(choices[i][space]){selected.add(sorted[i]);space-=Math.max(1,Math.ceil(app().estimateHours(sorted[i])*4-1e-8))}}
 return selected;
}
function renderPlan(){
 ensureWeekHours();
 const st=state(),hours=st.settings.weekdayHours,base=academicTodayStart();
 const exportStart=$("#plan-export-start");if(document.activeElement!==exportStart)exportStart.value=st.settings.planExportStart||"09:00";
 const dates=Array.from({length:7},(_,i)=>new Date(base.getTime()+i*86400000));
 const total=dates.reduce((n,d)=>n+(Number(hours[d.getUTCDay()])||0),0);
 $("#plan-total-hours").textContent=fmtHours(total)+" h / 7 días";
 const dayLabels=dates.map(d=>new Intl.DateTimeFormat("es-CO",{timeZone:"America/Bogota",weekday:"short",day:"numeric",month:"short"}).format(d));
 $("#plan-days").innerHTML=dates.map((d,i)=>'<label class="plan-day-setting"><span>'+escapeHtml(dayLabels[i])+'</span><span class="plan-hour-control"><input type="number" min="0" max="24" step=".5" value="'+(Number(hours[d.getUTCDay()])||0)+'" data-day-hours="'+d.getDay()+'" aria-label="Horas disponibles el '+escapeHtml(dayLabels[i])+'"> <small>horas</small></span></label>').join("");
 const pending=st.tasks.filter(t=>!t.done),unconfirmed=pending.filter(t=>!t.confirmed).length,overdue=pending.filter(t=>t.confirmed&&t.due&&dueOffset(base,t)<0);
 const tasks=pending.filter(t=>t.confirmed&&(!t.due||(dueOffset(base,t)>=0&&dueOffset(base,t)<=6)));
 const capacity=dates.map(d=>Number(hours[d.getUTCDay()])||0),left=capacity.slice(),slots=dates.map(()=>[]),selected=optimizeDeadlineTasks(tasks,capacity,base,t=>app().ranking(t,st.settings.priorityMode));
 const planned=tasks.filter(t=>selected.has(t)).sort((a,b)=>dueOffset(base,a)-dueOffset(base,b)||app().ranking(b,st.settings.priorityMode)-app().ranking(a,st.settings.priorityMode));
 planExportDays=dates.map((date,i)=>({date,slots:slots[i]}));
 planned.forEach(t=>{
  const dueIndex=Math.max(0,Math.min(6,dueOffset(base,t)));let rem=app().estimateHours(t);
  for(let i=0;i<=dueIndex&&rem>.001;i++){while(left[i]>.001&&rem>.001){const block=Math.min(1.5,left[i],rem);slots[i].push({task:t,hours:block});left[i]-=block;rem-=block}}
 });
 const outstanding=tasks.filter(t=>!selected.has(t)).map(task=>({task,hours:app().estimateHours(task)}));
 const remaining=outstanding.reduce((n,x)=>n+x.hours,0);
 $("#plan-task-count").textContent=tasks.length+" actividad(es) · "+fmtHours(tasks.reduce((n,t)=>n+app().estimateHours(t),0))+" h estimadas";
 const status=$("#plan-status");
 if(!tasks.length)status.innerHTML='<b>Una semana más ligera</b><span>No hay actividades confirmadas con fecha próxima. Las actividades sin fecha, si existen, se planifican sin presión temporal.'+(overdue.length?' '+overdue.length+' actividad(es) vencidas requieren que revises la fecha.':'')+(unconfirmed?' '+unconfirmed+' actividad(es) por confirmar no se incluyen.':'')+'</span><button class="outline" data-go="tasks">Revisar actividades →</button>';
 else if(remaining>.001)status.innerHTML='<b>Algunas actividades no caben antes de su fecha</b><span>'+outstanding.length+' actividad(es), con '+fmtHours(remaining)+' h estimadas, quedan fuera de esta capacidad. Compara criterios, horas y fechas; ninguna entrega se reprograma automáticamente.'+(overdue.length?' '+overdue.length+' actividad(es) vencidas requieren revisión.':'')+(unconfirmed?' '+unconfirmed+' actividad(es) por confirmar quedan fuera.':'')+'</span><button class="outline" data-go="tasks">Revisar actividades →</button>';
 else status.innerHTML='<b>Las actividades seleccionadas caben antes de sus fechas</b><span>El criterio “'+escapeHtml(app().priorityModes[state().settings.priorityMode]||"Equilibrado")+'” elige una combinación que respeta las horas declaradas. Ajusta cualquier día para reflejar tu semana real.'+(overdue.length?' '+overdue.length+' actividad(es) vencidas requieren revisión.':'')+(unconfirmed?' '+unconfirmed+' actividad(es) por confirmar quedan fuera.':'')+'</span>';
 $("#plan-grid").innerHTML=dates.map((d,i)=>{
  const used=capacity[i]-left[i],items=slots[i].length?slots[i].map(s=>'<article class="plan-slot"><div><b>'+escapeHtml(s.task.title)+'</b><small>'+escapeHtml(st.subjects.find(x=>x.id===s.task.subjectId)?.name||"Materia")+' · '+fmtHours(s.hours)+' h</small></div><button class="mini" data-start-task="'+escapeHtml(s.task.id)+'">Enfocarme</button></article>').join(""):'<div class="plan-free">'+(capacity[i]?'Día libre para adelantar o descansar.':'Aún no asignaste horas disponibles.')+'</div>';
  return '<section class="card plan-day-card"><div class="plan-day-head"><div><small>DÍA '+(i+1)+'</small><h3>'+escapeHtml(dayLabels[i])+'</h3></div><strong>'+fmtHours(used)+' <small>/ '+fmtHours(capacity[i])+' h</small></strong></div><div class="plan-bar"><i style="width:'+(capacity[i]?Math.min(100,used/capacity[i]*100):0)+'%"></i></div><div class="plan-slots">'+items+'</div></section>';
 }).join("");
 if(tasks.length&&remaining>.001){
  $("#plan-grid").insertAdjacentHTML("beforeend",'<section class="plan-overflow"><b>Por ubicar: '+fmtHours(remaining)+' h</b><div>'+outstanding.map(x=>'<span>'+escapeHtml(x.task.title)+' · '+fmtHours(x.hours)+' h</span>').join("")+'</div></section>');
 }
}
function csvCell(value){return '"'+String(value??"").replace(/"/g,'""')+'"'}
function calendarDate(date){return pad(date.getMonth()+1)+"/"+pad(date.getDate())+"/"+date.getFullYear()}
function calendarTime(date){const h=date.getHours(),m=date.getMinutes();return pad((h%12)||12)+":"+pad(m)+" "+(h>=12?"PM":"AM")}
function exportPlanCsv(){
 const days=planExportDays.filter(day=>day.slots.length);if(!days.length){app().toast("Aún no hay sesiones ubicadas para exportar. Revisa actividades confirmadas y horas disponibles.");return}
 const startValue=$("#plan-export-start").value||"09:00",parts=startValue.split(":"),startMinutes=Number(parts[0])*60+Number(parts[1]);
 if(!Number.isFinite(startMinutes)||startMinutes<0||startMinutes>=1440){app().toast("Elige una hora de inicio válida.");return}
 state().settings.planExportStart=startValue;app().save();
 const rows=[["Subject","Start Date","Start Time","End Date","End Time","All Day Event","Description","Location","Private"]];let count=0;
 days.forEach(day=>{let cursor=startMinutes;day.slots.forEach((slot,index)=>{
  const begin=new Date(day.date);begin.setHours(0,cursor,0,0);const duration=Math.max(15,Math.round(Number(slot.hours)*60)),end=new Date(begin);end.setMinutes(end.getMinutes()+duration);
  const subject=state().subjects.find(item=>item.id===slot.task.subjectId)?.name||"Materia";
  const description="Materia: "+subject+"\nDuración planificada: "+fmtHours(slot.hours)+" h\nFecha límite registrada: "+(slot.task.due||"sin fecha")+"\nHorario propuesto: verifica que esta hora te sirva antes de importarlo.";
  rows.push([slot.task.title,calendarDate(begin),calendarTime(begin),calendarDate(end),calendarTime(end),"False",description,"","True"]);cursor+=duration+(index<day.slots.length-1?10:0);count++;
 })});
 const blob=new Blob(["\uFEFF"+rows.map(row=>row.map(csvCell).join(",")).join("\r\n")],{type:"text/csv;charset=utf-8"}),link=document.createElement("a");link.href=URL.createObjectURL(blob);link.download="horario-kairos-ciencias-datos-"+dateKey(new Date())+".csv";link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1500);app().toast("CSV descargado con "+count+" bloque(s). Puedes importarlo a Google Calendar.");
}
function rebalanceWeek(total){
 const st=state(),map=defaultWeekHours(total);
 st.settings.weekdayHours=map;
}
function bindPlan(){
 $("#plan-spread").addEventListener("click",()=>{const st=state(),total=Object.values(st.settings.weekdayHours).reduce((n,x)=>n+(Number(x)||0),0);st.settings.weekdayHours=defaultWeekHours(total);st.settings.availableHours=total;app().save();app().render();app().toast("Horas distribuidas entre los siete días.")});
 $("#plan-clear").addEventListener("click",()=>{if(!confirm("¿Dejar en cero tu disponibilidad de los siete días?"))return;const st=state();st.settings.weekdayHours={0:0,1:0,2:0,3:0,4:0,5:0,6:0};st.settings.availableHours=0;app().save();app().render();app().toast("Disponibilidad semanal reiniciada.")});
 $("#plan-export-start").addEventListener("change",e=>{if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(e.target.value)){e.target.value="09:00";return}state().settings.planExportStart=e.target.value;app().save();app().toast("Hora inicial guardada.")});
 $("#plan-export").addEventListener("click",exportPlanCsv);
 $("#plan-days").addEventListener("change",e=>{
  const input=e.target.closest("[data-day-hours]");if(!input)return;
  const day=Number(input.dataset.dayHours),st=state(),value=Math.max(0,Math.min(24,Number(input.value)||0));
  st.settings.weekdayHours[day]=value;st.settings.availableHours=Object.values(st.settings.weekdayHours).reduce((n,x)=>n+(Number(x)||0),0);
  app().save();app().render();app().toast("Disponibilidad semanal actualizada.");
 });
 $("#available-hours").addEventListener("change",e=>{
  rebalanceWeek(Math.max(0,Math.min(168,Number(e.target.value)||0)));
 },true);
 $("#plan-status").addEventListener("click",e=>{if(e.target.closest("[data-go=tasks]"))app().switchView("tasks")});
 $("#plan-grid").addEventListener("click",e=>{
  const button=e.target.closest("[data-start-task]");if(!button)return;
  $("#focus-task").value=button.dataset.startTask;app().switchView("dashboard");
  setTimeout(()=>$("#focus-card").scrollIntoView({behavior:"smooth",block:"center"}),80);
 });
}
function bindAll(){bindFocus();bindImport();bindSubjectEdit();bindPlan()}
window.renderEnhancements=()=>{renderFocus();renderPlan()};
function initializeEnhancements(){bindAll();window.renderEnhancements();window.__electivaEnhancementsReady=true}
if(document.readyState==="loading"){document.addEventListener("DOMContentLoaded",initializeEnhancements,{once:true})}else{initializeEnhancements()}
})();






