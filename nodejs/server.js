"use strict";
require("dotenv").config();
const path=require("path"),crypto=require("crypto"),express=require("express"),helmet=require("helmet"),rateLimit=require("express-rate-limit"),session=require("express-session"),connectPgSimple=require("connect-pg-simple"),{Pool}=require("pg");
const app=express();
const production=process.env.NODE_ENV==="production";
const port=Number(process.env.PORT||3000);
const host=process.env.HOST||(production?"0.0.0.0":"127.0.0.1");
const configuredOrigin=process.env.APP_ORIGIN||process.env.RENDER_EXTERNAL_URL||"";
const dbPoolMax=Number(process.env.DB_POOL_MAX||30);
if(!Number.isInteger(dbPoolMax)||dbPoolMax<5||dbPoolMax>100)throw new Error("DB_POOL_MAX debe ser un entero entre 5 y 100.");
if(!process.env.SESSION_SECRET||process.env.SESSION_SECRET.length<32)throw new Error("SESSION_SECRET debe tener al menos 32 caracteres.");
if(!process.env.DATABASE_URL)throw new Error("Configura DATABASE_URL en .env.");
if(production&&!configuredOrigin)throw new Error("Configura APP_ORIGIN con la URL HTTPS pública de la aplicación.");
let expectedOrigin=null;
if(configuredOrigin){
 const parsedOrigin=new URL(configuredOrigin);
 if(production&&(parsedOrigin.protocol!=="https:"||parsedOrigin.pathname!=="/"||parsedOrigin.search||parsedOrigin.hash))throw new Error("APP_ORIGIN debe ser una URL HTTPS sin ruta, parámetros ni fragmento.");
 expectedOrigin=parsedOrigin.origin;
}
if(production)app.set("trust proxy",1);
const pool=new Pool({connectionString:process.env.DATABASE_URL,max:dbPoolMax,idleTimeoutMillis:30000,connectionTimeoutMillis:5000});
pool.on("error",error=>console.error("PostgreSQL pool error",error.message));
const PgStore=connectPgSimple(session);
app.disable("x-powered-by");
app.use(helmet({contentSecurityPolicy:{directives:{defaultSrc:["'self'"],scriptSrc:["'self'"],styleSrc:["'self'","'unsafe-inline'"],imgSrc:["'self'","data:"],objectSrc:["'none'"],baseUri:["'self'"],formAction:["'self'"],frameAncestors:["'none'"],upgradeInsecureRequests:production?[]:null}}}));
app.use(express.json({limit:"2mb",strict:true}));
app.use((req,res,next)=>{if(req.path.startsWith("/api/"))res.set("Cache-Control","no-store");next()});
app.use(session({store:new PgStore({pool:pool,tableName:"web_sessions",createTableIfMissing:true,pruneSessionInterval:60}),name:"kairos.sid",secret:process.env.SESSION_SECRET,resave:false,saveUninitialized:false,rolling:true,cookie:{httpOnly:true,secure:production,sameSite:"lax",maxAge:8*60*60*1000}}));
const authLimiter=rateLimit({windowMs:15*60*1000,limit:12,standardHeaders:true,legacyHeaders:false,message:{error:"Demasiados intentos. Espera unos minutos y prueba otra vez."}});
const agentLimiter=rateLimit({windowMs:60*1000,limit:12,standardHeaders:true,legacyHeaders:false,message:{error:"Demasiadas consultas al asistente. Espera un momento."}});
const asyncRoute=fn=>(req,res,next)=>Promise.resolve(fn(req,res,next)).catch(next);
function sameOrigin(req,res,next){const origin=req.get("origin"),expected=expectedOrigin||req.protocol+"://"+req.get("host");let allowed=Boolean(origin&&origin===expected);if(!allowed&&!production&&origin){try{const actual=new URL(origin),configured=new URL(expected),loopback=new Set(["localhost","127.0.0.1","[::1]"]);allowed=actual.protocol===configured.protocol&&actual.port===configured.port&&loopback.has(actual.hostname)&&loopback.has(configured.hostname)}catch{allowed=false}}if(!allowed)return res.status(403).json({error:"Origen de solicitud no permitido."});next()}
function requireAuth(req,res,next){if(!req.session.userId)return res.status(401).json({error:"Inicia sesión para continuar."});next()}
function publicUser(row){return {id:row.id,name:row.name,email:row.email}}
function derive(password,salt){return new Promise((resolve,reject)=>crypto.scrypt(password,salt,64,{N:16384,r:8,p:1,maxmem:64*1024*1024},(err,key)=>err?reject(err):resolve(key)))}
async function hashPassword(password){const salt=crypto.randomBytes(16).toString("hex"),key=await derive(password,salt);return "scrypt$"+salt+"$"+key.toString("hex")}
async function verifyPassword(password,stored){const parts=String(stored||"").split("$");if(parts.length!==3||parts[0]!=="scrypt")return false;try{const expected=Buffer.from(parts[2],"hex"),actual=await derive(password,parts[1]);return expected.length===actual.length&&crypto.timingSafeEqual(expected,actual)}catch(err){return false}}
function establishSession(req,id){return new Promise((resolve,reject)=>req.session.regenerate(err=>{if(err)return reject(err);req.session.userId=id;req.session.save(err=>err?reject(err):resolve())}))}
function destroySession(req){return new Promise((resolve,reject)=>req.session.destroy(err=>err?reject(err):resolve()))}
async function deletePythonSessions(userId){const table=await pool.query("SELECT to_regclass('kairos_python_sessions') AS name");if(table.rows[0]?.name)await pool.query("DELETE FROM kairos_python_sessions WHERE data->>'user_id'=$1",[userId])}
function validEmail(value){return typeof value==="string"&&value.length<=254&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)}
const publicFiles=new Set(["index.html","styles.css","ai-agent.js","agent-chat.js","priority-engine.js","auth-client.js","app.js","enhancements.js","lab.js","manifest.webmanifest","service-worker.js","icon-192.svg","icon-512.svg","icon-192.png","icon-512.png","fonts/inter-variable-latin.woff2","fonts/poppins-400-latin.woff2","fonts/poppins-500-latin.woff2","fonts/poppins-600-latin.woff2","fonts/poppins-700-latin.woff2","fonts/poppins-800-latin.woff2"]);
app.get("/api/health",asyncRoute(async(req,res)=>{await pool.query("SELECT 1");res.json({status:"ok"})}));
app.post("/api/auth/register",sameOrigin,authLimiter,asyncRoute(async(req,res)=>{
 const name=String(req.body.name||"").trim(),email=String(req.body.email||"").trim().toLowerCase(),password=String(req.body.password||"");
 if(name.length<1||name.length>80)return res.status(400).json({error:"Escribe un nombre de 1 a 80 caracteres."});
 if(!validEmail(email))return res.status(400).json({error:"Escribe un correo electrónico válido."});
 if(password.length<10||Buffer.byteLength(password,"utf8")>256)return res.status(400).json({error:"La contraseña debe tener al menos 10 caracteres."});
 const id=crypto.randomUUID(),passwordHash=await hashPassword(password);
 try{const result=await pool.query("INSERT INTO app_users(id,name,email,password_hash) VALUES($1,$2,$3,$4) RETURNING id,name,email",[id,name,email,passwordHash]);await establishSession(req,id);res.status(201).json({user:publicUser(result.rows[0])})}
 catch(err){if(err.code==="23505")return res.status(409).json({error:"Ese correo ya está registrado."});throw err}
}));
app.post("/api/auth/login",sameOrigin,authLimiter,asyncRoute(async(req,res)=>{
 const email=String(req.body.email||"").trim().toLowerCase(),password=String(req.body.password||"");
 if(!validEmail(email)||!password||Buffer.byteLength(password,"utf8")>256)return res.status(401).json({error:"Correo o contraseña incorrectos."});
 const result=await pool.query("SELECT id,name,email,password_hash FROM app_users WHERE email=$1",[email]),row=result.rows[0];
 if(!row||!(await verifyPassword(password,row.password_hash)))return res.status(401).json({error:"Correo o contraseña incorrectos."});
 await establishSession(req,row.id);res.json({user:publicUser(row)});
}));
app.get("/api/auth/me",requireAuth,asyncRoute(async(req,res)=>{const result=await pool.query("SELECT id,name,email FROM app_users WHERE id=$1",[req.session.userId]);if(!result.rows[0]){await destroySession(req);return res.status(401).json({error:"La cuenta ya no existe."})}res.json({user:publicUser(result.rows[0])})}));
app.post("/api/auth/logout",sameOrigin,requireAuth,asyncRoute(async(req,res)=>{await destroySession(req);res.clearCookie("kairos.sid",{httpOnly:true,secure:production,sameSite:"lax"});res.json({ok:true})}));
app.post("/api/auth/password",sameOrigin,authLimiter,requireAuth,asyncRoute(async(req,res)=>{
 const current=String(req.body.currentPassword||""),next=String(req.body.newPassword||""),id=req.session.userId;
 if(Buffer.byteLength(current,"utf8")>256)return res.status(401).json({error:"La contraseña actual no es correcta."});
 if(next.length<10||Buffer.byteLength(next,"utf8")>256)return res.status(400).json({error:"La nueva contraseña debe tener al menos 10 caracteres."});
 const result=await pool.query("SELECT password_hash FROM app_users WHERE id=$1",[id]);
 if(!result.rows[0]||!(await verifyPassword(current,result.rows[0].password_hash)))return res.status(401).json({error:"La contraseña actual no es correcta."});
 const hash=await hashPassword(next);await pool.query("UPDATE app_users SET password_hash=$1 WHERE id=$2",[hash,id]);
 await pool.query("DELETE FROM web_sessions WHERE sess->>'userId'=$1 AND sid<>$2",[id,req.sessionID]);await deletePythonSessions(id);await establishSession(req,id);
 res.json({ok:true,message:"Contraseña actualizada. Se cerraron las demás sesiones."});
}));
app.delete("/api/auth/account",sameOrigin,authLimiter,requireAuth,asyncRoute(async(req,res)=>{
 const password=String(req.body.password||""),confirmation=String(req.body.confirmation||""),id=req.session.userId;
 if(confirmation!=="ELIMINAR")return res.status(400).json({error:"Escribe ELIMINAR para confirmar."});
 const result=await pool.query("SELECT password_hash FROM app_users WHERE id=$1",[id]);
 if(!result.rows[0]||!(await verifyPassword(password,result.rows[0].password_hash)))return res.status(401).json({error:"La contraseña no es correcta."});
 await pool.query("DELETE FROM web_sessions WHERE sess->>'userId'=$1",[id]);await deletePythonSessions(id);
 await pool.query("DELETE FROM app_users WHERE id=$1",[id]);await destroySession(req);
 res.clearCookie("kairos.sid",{httpOnly:true,secure:production,sameSite:"lax"});res.json({ok:true});
}));
const agentConfigured=()=>Boolean(process.env.N8N_WEBHOOK_URL&&process.env.N8N_SHARED_SECRET);
// Piloto con un solo token de Moodle: limita el asistente a las cuentas listadas (correos separados por comas).
async function agentAllowed(userId){const list=String(process.env.AGENT_ALLOWED_EMAILS||"").split(",").map(v=>v.trim().toLowerCase()).filter(Boolean);if(!list.length)return true;const result=await pool.query("SELECT email FROM app_users WHERE id=$1",[userId]);return Boolean(result.rows[0]&&list.includes(String(result.rows[0].email).toLowerCase()))}
function cleanAgentPayload(value,maxBytes){try{const text=JSON.stringify(value);return text&&Buffer.byteLength(text,"utf8")<=maxBytes?JSON.parse(text):null}catch{return null}}
app.get("/api/agent/status",requireAuth,asyncRoute(async(req,res)=>res.json({configured:agentConfigured(),allowed:await agentAllowed(req.session.userId)})));
app.post("/api/agent",sameOrigin,requireAuth,agentLimiter,asyncRoute(async(req,res)=>{
 if(!agentConfigured())return res.status(503).json({error:"El asistente aún no está configurado en el servidor."});
 if(!(await agentAllowed(req.session.userId)))return res.status(403).json({error:"El asistente está en piloto y tu cuenta aún no está habilitada."});
 const mensaje=String(req.body.mensaje||"").trim();
 if(!mensaje||mensaje.length>4000)return res.status(400).json({error:"Escribe un mensaje de 1 a 4000 caracteres."});
 let target;try{target=new URL(process.env.N8N_WEBHOOK_URL)}catch{return res.status(503).json({error:"La URL del asistente no es válida."})}
 if(production&&target.protocol!=="https:")return res.status(503).json({error:"El asistente requiere una URL HTTPS en producción."});
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),55000);
 try{
  const upstream=await fetch(target,{method:"POST",signal:controller.signal,headers:{"Content-Type":"application/json","x-kairos-key":process.env.N8N_SHARED_SECRET},body:JSON.stringify({mensaje,estudianteId:req.session.userId,sessionId:req.session.userId,candidatos:cleanAgentPayload(req.body.candidatos,20000),advertencias:cleanAgentPayload(req.body.advertencias,5000)})});
  const data=await upstream.json().catch(()=>null);
  if(!upstream.ok||!data||typeof data!=="object")return res.status(502).json({error:"El asistente no pudo responder."});
  const acciones=Array.isArray(data.acciones)?data.acciones.filter(a=>a&&typeof a==="object").slice(0,20):[];
  res.json({texto:String(data.texto??data.respuesta??"").slice(0,8000),acciones});
 }catch(err){
  if(err&&err.name==="AbortError")return res.status(504).json({error:"El asistente tardó demasiado en responder."});
  console.error("Agent proxy error",err&&err.message);res.status(502).json({error:"El asistente no está disponible ahora."});
 }finally{clearTimeout(timer)}
}));
app.get("/api/planner/state",requireAuth,asyncRoute(async(req,res)=>{const result=await pool.query("SELECT data FROM planner_data WHERE user_id=$1",[req.session.userId]);res.json({data:result.rows[0]?result.rows[0].data:null})}));
app.put("/api/planner/state",sameOrigin,requireAuth,asyncRoute(async(req,res)=>{
 const data=req.body&&req.body.data;
 if(!data||!Array.isArray(data.subjects)||!Array.isArray(data.tasks)||!data.settings||typeof data.settings!=="object")return res.status(400).json({error:"Los datos de planificación no tienen un formato válido."});
 if(Buffer.byteLength(JSON.stringify(data),"utf8")>2*1024*1024)return res.status(413).json({error:"La copia de planificación supera el límite de 2 MB."});
 await pool.query("INSERT INTO planner_data(user_id,data,updated_at) VALUES($1,$2::jsonb,NOW()) ON CONFLICT(user_id) DO UPDATE SET data=EXCLUDED.data,updated_at=NOW()",[req.session.userId,JSON.stringify(data)]);res.json({ok:true});
}));
app.get(["/","/index.html","/styles.css","/ai-agent.js","/agent-chat.js","/priority-engine.js","/auth-client.js","/app.js","/enhancements.js","/lab.js","/manifest.webmanifest","/service-worker.js","/icon-192.svg","/icon-512.svg","/icon-192.png","/icon-512.png","/fonts/:font"],(req,res)=>{const name=req.path==="/"?"index.html":req.path.slice(1);if(!publicFiles.has(name))return res.sendStatus(404);if(name==="service-worker.js")res.set("Service-Worker-Allowed","/").set("Cache-Control","no-cache");res.sendFile(path.join(__dirname,name))});
app.use((err,req,res,next)=>{console.error("Request error",err.message);if(res.headersSent)return next(err);res.status(500).json({error:"Ocurrió un error del servidor. Inténtalo de nuevo."})});
async function main(){
 await pool.query("CREATE TABLE IF NOT EXISTS app_users(id TEXT PRIMARY KEY,name VARCHAR(80) NOT NULL,email VARCHAR(254) NOT NULL UNIQUE,password_hash TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");
 await pool.query("CREATE TABLE IF NOT EXISTS planner_data(user_id TEXT PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,data JSONB NOT NULL,updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");
 const server=app.listen(port,host,()=>console.log("KAIROS disponible en http://"+host+":"+port));
 const shutdown=()=>server.close(()=>pool.end().finally(()=>process.exit(0)));process.on("SIGTERM",shutdown);process.on("SIGINT",shutdown)
}
main().catch(err=>{console.error("No pude iniciar el servidor:",err.message);process.exit(1)});
