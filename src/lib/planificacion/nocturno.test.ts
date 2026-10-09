import { describe, expect, it } from "vitest";
import { componerRecalculo, conservablesDesde, decidirNocturno, objetivosRecalculo, type EstadoNocturno } from "./nocturno";

// Octubre de 2026: el 12 y el 19 son lunes; el 8, jueves; el 20, martes.
const OCTUBRE: EstadoNocturno = {
  hoy: "2026-10-12",
  diaGeneracion: 20,
  ultimoAgregado: "2026-10-11",
  ultimoRecalculo: "2026-10-05",
  versiones: [
    { mes: "2026-09", estado: "publicada" },
    { mes: "2026-10", estado: "publicada" },
    { mes: "2026-10", estado: "borrador" },
    { mes: "2026-11", estado: "descartada" },
    { mes: "2026-11", estado: "borrador" },
  ],
};

describe("tarea nocturna: qué toca cada noche", () => {
  it("lunes: agregados de ayer y recálculo desde el lunes que viene (la semana de hoy ya ha empezado)", () => {
    const d = decidirNocturno(OCTUBRE);
    expect(d.agregados).toEqual({ desde: "2026-10-11", hasta: "2026-10-11" });
    expect(d.generar).toBeNull();
    expect(d.semana).toBe("2026-10-12");
    expect(d.tocaRecalculo).toBe(true);
    // Noviembre no ha empezado: entero
    expect(d.recalcular).toEqual([
      { mes: "2026-10", desde: "2026-10-19" },
      { mes: "2026-11", desde: "2026-11-01" },
    ]);
  });

  it("ejecutarla dos veces la misma noche no recalcula dos veces", () => {
    const d = decidirNocturno({ ...OCTUBRE, ultimoRecalculo: "2026-10-12" });
    expect(d.tocaRecalculo).toBe(false);
    expect(d.recalcular).toEqual([]);
    expect(d.agregados).toEqual({ desde: "2026-10-11", hasta: "2026-10-11" });
  });

  it("si la noche del lunes no se ejecutó, recalcula la primera noche siguiente de esa semana", () => {
    const d = decidirNocturno({ ...OCTUBRE, hoy: "2026-10-14", ultimoAgregado: "2026-10-11" });
    expect(d.tocaRecalculo).toBe(true);
    expect(d.recalcular[0]).toEqual({ mes: "2026-10", desde: "2026-10-19" });
    // y pone al día los agregados que faltan
    expect(d.agregados).toEqual({ desde: "2026-10-12", hasta: "2026-10-13" });
  });

  it("la primera vez que se ejecuta, solo recalcula si es lunes", () => {
    expect(decidirNocturno({ ...OCTUBRE, hoy: "2026-10-08", ultimoRecalculo: null }).tocaRecalculo).toBe(false);
    expect(decidirNocturno({ ...OCTUBRE, ultimoRecalculo: null }).tocaRecalculo).toBe(true);
  });

  it("forzado, recalcula cualquier día desde el lunes que viene", () => {
    const d = decidirNocturno({ ...OCTUBRE, hoy: "2026-10-08", ultimoRecalculo: "2026-10-05", forzarRecalculo: true });
    expect(d.recalcular).toEqual([
      { mes: "2026-10", desde: "2026-10-12" },
      { mes: "2026-11", desde: "2026-11-01" },
    ]);
  });

  it("a partir del día 20, borrador del mes siguiente si no tiene ni borrador ni publicada", () => {
    const sinNoviembre = OCTUBRE.versiones.filter((v) => !(v.mes === "2026-11" && v.estado === "borrador"));
    expect(decidirNocturno({ ...OCTUBRE, hoy: "2026-10-19", versiones: sinNoviembre }).generar).toBeNull();
    const d = decidirNocturno({ ...OCTUBRE, hoy: "2026-10-20", versiones: sinNoviembre });
    expect(d.generar).toBe("2026-11");
    // Si el 20 no se ejecutó, al día siguiente
    expect(decidirNocturno({ ...OCTUBRE, hoy: "2026-10-23", versiones: sinNoviembre }).generar).toBe("2026-11");
    // Con borrador o publicada, nada
    expect(decidirNocturno({ ...OCTUBRE, hoy: "2026-10-20" }).generar).toBeNull();
    expect(
      decidirNocturno({ ...OCTUBRE, hoy: "2026-10-20", versiones: [...sinNoviembre, { mes: "2026-11", estado: "publicada" }] }).generar,
    ).toBeNull();
    // El cambio de año
    expect(decidirNocturno({ ...OCTUBRE, hoy: "2026-12-21", versiones: [] }).generar).toBe("2027-01");
  });

  it("el mes que se acaba de generar no se recalcula esa misma noche", () => {
    const sinNoviembre = OCTUBRE.versiones.filter((v) => v.mes !== "2026-11");
    // Lunes 26/10: octubre ya no tiene semanas sin empezar; noviembre se acaba de generar
    const d = decidirNocturno({ ...OCTUBRE, hoy: "2026-10-26", ultimoAgregado: "2026-10-25", versiones: sinNoviembre });
    expect(d.generar).toBe("2026-11");
    expect(d.tocaRecalculo).toBe(true);
    expect(d.recalcular).toEqual([]);
    // Con noviembre ya generado, se recalcula desde el 02/11
    expect(decidirNocturno({ ...OCTUBRE, hoy: "2026-10-26", ultimoAgregado: "2026-10-25" }).recalcular).toEqual([
      { mes: "2026-11", desde: "2026-11-02" },
    ]);
  });

  it("solo recalcula los meses con plan", () => {
    const d = decidirNocturno({ ...OCTUBRE, versiones: [{ mes: "2026-10", estado: "sustituida" }] });
    expect(d.tocaRecalculo).toBe(true);
    expect(d.recalcular).toEqual([]);
  });

  it("agregados: se pone al día como mucho 31 días atrás y repite siempre ayer", () => {
    expect(decidirNocturno({ ...OCTUBRE, ultimoAgregado: null }).agregados).toEqual({ desde: "2026-10-11", hasta: "2026-10-11" });
    expect(decidirNocturno({ ...OCTUBRE, ultimoAgregado: "2026-10-05" }).agregados).toEqual({ desde: "2026-10-06", hasta: "2026-10-11" });
    expect(decidirNocturno({ ...OCTUBRE, ultimoAgregado: "2026-06-01" }).agregados).toEqual({ desde: "2026-09-11", hasta: "2026-10-11" });
    expect(decidirNocturno({ ...OCTUBRE, ultimoAgregado: "2026-10-12" }).agregados).toEqual({ desde: "2026-10-11", hasta: "2026-10-11" });
  });
});

