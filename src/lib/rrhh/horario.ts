// ============================================================
// Panel de RRHH: horario «aprendido» de las personas que no están en la
// plantilla de Planificación (decidido con Christian el 16/11/2026,
// docs/plan-rrhh.md). Puro: sin I/O.
//
// De sus últimas semanas, por día de la semana: la mediana de la primera
// conexión y de la última desconexión, redondeadas a 15 min. Un día de la
// semana entra si se trabajó al menos 2 veces y en la mitad de las semanas en
// que la persona trabajó algo (un sábado suelto no hace horario). Medido el
// 16/11/2026: las 15 personas sin planificar entran y salen casi al minuto
// cada día (0-2 min de desviación).
//
// TURNO PARTIDO: los jueves de Bolsas son 08:00-15:00 y 17:00-20:00. Si en
// al menos la mitad de esos días hay un corte de 1 h o más sin conectar, el
// día lleva dos tramos (mediana de cada una de las cuatro horas, partiendo
// por el corte más largo). Con un solo tramo, las dos horas del mediodía
// salían como «sin conectar a mitad de jornada».
// ============================================================

import type { Tramo } from "./dia";

/** 1 = lunes ... 7 = domingo (ISO). */
export type DiaSemana = 1 | 2 | 3 | 4 | 5 | 6 | 7;
export const DIAS_SEMANA: readonly DiaSemana[] = [1, 2, 3, 4, 5, 6, 7];
export const NOMBRE_DIA: Record<DiaSemana, string> = {
  1: "Lunes",
  2: "Martes",
  3: "Miércoles",
  4: "Jueves",
  5: "Viernes",
  6: "Sábado",
  7: "Domingo",
};
export const INICIAL_DIA: Record<DiaSemana, string> = { 1: "L", 2: "M", 3: "X", 4: "J", 5: "V", 6: "S", 7: "D" };

/** Uno o dos tramos por día de la semana (sin el día = libre). */
export type HorarioSemana = Partial<Record<DiaSemana, Tramo[]>>;

/** Como mucho, dos tramos por día (mañana y tarde). */
export const MAX_TRAMOS_DIA = 2;
/** Un corte sin conectar de 1 h o más parte el día en dos tramos. */
export const CORTE_TURNO_PARTIDO_MIN = 60;

/** Una conexión de una persona en un día (varias el mismo día = sus sesiones). */
export interface DiaConectada {
  fecha: string;
  inicioMin: number;
  finMin: number;
}

export const SEMANAS_APRENDER = 6;
export const REDONDEO_MIN = 15;

/** Día de la semana ISO de una fecha YYYY-MM-DD (sin depender de la zona horaria). */
export function diaSemanaDe(fecha: string): DiaSemana {
  const [a, m, d] = fecha.split("-").map(Number);
  const dia = new Date(Date.UTC(a, m - 1, d)).getUTCDay(); // 0 = domingo
  return (dia === 0 ? 7 : dia) as DiaSemana;
}

/** Lunes de la semana de una fecha (YYYY-MM-DD). */
export function lunesDeFecha(fecha: string): string {
  const [a, m, d] = fecha.split("-").map(Number);
  const t = new Date(Date.UTC(a, m - 1, d - (diaSemanaDe(fecha) - 1)));
  return t.toISOString().slice(0, 10); // en UTC a propósito: es una fecha, no una hora
}

function mediana(valores: readonly number[]): number {
  const s = [...valores].sort((a, b) => a - b);
  const mitad = Math.floor(s.length / 2);
  return s.length % 2 ? s[mitad] : (s[mitad - 1] + s[mitad]) / 2;
}

const redondear = (min: number, paso: number) => Math.round(min / paso) * paso;

/** Las sesiones de un día en uno o dos tramos: se parte por el corte más largo si llega a 1 h. */
export function jornadaDelDia(sesiones: readonly Tramo[]): Tramo[] {
  const orden = [...sesiones].filter((t) => t.finMin > t.inicioMin).sort((a, b) => a.inicioMin - b.inicioMin);
  if (orden.length === 0) return [];
  // Juntar lo que se solapa o se toca
  const bloques: Tramo[] = [];
  for (const t of orden) {
    const ultimo = bloques[bloques.length - 1];
    if (ultimo && t.inicioMin <= ultimo.finMin) ultimo.finMin = Math.max(ultimo.finMin, t.finMin);
    else bloques.push({ ...t });
  }
  let corte = -1;
  let mayor = 0;
  for (let i = 0; i < bloques.length - 1; i++) {
    const hueco = bloques[i + 1].inicioMin - bloques[i].finMin;
    if (hueco > mayor) {
      mayor = hueco;
      corte = i;
    }
  }
  const primero = bloques[0].inicioMin;
  const ultimo = bloques[bloques.length - 1].finMin;
  if (corte < 0 || mayor < CORTE_TURNO_PARTIDO_MIN) return [{ inicioMin: primero, finMin: ultimo }];
  return [
    { inicioMin: primero, finMin: bloques[corte].finMin },
    { inicioMin: bloques[corte + 1].inicioMin, finMin: ultimo },
  ];
}

