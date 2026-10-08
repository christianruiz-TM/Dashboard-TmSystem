import { describe, expect, it } from "vitest";
import { calcularAdherencia, resumirAdherencia, resumirPor, type BloquePlanAdh, type ReglasAdherencia, type TramoLogado } from "./adherencia";

const F = "2026-10-05";
const b = (agente: string, cliente: string, ini: number, fin: number, fecha = F): BloquePlanAdh => ({
  agenteNumero: agente,
  fecha,
  clienteCodigo: cliente,
  inicioMin: ini * 60,
  finMin: fin * 60,
});
const t = (agente: string, cliente: string | null, ini: number, fin: number, fecha = F): TramoLogado => ({
  agenteNumero: agente,
  fecha,
  clienteCodigo: cliente,
  inicioMin: ini * 60,
  finMin: fin * 60,
});
const AV: ReglasAdherencia = { clienteBase: "GH", aDemanda: new Set(["AV"]), cuentaComo: { BD: "GH", LX: "GH" } };

describe("adherencia", () => {
  it("clasifica cada minuto planificado: correcto, a demanda, otro cliente o sin conectar", () => {
    // Planificado GH 9-14 y UGR 16-18. Logada GH 9-12, Av 12-13 (a demanda),
    // nada 13-14, GH 16-17 (en UGR tocaba: otro cliente) y UGR 17-19 (19 fuera del plan)
    const { filas, dias } = calcularAdherencia(
      [b("0851", "GH", 9, 14), b("0851", "UGR", 16, 18)],
      [t("0851", "GH", 9, 12), t("0851", "AV", 12, 13), t("0851", "GH", 16, 17), t("0851", "UGR", 17, 19)],
      AV,
    );
    expect(filas).toEqual([
      { agenteNumero: "0851", fecha: F, clienteCodigo: "GH", planificadoMin: 300, correctoMin: 180, cubiertoMin: 0, aDemandaMin: 60, otroMin: 0, sinConectarMin: 60 },
      { agenteNumero: "0851", fecha: F, clienteCodigo: "UGR", planificadoMin: 120, correctoMin: 60, cubiertoMin: 0, aDemandaMin: 0, otroMin: 60, sinConectarMin: 0 },
    ]);
    expect(dias).toEqual([{ agenteNumero: "0851", fecha: F, planificadoMin: 420, logadoMin: 420, fueraPlanMin: 60 }]);
    const r = resumirAdherencia(filas);
    expect(r).toMatchObject({ planificadoH: 7, correctoH: 4, aDemandaH: 1, otroH: 1, sinConectarH: 1 });
    expect(r.porTurno).toBeCloseTo(6 / 7, 10);
    expect(r.porCliente).toBeCloseTo(5 / 7, 10);
  });

  it("dos usuarios a la vez cuentan una vez y gana el del cliente planificado", () => {
    const { filas, dias } = calcularAdherencia(
      [b("0892", "GH", 9, 11)],
      [t("0892", "GH", 9, 11), t("0892", "AV", 9.5, 10.5)],
      AV,
    );
    expect(filas[0]).toMatchObject({ planificadoMin: 120, correctoMin: 120, aDemandaMin: 0 });
    expect(dias[0].logadoMin).toBe(120);
  });

  it("minutos sueltos (segundos del user_log) y días o agentes sin plan", () => {
    const { filas, dias } = calcularAdherencia(
      [b("0940", "CEFF", 18, 20)],
      [
        { agenteNumero: "0940", fecha: F, clienteCodigo: "CEFF", inicioMin: 18 * 60 + 2.5, finMin: 19 * 60 + 59 },
        t("0940", "GH", 9, 10, "2026-10-06"),
        t("1008", null, 9, 10),
      ],
      AV,
    );
    expect(filas).toHaveLength(1);
    expect(filas[0].correctoMin).toBeCloseTo(116.5, 6);
    expect(filas[0].sinConectarMin).toBeCloseTo(3.5, 6);
    expect(dias.map((d) => `${d.agenteNumero} ${d.fecha} ${d.fueraPlanMin}`)).toEqual([
      "0940 2026-10-05 0",
      "0940 2026-10-06 60",
      "1008 2026-10-05 60",
    ]);
  });

  it("resumen por agente y por cliente", () => {
    const { filas } = calcularAdherencia(
      [b("0851", "GH", 9, 11), b("0925", "GH", 9, 11), b("0925", "UGR", 11, 13)],
      [t("0851", "GH", 9, 11), t("0925", "GH", 9, 10), t("0925", "UGR", 11, 13)],
      AV,
    );
    const porAgente = resumirPor(filas, (f) => f.agenteNumero);
    expect([...porAgente.keys()]).toEqual(["0851", "0925"]);
    expect(porAgente.get("0925")).toMatchObject({ planificadoH: 4, correctoH: 3, sinConectarH: 1, porTurno: 0.75 });
    const porCliente = resumirPor(filas, (f) => f.clienteCodigo);
    expect(porCliente.get("GH")).toMatchObject({ planificadoH: 4, correctoH: 3, porCliente: 0.75 });
    expect(porCliente.get("UGR")?.porCliente).toBe(1);
    expect(resumirAdherencia([]).porTurno).toBeNull();
  });

  it("BD cubre un bloque de GH (cuenta como GH) pero no es «correcto»; GH no cubre uno de BD", () => {
    const { filas } = calcularAdherencia(
      [b("1067", "GH", 9, 11), b("1067", "BD", 11, 12)],
      [t("1067", "BD", 9, 11), t("1067", "GH", 11, 12)],
      AV,
    );
    expect(filas.map((f) => [f.clienteCodigo, f.correctoMin, f.cubiertoMin, f.otroMin])).toEqual([
      ["BD", 0, 0, 60],
      ["GH", 0, 120, 0],
    ]);
    // Cubierto cuenta por turno, no por cliente
    expect(resumirAdherencia(filas)).toMatchObject({ porTurno: 1, porCliente: 0 });
  });

  it("en un bloque de Ávolo (a demanda): con Av_ es correcto, esperando en GH o BD es cubierto, en UGR es otro", () => {
    const { filas } = calcularAdherencia(
      [b("0985", "AV", 9, 13)],
      [t("0985", "GH", 9, 10), t("0985", "AV", 10, 10.5), t("0985", "BD", 10.5, 11), t("0985", "UGR", 11, 12)],
      AV,
    );
    expect(filas[0]).toMatchObject({ planificadoMin: 240, correctoMin: 30, cubiertoMin: 90, otroMin: 60, sinConectarMin: 60 });
  });
});