describe("tarea nocturna: recálculo", () => {
  const b = (fecha: string, cliente: string, extra: { fijado?: boolean; origen?: string } = {}) => ({
    agenteNumero: "0851",
    fecha,
    inicioMin: 540,
    finMin: 600,
    clienteCodigo: cliente,
    fijado: extra.fijado ?? false,
    origen: extra.origen ?? "motor",
  });

  it("conserva los días anteriores y toma del motor el resto", () => {
    const base = [b("2026-10-16", "UGR"), b("2026-10-19", "UGR"), b("2026-10-20", "UGR")];
    const motor = [b("2026-10-16", "GH"), b("2026-10-19", "GH"), b("2026-10-20", "UGR")];
    const r = componerRecalculo(base, motor, "2026-10-19");
    expect(r.conservados.map((x) => `${x.fecha} ${x.clienteCodigo}`)).toEqual(["2026-10-16 UGR"]);
    expect(r.nuevos.map((x) => `${x.fecha} ${x.clienteCodigo}`)).toEqual(["2026-10-19 GH", "2026-10-20 UGR"]);
  });

  it("el motor respeta, desde el primer día recalculado, los bloques fijados y los cambiados a mano", () => {
    const base = [
      b("2026-10-16", "UGR", { fijado: true }),
      b("2026-10-19", "UGR", { fijado: true }),
      b("2026-10-20", "CR", { origen: "manual" }),
      b("2026-10-21", "UGR"),
    ];
    expect(conservablesDesde(base, "2026-10-19").map((x) => x.fecha)).toEqual(["2026-10-19", "2026-10-20"]);
  });

  it("guarda los objetivos de las semanas empezadas tal como estaban", () => {
    const o = (semanaLunes: string, horas: number) => ({ cliente: "UGR", semanaLunes, horas, origen: "calculado" as const });
    const base = [o("2026-10-05", 30), o("2026-10-12", 30), o("2026-10-19", 30)];
    const nuevos = [o("2026-10-05", 0), o("2026-10-12", 0), o("2026-10-19", 12)];
    expect(objetivosRecalculo(base, nuevos, "2026-10-19").map((x) => x.horas)).toEqual([30, 30, 12]);
  });
});
