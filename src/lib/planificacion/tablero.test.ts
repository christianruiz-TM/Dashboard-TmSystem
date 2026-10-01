import { describe, expect, it } from "vitest";
import { construirDias, fechasDelMes, type AusenciaMotor, type Tramo } from "./motor";
import {
  agentesEnFranja,
  barrasBolsa,
  capacidadPlan,
  colorTexto,
  estadoFranja,
  horasPorAgente,
  horasPorCliente,
  nombreMes,
  posicionPct,
  saldosPrevistos,
  saldoTexto,
} from "./tablero";

// Clientes y horas del borrador v1 de octubre de 2026 (SQLite real, 30/09/2026)
const CLIENTES = [
  { codigo: "GH", modo: "resto" as const, cuentaComo: null },
  { codigo: "BD", modo: "objetivo" as const, cuentaComo: "GH" },
  { codigo: "LX", modo: "objetivo" as const, cuentaComo: "GH" },
  { codigo: "AV", modo: "a_demanda" as const, cuentaComo: null },
  { codigo: "UGR", modo: "objetivo" as const, cuentaComo: null },
  { codigo: "CR", modo: "objetivo" as const, cuentaComo: null },
  { codigo: "CEFF", modo: "objetivo" as const, cuentaComo: null },
];
const HORAS = new Map(
  Object.entries({ GH: 1343, BD: 42, LX: 45, UGR: 148, CEFF: 18 }).map(([c, total]) => [c, { total }]),
);
const OBJETIVOS = [
  { cliente: "BD", horas: 42 },
  { cliente: "LX", horas: 45 },
  { cliente: "UGR", horas: 14 },
  { cliente: "UGR", horas: 134 },
  { cliente: "CR", horas: 0 },
  { cliente: "CEFF", horas: 18 },
];
const BOLSAS = [
  { cliente: "GH", horas: 1263.82, origen: "prorrateo" as const },
  { cliente: "AV", horas: 147, origen: "prorrateo" as const },
];

