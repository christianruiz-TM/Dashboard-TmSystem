import { describe, expect, it } from "vitest";
import { evaluarAlertas, type DatosAlertas } from "./alertas";

const BASE: DatosAlertas = {
  ahoraMin: 10 * 60 + 30, // 10:30
  pasoMin: 60,
  inicioDiaMin: 480,
  finDiaMin: 1200,
  clienteBase: "GH",
  clientes: [
    { codigo: "GH", nombre: "Grupo Huertas", modo: "resto", cuentaComo: null, prefijos: ["GH_"] },
    { codigo: "BD", nombre: "GH BBDD", modo: "objetivo", cuentaComo: "GH", prefijos: ["GH_…_BD"] },
    { codigo: "AV", nombre: "Ávolo", modo: "a_demanda", cuentaComo: null, prefijos: ["Av_"] },
    { codigo: "UGR", nombre: "UGR", modo: "objetivo", cuentaComo: null, prefijos: ["UGR_"] },
  ],
  bloquesHoy: [
    { agenteNumero: "0851", inicioMin: 540, finMin: 840, clienteCodigo: "GH" },
    { agenteNumero: "0892", inicioMin: 540, finMin: 840, clienteCodigo: "GH" },
    { agenteNumero: "0925", inicioMin: 600, finMin: 840, clienteCodigo: "UGR" },
  ],
  // 2 de mínimo de 10 a 11
  minimosBase: [0, 0, 2, 2, 2, 2, 0, 0, 2, 2, 2, 2],
  logadoHoy: [
    { agenteNumero: "0851", inicioMin: 535, finMin: 630, clienteCodigo: "GH" },
    { agenteNumero: "0892", inicioMin: 538, finMin: 629, clienteCodigo: "BD" },
    { agenteNumero: "0925", inicioMin: 600, finMin: 625, clienteCodigo: "UGR" },
  ],
  aDemanda: [{ cliente: "AV", noAtendidas: 0, ultima: null, ultimaAtendida: null }],
  semana: [],
  nombres: { "0851": "Lourdes", "0925": "Bego" },
  parametros: { minutosConexion: 15, pctRetraso: 80, horasMinRetraso: 2 },
};

