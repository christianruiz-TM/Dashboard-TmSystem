import { describe, expect, it } from "vitest";
import {
  alertasCallback,
  calcularCallback,
  enHorario,
  horarioDeCalendario,
  leerConfigCallback,
  minutosEnHorario,
  restarMinutos,
  textoTicketCallback,
  type BaseCallback,
  type ConfigCallback,
  type FichaCallback,
  type HorarioSemanal,
} from "./callback";

// GrupoHuertas: de lunes a viernes de 9 a 14 y de 16 a 20
const HORARIOS_GH: HorarioSemanal[] = [
  { servicio: "GrupoHuertas", dias: [true, true, true, true, true, false, false], entradaMin: 540, salidaMin: 840, desde: "2024-01-01", hasta: "2026-12-31" },
  { servicio: "GrupoHuertas", dias: [true, true, true, true, true, false, false], entradaMin: 960, salidaMin: 1200, desde: "2024-01-01", hasta: "2026-12-31" },
];
const gh = horarioDeCalendario(HORARIOS_GH, "GrupoHuertas", new Set(["2026-11-09"]))!;

describe("horario de atención", () => {
  it("cuenta solo los minutos con el cliente abierto", () => {
    // Martes 10/11: de 13:50 a 16:10 → 10 min antes de comer y 10 después
    expect(minutosEnHorario("2026-11-10 13:50:00", "2026-11-10 16:10:00", gh)).toBe(20);
    // De las 20:55 del martes a las 9:05 del miércoles: 5 minutos
    expect(minutosEnHorario("2026-11-10 20:55:00", "2026-11-11 09:05:00", gh)).toBe(5);
    // Del viernes 19:50 al lunes 9:10 (el lunes 09/11 es festivo): 10 + martes 10 min
    expect(minutosEnHorario("2026-11-06 19:50:00", "2026-11-10 09:10:00", gh)).toBe(20);
  });

  it("sin calendario, el reloj", () => {
    expect(minutosEnHorario("2026-11-10 20:55:00", "2026-11-11 09:05:00", () => null)).toBe(730);
    expect(horarioDeCalendario(HORARIOS_GH, "CEFF", new Set())).toBeNull();
    expect(horarioDeCalendario(HORARIOS_GH, null, new Set())).toBeNull();
  });

  it("el horario especial del día manda y el festivo cierra", () => {
    const especial = horarioDeCalendario(HORARIOS_GH, "GrupoHuertas", new Set(), { "2026-12-24": [{ inicioMin: 540, finMin: 840 }] })!;
    expect(especial("2026-12-24")).toEqual([{ inicioMin: 540, finMin: 840 }]);
    expect(gh("2026-11-09")).toEqual([]);
    expect(gh("2026-11-08")).toEqual([]); // domingo
    expect(enHorario("2026-11-10 14:30:00", gh)).toBe(false);
    expect(enHorario("2026-11-10 16:00:00", gh)).toBe(true);
  });
});

describe("configuración", () => {
  it("lee lo válido y pone los valores por defecto", () => {
    expect(leerConfigCallback(null)).toEqual({ servicios: [], umbralAlerta: 10, destinatario: "dtecnico@tmsystem.es" });
    const c = leerConfigCallback(
      JSON.stringify({
        servicios: [{ servicio: " Avolo ", calendario: "GrupoAvolo", campanias: null }, { servicio: "" }, { servicio: "CEFF", campanias: ["Curso_maquinista", 3] }],
        umbralAlerta: 0,
        destinatario: "no es un correo",
      }),
    );
    expect(c.servicios).toEqual([
      { servicio: "Avolo", calendario: "GrupoAvolo", campanias: null },
      { servicio: "CEFF", calendario: null, campanias: ["Curso_maquinista"] },
    ]);
    expect(c.umbralAlerta).toBe(10);
    expect(c.destinatario).toBe("dtecnico@tmsystem.es");
    expect(leerConfigCallback("{roto")).toEqual(leerConfigCallback(null));
  });
});

