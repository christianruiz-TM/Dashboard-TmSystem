import { describe, expect, it } from "vitest";
import fixture from "./__fixtures__/octubre-2026.json";
import { explicarBloque } from "./explicaciones";
import { generarPlan } from "./motor";
import type { EntradaMotor, SalidaMotor } from "./tipos";

// Entrada REAL de octubre de 2026 (datos de RDBv2 hasta el 28/09/2026), sin
// nombres, generada con:
//   npm run planificacion:fixture -- --mes 2026-10 --hasta-datos 2026-09-28
// Si se regenera o cambia el motor a propósito, el snapshot del final cambia:
// actualizarlo con `npx vitest -u` y explicar el cambio en el commit.
const entrada = fixture as unknown as EntradaMotor;
const salida = generarPlan(entrada);

const horasCliente = (s: SalidaMotor, codigo: string) => s.resumen.clientes.find((c) => c.codigo === codigo)?.horas ?? 0;
const objetivoCliente = (codigo: string) =>
  entrada.objetivos.filter((o) => o.cliente === codigo).reduce((a, o) => a + o.horas, 0);

/** Agentes con turno (y sin ausencia) en una franja: el máximo que podría haber en GH. */
function conTurno(fecha: string, inicioMin: number): number {
  const fin = inicioMin + entrada.pasoMin;
  return entrada.agentes.filter(
    (a) =>
      (a.turnos[fecha] ?? []).some((t) => t.inicioMin <= inicioMin && fin <= t.finMin) &&
      !a.ausencias.some((x) => x.fecha === fecha && x.inicioMin < fin && inicioMin < x.finMin),
  ).length;
}

describe("motor · octubre de 2026 (fixture real)", () => {
  // El plan pedía «0 franjas bajo el mínimo», la cifra del prototipo. Con la
  // ventana de 12 semanas la λ del jueves a las 17 h sube a 18,8 llamadas/h y
  // el mínimo, de 4 a 5; los jueves de semana B (08 y 22/10) solo 4 agentes
  // tienen turno a esa hora. Es un déficit de TURNOS, no de reparto: lo que
  // se exige al motor es no crear ninguno moviendo gente fuera de GH.
  it("0 franjas bajo el mínimo causadas por el reparto (solo quedan las de turnos)", () => {
    const bajo = salida.avisos.filter((a) => a.codigo === "franja_bajo_minimo");
    for (const a of bajo) {
      expect(a.datos?.hay).toBe(conTurno(a.fecha!, a.inicioMin!));
    }
    expect(bajo.map((a) => `${a.fecha} ${a.inicioMin! / 60}h`)).toEqual(["2026-10-08 17h", "2026-10-22 17h"]);
  });

  it("es determinista: dos ejecuciones dan una salida idéntica", () => {
    expect(generarPlan(structuredClone(entrada))).toEqual(salida);
  });

  it("no modifica la entrada", () => {
    const copia = structuredClone(entrada);
    generarPlan(copia);
    expect(copia).toEqual(entrada);
  });

  it("ninguna incidencia dura", () => {
    expect(salida.avisos.filter((a) => a.gravedad === "dura")).toEqual([]);
  });

  it("no se pierde ninguna hora: planificado = capacidad", () => {
    expect(salida.resumen.capacidadH).toBeGreaterThan(0);
    expect(salida.resumen.planificadoH).toBe(salida.resumen.capacidadH);
    for (const a of salida.resumen.agentes) expect(a.horas).toBe(a.capacidadH);
  });

  it("mínimo de GH entre 3 y 6 agentes, con el máximo un lunes por la mañana", () => {
    const gh = salida.minimos.filter((m) => m.cliente === "GH");
    const valores = gh.flatMap((m) => m.porFranja.filter((x) => x > 0));
    expect(Math.min(...valores)).toBeGreaterThanOrEqual(3);
    expect(Math.max(...valores)).toBe(6);
    const lunes5 = gh.find((m) => m.fecha === "2026-10-05")!;
    expect(Math.max(...lunes5.porFranja)).toBe(6);
    // Fuera del horario de GH (8-9, 14-16) no hay mínimo; el festivo, tampoco
    const i = (min: number) => salida.franjas.indexOf(min);
    expect(lunes5.porFranja[i(480)]).toBe(0);
    expect(lunes5.porFranja[i(840)]).toBe(0);
    expect(gh.find((m) => m.fecha === "2026-10-12")!.porFranja.every((x) => x === 0)).toBe(true);
    // El martes 13, tras el festivo, se dimensiona como un lunes
    expect(gh.find((m) => m.fecha === "2026-10-13")!.porFranja).toEqual(lunes5.porFranja);
  });

  it("UGR ≥ 95 % de su objetivo", () => {
    expect(objetivoCliente("UGR")).toBeGreaterThan(0);
    expect(horasCliente(salida, "UGR")).toBeGreaterThanOrEqual(0.95 * objetivoCliente("UGR"));
  });

  it("CEFF 18 ± 2 h, CR 4 h, BD + LX 88 ± 5 h y Ávolo sin bloques", () => {
    expect(Math.abs(horasCliente(salida, "CEFF") - 18)).toBeLessThanOrEqual(2);
    expect(horasCliente(salida, "CR")).toBe(4);
    expect(Math.abs(horasCliente(salida, "BD") + horasCliente(salida, "LX") - 88)).toBeLessThanOrEqual(5);
    expect(horasCliente(salida, "AV")).toBe(0);
    expect(salida.bloques.some((b) => b.clienteCodigo === "AV")).toBe(false);
  });

  it("cada bloque tiene su explicación", () => {
    for (const b of salida.bloques) {
      const texto = explicarBloque(b, entrada.clienteBase);
      expect(texto.length).toBeGreaterThan(10);
      if (b.regla === "objetivo") expect(texto).toMatch(/aquí: holgura GH -?\d+, contacto/);
    }
  });

  it("reparto por cliente y semana estable (snapshot)", () => {
    expect(
      Object.fromEntries(salida.resumen.clientes.map((c) => [c.codigo, { ...c.porSemana, mes: c.horas }])),
    ).toMatchSnapshot();
  });
});

