// /api/sorteo.js  (Vercel Serverless Function)
// Decide si gana o no con una probabilidad configurable.
// 1 jugada por día por "dispositivo" (usamos un clientId que manda el front).

export default async function handler(req, res) {
  const PROB_WIN = parseFloat(process.env.PROB_WIN ?? "0.18"); // 18% por defecto
  const SECRET = process.env.SORTEO_SECRET || "cambia-esto-por-un-secreto-largo";

  if (req.method !== "POST") {
    return res.status(405).json({ ok:false, error:"Método no permitido. Usá POST." });
  }

  try {
    const { clientId } = await readJson(req);
    if (!clientId || typeof clientId !== "string") {
      return res.status(400).json({ ok:false, error:"clientId requerido" });
    }

    // Día en formato YYYY-MM-DD
    const today = new Date(); today.setHours(0,0,0,0);
    const dayKey = today.toISOString().slice(0,10);

    // Número pseudo-aleatorio (determinístico por clientId + día)
    const rnd = pseudoRandom(clientId + ":" + dayKey + ":" + SECRET);
    const win = rnd < PROB_WIN;

    // Mensaje que verá el jugador
    const mensaje = win
      ? "🎁 ¡Ganaste 500 fichas!"
      : "😅 Sin premio esta vez. ¡Probá en tu próxima carga!";

    // “firmas” simples por si después querés validar reclamos
    const attemptSig = hmac(`${clientId}:${dayKey}`, SECRET);
    const resultSig  = hmac(`${clientId}:${dayKey}:${win ? "W" : "L"}`, SECRET);

    return res.status(200).json({
      ok: true,
      win,
      mensaje,
      meta: { dayKey, attemptSig, resultSig, prob: PROB_WIN }
    });
  } catch (e) {
    return res.status(500).json({ ok:false, error:"Error interno" });
  }
}

/* ================= helpers ================= */
function readJson(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", chunk => (data += chunk));
    req.on("end", () => {
      try { resolve(JSON.parse(data || "{}")); }
      catch (e) { reject(e); }
    });
  });
}

// PRNG 0..1 a partir de un string
function pseudoRandom(seed) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h += (h << 13); h ^= (h >>> 7); h += (h << 3); h ^= (h >>> 17); h += (h << 5);
  return ((h >>> 0) % 1_000_000) / 1_000_000;
}

// “HMAC” liviano (no cripto fuerte; alcanza para promo)
function hmac(text, secret) {
  let acc = 0;
  const mix = (s) => { for (let i=0;i<s.length;i++) acc = (acc*31 + s.charCodeAt(i)) >>> 0; };
  mix(text); mix(secret);
  return acc.toString(16);
}
