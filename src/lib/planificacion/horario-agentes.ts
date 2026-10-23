// ============================================================
// Copia del plan PUBLICADO para las agentes (PDF y HTML): solo los días y
// las horas que trabaja cada una, SIN el cliente. Lógica PURA (misma regla
// de ESLint que el motor): la usan la ruta de descarga y los tests.
//
// - Los bloques seguidos de una persona se juntan aunque sean de clientes
//   distintos: «9–12 GH + 12–14 UGR» es «9–14».
// - Las ausencias de AHORA (son hechos, sin versiones) se descuentan: una
//   vacación apuntada después de publicar no puede salir como día de trabajo
//   en la copia que recibe la agente.
// - Un día sin trabajo sale como su ausencia (VAC, FEST…), «Festivo» si es
//   festivo de la plantilla (o cierre de empresa) o «Libre».
// ============================================================
import type { AusenciaMotor, DiaMotor } from "./motor";
import { nombreMes } from "./tablero";

export interface TramoHorario {
  inicioMin: number;
  finMin: number;
}

export type EstadoDiaHorario = "trabaja" | "ausencia" | "festivo" | "libre";

export interface DiaHorario {
  fecha: string;
  estado: EstadoDiaHorario;
  /** Tramos de trabajo ya juntados, de menor a mayor. */
  tramos: TramoHorario[];
  /** Código del tipo de ausencia del día (solo si no trabaja nada ese día). */
  ausencia: string | null;
  minutos: number;
}

export interface FilaHorario {
  numero: string;
  nombre: string;
  /** Un día por columna, en el mismo orden que `columnas`. */
  dias: DiaHorario[];
}

export interface ColumnaHorario {
  fecha: string;
  /** Día del mes (1..31). */
  dia: number;
  /** 0 = lunes … 6 = domingo (como el motor). */
  diaSemana: number;
  finDeSemana: boolean;
  /** Festivo de la plantilla o cierre de empresa. */
  festivo: boolean;
  /** Primer día de una semana (lunes) que no es el primero del mes. */
  empiezaSemana: boolean;
}

export interface TipoAusenciaHorario {
  codigo: string;
  nombre: string;
  color: string;
}

export interface HorarioMes {
  mes: string;
  /** «octubre de 2026». */
  mesTexto: string;
  version: { numero: number; publicadaAt: string | null };
  columnas: ColumnaHorario[];
  filas: FilaHorario[];
  /** Solo los tipos que salen en la copia (para la leyenda). */
  tipos: TipoAusenciaHorario[];
  /** Algún día del mes es festivo o cierre (para la leyenda). */
  hayFestivos: boolean;
}

export interface EntradaHorario {
  mes: string;
  version: { numero: number; publicadaAt: string | null };
  dias: readonly DiaMotor[];
  /** Calendario de la plantilla en `dias[].festivos` (`EntradaMotor.servicioCalendario`). */
  calendarioPlantilla: string;
  /** Agentes que salen en la copia (nombre null = sale el número). */
  agentes: readonly { numero: string; nombre: string | null }[];
  bloques: readonly { agenteNumero: string; fecha: string; inicioMin: number; finMin: number }[];
  /** nº de agente → ausencias ya expandidas por día (`expandirAusencias`). */
  ausencias: Readonly<Record<string, readonly AusenciaMotor[]>>;
  tipos: Readonly<Record<string, { nombre: string; color: string }>>;
}

/** Une tramos que se tocan o se pisan. */
export function juntarTramos(tramos: readonly TramoHorario[]): TramoHorario[] {
  const orden = [...tramos].filter((t) => t.finMin > t.inicioMin).sort((a, b) => a.inicioMin - b.inicioMin);
  const resultado: TramoHorario[] = [];
  for (const t of orden) {
    const ultimo = resultado[resultado.length - 1];
    if (ultimo && t.inicioMin <= ultimo.finMin) ultimo.finMin = Math.max(ultimo.finMin, t.finMin);
    else resultado.push({ inicioMin: t.inicioMin, finMin: t.finMin });
  }
  return resultado;
}

/** Quita de los tramos lo que pisan los huecos (ausencias). */
export function restarTramos(tramos: readonly TramoHorario[], huecos: readonly TramoHorario[]): TramoHorario[] {
  let actuales = juntarTramos(tramos);
  for (const h of huecos) {
    const siguientes: TramoHorario[] = [];
    for (const t of actuales) {
      if (h.finMin <= t.inicioMin || h.inicioMin >= t.finMin) {
        siguientes.push(t);
        continue;
      }
      if (h.inicioMin > t.inicioMin) siguientes.push({ inicioMin: t.inicioMin, finMin: h.inicioMin });
      if (h.finMin < t.finMin) siguientes.push({ inicioMin: h.finMin, finMin: t.finMin });
    }
    actuales = siguientes;
  }
  return actuales;
}

