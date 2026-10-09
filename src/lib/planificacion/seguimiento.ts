// NOTA: solo servidor. Seguimiento del plan (F4): la versión VIGENTE de cada
// mes (la publicada; si no hay, el borrador) frente al tiempo LOGADO
// (user_log, la misma fuente con que factura operaciones, regla 16). Los días
// cerrados salen de agg_logado_usuario; los que faltan por agregar (hoy, o
// todos si las tareas nocturnas no han corrido) se piden en vivo a RDBv2,
// cacheados (60 s si incluyen hoy). Las cuentas son las de los módulos puros
// adherencia.ts, saldo.ts y alertas.ts.
import { format } from "date-fns";
import * as q from "@/lib/rdb/queries/planificacion";
import { campaniasEfectivas } from "@/lib/rdb/queries/servicios";
import type { PlanVersionRow } from "@/lib/db/schema";
import {
  calcularAdherencia,
  SIN_REGLAS,
  type BloquePlanAdh,
  type DiaAdherencia,
  type FilaAdherencia,
  type ReglasAdherencia,
  type TramoLogado,
} from "./adherencia";
import { evaluarAlertas, type Alerta } from "./alertas";
import { leerEquipo, nombresAgentes } from "./equipo";
import { calcularMinimos, desplazarMes, fechasDelMes, lunesDe, sumarDias } from "./motor";
import { leerParametrosPlan } from "./parametros";
import * as repo from "./repositorio";
import { horasCubiertas, saldoAgente, type DiaSaldo, type TotalesSaldo } from "./saldo";
import type { BloqueTablero } from "./tablero";
import { cargarTablero, pendientesRevision, type PendienteRevision } from "./vistas";

const fechaLocal = (d: Date) => format(d, "yyyy-MM-dd");
/** Minuto del día, con decimales (las sesiones de hoy acaban «ahora»). */
const minutoDelDia = (d: Date) => d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;

/** Versión con la que se hace el seguimiento de un mes: la publicada; si no hay, el borrador. */
export function versionVigente(mes: string): PlanVersionRow | null {
  const versiones = repo.versionesMes(mes);
  return versiones.find((v) => v.estado === "publicada") ?? versiones.find((v) => v.estado === "borrador") ?? null;
}

/** Meses (YYYY-MM) que toca un rango de fechas. */
function mesesDe(desde: string, hasta: string): string[] {
  const meses: string[] = [];
  for (let m = desde.slice(0, 7); m <= hasta.slice(0, 7); m = desplazarMes(m, 1)) meses.push(m);
  return meses;
}

// ---------- Tiempo logado ----------

export interface Logado {
  tramos: TramoLogado[];
  /** Islas por usuario (para las horas por cliente del cierre). */
  porUsuario: { usrName: string; fecha: string; inicioMin: number; finMin: number; agenteNumero: string | null; clienteCodigo: string | null }[];
  /** Primer día pedido en vivo a RDBv2 (null = todo de los agregados). */
  vivoDesde: string | null;
}

/**
 * Tiempo logado (user_log) de los usuarios con nº de agente en el rango, con
 * el agente y el cliente de cada usuario (prefijos VIGENTES, como el
 * tablero). Un usuario sin cliente de planificación (Soc_Fed_0892...) llega
 * con cliente null; los que aún no se han sincronizado, sin agente.
 */
export async function logadoRango(desde: string, hasta: string): Promise<Logado> {
  const ultimo = repo.ultimoLogadoAgregado();
  const finAgregado = ultimo == null ? null : ultimo < hasta ? ultimo : hasta;
  const agregadas = finAgregado != null && desde <= finAgregado ? repo.logadoRango(desde, finAgregado) : [];
  const vivoDesde = ultimo == null || ultimo < desde ? desde : ultimo < hasta ? sumarDias(ultimo, 1) : null;
  const vivas = vivoDesde ? await q.islasLogadoUsuario(vivoDesde, hasta) : [];

  const eq = leerEquipo(leerParametrosPlan().equipo, hasta);
  const porUsuario = [...agregadas, ...vivas].map((f) => ({
    usrName: f.usrName,
    fecha: f.fecha,
    inicioMin: f.inicioSeg / 60,
    finMin: f.finSeg / 60,
    agenteNumero: eq.agenteDeUsuario.get(f.usrName) ?? null,
    clienteCodigo: eq.clienteDeUsuario.get(f.usrName) ?? null,
  }));
  const tramos = porUsuario
    .filter((u): u is typeof u & { agenteNumero: string } => u.agenteNumero != null)
    .map((u) => ({ agenteNumero: u.agenteNumero, fecha: u.fecha, inicioMin: u.inicioMin, finMin: u.finMin, clienteCodigo: u.clienteCodigo }));
  return { tramos, porUsuario, vivoDesde };
}