/** Horario aprendido de las sesiones de una persona (cada fila, una sesión de un día). */
export function aprenderHorario(sesiones: readonly DiaConectada[], paso = REDONDEO_MIN): HorarioSemana {
  const porFecha = new Map<string, Tramo[]>();
  for (const s of sesiones) porFecha.set(s.fecha, [...(porFecha.get(s.fecha) ?? []), { inicioMin: s.inicioMin, finMin: s.finMin }]);
  const semanas = new Set([...porFecha.keys()].map(lunesDeFecha)).size;
  const porDia = new Map<DiaSemana, Tramo[][]>();
  for (const [fecha, lista] of porFecha) {
    const ds = diaSemanaDe(fecha);
    porDia.set(ds, [...(porDia.get(ds) ?? []), jornadaDelDia(lista)]);
  }
  const horario: HorarioSemana = {};
  const r = (m: number) => Math.min(1440, redondear(m, paso));
  for (const [ds, jornadas] of porDia) {
    if (jornadas.length < 2 || jornadas.length * 2 < semanas) continue;
    const partidas = jornadas.filter((j) => j.length === 2);
    let tramos: Tramo[];
    if (partidas.length * 2 >= jornadas.length) {
      tramos = [0, 1].map((i) => ({
        inicioMin: r(mediana(partidas.map((j) => j[i].inicioMin))),
        finMin: r(mediana(partidas.map((j) => j[i].finMin))),
      }));
    } else {
      const seguidas = jornadas.filter((j) => j.length === 1);
      const base = seguidas.length > 0 ? seguidas : jornadas;
      tramos = [{ inicioMin: r(mediana(base.map((j) => j[0].inicioMin))), finMin: r(mediana(base.map((j) => j[j.length - 1].finMin))) }];
    }
    tramos = tramos.filter((t) => t.finMin > t.inicioMin);
    // Si al redondear se tocan, es un solo tramo
    if (tramos.length === 2 && tramos[1].inicioMin <= tramos[0].finMin) tramos = [{ inicioMin: tramos[0].inicioMin, finMin: tramos[1].finMin }];
    if (tramos.length > 0) horario[ds] = tramos;
  }
  return horario;
}

/** Horas a la semana de un horario. */
export function horasSemana(h: HorarioSemana): number {
  return DIAS_SEMANA.reduce((s, d) => s + (h[d] ?? []).reduce((x, t) => x + (t.finMin - t.inicioMin) / 60, 0), 0);
}

/** «L-V 08:00-15:00» / «L-X 08:00-15:00 · J 08:00-15:00 y 17:00-20:00». Vacío si no hay ningún día. */
export function textoHorario(h: HorarioSemana): string {
  const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  const grupos: { desde: DiaSemana; hasta: DiaSemana; texto: string }[] = [];
  for (const d of DIAS_SEMANA) {
    const tramos = h[d];
    if (!tramos?.length) continue;
    const texto = tramos.map((t) => `${hhmm(t.inicioMin)}-${hhmm(t.finMin)}`).join(" y ");
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.texto === texto && ultimo.hasta === d - 1) ultimo.hasta = d;
    else grupos.push({ desde: d, hasta: d, texto });
  }
  return grupos
    .map((g) => `${g.desde === g.hasta ? INICIAL_DIA[g.desde] : `${INICIAL_DIA[g.desde]}-${INICIAL_DIA[g.hasta]}`} ${g.texto}`)
    .join(" · ");
}

/** ¿Difieren dos contratos semanales? (a la centésima; null = sin dato, no se compara). */
export function contratosDistintos(a: number | null | undefined, b: number | null | undefined): boolean {
  if (a == null || b == null) return false;
  return Math.round(a * 100) !== Math.round(b * 100);
}
