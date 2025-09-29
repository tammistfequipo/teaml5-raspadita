// /api/sorteo.js
// Sorteo seguro con control de origen, rate-limit básico y resultado estable por día+clientId.

const PROB_WIN = 0.18; // probabilidad total de ganar (0..1)
const SECRET   = process.env.SORTEO_SECRET || "TeamL5_2025_secret_x91";

const LOSE_TEXT = "😅 Sin premio esta vez. ¡Probá mañana!";
const PRIZES = [
  { label: "🎁 ¡Ganaste 1.000 fichas!", weight: 30 },
  { label: "🎁 ¡Ganaste 500 fichas!",   weight: 70 },
];

// Dominios permitidos
const ALLOWED_HOSTS = [
  "teaml5-raspadita.vercel.app", // prod
  "localhost:3000"               // dev
];
// Si querés permitir previews de Vercel, poné true:
const ALLOW_VERCEL_PREVIEWS = false;

// Rate limit (IP)
const ipHitWindow = 60 * 1000; // 1 minuto
const ipMaxHitsPerWindow = 20;
const ipHits = new Map();      // ip -> { tsArray: number[] }

// Memoria de proceso (no persiste entre cold starts)
const issuedCodes   = new Map();   // code -> { ts }
const clientResults = new Map();   // clientId -> { dayKey, resultado }

export default async function handler(req, res) {
  // Headers comunes en todas las respuestas JSON
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "OPTIONS") {
    // Preflight CORS: solo si el origen es válido
    const allowed = isAllowedHost(req);
    if (allowed.ok) addCorsAllowed(res, allowed.origin);
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ ok:false, error:"Método no permitido" });
  }

  const allowed = isAllowedHost(req);
  if (!allowed.ok) {
    // No eco de CORS cuando el origen es inválido
    return res.status(403).json({ ok:false, error:"Acceso denegado" });
  }

  // A partir de acá, CORS habilitado para el origen permitido
  addCorsAllowed(res, allowed.origin);

  // Rate-limit por IP
  const ip = getClientIP(req).chosen;
  if (isRateLimited(ip)) {
    return res.status(429).json({ ok:false, error:"Demasiadas solicitudes" });
  }

  try {
    const body = parseBody(req.body);
    const clientId = (body.clientId || "").toString().trim() || null;

    // Día UTC
    const day = new Date(); day.setUTCHours(0,0,0,0);
    const dayKey = day.toISOString().slice(0,10);

    // Cache por clientId del mismo día
    if (clientId) {
      const prev = clientResults.get(clientId);
      if (prev && prev.dayKey === dayKey) {
        return res.status(200).json({
          ok: true,
          ...prev.resultado,
          clientId,
          whatsApp: getWa()
        });
      }
    }

    // Seed base (estable por red/día y, si hay, clientId)
    const netKey = toIPv4Net24(ip);
    const baseSeed = clientId
      ? `${netKey}:${dayKey}:${clientId}:${SECRET}`
      : `${netKey}:${dayKey}:${SECRET}`;

    // Decide si gana
    const rndWin = pseudoRandom(baseSeed); // [0,1)
    const win = rndWin < PROB_WIN;

    // Mensaje (texto plano)
    let mensaje = LOSE_TEXT;
    if (win) {
      const rndPrize = pseudoRandom(baseSeed + ":prize");
      const prize = pickWeighted(PRIZES, rndPrize);
      mensaje = String(prize?.label ?? "🎁 Premio");
    } else {
      mensaje = String(LOSE_TEXT);
    }

    // Sello (UTC) y “código” verificable
    const nowUtc = new Date().toISOString();
    const raw = `${nowUtc}|${netKey}|${clientId || "NOCLIENT"}|${win ? "W":"L"}`;
    const code = hmac(raw, SECRET).slice(0,8).toUpperCase();

    // Guarda en memoria
    const ts = Date.now();
    issuedCodes.set(code, { ts });
    cleanupIssued(ts);

    const resultado = { mensaje, nowUtc, code, win };
    if (clientId) {
      clientResults.set(clientId, { dayKey, resultado });
      cleanupClientResults(ts);
    }

    return res.status(200).json({
      ok: true,
      ...resultado,
      clientId,
      whatsApp: getWa()
    });
  } catch {
    return res.status(500).json({ ok:false, error:"Error interno" });
  }
}