/** Bloques de las versiones vigentes en el rango; los de hoy, recortados a «ahora». */
function bloquesVigentes(desde: string, hasta: string, ahora: Date) {
  const hoy = fechaLocal(ahora);
  const ahoraMin = minutoDelDia(ahora);
  const versiones: { mes: string; version: PlanVersionRow | null }[] = mesesDe(desde, hasta).map((mes) => ({ mes, version: versionVigente(mes) }));
  const bloques: BloquePlanAdh[] = [];
  for (const { version } of versiones) {
    if (!version) continue;
    for (const b of repo.bloquesVersion(version.id)) {
      if (b.fecha < desde || b.fecha > hasta || b.fecha > hoy) continue;
      const finMin = b.fecha === hoy ? Math.min(b.finMin, ahoraMin) : b.finMin;
      if (finMin <= b.inicioMin) continue;
      bloques.push({ agenteNumero: b.agenteNumero, fecha: b.fecha, inicioMin: b.inicioMin, finMin, clienteCodigo: b.clienteCodigo });
    }
  }
  return { versiones, bloques };
}

function clientesPlan() {
  return repo.leerClientesTodos().map((c) => ({ codigo: c.codigo, nombre: c.nombre, color: c.color, modo: c.modo, cuentaComo: c.cuentaComo }));
}

function reglasAdherencia(clientes: ReturnType<typeof clientesPlan>): ReglasAdherencia {
  return {
    clienteBase: clientes.find((c) => c.modo === "resto")?.codigo ?? "",
    aDemanda: new Set(clientes.filter((c) => c.modo === "a_demanda").map((c) => c.codigo)),
    cuentaComo: Object.fromEntries(clientes.map((c) => [c.codigo, c.cuentaComo])),
  };
}

// ---------- Adherencia ----------

export interface DatosAdherencia {
  desde: string;
  hasta: string;
  versiones: { mes: string; numero: number | null; estado: string | null; origen: string | null }[];
  filas: FilaAdherencia[];
  dias: DiaAdherencia[];
  nombres: Record<string, string>;
  clientes: ReturnType<typeof clientesPlan>;
  /** Horas logadas con los usuarios de cada cliente en el periodo, estén o no planificadas (como en Cierre). */
  realPorCliente: Record<string, number>;
  vivoDesde: string | null;
}

/**
 * Adherencia de un rango (hasta hoy, y hoy hasta ahora). Cuentan los agentes
 * planificados en el rango y los de la plantilla del equipo (su tiempo
 * logado sin plan sale como «fuera del plan»).
 */
export async function adherenciaRango(desde: string, hasta: string, ahora = new Date()): Promise<DatosAdherencia> {
  const hoy = fechaLocal(ahora);
  const fin = hasta < hoy ? hasta : hoy;
  const { versiones, bloques } = bloquesVigentes(desde, fin, ahora);
  const logado: Pick<Logado, "tramos" | "porUsuario" | "vivoDesde"> =
    desde <= fin ? await logadoRango(desde, fin) : { tramos: [], porUsuario: [], vivoDesde: null };
  const realPorCliente: Record<string, number> = {};
  for (const u of logado.porUsuario) {
    if (u.clienteCodigo) realPorCliente[u.clienteCodigo] = (realPorCliente[u.clienteCodigo] ?? 0) + (u.finMin - u.inicioMin) / 60;
  }
  const eq = leerEquipo(leerParametrosPlan().equipo, fin);
  const agentes = new Set([...bloques.map((b) => b.agenteNumero), ...eq.plantilla.map((a) => a.numero)]);
  const clientes = clientesPlan();
  const r = calcularAdherencia(bloques, logado.tramos.filter((t) => agentes.has(t.agenteNumero)), reglasAdherencia(clientes));
  const nombres = nombresAgentes(eq);
  return {
    desde,
    hasta: fin,
    versiones: versiones.map(({ mes, version }) => ({
      mes,
      numero: version?.numero ?? null,
      estado: version?.estado ?? null,
      origen: version?.origen ?? null,
    })),
    filas: r.filas,
    dias: r.dias,
    nombres: Object.fromEntries([...nombres].filter(([n]) => agentes.has(n))),
    clientes,
    realPorCliente,
    vivoDesde: logado.vivoDesde,
  };
}