describe("tablero", () => {
  it("barras: GH comparte bolsa con BD y LX, que llevan además su objetivo", () => {
    const barras = barrasBolsa(CLIENTES, HORAS, OBJETIVOS, BOLSAS);
    expect(barras.map((b) => [b.cliente, b.tipo, b.horas, b.referencia, b.miembroDe])).toEqual([
      ["GH", "grupo", 1430, 1263.82, null],
      ["BD", "objetivo", 42, 42, "GH"],
      ["LX", "objetivo", 45, 45, "GH"],
      ["AV", "a_demanda", 0, 147, null],
      ["UGR", "objetivo", 148, 148, null],
      ["CR", "objetivo", 0, 0, null],
      ["CEFF", "objetivo", 18, 18, null],
    ]);
    expect(barras[0].segmentos).toEqual([
      { cliente: "GH", horas: 1343 },
      { cliente: "BD", horas: 42 },
      { cliente: "LX", horas: 45 },
    ]);
    expect(barras[0].tipoReferencia).toBe("bolsa");
    expect(barras[0].origenBolsa).toBe("prorrateo");
  });

  it("horas por cliente, semana y agente", () => {
    const bloques = [
      { agenteNumero: "0851", fecha: "2026-11-02", inicioMin: 540, finMin: 840, clienteCodigo: "GH" },
      { agenteNumero: "0851", fecha: "2026-11-03", inicioMin: 660, finMin: 840, clienteCodigo: "UGR" },
      { agenteNumero: "0925", fecha: "2026-11-09", inicioMin: 960, finMin: 1200, clienteCodigo: "GH" },
    ];
    const semanaDe = { "2026-11-02": "2026-11-02", "2026-11-03": "2026-11-02", "2026-11-09": "2026-11-09" };
    const c = horasPorCliente(bloques, semanaDe);
    expect(c.get("GH")).toEqual({ total: 9, porSemana: { "2026-11-02": 5, "2026-11-09": 4 } });
    expect(c.get("UGR")?.total).toBe(3);
    const a = horasPorAgente(bloques, semanaDe);
    expect(a.semana.get("0851|2026-11-02")).toBe(8);
    expect(a.mes.get("0925")).toBe(4);
    expect(agentesEnFranja(bloques, new Set(["GH", "BD"]), "2026-11-02", 600, 60)).toEqual(["0851"]);
    expect(agentesEnFranja(bloques, new Set(["UGR"]), "2026-11-03", 600, 60)).toEqual([]);
  });

  it("semáforo del mapa de cobertura", () => {
    expect(estadoFranja(3, 0)).toBe("sin_minimo");
    expect(estadoFranja(3, 4)).toBe("bajo");
    expect(estadoFranja(4, 4)).toBe("justo");
    expect(estadoFranja(5, 4)).toBe("holgado");
  });

  it("texto negro o blanco según el color del cliente", () => {
    expect(colorTexto("#FFCCFF")).toBe("#000000"); // GH
    expect(colorTexto("#4E95D9")).toBe("#000000"); // Ávolo
    expect(colorTexto("#1C1B1A")).toBe("#ffffff");
    expect(colorTexto("rojo")).toBe("#000000");
  });

  it("posición en % dentro del día de 8 a 20 h", () => {
    expect(posicionPct(540, 840, 480, 1200)).toEqual({ left: (60 / 720) * 100, width: (300 / 720) * 100 });
    expect(posicionPct(420, 540, 480, 1200)).toEqual({ left: 0, width: (60 / 720) * 100 }); // recortado
    expect(posicionPct(1200, 1260, 480, 1200).width).toBe(0);
  });

  it("nombre del mes", () => {
    expect(nombreMes("2026-11")).toBe("Noviembre 2026");
  });

  it("saldo previsto por semana y mes: plan + justificadas − contrato prorrateado", () => {
    // Octubre de 2026: 21 laborables (12/10 festivo). Turno 9-15 de lunes a
    // viernes y 30 h de contrato. VAC (cuenta como trabajada) el 09/10 y AUS
    // (no cuenta) el 21/10.
    const entrada = {
      dias: construirDias({
        mes: "2026-10",
        semanaA: "2026-08-31",
        servicioCalendario: "GrupoHuertas",
        festivos: [{ fecha: "2026-10-12", servicio: "GrupoHuertas" }],
      }),
      servicioCalendario: "GrupoHuertas",
      inicioDiaMin: 480,
      finDiaMin: 1200,
      pasoMin: 60,
    };
    const entreSemana = entrada.dias.filter((d) => d.diaSemana < 5).map((d) => d.fecha);
    const turnos: Record<string, Tramo[]> = Object.fromEntries(entreSemana.map((f) => [f, [{ inicioMin: 540, finMin: 900 }]]));
    const ausencias: AusenciaMotor[] = [
      { fecha: "2026-10-09", inicioMin: 0, finMin: 1440, tipo: "VAC" },
      { fecha: "2026-10-21", inicioMin: 0, finMin: 1440, tipo: "AUS" },
    ];
    const agente = { numero: "0851", contratoSemanalH: 30, turnos, ausencias };
    const trabaja = entreSemana.filter((f) => !["2026-10-09", "2026-10-12", "2026-10-21"].includes(f));
    const bloques = trabaja.map((fecha) => ({
      agenteNumero: "0851",
      fecha,
      inicioMin: 540,
      finMin: fecha === "2026-10-30" ? 960 : 900, // el 30/10, una hora extra
      clienteCodigo: "GH",
    }));
    const saldos = saldosPrevistos(entrada, [agente], bloques, (t) => t === "VAC");
    const semana = (lunes: string) => saldos.get(`0851|${lunes}`);
    expect(semana("2026-09-28")).toEqual({ plan: 12, justificadas: 0, contrato: 12, saldo: 0 }); // 1 y 2/10
    expect(semana("2026-10-05")).toEqual({ plan: 24, justificadas: 6, contrato: 30, saldo: 0 });
    expect(semana("2026-10-12")).toEqual({ plan: 24, justificadas: 0, contrato: 24, saldo: 0 }); // festivo
    expect(semana("2026-10-19")).toEqual({ plan: 24, justificadas: 0, contrato: 30, saldo: -6 });
    expect(semana("2026-10-26")).toEqual({ plan: 31, justificadas: 0, contrato: 30, saldo: 1 });
    expect(saldos.get("0851|mes")).toEqual({ plan: 115, justificadas: 6, contrato: 126, saldo: -5 });
    expect(saldosPrevistos(entrada, [{ ...agente, contratoSemanalH: null }], bloques, () => true).size).toBe(0);
    expect([saldoTexto(1), saldoTexto(-6), saldoTexto(0.004)]).toEqual(["+1,00 h", "−6,00 h", "0,00 h"]);

    // Capacidad: 21 laborables × 6 h − las dos ausencias; sin el festivo
    expect(fechasDelMes("2026-10")).toHaveLength(31);
    expect(capacidadPlan(entrada, [agente])).toBe(21 * 6 - 12);
    // Una ausencia nueva de 2 h la baja al momento
    const conOtra = { ...agente, ausencias: [...ausencias, { fecha: "2026-10-27", inicioMin: 600, finMin: 720, tipo: "AUS" }] };
    expect(capacidadPlan(entrada, [conOtra])).toBe(21 * 6 - 14);
  });
});