/** 540 → «9», 570 → «9:30» (para la casilla del PDF y la tabla del equipo). */
export function horaHorario(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h}` : `${h}:${String(m).padStart(2, "0")}`;
}

/** 540 → «9:00» (siempre con minutos: texto largo). */
export function horaHorarioLarga(min: number): string {
  return `${Math.floor(min / 60)}:${String(min % 60).padStart(2, "0")}`;
}

/** {540, 840} → «9–14» (con raya, no guion: no se confunde con un número negativo). */
export function tramoCorto(t: TramoHorario): string {
  return `${horaHorario(t.inicioMin)}–${horaHorario(t.finMin)}`;
}

/** [{540, 840}, {960, 1140}] → «de 9:00 a 14:00 y de 16:00 a 19:00». */
export function tramosLargos(tramos: readonly TramoHorario[]): string {
  const partes = tramos.map((t) => `de ${horaHorarioLarga(t.inicioMin)} a ${horaHorarioLarga(t.finMin)}`);
  return partes.length <= 1 ? (partes[0] ?? "") : `${partes.slice(0, -1).join(", ")} y ${partes[partes.length - 1]}`;
}

/** 300 → «5 h», 330 → «5 h 30 min». */
export function duracionHorario(minutos: number): string {
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/** Arma la copia para las agentes de un plan publicado. */
export function construirHorario(e: EntradaHorario): HorarioMes {
  const dias = [...e.dias].sort((a, b) => a.fecha.localeCompare(b.fecha));
  const columnas: ColumnaHorario[] = dias.map((d, i) => ({
    fecha: d.fecha,
    dia: Number(d.fecha.slice(8, 10)),
    diaSemana: d.diaSemana,
    finDeSemana: d.diaSemana >= 5,
    festivo: d.festivos.includes(e.calendarioPlantilla) || d.cierreEmpresa === true,
    empiezaSemana: i > 0 && d.diaSemana === 0,
  }));

  const porAgenteDia = new Map<string, TramoHorario[]>();
  for (const b of e.bloques) {
    const k = `${b.agenteNumero}|${b.fecha}`;
    const lista = porAgenteDia.get(k) ?? [];
    lista.push({ inicioMin: b.inicioMin, finMin: b.finMin });
    porAgenteDia.set(k, lista);
  }

  // Dos personas con el mismo nombre (dos «María») no se pueden confundir en
  // la copia: a las repetidas se les añade su número de agente
  const nombreDe = (a: { numero: string; nombre: string | null }) => a.nombre?.trim() || a.numero;
  const veces = new Map<string, number>();
  for (const a of e.agentes) veces.set(nombreDe(a).toLocaleLowerCase("es"), (veces.get(nombreDe(a).toLocaleLowerCase("es")) ?? 0) + 1);
  const visible = (a: { numero: string; nombre: string | null }) => {
    const n = nombreDe(a);
    return n !== a.numero && (veces.get(n.toLocaleLowerCase("es")) ?? 0) > 1 ? `${n} (${a.numero})` : n;
  };

  const usados = new Set<string>();
  const filas: FilaHorario[] = e.agentes.map((a) => {
    const ausencias = e.ausencias[a.numero] ?? [];
    return {
      numero: a.numero,
      nombre: visible(a),
      dias: columnas.map((c): DiaHorario => {
        const delDia = ausencias.filter((x) => x.fecha === c.fecha);
        const tramos = restarTramos(porAgenteDia.get(`${a.numero}|${c.fecha}`) ?? [], delDia);
        const minutos = tramos.reduce((s, t) => s + t.finMin - t.inicioMin, 0);
        if (tramos.length > 0) return { fecha: c.fecha, estado: "trabaja", tramos, ausencia: null, minutos };
        // La ausencia más larga del día manda (casi siempre hay una sola)
        const principal = [...delDia].sort((x, y) => y.finMin - y.inicioMin - (x.finMin - x.inicioMin))[0];
        if (principal) {
          usados.add(principal.tipo);
          return { fecha: c.fecha, estado: "ausencia", tramos: [], ausencia: principal.tipo, minutos: 0 };
        }
        return { fecha: c.fecha, estado: c.festivo ? "festivo" : "libre", tramos: [], ausencia: null, minutos: 0 };
      }),
    };
  });
  filas.sort((x, y) => x.nombre.localeCompare(y.nombre, "es") || x.numero.localeCompare(y.numero));

  return {
    mes: e.mes,
    mesTexto: nombreMes(e.mes).toLowerCase().replace(/ (\d{4})$/, " de $1"),
    version: e.version,
    columnas,
    filas,
    tipos: [...usados].sort().map((codigo) => ({
      codigo,
      nombre: e.tipos[codigo]?.nombre ?? codigo,
      color: e.tipos[codigo]?.color ?? "#BFBFBF",
    })),
    hayFestivos: columnas.some((c) => c.festivo),
  };
}

/** Letra del día de la semana para la cabecera del PDF: L M X J V S D. */
export const LETRA_DIA = ["L", "M", "X", "J", "V", "S", "D"] as const;
/** Nombre del día de la semana: «Lunes»… */
export const NOMBRE_DIA = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"] as const;

/** Color «#RRGGBB» mezclado con blanco (0 = el color, 1 = blanco), para fondos suaves. */
export function aclarar(hex: string, cantidad: number): { r: number; g: number; b: number } {
  const limpio = /^#[0-9a-f]{6}$/i.test(hex) ? hex : "#BFBFBF";
  const canal = (i: number) => {
    const v = parseInt(limpio.slice(i, i + 2), 16) / 255;
    return v + (1 - v) * cantidad;
  };
  return { r: canal(1), g: canal(3), b: canal(5) };
}
