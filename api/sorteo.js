// Sorteo determinístico por IP + día (sin DB).
// Misma IP el mismo día => mismo resultado, aunque usen incógnito.
// Cambiá PROB_WIN si querés más/menos ganadores.

const PROB_WIN = parseFloat(process.env.PROB_WIN ?? "0.18"); // 18%
const SECRET = process.env.SORTEO_SECRET || "TeamL5_2025_secret_x91";

export default function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Método no permitido" });
  }

  try {
    // 1) Obtenemos IP real (Vercel/Cloudflare coloca x-forwarded-for)
    const xff = (req.headers["x-forwarded-for"] || "").toString();
    const ip = (xff.split(",")[0] || req.socket?.remoteAddress || "0.0.0.0").trim();

    // 2) Clave del día (UTC)
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const dayKey = today.toISOString().slice(0, 10); // YYYY-MM-DD

    // 3) Número pseudo-aleatorio determinístico 0..1 según (IP + día + secreto)
    const rnd = pseudoRandom(`${ip}:${dayKey}:${SECRET}`);

    // 4) Resultado estable por IP/día
    const win = rnd < PROB_WIN;

    // 5) Mensaje (podés personalizar libremente)
    const mensaje = win
      ? "🎁 ¡Ganaste 500 fichas!"
      : "😅 Sin premio esta vez. ¡Probá en tu próxima carga!";

    // (Opcional) firmas simples
    const resultSig = hmac(`${ip}:${dayKey}:${win ? "W" : "L"}`, SECRET);

    return res.status(200).json({
      ok: true,
      win,
      mensaje,
      meta: { ipMasked: maskIP(ip), dayKey, prob: PROB_WIN, sig: resultSig }
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: "Error interno" });
  }
}

/* ================= helpers ================= */
// PRNG determinístico (0..1) desde un string
function pseudoRandom(seed) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h += (h << 13); h ^= (h >>> 7); h += (h << 3); h ^= (h >>> 17); h += (h << 5);
  return ((h >>> 0) % 1_000_000) / 1_000_000;
}

// HMAC simplificado (no cripto fuerte; alcanza para firma liviana)
function hmac(text, secret) {
  let acc = 0;
  const mix = (s) => { for (let i = 0; i < s.length; i++) acc = (acc * 31 + s.charCodeAt(i)) >>> 0; };
  mix(text); mix(secret);
  return acc.toString(16);
}

function maskIP(ip) {
  // Ocultamos parte para no exponerla completa en meta (opcional)
  if (ip.includes(":")) {
    // IPv6
    const parts = ip.split(":");
    return parts.slice(0, 3).join(":") + "::****";
  } else {
    // IPv4
    const parts = ip.split(".");
    if (parts.length === 4) return `${parts[0]}.${parts[1]}.*.*`;
    return ip;
  }
}