// ---------- Saldo ----------

export interface SaldoAgenteMes {
  numero: string;
  nombre: string | null;
  contratoSemanalH: number;
  dias: DiaSaldo[];
  totales: TotalesSaldo;
  /** Saldo real acumulado desde plan.inicioSaldo hasta el final del mes anterior. */
  arrastre: number;
  ajustes: { id: number; fecha: string; horas: number; motivo: string; autor: string }[];
}

export interface DatosSaldos {
  mes: string;
  version: { numero: number; estado: string } | null;
  /** Último día cerrado (ayer): hasta él, lo logado; después, lo planificado. */
  fechaDatos: string;
  inicioSaldo: string;
  semanas: { lunes: string; fechas: string[] }[];
  agentes: SaldoAgenteMes[];
}

/** Saldo de un mes por agente, sin arrastre. null si el mes no tiene versión. */
async function saldoDelMes(mes: string, fechaDatos: string, inicioSaldo: string) {
  const version = versionVigente(mes);
  if (!version) return null;
  const t = cargarTablero(mes, version.id);
  if (!t) return null;
  const dias = t.entrada.dias.filter((d) => d.fecha >= inicioSaldo);
  if (dias.length === 0) return { version, t, dias, porAgente: new Map<string, ReturnType<typeof saldoAgente>>(), ajustes: [] };
  const desde = dias[0].fecha;
  const hasta = dias[dias.length - 1].fecha;

  // Horas reales de la persona: unión de TODOS sus usuarios, solo días cerrados
  const finReal = fechaDatos < hasta ? fechaDatos : hasta;
  const reales = new Map<string, number>();
  if (desde <= finReal) {
    const { tramos } = await logadoRango(desde, finReal);
    for (const d of calcularAdherencia([], tramos, SIN_REGLAS).dias) reales.set(`${d.agenteNumero}|${d.fecha}`, d.logadoMin / 60);
  }
  const plan = new Map<string, number>();
  for (const b of t.bloques) plan.set(`${b.agenteNumero}|${b.fecha}`, (plan.get(`${b.agenteNumero}|${b.fecha}`) ?? 0) + (b.finMin - b.inicioMin) / 60);
  const ajustes = repo.ajustesSaldo(desde, hasta);
  const cuenta = (tipo: string) => t.tiposAusencia[tipo]?.computaComoTrabajada ?? false;

  const porAgente = new Map<string, ReturnType<typeof saldoAgente>>();
  for (const a of t.entrada.agentes) {
    const porDia = (m: Map<string, number>) =>
      Object.fromEntries(dias.map((d) => [d.fecha, m.get(`${a.numero}|${d.fecha}`) ?? 0]).filter(([, h]) => h !== 0));
    const ajustesH: Record<string, number> = {};
    for (const x of ajustes.filter((x) => x.agenteNumero === a.numero)) ajustesH[x.fecha] = (ajustesH[x.fecha] ?? 0) + x.horas;
    const justificadasH: Record<string, number> = {};
    const turnoH: Record<string, number> = {};
    for (const d of dias) {
      const turno = a.turnos[d.fecha] ?? [];
      turnoH[d.fecha] = turno.reduce((h, x) => h + (x.finMin - x.inicioMin) / 60, 0);
      const h = horasCubiertas(
        turno,
        a.ausencias.filter((x) => x.fecha === d.fecha && cuenta(x.tipo)),
      );
      if (h > 0) justificadasH[d.fecha] = h;
    }
    porAgente.set(
      a.numero,
      saldoAgente({
        contratoSemanalH: a.contratoSemanalH,
        fechaDatos,
        dias: dias.map((d) => ({ fecha: d.fecha, entreSemana: d.diaSemana < 5, festivo: d.festivos.includes(t.entrada.servicioCalendario) })),
        planH: porDia(plan),
        realH: porDia(reales),
        justificadasH,
        turnoH,
        ajustesH,
      }),
    );
  }
  return { version, t, dias, porAgente, ajustes };
}

