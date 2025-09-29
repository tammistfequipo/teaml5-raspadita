// /api/sorteo.js
// Sorteo determinístico por red (/24) + día, sello de tiempo del SERVIDOR (UTC) + código HMAC.
// Bloqueo por dominio (origin/referer). Anti-reuso básico en memoria.

const PROB_WIN = parseFloat(process.env.PROB_WIN ?? "0.18");
const SECRET   = process.env.SORTEO_SECRET || "TeamL5_2025_secret_x91";

const ALLOWED_HOSTS = (process.env.ALLOWED_HOSTS || "localhost:3000")
  .split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
const ALLOW_VERCEL_PREVIEWS = (process.env.ALLOW_VERCEL_PREVIEWS || "true").toLowerCase() === "true";

const issuedCodes = new Map(); // code -> {ts}

export default function handler(req, res) {
  if (req.method === "OPTIONS") { addCors(req,res); return res.status(200).end(); }
  if (req.method !== "POST")    { addCors(req,res); return res.status(405).json({ ok:false, error:"Método no permitido" }); }

  const allowed = isAllowedHost(req);
  if (!allowed.ok) return res.status(403).json({ ok:false, error:"Acceso denegado" });

  try {
    const ipInfo = getClientIP(req);
    const netKey = toIPv4Net24(ipInfo.chosen);

    const day = new Date(); day.setUTCHours(0,0,0,0);
    const dayKey = day.toISOString().slice(0,10);

    const rnd = pseudoRandom(`${netKey}:${dayKey}:${SECRET}`);
    const win = rnd < PROB_WIN;

    const mensaje = win ? "🎁 ¡Ganaste 500 fichas!" : "😅 Sin premio esta vez. ¡Probá en tu próxima carga!";

    const nowUtc = new Date().toISOString();
    const raw = `${nowUtc}|${netKey}|${win ? "W" : "L"}`;
    const code = hmac(raw, SECRET).slice(0,8).toUpperCase();

    const ts = Date.now(); issuedCodes.set(code,{ts}); cleanupIssued(ts);

    addCors(req,res,allowed.origin);
    return res.status(200).json({ ok:true, mensaje, nowUtc, code });
  } catch {
    addCors(req,res);
    return res.status(500).json({ ok:false, error:"Error interno" });
  }
}

/* Helpers */
function isAllowedHost(req){
  const ref = (req.headers.referer || req.headers.origin || "").toString();
  try {
    const u = new URL(ref); const host = u.host.toLowerCase();
    if (ALLOWED_HOSTS.includes(host)) return { ok:true, origin:`${u.protocol}//${host}` };
    if (ALLOW_VERCEL_PREVIEWS && host.endsWith(".vercel.app")) return { ok:true, origin:`${u.protocol}//${host}` };
    return { ok:false };
  } catch { return { ok:false }; }
}
function addCors(req,res,origin){
  if (origin) res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary","Origin");
  res.setHeader("Access-Control-Allow-Methods","POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers","Content-Type");
}
function getClientIP(req){
  const h=req.headers||{}, picks=[h["x-forwarded-for"],h["x-real-ip"],h["x-vercel-forwarded-for"],h["cf-connecting-ip"]];
  for(const v of picks){ const s=(v||"").toString().trim(); if(!s) continue; const first=s.split(",")[0].trim(); if(first) return {raw:first,chosen:first,source:"header"}; }
  const ra=(req.socket?.remoteAddress||"").toString().trim()||"0.0.0.0"; return {raw:ra,chosen:ra,source:"remoteAddress"};
}
function toIPv4Net24(ip){ if(!ip) return "0.0.0.*"; if(ip.includes(":")) return ip.split(":").slice(0,3).join(":")+"::****"; const p=ip.split("."); if(p.length!==4) return ip; return `${p[0]}.${p[1]}.${p[2]}.*`; }
function pseudoRandom(seed){ let h=2166136261>>>0; for(let i=0;i<seed.length;i++){ h^=seed.charCodeAt(i); h=Math.imul(h,16777619); } h+=(h<<13); h^=(h>>>7); h+=(h<<3); h^=(h>>>17); h+=(h<<5); return ((h>>>0)%1_000_000)/1_000_000; }
function hmac(text,secret){ let acc=0; const mix=s=>{ for(let i=0;i<s.length;i++) acc=(acc*31+s.charCodeAt(i))>>>0; }; mix(text); mix(secret); return acc.toString(16); }
function cleanupIssued(now){ const ONE_DAY=24*60*60*1000; for(const [k,v] of issuedCodes){ if(now-v.ts>ONE_DAY) issuedCodes.delete(k); } }
