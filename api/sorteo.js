import fs from "fs";
import path from "path";

export default function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Método no permitido" });
  }

  try {
    // 📌 Ruta del archivo premios.json
    const filePath = path.join(process.cwd(), "premios.json");

    // 📌 Leer premios actuales
    let premios = JSON.parse(fs.readFileSync(filePath, "utf8"));

    // Si ya no quedan premios
    if (premios.length === 0) {
      return res.status(200).json({
        ok: true,
        mensaje: "❌ Ya no quedan premios disponibles"
      });
    }

    // 📌 Elegir premio aleatorio
    const index = Math.floor(Math.random() * premios.length);
    const mensaje = premios[index];

    // 📌 Eliminar el premio para que no se repita
    premios.splice(index, 1);

    // 📌 Guardar archivo actualizado
    fs.writeFileSync(filePath, JSON.stringify(premios, null, 2));

    return res.status(200).json({ ok: true, mensaje });
  } catch (error) {
    console.error("Error en sorteo.js:", error);
    return res.status(500).json({
      ok: false,
      error: "Error interno en el servidor"
    });
  }
}