describe("motor · casos sintéticos", () => {
  it("un bloque fijado se respeta tal cual y cuenta para el objetivo", () => {
    const b = salida.bloques.find((x) => x.clienteCodigo === "GH" && x.fecha === "2026-10-06" && x.finMin - x.inicioMin >= 180)!;
    const fijado = { agenteNumero: b.agenteNumero, fecha: b.fecha, inicioMin: b.inicioMin, finMin: b.inicioMin + 120, clienteCodigo: "BD" };
    const e = structuredClone(entrada);
    e.fijados = [fijado];
    const s = generarPlan(e);
    const suyo = s.bloques.find((x) => x.agenteNumero === fijado.agenteNumero && x.fecha === fijado.fecha && x.inicioMin === fijado.inicioMin);
    expect(suyo).toMatchObject({ clienteCodigo: "BD", finMin: fijado.finMin, fijado: true, regla: "fijado" });
  });

  it("una ausencia de día entero quita esas horas de la capacidad", () => {
    const e = structuredClone(entrada);
    const agente = e.agentes.find((a) => a.turnos["2026-10-07"]?.length)!;
    const horasTurno = agente.turnos["2026-10-07"].reduce((acc, t) => acc + (t.finMin - t.inicioMin) / 60, 0);
    agente.ausencias.push({ fecha: "2026-10-07", inicioMin: 0, finMin: 1440, tipo: "VAC" });
    const s = generarPlan(e);
    expect(s.resumen.capacidadH).toBe(salida.resumen.capacidadH - horasTurno);
    expect(s.bloques.some((x) => x.agenteNumero === agente.numero && x.fecha === "2026-10-07")).toBe(false);
  });

  it("un agente sin sesiones recientes no se planifica (salvo forzado)", () => {
    const e = structuredClone(entrada);
    const a = e.agentes.find((x) => x.ultimaSesion != null && Object.keys(x.turnos).length > 0)!;
    a.ultimaSesion = "2026-06-01";
    const s = generarPlan(e);
    expect(s.avisos.some((x) => x.codigo === "agente_inactivo" && x.agente === a.numero)).toBe(true);
    expect(s.bloques.some((x) => x.agenteNumero === a.numero)).toBe(false);
    a.forzarActivo = true;
    expect(generarPlan(e).bloques.some((x) => x.agenteNumero === a.numero)).toBe(true);
  });
});
