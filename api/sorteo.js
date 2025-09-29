// 📌 Lista inicial de premios disponibles
let premiosDisponibles = [
  ...Array(5).fill("🎁 Ganaste 1000 fichas"),
  ...Array(10).fill("🎁 Ganaste 500 fichas"),
  ...Array(20).fill("🎁 Ganaste 200 fichas"),
  ...Array(200).fill("😅 Esta vez no ganaste, suerte la próxima"),
  ...Array(200).fill("🎉 Sin premio, probá en tu próxima carga"),
  ...Array(200).fill("🙃 Seguí participando, la próxima puede ser tuya")
];

export default function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Método no permitido" });
  }

  if (premiosDisponibles.length === 0) {
    return res.status(200).json({
      ok: true,
      mensaje: "❌ Ya no quedan premios disponibles"
    });
  }

  // 📌 Elegir premio al azar
  const index = Math.floor(Math.random() * premiosDisponibles.length);
  const mensaje = premiosDisponibles[index];

  // 📌 Eliminar el premio de la lista (para que no se repita)
  premiosDisponibles.splice(index, 1);

  return res.status(200).json({ ok: true, mensaje });
}