/* ---------------- Helpers ---------------- */
function parseBody(body){
  if (!body) return {};
  if (typeof body === 'string') { try { return JSON.parse(body); } catch { return {}; } }
  return body;
}
function getWa(){ return process.env.WA_NUMBER || ""; }

function isAllowedHost(req){
  const ref = (req.headers.referer || req.headers.origin || "").toString();
  try {
    const u = new URL(ref);
    const host = u.host.toLowerCase();
    if (ALLOWED_HOSTS.includes(host)) return { ok:true, origin:`${u.protocol}//${host}` };
    if (ALLOW_VERCEL_PREVIEWS && host.endsWith(".vercel.app")) return { ok:true, origin:`${u.protocol}//${host}` };
    return { ok:false };
  } catch {
    return { ok:false };
  }
}
function addCorsAllowed(res, origin){
  if (origin) res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Credentials", "false");
}
function getClientIP(req){
  const h = req.headers || {};
  const picks = [h["x-forwarded-for"], h["x-real-ip"], h["x-vercel-forwarded-for"], h["cf-connecting-ip"]];
  for (const v of picks) {
    const s = (v||"").toString().trim();
    if (!s) continue;
    const first = s.split(",")[0].trim();
    if (first) return { chosen:first };
  }
  const ra = (req.socket?.remoteAddress || "").toString().trim() || "0.0.0.0";
  return { chosen:ra };
}
function toIPv4Net24(ip){
  if (!ip) return "0.0.0.*";
  if (ip.includes(":")) return ip.split(":").slice(0,3).join(":")+"::****";
  const p = ip.split(".");
  if (p.length !== 4) return ip;
  return `${p[0]}.${p[1]}.${p[2]}.*`;
}
function pseudoRandom(seed){
  let h = 2166136261 >>> 0;
  for (let i=0;i<seed.length;i++){ h ^= seed.charCodeAt(i); h = Math.imul(h,16777619); }
  h += (h<<13); h ^= (h>>>7); h += (h<<3); h ^= (h>>>17); h += (h<<5);
  return ((h>>>0) % 1_000_000) / 1_000_000;
}
function hmac(text, secret){
  let acc=0;
  const mix = s => { for(let i=0;i<s.length;i++) acc = (acc*31 + s.charCodeAt(i))>>>0; };
  mix(text); mix(secret);
  return acc.toString(16);
}
function pickWeighted(items, r) {
  const total = items.reduce((a,b)=>a + (b.weight||0), 0);
  if (total <= 0) return items[0] || { label:"🎁 Premio", weight:1 };
  let acc = 0;
  for (const it of items) {
    acc += (it.weight||0) / total;
    if (r <= acc) return it;
  }
  return items[items.length-1];
}
function cleanupIssued(now){
  const ONE_DAY = 24*60*60*1000;
  for (const [k,v] of issuedCodes) if (now - v.ts > ONE_DAY) issuedCodes.delete(k);
}
function cleanupClientResults(now){
  const ONE_DAY = 24*60*60*1000;
  for (const [k,v] of clientResults) {
    if (!v || !v.dayKey) { clientResults.delete(k); continue; }
    const dayMs = new Date(v.dayKey + "T00:00:00Z").getTime();
    if (now - dayMs > ONE_DAY) clientResults.delete(k);
  }
}

// ---- Rate-limit por IP (ventana rodante 1 minuto)
function isRateLimited(ip){
  const now = Date.now();
  const rec = ipHits.get(ip) || { tsArray: [] };
  rec.tsArray = rec.tsArray.filter(t => now - t <= ipHitWindow);
  rec.tsArray.push(now);
  ipHits.set(ip, rec);
  return rec.tsArray.length > ipMaxHitsPerWindow;
}
