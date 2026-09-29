// ============================================================
// Export CSV para Excel español: separador ';' y BOM UTF-8
// (sin BOM, Excel ES rompe los acentos; con coma, no separa).
// ============================================================

import { cabeceraAdjunto } from "./adjunto";

const BOM = "﻿";
const SEPARADOR = ";";

function escaparCelda(valor: unknown): string {
  if (valor == null) return "";
  let texto: string;
  if (typeof valor === "number") {
    // Decimal con coma para Excel español
    texto = valor.toLocaleString("es-ES", { useGrouping: false, maximumFractionDigits: 2 });
  } else {
    texto = String(valor);
  }
  if (texto.includes(SEPARADOR) || texto.includes('"') || texto.includes("\n")) {
    return `"${texto.replaceAll('"', '""')}"`;
  }
  return texto;
}

/** Genera el contenido CSV completo a partir de cabeceras y filas. */
export function generarCsv(cabeceras: string[], filas: unknown[][]): string {
  const lineas = [
    cabeceras.map(escaparCelda).join(SEPARADOR),
    ...filas.map((fila) => fila.map(escaparCelda).join(SEPARADOR)),
  ];
  return BOM + lineas.join("\r\n");
}

/** Respuesta HTTP de descarga CSV. */
export function respuestaCsv(nombreArchivo: string, contenido: string): Response {
  return new Response(contenido, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": cabeceraAdjunto(nombreArchivo),
      "Cache-Control": "no-store",
    },
  });
}
