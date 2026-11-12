// ============================================================
// Callback de las entrantes (12/11/2026, estudiado y decidido con Christian).
// PURO (con tests): la consulta está en rdb/queries/callback.ts y la
// configuración en db/callback.ts.
//
// Cómo funciona en Altitude: todas las entrantes entran por el IVR. Si en la
// campaña a la que va la llamada no hay ningún agente que pueda cogerla, la
// campaña la rechaza (estado 7) o la desborda (9) y el IVR (usuario de tipo 3,
// IVR41-60) da de alta un contacto en esa campaña («ficha de callback»), con
// el teléfono en activity.resch_phone_value, en menos de 10 minutos. Las
// altas del IVR en su propia campaña IVR_* son otra cosa (una ficha por
// llamada) y no cuentan. No hay «pulse para que le llamemos».
//
// Decidido el 12/11/2026:
//  - Devuelto = un agente TOCA esa ficha: una llamada (con número o sin él:
//    a veces la gestión es en la herramienta del cliente y basta abrir la
//    ficha y finalizar el guion) o una sesión de guion sobre ella. Se cuenta
//    por llamada (ficha), no por número.
//  - Tiempo hasta devolver SOLO en horario de atención del cliente (su
//    calendario de Altitude, el de planificación): una ficha de las 20:55
//    devuelta a las 9:05 son minutos, no 12 horas. Sin calendario, reloj.
//  - Qué clientes y campañas tienen callback lo dice el admin (no se
//    deduce: si el callback se rompe, la deducción dejaría de verlo).
//  - El cliente no lo ve (no va a «Mi servicio»).
//  - Alerta «callback sin funcionar» (y ticket por correo a dtecnico@): en
//    el caso de GH no se creó ninguna ficha entre el 03/07/2026 10:43 y el
//    26/10/2026 09:23, con unas 3.450 rechazadas.
// ============================================================

/** Un cliente (servicio de Altitude) con callback. */
export interface ConfigCallbackServicio {
  servicio: string;
  /** Calendario de horarios_servicio («GrupoAvolo» para Ávolo); null = tiempo de reloj. */
  calendario: string | null;
  /** Campañas con callback; null = todas las de agentes del servicio. */
  campanias: string[] | null;
}

export interface ConfigCallback {
  servicios: ConfigCallbackServicio[];
  /** Rechazadas seguidas en horario sin ninguna ficha para avisar. */
  umbralAlerta: number;
  /** Correo que recibe el ticket de la alerta (la herramienta de tickets). */
  destinatario: string;
}

/**
 * 10 rechazadas seguidas sin ficha. Medido del 01/09 al 11/11/2026 con el
 * callback funcionando: la racha más larga fue de 4 en GH, 6 en Ávolo y 9 en
 * CEFF (quien cuelga enseguida no deja ficha). Durante el corte de GH hubo
 * unas 38 rechazadas al día: habría avisado a media mañana del 03/07.
 */
export const UMBRAL_ALERTA_POR_DEFECTO = 10;
export const DESTINATARIO_POR_DEFECTO = "dtecnico@tmsystem.es";
/** Margen para que el IVR cree la ficha tras la llamada (lo normal: 13-92 s). */
export const MINUTOS_MARGEN_FICHA = 10;

/** Configuración guardada (JSON de app_settings); lo que no se entienda, fuera. */
export function leerConfigCallback(texto: string | null | undefined): ConfigCallback {
  const vacia: ConfigCallback = { servicios: [], umbralAlerta: UMBRAL_ALERTA_POR_DEFECTO, destinatario: DESTINATARIO_POR_DEFECTO };
  if (!texto) return vacia;
  try {
    const c = JSON.parse(texto) as Partial<ConfigCallback>;
    const servicios = Array.isArray(c.servicios)
      ? c.servicios
          .filter((s): s is ConfigCallbackServicio => !!s && typeof s.servicio === "string" && s.servicio.trim() !== "")
          .map((s) => ({
            servicio: s.servicio.trim(),
            calendario: typeof s.calendario === "string" && s.calendario.trim() ? s.calendario.trim() : null,
            campanias: Array.isArray(s.campanias)
              ? [...new Set(s.campanias.filter((x): x is string => typeof x === "string" && x.trim() !== ""))]
              : null,
          }))
      : [];
    const umbral = Number(c.umbralAlerta);
    return {
      servicios,
      umbralAlerta: Number.isInteger(umbral) && umbral >= 1 && umbral <= 500 ? umbral : UMBRAL_ALERTA_POR_DEFECTO,
      destinatario:
        typeof c.destinatario === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.destinatario.trim())
          ? c.destinatario.trim()
          : DESTINATARIO_POR_DEFECTO,
    };
  } catch {
    return vacia;
  }
}

