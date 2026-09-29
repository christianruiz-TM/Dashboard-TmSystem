import ExcelJS from "exceljs";
import { cabeceraAdjunto } from "./adjunto";

/** Formato numérico de Excel para tiempos: 2 decimales fijos (8,50 y no 8,5). */
export const FORMATO_2_DECIMALES = "#,##0.00";

/**
 * Genera un XLSX simple de una hoja con cabecera en amarillo corporativo.
 * `columnas`: cabecera y clave de cada campo de las filas; `formato` es un
 * numFmt de Excel opcional (p. ej. FORMATO_2_DECIMALES para tiempos). Sin
 * él Excel usa "General" y recorta los ceros finales.
 */
export async function generarXlsx(
  nombreHoja: string,
  columnas: { cabecera: string; clave: string; ancho?: number; formato?: string }[],
  filas: Record<string, unknown>[],
): Promise<Buffer> {
  const libro = new ExcelJS.Workbook();
  libro.creator = "Dashboard TmSystem";
  const hoja = libro.addWorksheet(nombreHoja);

  hoja.columns = columnas.map((c) => ({
    header: c.cabecera,
    key: c.clave,
    width: c.ancho ?? 18,
    style: c.formato ? { numFmt: c.formato } : undefined,
  }));
  hoja.getRow(1).font = { bold: true, color: { argb: "FF1C1B1A" } };
  hoja.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFF5CF3D" }, // amarillo de marca TmSystem
  };
  hoja.addRows(filas);
  hoja.views = [{ state: "frozen", ySplit: 1 }];

  const buffer = await libro.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

/** Respuesta HTTP de descarga XLSX. */
export function respuestaXlsx(nombreArchivo: string, contenido: Buffer): Response {
  return new Response(new Uint8Array(contenido), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": cabeceraAdjunto(nombreArchivo),
      "Cache-Control": "no-store",
    },
  });
}
