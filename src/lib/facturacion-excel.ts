import type ExcelJS from "exceljs";
import type { EstadoDdi, UnidadFacturacion } from "@/lib/db/schema";
import type { LineaCierre } from "@/lib/facturacion-campania";

// ============================================================
// Lectura del Excel de facturación de operaciones («Interacciones GH_cs v4
// …xlsx») para importar sus maestros y su histórico (14/10/2026):
//  - «LISTADO DDI DETALLE»: inventario de DDIs → tabla ddis.
//  - «CAMP GS»: código de cada campaña en GS → tabla campanias_gs.
//  - «facturacion cerrada»: lo facturado cada mes por campaña → cierres
//    importados.
// Las columnas se buscan por su cabecera (fila 1), no por su letra. Los
// códigos de campaña de Altitude v7 (hasta enero de 2025) no son los de la
// v8 actual: esas filas se importan sin campaña.
// ============================================================

/** Valor simple de una celda de ExcelJS (resultado de fórmula, texto enriquecido…). */
export function valorCelda(v: ExcelJS.CellValue): string | number | Date | null {
  if (v == null) return null;
  if (v instanceof Date || typeof v === "number" || typeof v === "string") return v;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (typeof v === "object") {
    if ("result" in v) return valorCelda(v.result as ExcelJS.CellValue);
    if ("richText" in v) return v.richText.map((t) => t.text).join("");
    if ("text" in v) return String(v.text);
  }
  return null;
}

/** Texto recortado; vacío → null. */
export function texto(v: ExcelJS.CellValue): string | null {
  const x = valorCelda(v);
  if (x == null) return null;
  const s = x instanceof Date ? fechaISO(x) : String(x).trim();
  return s === "" ? null : s;
}

/** Número; vacío, guiones de formato contable («  -  ») o texto → null. */
export function numero(v: ExcelJS.CellValue): number | null {
  const x = valorCelda(v);
  if (typeof x === "number") return Number.isFinite(x) ? x : null;
  if (typeof x === "string") {
    const s = x.trim().replace(/\./g, "").replace(",", ".");
    return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : null;
  }
  return null;
}

/**
 * Fecha de Excel → YYYY-MM-DD. ExcelJS da las celdas con formato de fecha
 * como Date a las 00:00 UTC; las que no tienen ese formato llegan como el
 * número de serie (en «LISTADO DDI DETALLE», tres fechas de baja), que
 * también se aceptan (días desde el 30/12/1899).
 */
export function fechaISO(v: ExcelJS.CellValue | Date): string | null {
  let x = v instanceof Date ? v : valorCelda(v);
  if (typeof x === "number" && x > 20000 && x < 80000) x = new Date(Math.round((x - 25569) * 86_400_000));
  if (!(x instanceof Date) || Number.isNaN(x.getTime())) return null;
  return `${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, "0")}-${String(x.getUTCDate()).padStart(2, "0")}`;
}

export function estadoDdi(v: string | null): EstadoDdi | null {
  const s = (v ?? "").toUpperCase();
  if (s.startsWith("EN PRODUC")) return "en_produccion";
  if (s.startsWith("BAJA")) return "baja";
  if (s.startsWith("DESHABILIT")) return "deshabilitado";
  return null;
}

/** Columnas por cabecera (la primera aparición de cada nombre, de izquierda a derecha). */
function columnasPorCabecera(hoja: ExcelJS.Worksheet, fila = 1): Map<string, number> {
  const mapa = new Map<string, number>();
  hoja.getRow(fila).eachCell({ includeEmpty: false }, (celda, col) => {
    const t = texto(celda.value);
    if (t && !mapa.has(t)) mapa.set(t, col);
  });
  return mapa;
}

function hoja(libro: ExcelJS.Workbook, nombre: string): ExcelJS.Worksheet {
  const h = libro.getWorksheet(nombre);
  if (!h) throw new Error(`El Excel no tiene la hoja «${nombre}»`);
  return h;
}

function exigir(cols: Map<string, number>, nombres: string[], hojaNombre: string): void {
  const faltan = nombres.filter((n) => !cols.has(n));
  if (faltan.length > 0) throw new Error(`En «${hojaNombre}» faltan las columnas: ${faltan.join(", ")}`);
}

// ---------- DDIs ----------

export interface DdiExcel {
  numero: string;
  campaignShortname: string | null;
  estado: EstadoDdi;
  fechaAlta: string | null;
  fechaBaja: string | null;
  fechaSolicitud: string | null;
  versionAltitude: string | null;
  huntGroup: string | null;
  accountCode: string | null;
  lineaIntermedia: string | null;
  departamento: string | null;
  tipoUso: string | null;
  uso: string | null;
  clienteGs: string | null;
  empresa: string | null;
  nombreCampania: string | null;
  centro: string | null;
  campaniaGs: string | null;
  sentido: string | null;
  unidadNegocio: string | null;
  marca: string | null;
  notas: string | null;
}