describe("alertas de planificación", () => {
  it("sin incidencias, sin alertas", () => {
    expect(evaluarAlertas({ ...BASE, logadoHoy: BASE.logadoHoy.map((t) => ({ ...t, finMin: 630 })) })).toEqual([]);
  });

  it("agente que se desconecta durante su bloque: aviso tras 15 min", () => {
    // 0925 salió a las 10:25; a las 10:30 aún no, a las 10:41 sí
    expect(evaluarAlertas({ ...BASE, logadoHoy: BASE.logadoHoy.map((t) => ({ ...t, finMin: t.agenteNumero === "0925" ? 625 : 630 })) })).toEqual([]);
    const tarde = evaluarAlertas({ ...BASE, ahoraMin: 641, logadoHoy: BASE.logadoHoy.map((t) => ({ ...t, finMin: t.agenteNumero === "0925" ? 625 : 641 })) });
    expect(tarde).toEqual([
      { tipo: "sin_conectar", gravedad: "media", agente: "0925", cliente: "UGR", mensaje: "0925 Bego: planificado en UGR y desconectado desde las 10:25." },
    ]);
  });

  it("agente planificado que no se ha conectado", () => {
    const r = evaluarAlertas({ ...BASE, logadoHoy: BASE.logadoHoy.filter((t) => t.agenteNumero !== "0925").map((t) => ({ ...t, finMin: 630 })) });
    expect(r.map((a) => a.mensaje)).toEqual(["0925 Bego: planificado en UGR desde las 10:00 y sin conectar."]);
  });

  it("más de 3 sin conectar: una sola alerta con la lista", () => {
    const bloques = ["0851", "0892", "0925", "0940"].map((a) => ({ agenteNumero: a, inicioMin: 540, finMin: 840, clienteCodigo: "GH" }));
    const r = evaluarAlertas({ ...BASE, minimosBase: null, bloquesHoy: bloques, logadoHoy: [] });
    expect(r).toEqual([
      {
        tipo: "sin_conectar",
        gravedad: "media",
        mensaje:
          "4 agentes planificados y sin conectar: 0851 Lourdes (GH desde las 09:00), 0892 (GH desde las 09:00), 0925 Bego (GH desde las 09:00), 0940 (GH desde las 09:00).",
      },
    ]);
  });

  it("GH por debajo del mínimo: cuentan GH y los que cuentan como GH (BD)", () => {
    const solo = BASE.logadoHoy.filter((t) => t.agenteNumero !== "0892").map((t) => ({ ...t, finMin: 630 }));
    const r = evaluarAlertas({ ...BASE, logadoHoy: solo, bloquesHoy: BASE.bloquesHoy.filter((b) => b.agenteNumero !== "0892") });
    expect(r).toEqual([
      {
        tipo: "bajo_minimo",
        gravedad: "alta",
        cliente: "GH",
        mensaje: "GH por debajo del mínimo: 1 agente conectado con GH/BD para un mínimo de 2 (franja 10:00-11:00).",
      },
    ]);
    // Al empezar una franja que sube el mínimo (de 0 a 2 a las 10:00) se esperan los 15 min
    expect(evaluarAlertas({ ...BASE, ahoraMin: 605, logadoHoy: solo.map((t) => ({ ...t, finMin: 605 })), bloquesHoy: [] })).toEqual([]);
    expect(evaluarAlertas({ ...BASE, ahoraMin: 615, logadoHoy: solo.map((t) => ({ ...t, finMin: 615 })), bloquesHoy: [] })).toHaveLength(1);
    // Fuera del día del tablero no hay franja que vigilar
    expect(evaluarAlertas({ ...BASE, ahoraMin: 21 * 60, logadoHoy: [], bloquesHoy: [] })).toEqual([]);
  });

  it("Ávolo con entrantes pendientes y nadie con Av_; si alguien está conectado, nada", () => {
    const pendientes = { ...BASE, logadoHoy: BASE.logadoHoy.map((t) => ({ ...t, finMin: 630 })), aDemanda: [{ cliente: "AV", noAtendidas: 3, ultima: "10:12", ultimaAtendida: "09:40" }] };
    expect(evaluarAlertas(pendientes)).toEqual([
      {
        tipo: "a_demanda",
        gravedad: "alta",
        cliente: "AV",
        mensaje: "Ávolo: 3 entrantes sin atender hoy (la última a las 10:12) y nadie conectado con Av_: que alguien con ese usuario se conecte.",
      },
    ]);
    const atendiendo = { ...pendientes, logadoHoy: [...pendientes.logadoHoy, { agenteNumero: "0985", inicioMin: 620, finMin: 630, clienteCodigo: "AV" }] };
    expect(evaluarAlertas(atendiendo)).toEqual([]);
    // Ya atendida después de la última perdida: nada pendiente
    expect(evaluarAlertas({ ...pendientes, aDemanda: [{ cliente: "AV", noAtendidas: 3, ultima: "10:12", ultimaAtendida: "10:20" }] })).toEqual([]);
  });

  it("campaña saliente retrasada por debajo del 80 % (y solo pasadas las horas mínimas)", () => {
    const d = { ...BASE, logadoHoy: BASE.logadoHoy.map((t) => ({ ...t, finMin: 630 })) };
    expect(
      evaluarAlertas({ ...d, semana: [{ cliente: "UGR", planificadoH: 20, realH: 12.5 }, { cliente: "BD", planificadoH: 1.5, realH: 0 }] }),
    ).toEqual([
      {
        tipo: "retraso",
        gravedad: "media",
        cliente: "UGR",
        mensaje: "La campaña de UGR va retrasada: 12,50 h trabajadas esta semana de 20,00 h planificadas hasta ahora (63 %).",
      },
    ]);
    expect(evaluarAlertas({ ...d, semana: [{ cliente: "UGR", planificadoH: 20, realH: 16 }] })).toEqual([]);
  });
});