/** ¿La campaña tiene callback según la configuración del servicio? */
export function campaniaConCallback(cfg: ConfigCallbackServicio, campania: string | null): boolean {
  if (!campania) return false;
  return cfg.campanias == null || cfg.campanias.includes(campania);
}

// ------------------------------------------------------------
// Horario de atención
// ------------------------------------------------------------

/** Tramo del día en minutos desde las 00:00 [inicio, fin). */
export interface TramoDia {
  inicioMin: number;
  finMin: number;
}

/**
 * Tramos de atención de una fecha (YYYY-MM-DD): [] = cerrado, null = sin
 * calendario (cuenta el reloj).
 */
export type HorarioDe = (fecha: string) => readonly TramoDia[] | null;

/** «YYYY-MM-DD HH:MM:SS» (hora local) → fecha y minuto del día (con decimales). */
function partes(momento: string): { fecha: string; min: number } {
  const fecha = momento.slice(0, 10);
  const h = Number(momento.slice(11, 13)) || 0;
  const m = Number(momento.slice(14, 16)) || 0;
  const s = Number(momento.slice(17, 19)) || 0;
  return { fecha, min: h * 60 + m + s / 60 };
}

function diaSiguiente(fecha: string): string {
  const [a, m, d] = fecha.split("-").map(Number);
  const t = new Date(Date.UTC(a, m - 1, d + 1));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}-${String(t.getUTCDate()).padStart(2, "0")}`;
}

/** Como mucho tantos días entre dos momentos (una ficha olvidada no recorre años). */
const MAX_DIAS_HORARIO = 120;

/**
 * Minutos de `desde` a `hasta` que caen en el horario de atención. Los días
 * sin calendario (`horarioDe` da null) cuentan enteros, como el reloj.
 */
export function minutosEnHorario(desde: string, hasta: string, horarioDe: HorarioDe): number {
  if (hasta <= desde) return 0;
  const a = partes(desde);
  const b = partes(hasta);
  let total = 0;
  let fecha = a.fecha;
  for (let i = 0; i <= MAX_DIAS_HORARIO && fecha <= b.fecha; i++, fecha = diaSiguiente(fecha)) {
    const ini = fecha === a.fecha ? a.min : 0;
    const fin = fecha === b.fecha ? b.min : 1440;
    if (fin <= ini) continue;
    const tramos = horarioDe(fecha);
    if (tramos == null) {
      total += fin - ini;
      continue;
    }
    for (const t of tramos) {
      const x = Math.max(ini, t.inicioMin);
      const y = Math.min(fin, t.finMin);
      if (y > x) total += y - x;
    }
  }
  return total;
}

/** Horario semanal de un calendario (forma de planificación, `HorarioLike`). */
export interface HorarioSemanal {
  servicio: string;
  /** 0 = lunes … 6 = domingo. */
  dias: readonly boolean[];
  entradaMin: number;
  salidaMin: number;
  desde: string;
  hasta: string;
}

/**
 * Horario de atención de un calendario, con la misma regla que
 * planificación (`horarioPorFecha`): el horario especial del día manda; en
 * sus festivos, cerrado; fuera de la vigencia de la tabla, el último (o el
 * primero) conocido. null si el calendario no tiene horarios (reloj).
 */
export function horarioDeCalendario(
  horarios: readonly HorarioSemanal[],
  calendario: string | null,
  festivos: ReadonlySet<string>,
  especiales: Readonly<Record<string, readonly TramoDia[]>> = {},
): HorarioDe | null {
  if (!calendario) return null;
  const filas = horarios.filter((h) => h.servicio === calendario);
  if (filas.length === 0) return null;
  const ultimoHasta = filas.reduce((m, h) => (h.hasta > m ? h.hasta : m), filas[0].hasta);
  const primerDesde = filas.reduce((m, h) => (h.desde < m ? h.desde : m), filas[0].desde);
  const cache = new Map<string, TramoDia[]>();
  return (fecha) => {
    const guardado = cache.get(fecha);
    if (guardado) return guardado;
    let tramos: TramoDia[];
    if (especiales[fecha]) tramos = [...especiales[fecha]];
    else if (festivos.has(fecha)) tramos = [];
    else {
      let vigentes = filas.filter((h) => h.desde <= fecha && fecha <= h.hasta);
      if (vigentes.length === 0 && fecha > ultimoHasta) vigentes = filas.filter((h) => h.hasta === ultimoHasta);
      if (vigentes.length === 0 && fecha < primerDesde) vigentes = filas.filter((h) => h.desde === primerDesde);
      const [a, m, d] = fecha.split("-").map(Number);
      const dia = (new Date(Date.UTC(a, m - 1, d)).getUTCDay() + 6) % 7;
      tramos = vigentes
        .filter((h) => h.dias[dia])
        .map((h) => ({ inicioMin: h.entradaMin, finMin: h.salidaMin }))
        .sort((x, y) => x.inicioMin - y.inicioMin);
    }
    cache.set(fecha, tramos);
    return tramos;
  };
}

/** ¿El momento cae dentro del horario de atención? (sin calendario: sí). */
export function enHorario(momento: string, horarioDe: HorarioDe): boolean {
  const p = partes(momento);
  const tramos = horarioDe(p.fecha);
  if (tramos == null) return true;
  return tramos.some((t) => p.min >= t.inicioMin && p.min < t.finMin);
}

// ------------------------------------------------------------
// Datos de la consulta
// ------------------------------------------------------------

/** Una ficha de callback (contacto dado de alta por el IVR en una campaña de agentes). */
export interface FichaCallback {
  servicio: string;
  campania: string;
  contacto: number;
  /** Alta, hora local «YYYY-MM-DD HH:MM:SS». */
  alta: string;
  /** activity.status 0, 1 o 2 (aún abierta). */
  abierta: boolean;
  /** Primer toque de un agente: llamada (con o sin número) o sesión de guion. */
  primerToque: string | null;
  agente: string | null;
  nombreAgente: string | null;
  /** Primera llamada con número de un agente a la ficha. */
  primeraLlamada: string | null;
  /** ¿Alguna de esas llamadas llegó a hablar (segmento Connected)? */
  hablaron: boolean;
}

export type CategoriaEntrante = "atendida" | "rechazada" | "cola" | "ivr" | "otra";

/** Entrantes del periodo agrupadas (una por itr_global). */
export interface GrupoEntrantes {
  servicio: string;
  /** Campaña de agentes a la que fue (null si se quedó en el IVR). */
  campania: string | null;
  categoria: CategoriaEntrante;
  /** Se le creó una ficha en los 10 minutos siguientes (misma campaña y número). */
  conFicha: boolean;
  /** El número ya tenía una ficha de ese día en la campaña (Altitude no crea otra). */
  fichaPrevia: boolean;
  n: number;
}

/** Una rechazada o desbordada (para la alerta). */
export interface RechazadaCallback {
  servicio: string;
  campania: string;
  inicio: string;
}

export interface BaseCallback {
  fichas: FichaCallback[];
  entrantes: GrupoEntrantes[];
  rechazadas: RechazadaCallback[];
}

// ------------------------------------------------------------
// Indicadores
// ------------------------------------------------------------

/** Tramos del tiempo hasta devolver (minutos en horario). */
export const TRAMOS_DEVOLUCION = [
  { clave: "m10", etiqueta: "Menos de 10 min", hasta: 10 },
  { clave: "m60", etiqueta: "10 a 60 min", hasta: 60 },
  { clave: "h4", etiqueta: "1 a 4 h", hasta: 240 },
  { clave: "mas", etiqueta: "Más de 4 h", hasta: Infinity },
] as const;

export interface ResumenCallback {
  /** Fichas creadas en el periodo. */
  creadas: number;
  devueltas: number;
  /** Abiertas y sin tocar. */
  pendientes: number;
  /** Cerradas sin que nadie las tocase (canceladas por el sistema, cerradas a mano…). */
  cerradasSinTocar: number;
  hablamos: number;
  llamadaSinHablar: number;
  /** Tocada sin llamar a un número: gestión en la herramienta del cliente. */
  gestionSinLlamada: number;
  /** Minutos en horario hasta el primer toque. */
  medianaMin: number | null;
  mediaMin: number | null;
  /** % devueltas en menos de 1 h (sobre las devueltas). */
  pctMenos1h: number | null;
  tramos: { clave: string; etiqueta: string; n: number }[];
}

export interface EntrantesResumen {
  recibidas: number;
  atendidas: number;
  /** Rechazadas o desbordadas en campañas con callback. */
  rechazadas: number;
  rechazadasConFicha: number;
  /** El número ya tenía una ficha de hoy: Altitude no crea otra. */
  rechazadasFichaPrevia: number;
  /** Sin ficha: colgaron antes de que llegara el callback. */
  rechazadasSinFicha: number;
  colgaronEnCola: number;
  colgaronEnColaConFicha: number;
  colgaronEnIvr: number;
  /** Rechazadas en campañas sin callback (nadie las va a devolver). */
  rechazadasSinCallback: number;
  otras: number;
}

export interface PendienteAhora {
  servicio: string;
  campania: string;
  contacto: number;
  alta: string;
  /** Minutos en horario esperando. */
  esperaMin: number;
}

export interface CallbackServicio {
  servicio: string;
  conCalendario: boolean;
  resumen: ResumenCallback;
  entrantes: EntrantesResumen;
  porCampania: ({ campania: string } & ResumenCallback)[];
  porAgente: { agente: string; nombre: string; devueltas: number; hablamos: number; medianaMin: number | null }[];
  /** Abiertas y sin tocar AHORA (también de días anteriores de la ventana). */
  pendientesAhora: PendienteAhora[];
}

export interface ResultadoCallback {
  servicios: CallbackServicio[];
  total: ResumenCallback;
}

function r2(v: number | null): number | null {
  return v == null || !isFinite(v) ? null : Math.round(v * 100) / 100;
}

function mediana(v: number[]): number | null {
  if (v.length === 0) return null;
  const s = [...v].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Resumen de unas fichas; cada una con el horario de su cliente. */
function resumir(fichas: readonly FichaCallback[], horarioDe: (f: FichaCallback) => HorarioDe): ResumenCallback {
  const tiempos: number[] = [];
  let pendientes = 0;
  let cerradasSinTocar = 0;
  let hablamos = 0;
  let llamadaSinHablar = 0;
  let gestionSinLlamada = 0;
  for (const f of fichas) {
    if (!f.primerToque) {
      if (f.abierta) pendientes++;
      else cerradasSinTocar++;
      continue;
    }
    tiempos.push(minutosEnHorario(f.alta, f.primerToque, horarioDe(f)));
    if (f.hablaron) hablamos++;
    else if (f.primeraLlamada) llamadaSinHablar++;
    else gestionSinLlamada++;
  }
  const tramos = TRAMOS_DEVOLUCION.map((t) => ({ clave: t.clave, etiqueta: t.etiqueta, n: 0 }));
  for (const m of tiempos) {
    const i = TRAMOS_DEVOLUCION.findIndex((t) => m < t.hasta);
    tramos[i].n++;
  }
  return {
    creadas: fichas.length,
    devueltas: tiempos.length,
    pendientes,
    cerradasSinTocar,
    hablamos,
    llamadaSinHablar,
    gestionSinLlamada,
    medianaMin: r2(mediana(tiempos)),
    mediaMin: r2(tiempos.length ? tiempos.reduce((s, x) => s + x, 0) / tiempos.length : null),
    pctMenos1h: r2(tiempos.length ? (tiempos.filter((m) => m < 60).length / tiempos.length) * 100 : null),
    tramos,
  };
}

function resumirEntrantes(grupos: readonly GrupoEntrantes[], cfg: ConfigCallbackServicio): EntrantesResumen {
  const e: EntrantesResumen = {
    recibidas: 0,
    atendidas: 0,
    rechazadas: 0,
    rechazadasConFicha: 0,
    rechazadasFichaPrevia: 0,
    rechazadasSinFicha: 0,
    colgaronEnCola: 0,
    colgaronEnColaConFicha: 0,
    colgaronEnIvr: 0,
    rechazadasSinCallback: 0,
    otras: 0,
  };
  for (const g of grupos) {
    e.recibidas += g.n;
    if (g.categoria === "atendida") e.atendidas += g.n;
    else if (g.categoria === "ivr") e.colgaronEnIvr += g.n;
    else if (g.categoria === "cola") {
      e.colgaronEnCola += g.n;
      if (g.conFicha) e.colgaronEnColaConFicha += g.n;
    } else if (g.categoria === "rechazada") {
      if (!campaniaConCallback(cfg, g.campania)) {
        e.rechazadasSinCallback += g.n;
        continue;
      }
      e.rechazadas += g.n;
      if (g.conFicha) e.rechazadasConFicha += g.n;
      else if (g.fichaPrevia) e.rechazadasFichaPrevia += g.n;
      else e.rechazadasSinFicha += g.n;
    } else e.otras += g.n;
  }
  return e;
}

/**
 * Indicadores de callback de cada cliente configurado. `desde` (YYYY-MM-DD)
 * marca qué fichas son del periodo: las anteriores de la base solo sirven
 * para los pendientes de ahora (Tiempo real). `ahora`, hora local
 * «YYYY-MM-DD HH:MM:SS».
 */
export function calcularCallback(
  base: BaseCallback,
  config: ConfigCallback,
  horarios: Readonly<Record<string, HorarioDe>>,
  desde: string,
  ahora: string,
): ResultadoCallback {
  const reloj: HorarioDe = () => null;
  const servicios: CallbackServicio[] = config.servicios
    .map((cfg) => {
      const horarioDe = horarios[cfg.servicio] ?? reloj;
      const todas = base.fichas.filter((f) => f.servicio === cfg.servicio);
      const fichas = todas.filter((f) => f.alta.slice(0, 10) >= desde);
      const camps = [...new Set(fichas.map((f) => f.campania))].sort((a, b) => a.localeCompare(b, "es"));
      const agentes = new Map<string, { nombre: string; tiempos: number[]; hablamos: number }>();
      for (const f of fichas) {
        if (!f.primerToque || !f.agente) continue;
        const a = agentes.get(f.agente) ?? { nombre: f.nombreAgente ?? f.agente, tiempos: [], hablamos: 0 };
        a.tiempos.push(minutosEnHorario(f.alta, f.primerToque, horarioDe));
        if (f.hablaron) a.hablamos++;
        agentes.set(f.agente, a);
      }
      return {
        servicio: cfg.servicio,
        conCalendario: horarios[cfg.servicio] != null,
        resumen: resumir(fichas, () => horarioDe),
        entrantes: resumirEntrantes(
          base.entrantes.filter((g) => g.servicio === cfg.servicio),
          cfg,
        ),
        porCampania: camps.map((c) => ({ campania: c, ...resumir(fichas.filter((f) => f.campania === c), () => horarioDe) })),
        porAgente: [...agentes]
          .map(([agente, a]) => ({
            agente,
            nombre: a.nombre,
            devueltas: a.tiempos.length,
            hablamos: a.hablamos,
            medianaMin: r2(mediana(a.tiempos)),
          }))
          .sort((x, y) => x.agente.localeCompare(y.agente, "es", { numeric: true, sensitivity: "base" })),
        pendientesAhora: todas
          .filter((f) => f.abierta && !f.primerToque)
          .map((f) => ({
            servicio: f.servicio,
            campania: f.campania,
            contacto: f.contacto,
            alta: f.alta,
            esperaMin: r2(minutosEnHorario(f.alta, ahora, horarioDe)) ?? 0,
          }))
          .sort((a, b) => a.alta.localeCompare(b.alta)),
      };
    })
    .sort((a, b) => a.servicio.localeCompare(b.servicio, "es", { sensitivity: "base" }));
  // Total: cada ficha con el horario de su cliente
  const fichasTotal = base.fichas.filter(
    (f) => config.servicios.some((c) => c.servicio === f.servicio) && f.alta.slice(0, 10) >= desde,
  );
  return { servicios, total: resumir(fichasTotal, (f) => horarios[f.servicio] ?? reloj) };
}

// ------------------------------------------------------------
// Alerta «callback sin funcionar»
// ------------------------------------------------------------

export interface AlertaCallback {
  servicio: string;
  /** Rechazadas en horario, en campañas con callback, desde la última ficha. */
  rechazadas: number;
  /** Primera de ellas (hora local). */
  desde: string;
  /** Última ficha de callback de hoy (hora local), o null si hoy no hay ninguna. */
  ultimaFicha: string | null;
}

/**
 * Clientes con el callback aparentemente roto HOY: al menos `umbralAlerta`
 * rechazadas o desbordadas seguidas, en horario de atención y en campañas
 * con callback, sin ninguna ficha nueva del cliente desde la primera (con
 * `MINUTOS_MARGEN_FICHA` de margen para que el IVR la cree).
 */
export function alertasCallback(
  base: Pick<BaseCallback, "fichas" | "rechazadas">,
  config: ConfigCallback,
  horarios: Readonly<Record<string, HorarioDe>>,
  hoy: string,
  ahora: string,
): AlertaCallback[] {
  const limite = restarMinutos(ahora, MINUTOS_MARGEN_FICHA);
  const alertas: AlertaCallback[] = [];
  for (const cfg of config.servicios) {
    const horarioDe = horarios[cfg.servicio] ?? (() => null);
    const altas = base.fichas
      .filter((f) => f.servicio === cfg.servicio && f.alta.slice(0, 10) === hoy)
      .map((f) => f.alta)
      .sort();
    const ultimaFicha = altas.at(-1) ?? null;
    const sin = base.rechazadas
      .filter(
        (r) =>
          r.servicio === cfg.servicio &&
          r.inicio.slice(0, 10) === hoy &&
          r.inicio <= limite &&
          (ultimaFicha == null || r.inicio > ultimaFicha) &&
          campaniaConCallback(cfg, r.campania) &&
          enHorario(r.inicio, horarioDe),
      )
      .map((r) => r.inicio)
      .sort();
    if (sin.length >= config.umbralAlerta) {
      alertas.push({ servicio: cfg.servicio, rechazadas: sin.length, desde: sin[0], ultimaFicha });
    }
  }
  return alertas;
}

/** «YYYY-MM-DD HH:MM:SS» menos unos minutos (en el mismo formato; sin horario de verano: es una resta de texto local). */
export function restarMinutos(momento: string, minutos: number): string {
  const [f, h] = momento.split(" ");
  const [a, m, d] = f.split("-").map(Number);
  const [hh, mi, ss] = (h ?? "00:00:00").split(":").map(Number);
  const t = new Date(Date.UTC(a, m - 1, d, hh, mi - minutos, ss || 0));
  const dos = (n: number) => String(n).padStart(2, "0");
  return `${t.getUTCFullYear()}-${dos(t.getUTCMonth() + 1)}-${dos(t.getUTCDate())} ${dos(t.getUTCHours())}:${dos(t.getUTCMinutes())}:${dos(t.getUTCSeconds())}`;
}

/** Asunto y cuerpo del correo que abre el ticket. */
export function correoAlertaCallback(a: AlertaCallback, urlPanel: string | null): { asunto: string; texto: string } {
  const hora = (m: string) => m.slice(11, 16);
  const fecha = (m: string) => `${m.slice(8, 10)}/${m.slice(5, 7)}/${m.slice(0, 4)}`;
  return {
    asunto: `[Dashboard] Callback sin funcionar en ${a.servicio} (${fecha(a.desde)})`,
    texto: [
      `El callback de ${a.servicio} parece no estar funcionando.`,
      "",
      `Desde las ${hora(a.desde)} del ${fecha(a.desde)} hay ${a.rechazadas} llamadas entrantes rechazadas o desbordadas ` +
        "(sin ningún agente disponible), en horario de atención y en campañas con callback, y el IVR no ha creado " +
        "ninguna ficha de callback para devolverlas.",
      a.ultimaFicha
        ? `La última ficha de callback de hoy se creó a las ${hora(a.ultimaFicha)}.`
        : "Hoy no se ha creado ninguna ficha de callback.",
      "",
      "Qué revisar: la configuración del callback de esas campañas en Altitude (el IVR da de alta un contacto en la " +
        "campaña cuando la llamada se rechaza). Entre el 03/07/2026 y el 26/10/2026 el de GrupoHuertas no creó " +
        "ninguna ficha con unas 3.450 llamadas rechazadas.",
      ...(urlPanel ? ["", `Supervisión: ${urlPanel}`] : []),
      "",
      "Este correo lo envía el dashboard de TmSystem una vez al día por cliente mientras dure el problema.",
    ].join("\n"),
  };
}