/**
 * «LISTADO DDI DETALLE» → asignaciones de DDI. `codigoACampania`: código de
 * ph_campaign → shortname de la v8. Las filas de «Alt V7» van sin campaña
 * (sus códigos son de otra instalación) con una nota.
 */
export function leerDdis(
  libro: ExcelJS.Workbook,
  codigoACampania: ReadonlyMap<number, string>,
): { ddis: DdiExcel[]; avisos: string[] } {
  const nombre = "LISTADO DDI DETALLE";
  const h = hoja(libro, nombre);
  const c = columnasPorCabecera(h);
  exigir(c, ["ESTADO", "Campaign", "DDI-TmSystem", "FEC EN PROD", "FEC ELIM", "Vers.Altit"], nombre);
  const col = (fila: ExcelJS.Row, cabecera: string) => (c.has(cabecera) ? fila.getCell(c.get(cabecera)!).value : null);
  const ddis: DdiExcel[] = [];
  const avisos: string[] = [];
  for (let i = 2; i <= h.rowCount; i++) {
    const fila = h.getRow(i);
    const numeroDdi = texto(col(fila, "DDI-TmSystem"));
    if (!numeroDdi) continue;
    const estado = estadoDdi(texto(col(fila, "ESTADO")));
    if (!estado) {
      avisos.push(`Fila ${i}: estado «${texto(col(fila, "ESTADO"))}» desconocido, no se importa`);
      continue;
    }
    const version = texto(col(fila, "Vers.Altit"));
    const codigo = numero(col(fila, "Campaign"));
    const esV7 = /v7/i.test(version ?? "");
    let campania: string | null = null;
    if (!esV7 && codigo != null) {
      campania = codigoACampania.get(codigo) ?? null;
      if (!campania) avisos.push(`Fila ${i}: la campaña ${codigo} del DDI ${numeroDdi} no existe en la centralita`);
    }
    const nota = texto(col(fila, "NOTA"));
    const fechaAlta = fechaISO(col(fila, "FEC EN PROD"));
    let fechaBaja = fechaISO(col(fila, "FEC ELIM"));
    if (estado !== "en_produccion" && !fechaBaja && fechaAlta) {
      // Sin fecha de baja se cobraría para siempre: se cierra el día del alta
      avisos.push(`Fila ${i}: DDI ${numeroDdi} en ${estado} sin fecha de baja; se le pone la del alta`);
      fechaBaja = fechaAlta;
    }
    ddis.push({
      numero: numeroDdi,
      campaignShortname: campania,
      estado,
      fechaAlta,
      fechaBaja,
      fechaSolicitud: fechaISO(col(fila, "FEC SOLIC")),
      versionAltitude: version,
      huntGroup: texto(col(fila, "Hunt Group")),
      accountCode: texto(col(fila, "Account CODE")),
      lineaIntermedia: texto(col(fila, "Linea intermedia VF")),
      departamento: texto(col(fila, "DPTO")),
      tipoUso: texto(col(fila, "TIPO USO")),
      uso: texto(col(fila, "USO")),
      clienteGs: texto(col(fila, "CLIENTE")),
      empresa: texto(col(fila, "EMPRESA")),
      nombreCampania: texto(col(fila, "CAMPAÑA")),
      centro: texto(col(fila, "Centro Fidelity")),
      campaniaGs: texto(col(fila, "Campaña en gs")),
      sentido: texto(col(fila, "Sentido Llam")),
      unidadNegocio: texto(col(fila, "COD_UNINEG")),
      marca: texto(col(fila, "MARCA")),
      notas: [esV7 && codigo != null ? `Altitude v7, campaña n.º ${codigo}` : null, nota].filter(Boolean).join(". ") || null,
    });
  }
  return { ddis, avisos };
}

// ---------- Códigos de GS ----------

export interface CampaniaGsExcel {
  campaignShortname: string;
  codigoGs: string;
  denominacion: string | null;
  clienteGs: string | null;
  presupuestoGs: string | null;
  fechaInicio: string | null;
  fechaFin: string | null;
}

/**
 * «CAMP GS» → código de GS vigente de cada campaña de la v8. Solo las filas
 * en curso («Est» distinto de F) con un código de campaña que exista; si una
 * campaña sale dos veces, la de inicio más reciente (las bbdd cambian de
 * código en cada tanda).
 */