/**
 * Saldos de un mes: día a día (real hasta ayer, previsto después) y el
 * arrastre de los meses anteriores desde plan.inicioSaldo. Solo agentes con
 * contrato.
 */
export async function saldosMes(mes: string, ahora = new Date()): Promise<DatosSaldos | null> {
  const fechaDatos = sumarDias(fechaLocal(ahora), -1);
  const { inicioSaldo } = leerParametrosPlan();
  const actual = await saldoDelMes(mes, fechaDatos, inicioSaldo);
  if (!actual) return null;

  // Arrastre: saldo REAL de los meses anteriores (desde el de inicioSaldo)
  const arrastre = new Map<string, number>();
  for (let m = inicioSaldo.slice(0, 7); m < mes; m = desplazarMes(m, 1)) {
    const previo = await saldoDelMes(m, fechaDatos, inicioSaldo);
    for (const [numero, s] of previo?.porAgente ?? []) {
      if (s) arrastre.set(numero, (arrastre.get(numero) ?? 0) + s.totales.real.saldo);
    }
  }

  const semanas = new Map<string, string[]>();
  for (const d of actual.t.entrada.dias) semanas.set(d.lunes, [...(semanas.get(d.lunes) ?? []), d.fecha]);
  // Los inactivos al generar (bajas, excedencias) no acumulan saldo, salvo que hayan trabajado
  const activos = new Set(actual.t.activos);
  const agentes: SaldoAgenteMes[] = [];
  for (const a of actual.t.entrada.agentes) {
    const s = actual.porAgente.get(a.numero);
    if (!s || a.contratoSemanalH == null) continue;
    if (!activos.has(a.numero) && s.totales.real.trabajadas === 0) continue;
    agentes.push({
      numero: a.numero,
      nombre: actual.t.nombres[a.numero] ?? null,
      contratoSemanalH: a.contratoSemanalH,
      dias: s.dias,
      totales: s.totales,
      arrastre: arrastre.get(a.numero) ?? 0,
      ajustes: actual.ajustes
        .filter((x) => x.agenteNumero === a.numero)
        .map((x) => ({ id: x.id, fecha: x.fecha, horas: x.horas, motivo: x.motivo, autor: x.autor })),
    });
  }
  return {
    mes,
    version: { numero: actual.version.numero, estado: actual.version.estado },
    fechaDatos,
    inicioSaldo,
    semanas: [...semanas].map(([lunes, fechas]) => ({ lunes, fechas })),
    agentes: agentes.sort((x, y) => x.numero.localeCompare(y.numero)),
  };
}

// ---------- Cierre de mes ----------

export interface FilaCierre {
  cliente: string;
  nombre: string;
  color: string;
  /** Cliente en cuya bolsa cuenta (BD y LX → GH). */
  cuentaComo: string | null;
  bolsaH: number | null;
  planificadoH: number;
  /** Horas logadas con los usuarios del cliente (todos, estén o no en la plantilla). */
  realH: number;
}

export interface DatosCierre {
  mes: string;
  version: { numero: number; estado: string; origen: string } | null;
  /** Último día con datos dentro del mes (el mes está cerrado si es su último día). */
  hasta: string;
  cerrado: boolean;
  filas: FilaCierre[];
  /** Clientes que comparten bolsa (GH con BD y LX): la bolsa es la de la cabeza. */
  grupos: { cabeza: string; miembros: string[]; bolsaH: number | null; planificadoH: number; realH: number }[];
  /** Detalle por usuario y cliente, para cuadrar con el Excel de operaciones. */
  usuarios: { usrName: string; cliente: string; agenteNumero: string | null; realH: number }[];
}

/**
 * Cierre de un mes por cliente: bolsa, planificado y real (user_log de los
 * usuarios de cada cliente, como la facturación por horas logadas). Las
 * horas se suman sin redondear; la pantalla y el XLSX redondean al final.
 */
