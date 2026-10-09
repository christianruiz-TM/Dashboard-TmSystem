import { coincideLike } from "@/lib/planificacion/motor/campanias";
import type {
  AgenteEstado,
  AgenteHoy,
  BaseRatiosExito,
  BaseRepartoHorasLogadas,
  CampaniaInfo,
  CierresDia,
  DemandaFranja,
  EntrantesNoAtendidas,
  EstadoLista,
  FestivosServicio,
  FilaBaseRatios,
  HorarioServicio,
  HorasAgenteReales,
  HorasLogadasUsuario,
  IslaSesion,
  KpiCampaniaHoy,
  MetricaDiariaCampania,
  MetricasIvr,
  PenetracionLista,
  RazonNotReady,
  SaludRdb,
  ServicioConCampanias,
  UnidadesCampania,
  UsuarioAgenteRdb,
  VolumenCampania,
  VolumenDia,
} from "./types";

// ============================================================
// Modo demo (RDB_MOCK=1): datos ficticios pero realistas.
// - Deterministas por fecha/campaña (mismo día → mismas cifras)
// - Usa los nombres de campaña reales de la instalación para que
//   el mapeo cliente↔campaña del admin sea verosímil.
// NO contiene datos reales de TmSystem ni de sus clientes.
// ============================================================

/** Campañas de la instalación (ver docs/referencia_bbdd_altitude_v85.md §1.4). */
const CAMPANIAS_DEMO: { shortname: string; tipo: string }[] = [
  { shortname: "Avolo", tipo: "Outbound" },
  { shortname: "AvoloRenov", tipo: "Outbound" },
  { shortname: "LoMonaco", tipo: "Inbound" },
  { shortname: "CajaRural", tipo: "Inbound" },
  { shortname: "SierraNevada", tipo: "Inbound" },
  { shortname: "Cetursa", tipo: "Inbound" },
  { shortname: "UGR", tipo: "Inbound" },
  { shortname: "Cuerva", tipo: "Blended" },
  { shortname: "GrupoHuertas", tipo: "Outbound" },
  { shortname: "AyudaTpymes", tipo: "Outbound" },
  { shortname: "Infoautonomos", tipo: "Outbound" },
  { shortname: "TopDigital", tipo: "Outbound" },
  { shortname: "Wit", tipo: "Outbound" },
  { shortname: "UPTA", tipo: "Outbound" },
  { shortname: "TMSYSTEM", tipo: "Blended" },
];

const AGENTES_DEMO = [
  "mgarcia", "jlopez", "alaura", "pruiz", "cmartin", "rsanchez",
  "lfernandez", "dmoreno", "evazquez", "njimenez", "smolina", "tortega",
];

const RAZONES_NR = ["Descanso", "Formación", "Administrativo", "Comida", "Reunión"];

