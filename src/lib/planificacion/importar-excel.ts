// NOTA: solo servidor (lee ficheros). Importa la plantilla Excel con la que
// supervisión planificaba a mano (p. ej. «Septiembre V1.xlsx»): bloques
// semanales con una fila por agente y, por cada día, 12 columnas horarias
// (8-20 h) pintadas del color del cliente. El cliente sale del COLOR de la
// celda (el número que llevan es un contador). Sirve para tener en el módulo
// los meses que se hicieron en Excel (y medir su adherencia).
import ExcelJS from "exceljs";

/** Qué significa cada color de la plantilla. */
export type SignificadoColor = { cliente: string } | { ausencia: string } | { ignorar: string };

/**
 * Colores de la plantilla de septiembre de 2026: los de su leyenda (GH,
 * Ávolo, Vacaciones, RTO, Caja Rural) y los que se deducen de los datos
 * (UGR desde el 15/09, cuando empezó UGR_EGRE26; Caja Rural desde el 22/09,
 * CajaR_Autonomos_26). Los que no salen aquí se informan y no se importan.
 */
export const COLORES_PLANTILLA: Record<string, SignificadoColor> = {
  FFFFCCFF: { cliente: "GH" },
  FFFF99FF: { cliente: "BD" },
  FFF6C6F6: { cliente: "BD" },
  "th3+0.50": { cliente: "AV" },
  "th4+0.80": { cliente: "UGR" },
  "th9+0.60": { cliente: "CR" },
  FF83E28E: { cliente: "CR" },
  FFFF00FF: { ausencia: "VAC" },
  FFFFC000: { ausencia: "RTO" },
  FFFF0000: { ausencia: "FEST" },
  "th0+0.00": { ignorar: "sin turno" },
  "th0-0.25": { ignorar: "no trabaja (gris)" },
  "th8+0.40": { ignorar: "sábados y festivos" },
  "th8+0.60": { ignorar: "horas que no se trabajan" },
  FFFFFF00: { ignorar: "recuperaciones / horas que no se trabajan" },
};

export interface CeldaPlantilla {
  agenteNumero: string;
  fecha: string;
  /** Hora de inicio de la celda (8 = 8-9 h). */
  hora: number;
  color: string;
  significado: SignificadoColor | null;
}

/** Clave del color de relleno, como la ve openpyxl: «FFFFCCFF» o «th3+0.50». */
function claveColor(celda: ExcelJS.Cell): string | null {
  const relleno = celda.fill;
  if (!relleno || relleno.type !== "pattern" || relleno.pattern === "none") return null;
  const c = relleno.fgColor as { argb?: string; theme?: number; tint?: number } | undefined;
  if (!c) return null;
  if (c.argb) return c.argb.toUpperCase();
  if (c.theme != null) {
    const tint = c.tint ?? 0;
    return `th${c.theme}${tint < 0 ? "-" : "+"}${Math.abs(tint).toFixed(2)}`;
  }
  return null;
}

const fechaISO = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** «8_9h» → 8, «9h-10H» → 9, «10-11H» → 10 (null si no es una cabecera de hora). */
function horaDeCabecera(v: unknown): number | null {
  const m = /^(\d{1,2})\s*h?\s*[-_]/i.exec(String(v ?? "").trim());
  return m ? Number(m[1]) : null;
}

/** «Lourdes 851» → «0851»; «GH_0851» → «0851». */
function numeroAgente(...valores: unknown[]): string | null {
  for (const v of valores) {
    const m = /(\d{3,4})/.exec(String(v ?? ""));
    if (m) return m[1].padStart(4, "0");
  }
  return null;
}

/**
 * Lee las celdas de la plantilla de un mes. Una celda de fecha cuya fila
 * siguiente es de cabeceras de hora («8_9h», «9h-10H»...) abre un día; las
 * filas de debajo con nº de agente en las columnas C o D son sus agentes.
 */
export async function leerPlantillaExcel(
  ruta: string,
  mes: string,
  colores: Record<string, SignificadoColor> = COLORES_PLANTILLA,
): Promise<CeldaPlantilla[]> {
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.readFile(ruta);
  const hoja = libro.worksheets[0];
  const celdas: CeldaPlantilla[] = [];
  const vistas = new Set<string>();

  hoja.eachRow({ includeEmpty: false }, (fila, nFila) => {
    fila.eachCell({ includeEmpty: false }, (celda, nCol) => {
      if (!(celda.value instanceof Date)) return;
      const fecha = fechaISO(celda.value);
      if (!fecha.startsWith(mes)) return;
      const cabecera = hoja.getRow(nFila + 1);
      // Columnas de hora del día: desde la de la fecha mientras haya cabecera de hora
      const horas: { col: number; hora: number }[] = [];
      for (let c = nCol; c < nCol + 24; c++) {
        const h = horaDeCabecera(cabecera.getCell(c).value);
        if (h == null) break;
        horas.push({ col: c, hora: h });
      }
      if (horas.length === 0) return;
      // Agentes: hasta la fila de totales (fórmula en la columna M) o el bloque
      // siguiente; las filas vacías entre medias (Carmen, Lucía... van tras una) se saltan
      for (let r = nFila + 2; r <= Math.min(hoja.rowCount, nFila + 40); r++) {
        const filaAgente = hoja.getRow(r);
        const nombre = filaAgente.getCell(13).value;
        const esFormula = typeof nombre === "object" && nombre != null && "formula" in (nombre as object);
        if (esFormula || String(nombre ?? "").startsWith("=") || filaAgente.getCell(nCol).value instanceof Date) break;
        const numero = numeroAgente(filaAgente.getCell(3).value, filaAgente.getCell(4).value);
        if (!numero) continue;
        for (const { col, hora } of horas) {
          const color = claveColor(filaAgente.getCell(col));
          if (!color) continue;
          const k = `${numero}|${fecha}|${hora}`;
          if (vistas.has(k)) continue;
          vistas.add(k);
          celdas.push({ agenteNumero: numero, fecha, hora, color, significado: colores[color] ?? null });
        }
      }
    });
  });
  return celdas.sort((a, b) => a.fecha.localeCompare(b.fecha) || a.agenteNumero.localeCompare(b.agenteNumero) || a.hora - b.hora);
}

export interface TramoImportado {
  agenteNumero: string;
  fecha: string;
  inicioMin: number;
  finMin: number;
  codigo: string;
}

/** Une las horas seguidas del mismo cliente (o tipo de ausencia) de cada agente y día. */
export function unirHoras(celdas: readonly CeldaPlantilla[], tipo: "cliente" | "ausencia"): TramoImportado[] {
  const tramos: TramoImportado[] = [];
  for (const c of celdas) {
    const s = c.significado;
    const codigo = s && tipo in s ? (s as Record<string, string>)[tipo] : null;
    if (!codigo) continue;
    const ultimo = tramos[tramos.length - 1];
    if (ultimo && ultimo.agenteNumero === c.agenteNumero && ultimo.fecha === c.fecha && ultimo.codigo === codigo && ultimo.finMin === c.hora * 60) {
      ultimo.finMin += 60;
    } else {
      tramos.push({ agenteNumero: c.agenteNumero, fecha: c.fecha, inicioMin: c.hora * 60, finMin: c.hora * 60 + 60, codigo });
    }
  }
  return tramos;
}