export async function cierreMes(mes: string, ahora = new Date()): Promise<DatosCierre> {
  const fechas = fechasDelMes(mes);
  const ayer = sumarDias(fechaLocal(ahora), -1);
  const hasta = fechas[fechas.length - 1] <= ayer ? fechas[fechas.length - 1] : ayer;
  const version = versionVigente(mes);
  const planificado = new Map<string, number>();
  if (version) {
    for (const b of repo.bloquesVersion(version.id)) planificado.set(b.clienteCodigo, (planificado.get(b.clienteCodigo) ?? 0) + (b.finMin - b.inicioMin) / 60);
  }
  const bolsas = new Map(repo.leerBolsas(mes).map((b) => [b.clienteCodigo, b.horas]));
  const usuarios = new Map<string, { usrName: string; cliente: string; agenteNumero: string | null; realH: number }>();
  if (fechas[0] <= hasta) {
    const { porUsuario } = await logadoRango(fechas[0], hasta);
    for (const u of porUsuario) {
      if (!u.clienteCodigo) continue;
      const x = usuarios.get(u.usrName) ?? { usrName: u.usrName, cliente: u.clienteCodigo, agenteNumero: u.agenteNumero, realH: 0 };
      x.realH += (u.finMin - u.inicioMin) / 60;
      usuarios.set(u.usrName, x);
    }
  }
  const real = new Map<string, number>();
  for (const u of usuarios.values()) real.set(u.cliente, (real.get(u.cliente) ?? 0) + u.realH);
  const { equipo } = leerParametrosPlan();
  const filas = repo
    .leerClientesTodos()
    .filter((c) => c.equipo === equipo && (c.activo || planificado.has(c.codigo) || real.has(c.codigo)))
    .map((c) => ({
      cliente: c.codigo,
      nombre: c.nombre,
      color: c.color,
      cuentaComo: c.cuentaComo,
      bolsaH: bolsas.get(c.codigo) ?? null,
      planificadoH: planificado.get(c.codigo) ?? 0,
      realH: real.get(c.codigo) ?? 0,
    }));
  const grupos = filas
    .filter((cabeza) => filas.some((f) => f.cuentaComo === cabeza.cliente))
    .map((cabeza) => {
      const miembros = [cabeza, ...filas.filter((f) => f.cuentaComo === cabeza.cliente)];
      return {
        cabeza: cabeza.cliente,
        miembros: miembros.map((m) => m.cliente),
        bolsaH: cabeza.bolsaH,
        planificadoH: miembros.reduce((t, m) => t + m.planificadoH, 0),
        realH: miembros.reduce((t, m) => t + m.realH, 0),
      };
    });
  return {
    mes,
    version: version ? { numero: version.numero, estado: version.estado, origen: version.origen } : null,
    hasta,
    cerrado: hasta === fechas[fechas.length - 1],
    filas,
    grupos,
    usuarios: [...usuarios.values()].sort((a, b) => a.cliente.localeCompare(b.cliente) || a.usrName.localeCompare(b.usrName)),
  };
}

// ---------- Hoy y alertas ----------

export interface AgenteHoy {
  numero: string;
  nombre: string | null;
  bloques: Pick<BloqueTablero, "inicioMin" | "finMin" | "clienteCodigo">[];
  logado: { inicioMin: number; finMin: number; clienteCodigo: string | null; usrName: string }[];
  /** Conectado ahora (con algún usuario). */
  conectado: boolean;
}

export interface DatosHoy {
  fecha: string;
  ahoraMin: number;
  /** Hora de los datos, «HH:mm» local. */
  actualizado: string;
  version: { mes: string; numero: number; estado: string } | null;
  inicioDiaMin: number;
  finDiaMin: number;
  pasoMin: number;
  clienteBase: string;
  clientes: { codigo: string; nombre: string; color: string }[];
  agentes: AgenteHoy[];
  /** Mínimo del cliente base y agentes conectados con él (o con los que cuentan como él) por franja. */
  coberturaBase: { inicioMin: number; minimo: number; planificados: number; conectados: number | null }[];
  alertas: Alerta[];
}

/** Margen para dar por abierta una sesión de hoy (el tiempo logado llega con ~1 min de retraso). */
const MARGEN_ABIERTA_MIN = 2;

