import type {
  AgenteEstado,
  AgenteHoy,
  CampaniaInfo,
  HorasAgenteReales,
  KpiCampaniaHoy,
  MetricaDiariaCampania,
  MetricasIvr,
  PenetracionLista,
  RazonNotReady,
  SaludRdb,
  ServicioConCampanias,
  UnidadesCampania,
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