function ficha(p: Partial<FichaCallback>): FichaCallback {
  return {
    servicio: "GrupoHuertas",
    campania: "gh_leads",
    contacto: 1,
    alta: "2026-11-10 10:00:00",
    abierta: false,
    primerToque: null,
    agente: null,
    nombreAgente: null,
    primeraLlamada: null,
    hablaron: false,
    ...p,
  };
}

const config: ConfigCallback = {
  servicios: [
    { servicio: "GrupoHuertas", calendario: "GrupoHuertas", campanias: null },
    { servicio: "CEFF", calendario: null, campanias: ["Curso_maquinista"] },
  ],
  umbralAlerta: 3,
  destinatario: "dtecnico@tmsystem.es",
};

describe("indicadores", () => {
  const base: BaseCallback = {
    fichas: [
      // Hablamos a los 5 min
      ficha({ contacto: 1, primerToque: "2026-11-10 10:05:00", agente: "GH_0851", nombreAgente: "Ana", primeraLlamada: "2026-11-10 10:05:00", hablaron: true }),
      // Llamada sin hablar: de 13:50 a 16:20 = 30 min en horario
      ficha({ contacto: 2, alta: "2026-11-10 13:50:00", primerToque: "2026-11-10 16:20:00", agente: "GH_0900", primeraLlamada: "2026-11-10 16:20:00" }),
      // Gestión sin llamada (abrió la ficha y la cerró)
      ficha({ contacto: 3, campania: "gh_vo", primerToque: "2026-11-10 12:00:00", agente: "GH_0851", nombreAgente: "Ana" }),
      // Pendiente y cerrada sin tocar
      ficha({ contacto: 4, alta: "2026-11-10 19:00:00", abierta: true }),
      ficha({ contacto: 5, alta: "2026-11-10 11:00:00" }),
      // De ayer, aún pendiente: solo cuenta en «pendientes ahora»
      ficha({ contacto: 6, alta: "2026-11-09 18:00:00", abierta: true }),
      // De otro cliente sin configurar: fuera
      ficha({ servicio: "Bolsas", contacto: 7 }),
    ],
    entrantes: [
      { servicio: "GrupoHuertas", campania: "gh_leads", categoria: "atendida", conFicha: false, fichaPrevia: false, n: 50 },
      { servicio: "GrupoHuertas", campania: "gh_leads", categoria: "rechazada", conFicha: true, fichaPrevia: false, n: 3 },
      { servicio: "GrupoHuertas", campania: "gh_leads", categoria: "rechazada", conFicha: false, fichaPrevia: true, n: 1 },
      { servicio: "GrupoHuertas", campania: "gh_leads", categoria: "rechazada", conFicha: false, fichaPrevia: false, n: 2 },
      { servicio: "GrupoHuertas", campania: "gh_leads", categoria: "cola", conFicha: false, fichaPrevia: false, n: 4 },
      { servicio: "GrupoHuertas", campania: null, categoria: "ivr", conFicha: false, fichaPrevia: false, n: 7 },
      { servicio: "CEFF", campania: "Otra", categoria: "rechazada", conFicha: false, fichaPrevia: false, n: 5 },
    ],
    rechazadas: [],
  };
  const r = calcularCallback(base, config, { GrupoHuertas: gh }, "2026-11-10", "2026-11-10 19:30:00");
  const g = r.servicios.find((s) => s.servicio === "GrupoHuertas")!;

  it("cuenta las fichas del periodo por cómo acabaron", () => {
    expect(g.resumen).toMatchObject({
      creadas: 5,
      devueltas: 3,
      pendientes: 1,
      cerradasSinTocar: 1,
      hablamos: 1,
      llamadaSinHablar: 1,
      gestionSinLlamada: 1,
    });
    // 5, 30 y 120 min en horario
    expect(g.resumen.medianaMin).toBe(30);
    expect(g.resumen.pctMenos1h).toBe(66.67);
    expect(g.resumen.tramos.map((t) => t.n)).toEqual([1, 1, 1, 0]);
  });

  it("separa las entrantes no atendidas", () => {
    expect(g.entrantes).toMatchObject({
      recibidas: 67,
      atendidas: 50,
      rechazadas: 6,
      rechazadasConFicha: 3,
      rechazadasFichaPrevia: 1,
      rechazadasSinFicha: 2,
      colgaronEnCola: 4,
      colgaronEnIvr: 7,
    });
    // CEFF: rechazadas en una campaña sin callback
    const ceff = r.servicios.find((s) => s.servicio === "CEFF")!;
    expect(ceff.entrantes.rechazadasSinCallback).toBe(5);
    expect(ceff.entrantes.rechazadas).toBe(0);
  });

  it("por campaña, por agente y pendientes de ahora (también de ayer)", () => {
    expect(g.porCampania.map((c) => [c.campania, c.creadas])).toEqual([["gh_leads", 4], ["gh_vo", 1]]);
    expect(g.porAgente).toEqual([
      { agente: "GH_0851", nombre: "Ana", devueltas: 2, hablamos: 1, medianaMin: 62.5 },
      { agente: "GH_0900", nombre: "GH_0900", devueltas: 1, hablamos: 0, medianaMin: 30 },
    ]);
    // La de ayer a las 18:00 (lunes 09/11, festivo en este calendario): solo la jornada de hoy (5 + 3,5 h)
    expect(g.pendientesAhora.map((p) => [p.contacto, p.esperaMin])).toEqual([[6, 300 + 210], [4, 30]]);
    expect(r.total.creadas).toBe(5);
  });
});