/**
 * Lo que pasa HOY: el plan vigente, quién está conectado y con qué usuario,
 * la cobertura del cliente base por franja y las alertas. Lo usan la vista
 * «Hoy» de planificación y la tarjeta de Supervisión (cada 60 s; las
 * consultas de RDBv2 van cacheadas 60 s y compartidas).
 */
export async function datosHoy(ahora = new Date()): Promise<DatosHoy> {
  const hoy = fechaLocal(ahora);
  const ahoraMin = minutoDelDia(ahora);
  const p = leerParametrosPlan();
  const mes = hoy.slice(0, 7);
  const version = versionVigente(mes);
  const t = version ? cargarTablero(mes, version.id) : null;
  const clientes = repo.leerClientesTodos().filter((c) => c.equipo === p.equipo);
  const porCodigo = new Map(clientes.map((c) => [c.codigo, c]));
  const clienteBase = t?.entrada.clienteBase ?? clientes.find((c) => c.modo === "resto")?.codigo ?? "";
  const inicioDiaMin = t?.entrada.inicioDiaMin ?? p.inicioDiaMin;
  const finDiaMin = t?.entrada.finDiaMin ?? p.finDiaMin;
  const pasoMin = t?.entrada.pasoMin ?? p.pasoMin;

  const { porUsuario } = await logadoRango(hoy, hoy);
  const logadoHoy = porUsuario.filter((u): u is typeof u & { agenteNumero: string } => u.agenteNumero != null);
  const bloquesHoy = (t?.bloques ?? []).filter((b) => b.fecha === hoy);
  const eq = leerEquipo(p.equipo, hoy);
  const nombres = nombresAgentes(eq);

  // Filas: agentes planificados hoy y los de la plantilla conectados hoy con un usuario del equipo
  const numeros = new Set([
    ...bloquesHoy.map((b) => b.agenteNumero),
    ...logadoHoy.filter((u) => eq.numerosPlantilla.has(u.agenteNumero) && u.clienteCodigo && porCodigo.has(u.clienteCodigo)).map((u) => u.agenteNumero),
  ]);
  const abierta = (u: { inicioMin: number; finMin: number }) => u.inicioMin <= ahoraMin && u.finMin >= ahoraMin - MARGEN_ABIERTA_MIN;
  const agentes: AgenteHoy[] = [...numeros].sort().map((numero) => {
    const logado = logadoHoy
      .filter((u) => u.agenteNumero === numero)
      .map((u) => ({ inicioMin: u.inicioMin, finMin: u.finMin, clienteCodigo: u.clienteCodigo, usrName: u.usrName }))
      .sort((a, b) => a.inicioMin - b.inicioMin);
    return {
      numero,
      nombre: nombres.get(numero) ?? null,
      bloques: bloquesHoy
        .filter((b) => b.agenteNumero === numero)
        .map((b) => ({ inicioMin: b.inicioMin, finMin: b.finMin, clienteCodigo: b.clienteCodigo }))
        .sort((a, b) => a.inicioMin - b.inicioMin),
      logado,
      conectado: logado.some(abierta),
    };
  });

  // Mínimos del cliente base hoy (con la entrada de la versión vigente)
  const minimos = t ? (calcularMinimos(t.entrada).find((m) => m.fecha === hoy && m.cliente === clienteBase)?.porFranja ?? null) : null;
  const cuentaBase = (c: string | null) => c === clienteBase || (c != null && porCodigo.get(c)?.cuentaComo === clienteBase);
  const coberturaBase: DatosHoy["coberturaBase"] = [];
  for (let f = inicioDiaMin, i = 0; f < finDiaMin; f += pasoMin, i++) {
    const enFranja = (x: { inicioMin: number; finMin: number }) => x.inicioMin < f + pasoMin && x.finMin > f;
    coberturaBase.push({
      inicioMin: f,
      minimo: minimos?.[i] ?? 0,
      planificados: new Set(bloquesHoy.filter((b) => cuentaBase(b.clienteCodigo) && b.inicioMin <= f && f + pasoMin <= b.finMin).map((b) => b.agenteNumero)).size,
      // Conectados: en las franjas pasadas, los que llegaron a estar; en la actual, los de ahora
      conectados:
        f > ahoraMin
          ? null
          : new Set(
              logadoHoy
                .filter((u) => cuentaBase(u.clienteCodigo) && (f <= ahoraMin && ahoraMin < f + pasoMin ? abierta(u) : enFranja(u)))
                .map((u) => u.agenteNumero),
            ).size,
    });
  }

  // Entrantes de los clientes a demanda (Ávolo): campañas de su servicio sin IVR
  const aDemanda = await Promise.all(
    clientes
      .filter((c) => c.modo === "a_demanda" && c.activo && c.servicioAltitude)
      .map(async (c) => {
        const campanias = (await campaniasEfectivas(c.servicioAltitude!, false)) ?? [];
        const r = await q.entrantesNoAtendidasHoy(campanias);
        return { cliente: c.codigo, noAtendidas: r.noAtendidas, ultima: r.ultima, ultimaAtendida: r.ultimaAtendida };
      }),
  );

  // Semana de los clientes con objetivo: planificado y logado del lunes hasta ahora
  const lunes = lunesDe(hoy);
  const semanaBloques = bloquesVigentes(lunes, hoy, ahora).bloques;
  const semanaLogado = lunes < hoy ? (await logadoRango(lunes, sumarDias(hoy, -1))).porUsuario.concat(porUsuario) : porUsuario;
  const semana = clientes
    .filter((c) => c.modo === "objetivo" && c.activo)
    .map((c) => ({
      cliente: c.codigo,
      planificadoH: semanaBloques.filter((b) => b.clienteCodigo === c.codigo).reduce((s, b) => s + (b.finMin - b.inicioMin) / 60, 0),
      realH: semanaLogado.filter((u) => u.clienteCodigo === c.codigo).reduce((s, u) => s + (u.finMin - u.inicioMin) / 60, 0),
    }));

  const prefijos = repo.leerPrefijos();
  const alertas = evaluarAlertas({
    ahoraMin,
    pasoMin,
    inicioDiaMin,
    finDiaMin,
    clienteBase,
    clientes: clientes.map((c) => ({
      codigo: c.codigo,
      nombre: c.nombre,
      modo: c.modo,
      cuentaComo: c.cuentaComo,
      prefijos: prefijos.filter((x) => x.clienteCodigo === c.codigo).map((x) => `${x.prefijo}_nnnn${x.sufijo}`),
    })),
    bloquesHoy: bloquesHoy.filter((b) => b.inicioMin <= ahoraMin),
    minimosBase: minimos,
    logadoHoy: logadoHoy.map((u) => ({ agenteNumero: u.agenteNumero, inicioMin: u.inicioMin, finMin: u.finMin, clienteCodigo: u.clienteCodigo })),
    aDemanda,
    semana,
    nombres: Object.fromEntries(nombres),
    parametros: { minutosConexion: p.minutosAlertaConexion, pctRetraso: p.pctAlertaRetraso, horasMinRetraso: p.horasMinAlertaRetraso },
  });

  return {
    fecha: hoy,
    ahoraMin,
    actualizado: format(ahora, "HH:mm"),
    version: version ? { mes, numero: version.numero, estado: version.estado } : null,
    inicioDiaMin,
    finDiaMin,
    pasoMin,
    clienteBase,
    clientes: clientes.map((c) => ({ codigo: c.codigo, nombre: c.nombre, color: c.color })),
    agentes,
    coberturaBase,
    alertas,
  };
}

/**
 * Las alertas y los planes que ha preparado la tarea de la noche, para la
 * tarjeta de Supervisión: si algo falla aquí, el resto del panel de
 * Supervisión sigue funcionando.
 */
export async function alertasPlanificacion(): Promise<{
  alertas: Alerta[];
  error: string | null;
  revisar: PendienteRevision[];
}> {
  let revisar: PendienteRevision[] = [];
  try {
    revisar = pendientesRevision();
  } catch (e) {
    console.error("[planificacion] pendientes de revisión:", e);
  }
  try {
    return { alertas: (await datosHoy()).alertas, error: null, revisar };
  } catch (e) {
    return { alertas: [], error: e instanceof Error ? e.message : "error desconocido", revisar };
  }
}
