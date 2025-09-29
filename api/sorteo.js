// Sorteo determinístico por RED (/24) + día, sin DB.
// Misma red pública (ej: 190.16.3.*) el mismo día => mismo resultado.
// Ajustá PROB_WIN desde variables de entorno si querés.

const PROB_WIN = parseFloat(process.env.PROB_WIN ?? "0.18");
const SECRET = process.env.SORTEO_SECRET || "TeamL5_2025_secret_x91";

export default function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Método no permitido" });
  }

  try {
    const ipInfo = getClientIP(req);           // { raw, chosen, source }
    const netKey = toIPv4Net24(ipInfo.chosen); // ej: "190.16.3.*" (o IPv6 abreviada)

    // Día en UTC
    const day = new Date(); day.setUTCHours(0,0,0,0);
    const dayKey = day.toISOString().slice(0,10);

    // PRNG determinístico (net/24 + día + secreto)
    const rnd = pseudoRandom(`${netKey}:${dayKey}:${SECRET}`);
    const win = rnd < PROB_WIN;

    const mensaje = win
      ? "🎁 ¡Ganaste 500 fichas!"
      : "😅 Sin premio esta vez. ¡Probá en tu próxima carga!";

    return res.status(200).json({
      ok: true,
      win,
      mensaje,
      meta: {
        dayKey,
        prob: PROB_WIN,
        ipSource: ipInfo.source,
        ipRawMasked: maskIP(ipInfo.raw),
        ipUsedMasked: netKey,
      }
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: "Error interno" });
  }
}

/* ================= helpers ================= */

function getClientIP(req) {
  // Tomamos el primer header que venga con IP de cliente
  const headers = req.headers || {};
  const picks = [
    {name: "x-forwarded-for", value: headers["x-forwarded-for"]},
    {name: "x-real-ip", value: headers["x-real-ip"]},
    {name: "x-vercel-forwarded-for", value: headers["x-vercel-forwarded-for"]},
    {name: "cf-connecting-ip", value: headers["cf-connecting-ip"]},
  ];

  for (const p of picks) {
    const v = (p.value || "").toString().trim();
    if (!v) continue;
    // x-forwarded-for puede traer lista "ip, ip, ip"
    const first = v.split(",")[0].trim();
    if (first) return { raw: first, chosen: first, source: p.name };
  }

  // Fallback a remoteAddress (puede ser privada)
  const ra = (req.socket?.remoteAddress || "").toString().trim() || "0.0.0.0";
  return { raw: ra, chosen: ra, source: "remoteAddress" };
}

function toIPv4Net24(ip) {
  if (!ip) return "0.0.0.*";
  if (ip.includes(":")) {
    // IPv6: usamos los primeros bloques para estabilizar
    const parts = ip.split(":").slice(0,3).join(":");
    return parts + "::****";
  }
  const parts = ip.split(".");
  if (parts.length !== 4) return ip;
  return `${parts[0]}.${parts[1]}.${parts[2]}.*`;
}

function maskIP(ip) {
  if (!ip) return "";
  if (ip.includes(":")) {
    const parts = ip.split(":");
    return parts.slice(0, 2).join(":") + ":****";
  } else {
    const parts = ip.split(".");
    if (parts.length === 4) return `${parts[0]}.${parts[1]}.*.*`;
    return ip;
  }
}

// PRNG determinístico 0..1 desde string
function pseudoRandom(seed) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h += (h << 13); h ^= (h >>> 7); h += (h << 3); h ^= (h >>> 17); h += (h << 5);
  return ((h >>> 0) % 1_000_000) / 1_000_000;
}