describe("alerta «callback sin funcionar»", () => {
  const rech = (inicio: string, campania = "gh_leads", servicio = "GrupoHuertas") => ({ servicio, campania, inicio });

  it("avisa con N rechazadas en horario y sin ninguna ficha desde la primera", () => {
    const base = {
      fichas: [ficha({ alta: "2026-11-10 09:30:00" })],
      rechazadas: [
        rech("2026-11-10 09:20:00"), // antes de la última ficha
        rech("2026-11-10 10:00:00"),
        rech("2026-11-10 14:30:00"), // fuera de horario (comida)
        rech("2026-11-10 16:10:00"),
        rech("2026-11-10 17:00:00"),
        rech("2026-11-10 17:55:00"), // aún en el margen de 10 min
      ],
    };
    expect(alertasCallback(base, config, { GrupoHuertas: gh }, "2026-11-10", "2026-11-10 18:00:00")).toEqual([
      { servicio: "GrupoHuertas", rechazadas: 3, desde: "2026-11-10 10:00:00", ultimaFicha: "2026-11-10 09:30:00" },
    ]);
    // Con una ficha nueva a las 16:30, la racha vuelve a empezar
    const conFicha = { ...base, fichas: [...base.fichas, ficha({ alta: "2026-11-10 16:30:00" })] };
    expect(alertasCallback(conFicha, config, { GrupoHuertas: gh }, "2026-11-10", "2026-11-10 18:00:00")).toEqual([]);
  });

  it("solo en las campañas con callback del cliente", () => {
    const base = {
      fichas: [],
      rechazadas: [rech("2026-11-10 10:00:00", "Otra", "CEFF"), rech("2026-11-10 10:01:00", "Otra", "CEFF"), rech("2026-11-10 10:02:00", "Otra", "CEFF")],
    };
    expect(alertasCallback(base, config, {}, "2026-11-10", "2026-11-10 18:00:00")).toEqual([]);
    const enCurso = { fichas: [], rechazadas: base.rechazadas.map((r) => ({ ...r, campania: "Curso_maquinista" })) };
    expect(alertasCallback(enCurso, config, {}, "2026-11-10", "2026-11-10 18:00:00")).toHaveLength(1);
  });

  it("ticket: lo básico sin diagnóstico", () => {
    const alerta = { servicio: "GrupoHuertas", rechazadas: 12, desde: "2026-11-10 10:00:00", ultimaFicha: null };
    const ctx = { cfg: config.servicios[0], umbral: 10, horarioHoy: null, urlPanel: null, errorDiagnostico: "tiempo agotado" };
    const c = textoTicketCallback(alerta, null, ctx);
    expect(c.asunto).toBe("[Dashboard] Callback sin funcionar en GrupoHuertas (10/11/2026)");
    expect(c.texto).toContain("hay 12 llamadas entrantes de GrupoHuertas rechazadas");
    expect(c.texto).toContain("Hoy no se ha creado ninguna ficha de callback");
    expect(c.texto).toContain("No se pudo sacar el detalle de RDBv2: tiempo agotado");
    expect(textoTicketCallback(alerta, null, { ...ctx, prueba: true }).asunto).toMatch(/^\[PRUEBA\] /);
  });

  it("ticket: con el diagnóstico, todo lo que ayuda a encontrar el fallo", () => {
    const alerta = { servicio: "CEFF", rechazadas: 2, desde: "2026-11-10 10:00:00", ultimaFicha: "2026-11-10 09:30:00" };
    const d = {
      rechazadasHoy: [
        { inicio: "2026-11-10 10:05:00", campania: "Curso_maquinista", global: 555, finNumero: "123", estado: 7, conFicha: false },
        { inicio: "2026-11-10 10:00:00", campania: "Curso_maquinista", global: 554, finNumero: null, estado: 9, conFicha: false },
        { inicio: "2026-11-10 09:20:00", campania: "Curso_maquinista", global: 550, finNumero: "456", estado: 7, conFicha: true },
        { inicio: "2026-11-10 09:00:00", campania: "Otra", global: 549, finNumero: "789", estado: 7, conFicha: false },
      ],
      ultimasFichas: [{ alta: "2026-11-10 09:30:00", campania: "Curso_maquinista", usuario: "IVR45" }],
      ultimaFichaCampania: { Curso_maquinista: "2026-11-10 09:30:00" },
      porDia: [
        { fecha: "2026-11-09", rechazadas: 5, fichas: 4 },
        { fecha: "2026-11-10", rechazadas: 4, fichas: 1 },
      ],
      agentesConectados: 0,
      agentesReady: 0,
      ultimoHilo: "2026-11-10 10:06:00",
      ultimoEventoContacto: "2026-11-10 10:05:30",
    };
    const t = textoTicketCallback(alerta, d, {
      cfg: config.servicios[1],
      umbral: 3,
      horarioHoy: [{ inicioMin: 540, finMin: 840 }],
      urlPanel: "http://panel/supervision?servicio=CEFF",
    }).texto;
    expect(t).toContain("- Rechazadas o desbordadas en campañas con callback: 3 (con ficha: 1; sin ficha: 2)");
    expect(t).toContain("- Rechazadas en campañas sin callback (no se esperan fichas): 1");
    expect(t).toContain("- Fichas de callback creadas hoy: 1");
    expect(t).toContain("- Agentes conectados ahora en sus campañas: 0 (en Ready: 0)");
    expect(t).toContain("- Horario de atención de hoy: 09:00-14:00");
    expect(t).toContain("- Curso_maquinista: 2 (de 10:00 a 10:05) · última ficha: 10/11 09:30");
    expect(t).toContain("- 09/11: 5 / 4");
    expect(t).toContain("- 10/11 09:30:00 · Curso_maquinista · creada por IVR45");
    expect(t).toContain("- 10:05:00 · Curso_maquinista · 555 · rechazada · acaba en 123");
    expect(t).toContain("- 10:00:00 · Curso_maquinista · 554 · desbordada · sin número");
    expect(t).toContain("- Último evento de contactos: 10/11 10:05:30");
    expect(t).toContain("- Campañas con callback: Curso_maquinista");
    expect(t).toContain("Supervisión: http://panel/supervision?servicio=CEFF");
  });

  it("restar minutos cruza el día", () => {
    expect(restarMinutos("2026-11-10 00:05:00", 10)).toBe("2026-11-09 23:55:00");
  });
});
