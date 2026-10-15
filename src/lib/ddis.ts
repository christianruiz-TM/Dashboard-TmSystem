// ============================================================
// Cuota de DDIs (puro, sin I/O). Decidido 14/10/2026 con Christian: se cobra
// el MES ENTERO por cada DDI activo algún día del mes natural, sin prorrata.
// Activo en un mes = puesto en producción (fecha_alta) antes de que acabe y
// sin baja o con la baja después de que empiece. Es lo que contaba el Excel
// de operaciones («EN PRODUCCIÓN»): septiembre 2026, 365 DDIs, igual campaña
// a campaña.
//
// Un rango que toca varios meses cobra cada mes; uno dentro de un mes cobra
// el mes completo (es una cuota, no un consumo).
//
// Un número se REASIGNA (otra fila en `ddis`: en el Excel, de la campaña de
// Altitude v7 a la de v8, con la baja de una el mismo día que el alta de la
// otra). Cada número se cobra UNA vez al mes, a la asignación que lo tiene al
// final (la de alta más reciente de las activas ese mes): pasar un número de
// campaña a mitad de mes no lo cobra dos veces.
// ============================================================

export interface DdiFechas {
  numero: string;
  campaignShortname: string | null;
  fechaAlta: string | null; // YYYY-MM-DD
  fechaBaja: string | null;
}

/** Meses naturales que toca el rango, como [primer día, último día] (YYYY-MM-DD). */
export function mesesDelRango(desde: string, hasta: string): { mes: string; inicio: string; fin: string }[] {
  const meses: { mes: string; inicio: string; fin: string }[] = [];
  let [anio, mes] = desde.slice(0, 7).split("-").map(Number);
  const ultimo = hasta.slice(0, 7);
  for (;;) {
    const clave = `${anio}-${String(mes).padStart(2, "0")}`;
    if (clave > ultimo) break;
    const dias = new Date(anio, mes, 0).getDate();
    meses.push({ mes: clave, inicio: `${clave}-01`, fin: `${clave}-${String(dias).padStart(2, "0")}` });
    mes += 1;
    if (mes > 12) {
      mes = 1;
      anio += 1;
    }
  }
  return meses;
}

/** El mes natural (YYYY-MM) si el rango es exactamente uno completo; si no, null. */
export function mesCompleto(desde: string, hasta: string): string | null {
  const meses = mesesDelRango(desde, hasta);
  if (meses.length !== 1) return null;
  return meses[0].inicio === desde && meses[0].fin === hasta ? meses[0].mes : null;
}

/** ¿Estuvo el DDI activo algún día entre inicio y fin (incluidos)? */
export function activoEntre(ddi: DdiFechas, inicio: string, fin: string): boolean {
  if (!ddi.fechaAlta || ddi.fechaAlta > fin) return false;
  return ddi.fechaBaja == null || ddi.fechaBaja >= inicio;
}

type Periodo = Pick<DdiFechas, "fechaAlta" | "fechaBaja">;

/**
 * ¿Se pisan dos asignaciones del mismo número? El relevo el mismo día (la
 * baja de una = el alta de la otra) no cuenta: es como lo apunta operaciones.
 * Sin fecha de alta no hay período (nunca estuvo en producción).
 */
export function seSolapan(a: Periodo, b: Periodo): boolean {
  if (!a.fechaAlta || !b.fechaAlta) return false;
  if (a.fechaAlta === b.fechaAlta) return true;
  const finA = a.fechaBaja ?? "9999-12-31";
  const finB = b.fechaBaja ?? "9999-12-31";
  return a.fechaAlta < finB && b.fechaAlta < finA;
}

/**
 * DDI-meses a cobrar por campaña en el rango (un DDI activo en dos meses del
 * rango cuenta 2). Cada número, una vez al mes, a la asignación activa de
 * alta más reciente; si esa no tiene campaña, no se cobra a nadie.
 */
export function ddisFacturables(ddis: readonly DdiFechas[], desde: string, hasta: string): Map<string, number> {
  const porCampania = new Map<string, number>();
  for (const [campania, meses] of ddisPorMes(ddis, desde, hasta)) {
    porCampania.set(campania, [...meses.values()].reduce((a, b) => a + b, 0));
  }
  return porCampania;
}

/**
 * Lo mismo, mes a mes: campaña → (YYYY-MM → DDIs). Hace falta para la opción
 * «solo los meses con llamadas» de la línea de DDIs (facturacion-campania).
 */
export function ddisPorMes(ddis: readonly DdiFechas[], desde: string, hasta: string): Map<string, Map<string, number>> {
  const porCampania = new Map<string, Map<string, number>>();
  for (const m of mesesDelRango(desde, hasta)) {
    const titular = new Map<string, DdiFechas>();
    for (const d of ddis) {
      if (!activoEntre(d, m.inicio, m.fin)) continue;
      const actual = titular.get(d.numero);
      if (!actual || (d.fechaAlta ?? "") > (actual.fechaAlta ?? "")) titular.set(d.numero, d);
    }
    for (const d of titular.values()) {
      if (!d.campaignShortname) continue;
      const meses = porCampania.get(d.campaignShortname) ?? new Map<string, number>();
      meses.set(m.mes, (meses.get(m.mes) ?? 0) + 1);
      porCampania.set(d.campaignShortname, meses);
    }
  }
  return porCampania;
}
