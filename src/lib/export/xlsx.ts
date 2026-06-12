import ExcelJS from "exceljs";

/**
 * Genera un XLSX simple de una hoja con cabecera en azul corporativo.
 * `columnas`: cabecera y clave de cada campo de las filas.
 */
export async function generarXlsx(
  nombreHoja: string,
  columnas: { cabecera: string; clave: string; ancho?: number }[],
  filas: Record<string, unknown>[],
): Promise<Buffer> {
  const libro = new ExcelJS.Workbook();
  libro.creator = "Dashboard TmSystem";
  const hoja = libro.addWorksheet(nombreHoja);

  hoja.columns = columnas.map((c) => ({
    header: c.cabecera,
    key: c.clave,
    width: c.ancho ?? 18,
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
      "Content-Disposition": `attachment; filename="${nombreArchivo}"`,
      "Cache-Control": "no-store",
    },
  });
}