/** PRNG determinista (mulberry32) sembrado por string. */
function rng(semilla: string): () => number {
  let h = 1779033703;
  for (let i = 0; i < semilla.length; i++) {
    h = Math.imul(h ^ semilla.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function entre(r: () => number, min: number, max: number): number {
  return Math.floor(min + r() * (max - min + 1));
}

/** ¿Es fin de semana? El call center baja mucho la actividad. */
function factorDia(fechaISO: string): number {
  const dia = new Date(`${fechaISO}T12:00:00`).getDay();
  return dia === 0 || dia === 6 ? 0.12 : 1;
}

function listaFechas(desdeISO: string, hastaISO: string): string[] {
  const fechas: string[] = [];
  const fin = new Date(`${hastaISO}T12:00:00`);
  for (let d = new Date(`${desdeISO}T12:00:00`); d <= fin; d.setDate(d.getDate() + 1)) {
    fechas.push(d.toISOString().slice(0, 10));
  }
  return fechas;
}

function campaniasFiltradas(campanias?: string[]): { shortname: string; tipo: string }[] {
  if (!campanias || campanias.length === 0) return CAMPANIAS_DEMO;
  return CAMPANIAS_DEMO.filter((c) => campanias.includes(c.shortname));
}

// ---------- Generadores por query ----------

export function mockListadoCampanias(): CampaniaInfo[] {
  return CAMPANIAS_DEMO.map((c, i) => ({
    codigo: 100 + i,
    shortname: c.shortname,
    descripcion: `Campaña ${c.shortname}`,
    tipo: c.tipo,
  }));
}

function metricaDia(fecha: string, c: { shortname: string; tipo: string }): MetricaDiariaCampania {
  const r = rng(`${fecha}|${c.shortname}`);
  const f = factorDia(fecha);
  const base = c.tipo === "Inbound" ? entre(r, 120, 420) : entre(r, 200, 700);
  const total = Math.round(base * f);
  const inbound = c.tipo === "Inbound" ? total : c.tipo === "Blended" ? Math.round(total * 0.4) : 0;
  const outbound = total - inbound;
  const abandonadas = Math.round(inbound * (0.03 + r() * 0.09));
  const atendidas = Math.round(total * (0.55 + r() * 0.3));
  const aht = 180 + r() * 240;
  const acw = 20 + r() * 60;

  return {
    fecha,
    campania: c.shortname,
    tipo: c.tipo,
    interacciones: total,
    inbound,
    outbound,
    atendidas,
    abandonadas,
    abandonadasInbound: abandonadas, // el mock solo abandona entrantes
    ahtSeg: total ? Math.round(aht) : null,
    acwSeg: total ? Math.round(acw) : null,
    talkSeg: total ? Math.round(aht - acw) : null,
    // Gestión real del día: atendidas × AHT (las logadas/ready por campaña no
    // existen a propósito, ver nota en types.ts)
    horasProductivas: Math.round(((atendidas * aht) / 3600) * 100) / 100,
    exitos: Math.round(atendidas * (0.08 + r() * 0.18)),
    leadsFinalizados: c.tipo === "Inbound" ? 0 : Math.round(outbound * (0.15 + r() * 0.2)),
  };
}

export function mockMetricasDiarias(
  desde: string,
  hasta: string,
  campanias?: string[],
): MetricaDiariaCampania[] {
  const filas: MetricaDiariaCampania[] = [];
  for (const fecha of listaFechas(desde, hasta)) {
    for (const c of campaniasFiltradas(campanias)) {
      const m = metricaDia(fecha, c);
      if (m.interacciones > 0) filas.push(m);
    }
  }
  return filas;
}

export function mockVolumenPorDia(
  desde: string,
  hasta: string,
  campanias?: string[],
): VolumenDia[] {
  return listaFechas(desde, hasta).map((fecha) => {
    const metricas = campaniasFiltradas(campanias).map((c) => metricaDia(fecha, c));
    const suma = (f: (m: MetricaDiariaCampania) => number) =>
      metricas.reduce((acc, m) => acc + f(m), 0);
    const total = suma((m) => m.interacciones);
    const conAht = metricas.filter((m) => m.ahtSeg != null);
    return {
      fecha,
      total,
      inbound: suma((m) => m.inbound),
      outbound: suma((m) => m.outbound),
      atendidas: suma((m) => m.atendidas),
      abandonadas: suma((m) => m.abandonadas),
      // En el mock las abandonadas solo salen de las entrantes
      abandonadasInbound: suma((m) => m.abandonadas),
      ahtSeg: conAht.length
        ? Math.round(conAht.reduce((a, m) => a + m.ahtSeg!, 0) / conAht.length)
        : null,
      acwSeg: conAht.length
        ? Math.round(conAht.reduce((a, m) => a + m.acwSeg!, 0) / conAht.length)
        : null,
      talkSeg: conAht.length
        ? Math.round(conAht.reduce((a, m) => a + m.talkSeg!, 0) / conAht.length)
        : null,
    };
  });
}

export function mockVolumenPorCampania(
  desde: string,
  hasta: string,
  campanias?: string[],
): VolumenCampania[] {
  const porCampania = new Map<string, VolumenCampania>();
  for (const m of mockMetricasDiarias(desde, hasta, campanias)) {
    const v =
      porCampania.get(m.campania) ??
      ({
        campania: m.campania,
        tipo: m.tipo ?? "",
        total: 0,
        inbound: 0,
        outbound: 0,
        atendidas: 0,
        abandonadas: 0,
        abandonadasInbound: 0,
        ahtSeg: m.ahtSeg,
      } satisfies VolumenCampania);
    v.total += m.interacciones;
    v.inbound += m.inbound;
    v.outbound += m.outbound;
    v.atendidas += m.atendidas;
    v.abandonadas += m.abandonadas;
    v.abandonadasInbound += m.abandonadas; // el mock solo abandona entrantes
    porCampania.set(m.campania, v);
  }
  return [...porCampania.values()].sort((a, b) => b.total - a.total);
}

export function mockEstadoAgentes(campanias?: string[]): AgenteEstado[] {
  // Sembrado por hora para que el polling muestre cambios cada hora
  const ahora = new Date();
  const semillaHora = `${ahora.toISOString().slice(0, 13)}`;
  const campsDisponibles = campaniasFiltradas(campanias);
  return AGENTES_DEMO.map((agente) => {
    const r = rng(`${semillaHora}|${agente}`);
    const estadoN = r();
    const campania = campsDisponibles[entre(r, 0, campsDisponibles.length - 1)].shortname;
    const estado = estadoN < 0.55 ? "Ready" : estadoN < 0.8 ? "NotReady" : "Logado";
    return {
      agente,
      nombre: `Agente ${agente.charAt(0).toUpperCase()}${agente.slice(1)}`,
      campania,
      estado,
      motivo: estado === "NotReady" ? RAZONES_NR[entre(r, 0, RAZONES_NR.length - 1)] : null,
      desdeMin: entre(r, 1, 95),
    };
  }).filter((_, i) => i < 10 + (ahora.getHours() % 3)); // plantilla variable
}

/** Esperas ficticias coherentes: sumas por campaña y medias sobre sus recuentos. */
function mockColas(
  r: () => number,
  umbralSeg: number,
  atendidasInbound: number,
  abandonadasInbound: number,
) {
  const cola = 5 + r() * umbralSeg * 1.5;
  const esperaAband = cola * (1.5 + r()); // quien cuelga suele haber esperado más
  return {
    colaMediaSeg: atendidasInbound > 0 ? Math.round(cola * 100) / 100 : null,
    esperaAbandonadasSeg: abandonadasInbound > 0 ? Math.round(esperaAband * 100) / 100 : null,
    colaAtendidasTotalSeg: cola * atendidasInbound,
    esperaAbandonadasTotalSeg: esperaAband * abandonadasInbound,
  };
}

/** SLA ficticio: el % por campaña sale del mismo recuento que usa el global. */
function mockSla(r: () => number, atendidasInbound: number) {
  const fuera = Math.round(atendidasInbound * (0.02 + r() * 0.28));
  return {
    atendidasFueraSla: fuera,
    slaPct:
      atendidasInbound > 0
        ? Math.round(((atendidasInbound - fuera) / atendidasInbound) * 1000) / 10
        : null,
  };
}

export function mockKpisCampaniasHoy(umbralSeg: number, campanias?: string[]): KpiCampaniaHoy[] {
  const hoy = new Date().toISOString().slice(0, 10);
  return campaniasFiltradas(campanias)
    .filter((c) => c.tipo !== "Outbound")
    .map((c) => {
      const m = metricaDia(hoy, c);
      const r = rng(`sla|${hoy}|${c.shortname}`);
      // Escalar al avance del día (aprox 8:00→20:00)
      const avance = Math.min(1, Math.max(0.05, (new Date().getHours() - 8) / 12));
      const recibidas = Math.round(m.inbound * avance);
      const abandonadas = Math.round(m.abandonadas * avance);
      const atendidasInbound = Math.max(0, recibidas - abandonadas);
      return {
        campania: c.shortname,
        tipo: c.tipo,
        recibidas,
        atendidas: atendidasInbound,
        abandonadas,
        atendidasInbound,
        abandonadasInbound: abandonadas,
        exitos: Math.round((m.exitos ?? 0) * avance),
        ahtSeg: m.ahtSeg,
        acwSeg: m.acwSeg,
        ...mockColas(r, umbralSeg, atendidasInbound, abandonadas),
        ...mockSla(r, atendidasInbound),
      };
    })
    .filter((k) => k.recibidas > 0);
}

export function mockAgentesHoy(campanias?: string[]): AgenteHoy[] {
  const hoy = new Date().toISOString().slice(0, 10);
  // Con filtro de servicio, sólo una parte de la plantilla trabaja sus campañas
  const plantilla =
    campanias && campanias.length > 0 ? AGENTES_DEMO.slice(0, 4) : AGENTES_DEMO;
  return plantilla.map((agente) => {
    const r = rng(`${hoy}|agente|${agente}`);
    const avance = Math.min(1, Math.max(0.05, (new Date().getHours() - 8) / 12));
    const atendidas = Math.round(entre(r, 15, 70) * avance);
    const talk = 150 + r() * 200;
    const acw = 15 + r() * 50;
    return {
      agente,
      nombre: `Agente ${agente.charAt(0).toUpperCase()}${agente.slice(1)}`,
      atendidas,
      talkMedioSeg: Math.round(talk),
      acwMedioSeg: Math.round(acw),
      ahtMedioSeg: Math.round(talk + acw),
      productivoSeg: Math.round(atendidas * (talk + acw)),
    };
  }).sort((a, b) => b.atendidas - a.atendidas);
}

export function mockKpisCampaniasRango(
  desde: string,
  hasta: string,
  umbralSeg: number,
  campanias?: string[],
): KpiCampaniaHoy[] {
  const porCamp = new Map<string, KpiCampaniaHoy>();
  for (const m of mockMetricasDiarias(desde, hasta, campanias)) {
    if (m.inbound === 0) continue; // KPIs de cola/SLA aplican a entrantes
    const k = porCamp.get(m.campania) ?? {
      campania: m.campania,
      tipo: m.tipo ?? "—",
      recibidas: 0,
      atendidas: 0,
      abandonadas: 0,
      atendidasInbound: 0,
      abandonadasInbound: 0,
      exitos: 0,
      ahtSeg: m.ahtSeg,
      acwSeg: m.acwSeg,
      colaMediaSeg: null,
      esperaAbandonadasSeg: null,
      colaAtendidasTotalSeg: 0,
      esperaAbandonadasTotalSeg: 0,
      slaPct: null,
      atendidasFueraSla: 0,
    };
    k.recibidas += m.inbound;
    k.atendidas += m.atendidas;
    k.abandonadas += m.abandonadas;
    // En el mock se reparte proporcionalmente lo entrante sobre el total
    k.atendidasInbound += Math.round(
      m.atendidas * (m.interacciones > 0 ? m.inbound / m.interacciones : 0),
    );
    k.abandonadasInbound += m.abandonadas;
    k.exitos += m.exitos;
    porCamp.set(m.campania, k);
  }
  return [...porCamp.values()]
    .map((k) => {
      const r = rng(`slaR|${desde}|${hasta}|${k.campania}`);
      return {
        ...k,
        ...mockColas(r, umbralSeg, k.atendidasInbound, k.abandonadasInbound),
        ...mockSla(r, k.atendidasInbound),
      };
    })
    .sort((a, b) => b.recibidas - a.recibidas);
}

export function mockAgentesRango(desde: string, hasta: string, campanias?: string[]): AgenteHoy[] {
  const d1 = new Date(`${desde}T00:00:00`).getTime();
  const d2 = new Date(`${hasta}T00:00:00`).getTime();
  const dias = Math.max(1, Math.round((d2 - d1) / 86_400_000) + 1);
  const plantilla =
    campanias && campanias.length > 0 ? AGENTES_DEMO.slice(0, 4) : AGENTES_DEMO;
  return plantilla
    .map((agente) => {
      const r = rng(`${desde}|${hasta}|agenteR|${agente}`);
      const atendidas = entre(r, 15, 70) * dias;
      const talk = 150 + r() * 200;
      const acw = 15 + r() * 50;
      return {
        agente,
        nombre: `Agente ${agente.charAt(0).toUpperCase()}${agente.slice(1)}`,
        atendidas,
        talkMedioSeg: Math.round(talk),
        acwMedioSeg: Math.round(acw),
        ahtMedioSeg: Math.round(talk + acw),
        productivoSeg: Math.round(atendidas * (talk + acw)),
      };
    })
    .sort((a, b) => b.atendidas - a.atendidas);
}

/**
 * Base de ratios de éxito: cada agente trabaja 1-3 campañas, con
 * conversiones distintas por campaña (para que el índice tenga sentido) y
 * más atendidas que contactos en algunas (como Bolsas en la real).
 */
export function mockBaseRatiosExito(
  desde: string,
  hasta: string,
  campanias?: string[],
): BaseRatiosExito {
  const d1 = new Date(`${desde}T00:00:00`).getTime();
  const d2 = new Date(`${hasta}T00:00:00`).getTime();
  const dias = Math.max(1, Math.round((d2 - d1) / 86_400_000) + 1);
  const esHoy = desde === hasta && desde === new Date().toISOString().slice(0, 10);
  const avance = esHoy ? Math.min(1, Math.max(0.05, (new Date().getHours() - 8) / 12)) : 1;
  const camps = campaniasFiltradas(campanias);
  const plantilla =
    campanias && campanias.length > 0 ? AGENTES_DEMO.slice(0, 4) : AGENTES_DEMO;
  // La mitad de las campañas «no marcan sin éxito» (como Bolsas)
  const conSinExito = CAMPANIAS_DEMO.filter((_, i) => i % 2 === 0).map((c) => c.shortname);
  const filas: FilaBaseRatios[] = [];
  const horasLogadas: { agente: string; horas: number }[] = [];
  if (camps.length === 0) return { filas, horasLogadas, campaniasConSinExito: conSinExito };

  for (const agente of plantilla) {
    const r = rng(`${desde}|${hasta}|ratios|${agente}`);
    const n = entre(r, 1, Math.min(3, camps.length));
    let horas = 0;
    for (let i = 0; i < n; i++) {
      const c = camps[(entre(r, 0, camps.length - 1) + i) % camps.length];
      if (filas.some((f) => f.agente === agente && f.campania === c.shortname)) continue;
      const rc = rng(`conv|${c.shortname}`);
      const convCampania = 0.02 + rc() * 0.3;
      const llamadasPorSesion = rc() < 0.4 ? 1.9 : 1;
      const sesiones = Math.round(entre(r, 8, 45) * dias * avance);
      const exitos = Math.round(sesiones * convCampania * (0.6 + r() * 0.8));
      const marca = conSinExito.includes(c.shortname);
      const sinExito = marca ? Math.round((sesiones - exitos) * (0.2 + r() * 0.3)) : 0;
      const atendidas = Math.round(sesiones * llamadasPorSesion);
      const productivoSeg = Math.round(atendidas * (90 + r() * 150));
      horas += productivoSeg / 3600;
      filas.push({
        agente,
        nombre: `Agente ${agente.charAt(0).toUpperCase()}${agente.slice(1)}`,
        campania: c.shortname,
        sesiones,
        exitos,
        sinExito,
        atendidas,
        productivoSeg,
      });
    }
    // Logado ≈ productivo + pausas y espera en Ready
    horasLogadas.push({ agente, horas: horas * (1.3 + r() * 0.5) });
  }
  return { filas, horasLogadas, campaniasConSinExito: conSinExito };
}

export function mockUnidadesPorCampania(
  desde: string,
  hasta: string,
  campanias?: string[],
): UnidadesCampania[] {
  const porCampania = new Map<string, UnidadesCampania>();
  for (const m of mockMetricasDiarias(desde, hasta, campanias)) {
    const u =
      porCampania.get(m.campania) ??
      ({
        campania: m.campania,
        horasProductivas: 0,
        interacciones: 0,
        atendidas: 0,
        exitos: 0,
        leadsFinalizados: 0,
      } satisfies UnidadesCampania);
    u.horasProductivas += m.horasProductivas;
    u.interacciones += m.interacciones;
    u.atendidas += m.atendidas;
    u.exitos += m.exitos;
    u.leadsFinalizados += m.leadsFinalizados;
    porCampania.set(m.campania, u);
  }
  return [...porCampania.values()]
    .map((u) => ({ ...u, horasProductivas: Math.round(u.horasProductivas * 10) / 10 }))
    .sort((a, b) => b.interacciones - a.interacciones);
}

export function mockPenetracionListas(
  desde: string,
  hasta: string,
  campanias?: string[],
): PenetracionLista[] {
  return campaniasFiltradas(campanias)
    .filter((c) => c.tipo !== "Inbound")
    .map((c) => {
      const r = rng(`listas|${desde}|${hasta}|${c.shortname}`);
      const total = entre(r, 800, 6000);
      const done = Math.round(total * (0.3 + r() * 0.5));
      const exitos = Math.round(done * (0.1 + r() * 0.25));
      const sinExito = Math.round(done * (0.4 + r() * 0.3));
      return {
        campania: c.shortname,
        lista: `Lista ${c.shortname} ${desde.slice(0, 7)}`,
        totalContactos: total,
        done,
        exitos,
        sinExito,
        sinContacto: total - done,
        intentosAutoMedio: Math.round((1 + r() * 3) * 10) / 10,
      };
    });
}

export function mockRazonesNotReady(
  desde: string,
  hasta: string,
  campanias?: string[],
): RazonNotReady[] {
  // En demo los agentes no están atados a campaña; si hay filtro de servicio
  // se reduce el número de agentes para que se note el ámbito.
  const tope = campanias && campanias.length > 0 ? 3 : 8;
  const filas: RazonNotReady[] = [];
  for (const agente of AGENTES_DEMO.slice(0, tope)) {
    for (const razon of RAZONES_NR) {
      const r = rng(`nr|${desde}|${hasta}|${agente}|${razon}`);
      if (r() < 0.4) continue;
      filas.push({
        agente,
        razon,
        veces: entre(r, 1, 12),
        segundosTotal: entre(r, 300, 7200),
      });
    }
  }
  return filas.sort((a, b) => b.segundosTotal - a.segundosTotal);
}

export function mockHorasAgenteReales(
  desde: string,
  hasta: string,
  campanias?: string[],
): HorasAgenteReales {
  // ~6 h logadas reales por agente/día laborable (la unión, no la suma)
  const d1 = new Date(`${desde}T00:00:00`).getTime();
  const d2 = new Date(`${hasta}T00:00:00`).getTime();
  const dias = Math.max(1, Math.round((d2 - d1) / 86_400_000) + 1);
  const r = rng(`horas|${desde}|${hasta}|${campanias?.join(",") ?? "todas"}`);
  // Con filtro de servicio sólo cuenta una parte de la plantilla
  const agentes = campanias && campanias.length > 0 ? Math.max(2, AGENTES_DEMO.length / 4) : AGENTES_DEMO.length;
  const logadas = agentes * dias * (5.5 + r() * 1.5);
  return {
    horasLogadas: Math.round(logadas * 10) / 10,
    horasReady: Math.round(logadas * (0.55 + r() * 0.1) * 10) / 10,
  };
}

/**
 * Base del reparto por campaña coherente con mockHorasLogadasUsuarios: las
 * horas de cada usuario repartidas en días laborables del rango y, cada día,
 * algo de gestión en 2-4 campañas «<prefijo>_camp_n» (algún día sin llamadas).
 */
export function mockBaseRepartoHorasLogadas(
  desde: string,
  hasta: string,
  prefijos: string[],
): BaseRepartoHorasLogadas {
  const fechas: string[] = [];
  for (let d = new Date(`${desde}T12:00:00`); d <= new Date(`${hasta}T12:00:00`); d.setDate(d.getDate() + 1)) {
    if (d.getDay() !== 0 && d.getDay() !== 6) {
      fechas.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
    }
  }
  if (fechas.length === 0) fechas.push(desde);
  const base: BaseRepartoHorasLogadas = { logado: [], productivo: [] };
  for (const u of mockHorasLogadasUsuarios(desde, hasta, prefijos)) {
    const r = rng(`reparto|${desde}|${hasta}|${u.usuario}`);
    const camps = Array.from({ length: 6 }, (_, i) => `${u.prefijo.toLowerCase()}_camp_${i + 1}`);
    for (const fecha of fechas) {
      base.logado.push({ usuario: u.usuario, fecha, horas: u.horas / fechas.length });
      if (r() < 0.08) continue; // día logado sin llamadas
      const n = entre(r, 2, 4);
      for (let i = 0; i < n; i++) {
        base.productivo.push({ usuario: u.usuario, fecha, campania: camps[(i * 2 + entre(r, 0, 5)) % 6], horas: 0.3 + r() * 2.5 });
      }
    }
  }
  return base;
}

export function mockHorasLogadasUsuarios(
  desde: string,
  hasta: string,
  prefijos: string[],
): HorasLogadasUsuario[] {
  // 4-8 usuarios <PREFIJO>_08nn por cliente, ~5-7 h por día laborable
  const d1 = new Date(`${desde}T00:00:00`).getTime();
  const d2 = new Date(`${hasta}T00:00:00`).getTime();
  const dias = Math.max(1, Math.round((d2 - d1) / 86_400_000) + 1);
  const laborables = Math.max(1, Math.round((dias * 5) / 7));
  const filas: HorasLogadasUsuario[] = [];
  for (const prefijo of prefijos) {
    const r = rng(`logadasUsr|${desde}|${hasta}|${prefijo}`);
    const n = entre(r, 4, 8);
    for (let i = 0; i < n; i++) {
      const diasUsuario = Math.max(1, Math.round(laborables * (0.5 + r() * 0.5)));
      filas.push({
        prefijo,
        usuario: `${prefijo}_08${String(10 + i * 7).padStart(2, "0")}`,
        horas: diasUsuario * (5 + r() * 2),
        sesiones: diasUsuario + entre(r, 0, diasUsuario),
      });
    }
  }
  return filas;
}

export function mockMetricasIvr(
  desde: string,
  hasta: string,
  campanias?: string[],
): MetricasIvr {
  const d1 = new Date(`${desde}T00:00:00`).getTime();
  const d2 = new Date(`${hasta}T00:00:00`).getTime();
  const dias = Math.max(1, Math.round((d2 - d1) / 86_400_000) + 1);
  // El alcance entra en la semilla: al filtrar por servicio el mock debe dar
  // cifras distintas (y menores), como haría la query real.
  const r = rng(`ivr|${desde}|${hasta}|${campanias?.join(",") ?? "todas"}`);
  const escala = campanias && campanias.length > 0 ? 0.35 : 1;
  const llamadas = Math.round((300 + r() * 250) * dias * escala);
  const atendidasAgente = Math.round(llamadas * (0.42 + r() * 0.15));
  const noAtendidas = Math.max(0, llamadas - atendidasAgente);
  return {
    llamadas,
    atendidasAgente,
    noAtendidas,
    // la mayoría de las no atendidas entran en horario de producción
    noAtendidasEnHorario: Math.round(noAtendidas * (0.6 + r() * 0.3)),
  };
}

export function mockServicios(): ServicioConCampanias[] {
  // En demo cada campaña representa un cliente → un servicio del mismo nombre.
  return CAMPANIAS_DEMO.map((c) => ({ servicio: c.shortname, campanias: [c.shortname] }));
}

export function mockSalud(): SaludRdb {
  const ahora = new Date();
  return {
    conectado: true,
    mock: true,
    latenciaMs: 2,
    ultimaInteraccion: ahora.toISOString(),
    ultimaFlat: new Date(ahora.getTime() - 9 * 60_000).toISOString(),
    error: null,
  };
}

// ---------- Planificación de turnos ----------
// Plantilla ficticia identificada solo por nº (sin nombres reales): un
// usuario por cliente, como en la instalación (GH_0851, UGR_0851...).

const USUARIOS_PLAN_DEMO: Record<string, string[]> = {
  "0851": ["GH", "GH|_BD", "UGR", "AEP"],
  "0892": ["GH", "GH|_BD"],
  "0925": ["GH", "GH|_BD", "UGR"],
  "0940": ["GH", "GH|_BD", "UGR", "Av", "CEFF"],
  "0950": ["GH", "UGR"],
  "0973": ["GH", "GH|_BD", "UGR", "Av", "CR"],
  "0985": ["GH", "GH|_BD", "UGR", "Av", "CR", "Sat"],
  "1008": ["GH", "GH|_BD"],
  "1045": ["GH", "GH|_BD", "UGR"],
  "1048": ["GH", "GH|_BD", "GH|_BD_LX", "UGR", "Av", "CEFF"],
  "1067": ["GH", "GH|_BD", "GH|_BD_LX", "UGR"],
  "1086": ["GH", "UGR"],
  "1118": ["GH", "UGR"],
  "1010": ["GH", "Av"], // con actividad pero fuera de la plantilla
};
/** Agentes demo sin ninguna sesión (aviso de inactividad). */
const INACTIVOS_PLAN_DEMO = new Set(["0950"]);

function usrDemo(numero: string, clave: string): string {
  const [prefijo, sufijo = ""] = clave.split("|");
  return `${prefijo}_${numero}${sufijo}`;
}

export function mockUsuariosAgente(): UsuarioAgenteRdb[] {
  let codigo = 500;
  return Object.entries(USUARIOS_PLAN_DEMO)
    .flatMap(([numero, claves]) =>
      claves.map((clave) => ({
        usrName: usrDemo(numero, clave),
        altitudeCode: codigo++,
        fullname: `Agente ${numero} (demo)`,
      })),
    )
    .sort((a, b) => a.usrName.localeCompare(b.usrName));
}

/** Islas de sesión ficticias: GH de 9 a 14 y de 16 a 20; otros clientes, a ratos. */
/**
 * Tiempo logado (user_log) de demo: las mismas islas que las sesiones con
 * campaña, unos minutos más largas (se loga antes de abrir campaña), y HOY
 * las sesiones hasta este momento (vista «Hoy» y alertas).
 */
export function mockIslasLogadoUsuario(desde: string, hasta: string, usuarios?: string[]): IslaSesion[] {
  const ahora = new Date();
  const hoy = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, "0")}-${String(ahora.getDate()).padStart(2, "0")}`;
  const segAhora = ahora.getHours() * 3600 + ahora.getMinutes() * 60 + ahora.getSeconds();
  const filas: IslaSesion[] = [];
  const hastaCerrado = hasta < hoy ? hasta : sumarDiaDemo(hoy, -1);
  if (desde <= hastaCerrado) {
    for (const f of mockIslasSesionUsuario(desde, hastaCerrado, usuarios)) {
      const r = rng(`logado|${f.fecha}|${f.usrName}|${f.inicioSeg}`);
      filas.push({
        ...f,
        inicioSeg: Math.max(0, f.inicioSeg - entre(r, 1, 5) * 60),
        finSeg: Math.min(86_400, f.finSeg + entre(r, 0, 3) * 60),
      });
    }
  }
  if (desde <= hoy && hoy <= hasta && factorDia(hoy) >= 1) {
    // Hoy: el patrón de un día laborable cualquiera, cortado en este instante
    for (const f of mockIslasSesionUsuario("2026-09-01", "2026-09-01", usuarios)) {
      if (f.inicioSeg >= segAhora) continue;
      filas.push({ fecha: hoy, usrName: f.usrName, inicioSeg: f.inicioSeg, finSeg: Math.min(f.finSeg, segAhora) });
    }
  }
  return filas;
}

function sumarDiaDemo(fecha: string, n: number): string {
  const d = new Date(`${fecha}T12:00:00`);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function mockIslasSesionUsuario(desde: string, hasta: string, usuarios?: string[]): IslaSesion[] {
  const hoy = new Date().toISOString().slice(0, 10);
  const filas: IslaSesion[] = [];
  for (const fecha of listaFechas(desde, hasta)) {
    if (fecha >= hoy || factorDia(fecha) < 1) continue;
    for (const [numero, claves] of Object.entries(USUARIOS_PLAN_DEMO)) {
      if (INACTIVOS_PLAN_DEMO.has(numero)) continue;
      for (const clave of claves) {
        const usrName = usrDemo(numero, clave);
        if (usuarios && usuarios.length > 0 && !usuarios.includes(usrName)) continue;
        const r = rng(`sesion|${fecha}|${usrName}`);
        const desvio = () => entre(r, -10, 10) * 60;
        if (clave === "GH") {
          if (numero === "1010" && r() < 0.5) continue;
          filas.push({ fecha, usrName, inicioSeg: 9 * 3600 + desvio(), finSeg: 14 * 3600 + desvio() });
          if (r() < 0.7) filas.push({ fecha, usrName, inicioSeg: 16 * 3600 + desvio(), finSeg: 20 * 3600 + desvio() });
        } else if (clave === "UGR") {
          if (fecha >= "2025-09-15" && fecha < "2025-10-18" && r() < 0.35) {
            filas.push({ fecha, usrName, inicioSeg: 11 * 3600, finSeg: 14 * 3600 });
          }
          if (fecha >= "2026-09-14" && r() < 0.4) filas.push({ fecha, usrName, inicioSeg: 11 * 3600, finSeg: 14 * 3600 });
        } else if (r() < 0.12) {
          filas.push({ fecha, usrName, inicioSeg: 18 * 3600, finSeg: 20 * 3600 });
        }
      }
    }
  }
  return filas;
}

/** Entrantes GH por hora (media real por día de la semana, 9-13 y 16-19 h). */
const LAMBDA_GH_DEMO: Record<number, number[]> = {
  1: [25.2, 32.9, 30.6, 28.5, 22.3, 15.8, 22.3, 21.2, 14.6],
  2: [14, 24.5, 24.8, 25.1, 17.3, 11.2, 18.6, 18.4, 11.4],
  3: [17.6, 21.3, 25.5, 26.8, 19.4, 12.3, 20.4, 17.4, 11.4],
  4: [14.4, 23.1, 25.3, 24.5, 18.1, 13.2, 17.5, 14.6, 10.7],
  5: [16.4, 19.8, 22.8, 21.9, 15.4, 10.1, 14.8, 15.5, 7.8],
};
const HORAS_GH_DEMO = [9, 10, 11, 12, 13, 16, 17, 18, 19];

function filaDemandaVacia(fecha: string, servicio: string, inicioMin: number): DemandaFranja {
  return {
    fecha,
    servicio,
    inicioMin,
    entrantes: 0,
    entrantesAtendidas: 0,
    entrantesAbandonadas: 0,
    entrantesRechazadas: 0,
    salientes: 0,
    salientesAtendidas: 0,
    segGestionEntrantes: 0,
  };
}

export function mockDemandaPorFranja(desde: string, hasta: string): DemandaFranja[] {
  const filas: DemandaFranja[] = [];
  for (const fecha of listaFechas(desde, hasta)) {
    const dia = new Date(`${fecha}T12:00:00`).getDay();
    if (dia === 0 || dia === 6) continue;
    HORAS_GH_DEMO.forEach((hora, h) => {
      for (const media of [0, 30]) {
        const inicioMin = hora * 60 + media;
        const r = rng(`demanda|${fecha}|${inicioMin}`);
        const entrantes = Math.round((LAMBDA_GH_DEMO[dia][h] / 2) * (0.85 + r() * 0.3));
        const atendidas = Math.round(entrantes * 0.8);
        const abandonadas = Math.round(entrantes * 0.1);
        const salientes = entre(r, 40, 80);
        filas.push({
          ...filaDemandaVacia(fecha, "GrupoHuertas", inicioMin),
          entrantes,
          entrantesAtendidas: atendidas,
          entrantesAbandonadas: abandonadas,
          entrantesRechazadas: Math.max(0, entrantes - atendidas - abandonadas),
          salientes,
          salientesAtendidas: Math.round(salientes * (0.68 + r() * 0.06)),
          segGestionEntrantes: atendidas * 280,
        });
        if (hora < 14) {
          const av = entre(r, 1, 3);
          filas.push({
            ...filaDemandaVacia(fecha, "Avolo", inicioMin),
            entrantes: av,
            entrantesAtendidas: av > 2 ? 1 : 0,
            entrantesRechazadas: av > 2 ? av - 1 : av,
            segGestionEntrantes: av > 2 ? 240 : 0,
          });
        }
        if (fecha >= "2026-09-14" && hora !== 18) {
          const sal = entre(r, 30, 50);
          filas.push({
            ...filaDemandaVacia(fecha, "UGR", inicioMin),
            salientes: sal,
            salientesAtendidas: Math.round(sal * (hora >= 11 && hora < 14 ? 0.66 : 0.6)),
          });
        }
      }
    });
  }
  return filas;
}

/** Listas salientes de la instalación (nombres de campaña, sin datos personales). */
const LISTAS_PLAN_DEMO: EstadoLista[] = [
  { campania: "CajaR_Autonomos_26", total: 265, vivos: 47, vivosSinTocar: 0 },
  { campania: "CEFF_Zaragoza", total: 1318, vivos: 222, vivosSinTocar: 80 },
  { campania: "gh_bbdd_autoclasse", total: 1729, vivos: 302, vivosSinTocar: 0 },
  { campania: "gh_bbdd_dimovil", total: 5393, vivos: 909, vivosSinTocar: 0 },
  { campania: "gh_bbdd_granada", total: 2437, vivos: 559, vivosSinTocar: 0 },
  { campania: "gh_bbdd_lexus", total: 324, vivos: 310, vivosSinTocar: 228 },
  { campania: "UGR_EGRE", total: 5516, vivos: 1562, vivosSinTocar: 660 },
  { campania: "UGR_EGRE26", total: 6177, vivos: 4310, vivosSinTocar: 1370 },
];

export function mockEstadoListas(patrones: string[]): EstadoLista[] {
  return LISTAS_PLAN_DEMO.filter((l) => patrones.some((p) => coincideLike(l.campania, p)));
}

export function mockCierresPorDia(desde: string, hasta: string, campanias?: string[]): CierresDia[] {
  // campaña → [desde, cierres medios por laborable]
  const ritmo: Record<string, [string, number]> = {
    UGR_EGRE26: ["2026-09-14", 150],
    CajaR_Autonomos_26: ["2026-09-01", 6],
    CEFF_Zaragoza: ["2026-08-01", 7],
    gh_bbdd_dimovil: ["2026-06-01", 20],
    gh_bbdd_granada: ["2026-06-01", 10],
    gh_bbdd_lexus: ["2026-09-28", 3],
  };
  const filas: CierresDia[] = [];
  for (const fecha of listaFechas(desde, hasta)) {
    if (factorDia(fecha) < 1) continue;
    for (const [campania, [inicio, media]] of Object.entries(ritmo)) {
      if (fecha < inicio || (campanias && campanias.length > 0 && !campanias.includes(campania))) continue;
      const r = rng(`cierres|${fecha}|${campania}`);
      filas.push({ fecha, campania, cierres: Math.max(1, Math.round(media * (0.7 + r() * 0.6))) });
    }
  }
  return filas;
}

const FESTIVOS_DEMO = [
  "2025-08-15", "2025-10-13", "2025-12-08", "2025-12-25", "2026-01-01", "2026-01-06",
  "2026-04-02", "2026-04-03", "2026-05-01", "2026-10-12", "2026-11-02", "2026-12-07",
  "2026-12-08", "2026-12-24", "2026-12-25", "2026-12-31",
];

export function mockFestivosServicio(desde: string, hasta: string): FestivosServicio {
  const festivos = FESTIVOS_DEMO.filter((f) => f >= desde && f <= hasta).flatMap((fecha) => [
    { fecha, servicio: "GrupoAvolo", tipo: "FESTIVO" },
    { fecha, servicio: "GrupoHuertas", tipo: "FESTIVO" },
  ]);
  return { festivos, ultimaFechaPorServicio: { GrupoAvolo: "2026-12-31", GrupoHuertas: "2026-12-31" } };
}

export function mockHorariosServicio(): HorarioServicio[] {
  const lv = [true, true, true, true, true, false, false];
  return [
    { servicio: "GrupoAvolo", dias: lv, entradaMin: 540, salidaMin: 840, desde: "2024-01-01", hasta: "2026-12-31" },
    { servicio: "GrupoAvolo", dias: lv, entradaMin: 960, salidaMin: 1080, desde: "2026-07-12", hasta: "2026-12-31" },
    { servicio: "GrupoHuertas", dias: lv, entradaMin: 540, salidaMin: 840, desde: "2024-01-01", hasta: "2026-12-31" },
    { servicio: "GrupoHuertas", dias: lv, entradaMin: 960, salidaMin: 1200, desde: "2024-01-01", hasta: "2026-12-31" },
  ];
}

export function mockEntrantesNoAtendidasHoy(campanias: string[]): EntrantesNoAtendidas {
  const r = rng(`noAtendidas|${new Date().toISOString().slice(0, 13)}|${campanias.join(",")}`);
  const n = entre(r, 0, 4);
  return n === 0
    ? { noAtendidas: 0, primera: null, ultima: null, ultimaAtendida: "10:05" }
    : { noAtendidas: n, primera: "09:12", ultima: "11:40", ultimaAtendida: "10:05" };
}