export function leerCampaniasGs(
  libro: ExcelJS.Workbook,
  codigoACampania: ReadonlyMap<number, string>,
): { campanias: CampaniaGsExcel[]; avisos: string[] } {
  const nombre = "CAMP GS";
  const h = hoja(libro, nombre);
  const c = columnasPorCabecera(h);
  exigir(c, ["Cód.Camp.Altit.", "Cód.Camp", "Est"], nombre);
  const col = (fila: ExcelJS.Row, cabecera: string) => (c.has(cabecera) ? fila.getCell(c.get(cabecera)!).value : null);
  const porCampania = new Map<string, CampaniaGsExcel>();
  const avisos: string[] = [];
  for (let i = 2; i <= h.rowCount; i++) {
    const fila = h.getRow(i);
    const codigoGs = texto(col(fila, "Cód.Camp"));
    if (!codigoGs) continue;
    const denominacion = texto(col(fila, "Denominación Campaña"));
    if ((texto(col(fila, "Est")) ?? "").toUpperCase() === "F") continue; // finalizada
    const codigo = numero(col(fila, "Cód.Camp.Altit."));
    const campania = codigo != null ? codigoACampania.get(codigo) : undefined;
    if (!campania) {
      avisos.push(`Fila ${i}: ${codigoGs} «${denominacion ?? ""}» con código de campaña ${codigo ?? "vacío"}: no se importa`);
      continue;
    }
    const nueva: CampaniaGsExcel = {
      campaignShortname: campania,
      codigoGs,
      denominacion,
      clienteGs: texto(col(fila, "Cliente")),
      presupuestoGs: texto(col(fila, "Presupuesto")),
      fechaInicio: fechaISO(col(fila, "Fecha Inicio Campaña")),
      fechaFin: fechaISO(col(fila, "Fecha Fin Campaña")),
    };
    const previa = porCampania.get(campania);
    if (!previa || (nueva.fechaInicio ?? "") >= (previa.fechaInicio ?? "")) porCampania.set(campania, nueva);
  }
  return { campanias: [...porCampania.values()].sort((a, b) => a.campaignShortname.localeCompare(b.campaignShortname)), avisos };
}

// ---------- Histórico «facturacion cerrada» ----------

export interface FilaCerradaExcel {
  mes: string; // YYYY-MM
  codigoAltitude: number | null;
  campania: string;
  /** Cantidad e importe por unidad (null si la celda está vacía o es «-»). */
  valores: Partial<Record<UnidadFacturacion, { cantidad: number | null; importe: number | null }>>;
  total: number | null;
}

/** Cabeceras de «facturacion cerrada» de cada unidad: [cantidad, importe]. */
const COLUMNAS_CERRADA: [UnidadFacturacion, string, string][] = [
  ["horas_logadas", "Horas Logadas", "Precio Total"],
  ["minutos_fijo", "Tarificacion Fija", "Precio T.Fija"],
  ["minutos_movil", "Tarifiación Móvil", "Precio T.Móvil"],
  ["leads", "Contactos Finali", "Precio Total Cont"],
  ["ddi", "Alquiler Ddis", "Precio Alq Ddis"],
];

/** «facturacion cerrada» (cabecera en la fila 3) → filas por mes y campaña. */
export function leerFacturacionCerrada(libro: ExcelJS.Workbook): FilaCerradaExcel[] {
  const nombre = "facturacion cerrada";
  const h = hoja(libro, nombre);
  const c = columnasPorCabecera(h, 3);
  exigir(c, ["MES", "c_camp", "campaña", "Totalidad", ...COLUMNAS_CERRADA.flatMap(([, a, b]) => [a, b])], nombre);
  const col = (fila: ExcelJS.Row, cabecera: string) => fila.getCell(c.get(cabecera)!).value;
  const filas: FilaCerradaExcel[] = [];
  for (let i = 4; i <= h.rowCount; i++) {
    const fila = h.getRow(i);
    const fecha = fechaISO(col(fila, "MES"));
    const campania = texto(col(fila, "campaña"));
    if (!fecha || !campania) continue;
    const valores: FilaCerradaExcel["valores"] = {};
    for (const [unidad, cantidad, importe] of COLUMNAS_CERRADA) {
      valores[unidad] = { cantidad: numero(col(fila, cantidad)), importe: numero(col(fila, importe)) };
    }
    filas.push({
      mes: fecha.slice(0, 7),
      codigoAltitude: numero(col(fila, "c_camp")),
      campania,
      valores,
      total: numero(col(fila, "Totalidad")),
    });
  }
  return filas;
}

/**
 * Filas de un mes del histórico → líneas de cierre. El precio es el que sale
 * de importe ÷ cantidad (el Excel no lo guarda) y el importe va sin
 * redondear, como en el Excel. Sin código de GS: las bbdd
 * cambiaban de código en cada tanda y el de hoy no vale para meses pasados.
 */
export function lineasDeFilasCerradas(filas: readonly FilaCerradaExcel[]): LineaCierre[] {
  const lineas: LineaCierre[] = [];
  for (const f of filas) {
    for (const [unidad] of COLUMNAS_CERRADA) {
      const v = f.valores[unidad];
      const cantidad = v?.cantidad ?? 0;
      const importe = v?.importe ?? null;
      if (cantidad === 0 && !importe) continue;
      lineas.push({
        campania: f.campania,
        codigoGs: null,
        unidad,
        cantidad,
        precioUnitario: cantidad !== 0 && importe != null ? Math.round((importe / cantidad) * 10000) / 10000 : null,
        // Tal cual (el Excel no redondea el de los minutos): así el total del mes cuadra
        importe,
      });
    }
  }
  return lineas;
}
