import { describe, expect, it } from "vitest";
import {
  construirDias,
  desplazarMes,
  expandirAusencias,
  expandirTurnos,
  horarioPorFecha,
  laborablesDelMes,
  lunesDe,
  rotacionDe,
  semanasDelMes,
} from "./calendario";

const SEMANA_A = "2026-08-31";
// festivos_servicio real de octubre-diciembre de 2026 (GrupoHuertas)
const FESTIVOS = ["2026-10-12", "2026-11-02", "2026-12-07", "2026-12-08", "2026-12-24", "2026-12-25", "2026-12-31"].map(
  (fecha) => ({ fecha, servicio: "GrupoHuertas" }),
);
const octubre = construirDias({ mes: "2026-10", semanaA: SEMANA_A, servicioCalendario: "GrupoHuertas", festivos: FESTIVOS });

describe("calendario", () => {
  it("rotación A/B desde la semana de referencia (31/08 = A)", () => {
    expect(rotacionDe("2026-08-31", SEMANA_A)).toBe("A");
    expect(rotacionDe("2026-09-07", SEMANA_A)).toBe("B");
    expect(rotacionDe("2026-09-28", SEMANA_A)).toBe("A");
    expect(rotacionDe("2026-10-05", SEMANA_A)).toBe("B");
    expect(rotacionDe("2026-10-12", SEMANA_A)).toBe("A");
    expect(rotacionDe("2026-10-19", SEMANA_A)).toBe("B");
    expect(rotacionDe("2026-10-26", SEMANA_A)).toBe("A");
    // Cualquier día de la semana y también hacia atrás
    expect(rotacionDe("2026-10-09", SEMANA_A)).toBe("B");
    expect(rotacionDe("2026-08-24", SEMANA_A)).toBe("B");
  });

  it("octubre de 2026 tiene 21 laborables (el 12/10 es festivo)", () => {
    expect(octubre).toHaveLength(31);
    expect(laborablesDelMes(octubre)).toBe(21);
    expect(octubre.find((d) => d.fecha === "2026-10-12")?.laborable).toBe(false);
    expect(octubre.find((d) => d.fecha === "2026-10-12")?.festivos).toEqual(["GrupoHuertas"]);
  });

  it("el día siguiente a un festivo se dimensiona como lunes", () => {
    const martes13 = octubre.find((d) => d.fecha === "2026-10-13")!;
    expect(martes13.diaSemana).toBe(1);
    expect(martes13.diaEquivalente).toBe(0);
    expect(octubre.find((d) => d.fecha === "2026-10-14")!.diaEquivalente).toBe(2);
    // 7 y 8/12 (lunes y martes) festivos → el miércoles 9 va como lunes
    const diciembre = construirDias({ mes: "2026-12", semanaA: SEMANA_A, servicioCalendario: "GrupoHuertas", festivos: FESTIVOS });
    expect(diciembre.find((d) => d.fecha === "2026-12-09")!.diaEquivalente).toBe(0);
    // Tras el festivo de un jueves (24/12) el viernes 25 también es festivo: nada
    expect(diciembre.find((d) => d.fecha === "2026-12-28")!.diaEquivalente).toBe(0);
  });

  it("semanas del mes: la primera de octubre solo tiene el jueves 1 y el viernes 2", () => {
    const semanas = semanasDelMes(octubre);
    expect(semanas.map((s) => s.lunes)).toEqual(["2026-09-28", "2026-10-05", "2026-10-12", "2026-10-19", "2026-10-26"]);
    expect(semanas.map((s) => s.rotacion)).toEqual(["A", "B", "A", "B", "A"]);
    expect(semanas.map((s) => s.laborables)).toEqual([2, 5, 4, 5, 5]);
    expect(lunesDe("2026-10-01")).toBe("2026-09-28");
  });

  it("expande los turnos con la rotación A/B y el periodo de cada asignación", () => {
    const patrones = [
      { id: 1, tramos: [{ diaSemana: 0, inicioMin: 540, finMin: 840 }, { diaSemana: 0, inicioMin: 960, finMin: 1200 }] },
      { id: 2, tramos: [{ diaSemana: 0, inicioMin: 540, finMin: 840 }] },
    ];
    const turnos = expandirTurnos(
      [{ agenteNumero: "0001", patronAId: 1, patronBId: 2, desde: "2026-01-01", hasta: null }],
      patrones,
      octubre,
    );
    expect(turnos["0001"]["2026-10-05"]).toEqual([{ inicioMin: 540, finMin: 840 }]); // B
    expect(turnos["0001"]["2026-10-12"]).toHaveLength(2); // A (festivo, pero el turno existe)
    expect(turnos["0001"]["2026-10-06"]).toBeUndefined(); // martes: sin tramos
  });

  it("ausencias sin horas ocupan el día entero", () => {
    const aus = expandirAusencias(
      [{ agenteNumero: "0001", tipoCodigo: "VAC", desde: "2026-10-30", hasta: "2026-11-03", inicioMin: null, finMin: null }],
      octubre,
    );
    expect(aus["0001"]).toEqual([
      { fecha: "2026-10-30", inicioMin: 0, finMin: 1440, tipo: "VAC" },
      { fecha: "2026-10-31", inicioMin: 0, finMin: 1440, tipo: "VAC" },
    ]);
  });

  it("horario de servicio: cerrado en festivos y el último conocido fuera de vigencia", () => {
    const horarios = [
      { servicio: "GrupoHuertas", dias: [true, true, true, true, true, false, false], entradaMin: 540, salidaMin: 840, desde: "2024-01-01", hasta: "2026-12-31" },
      { servicio: "GrupoHuertas", dias: [true, true, true, true, true, false, false], entradaMin: 960, salidaMin: 1200, desde: "2024-01-01", hasta: "2026-12-31" },
    ];
    const h = horarioPorFecha(horarios, "GrupoHuertas", octubre)!;
    expect(h["2026-10-05"]).toEqual([{ inicioMin: 540, finMin: 840 }, { inicioMin: 960, finMin: 1200 }]);
    expect(h["2026-10-12"]).toEqual([]);
    expect(h["2026-10-10"]).toEqual([]); // sábado
    expect(horarioPorFecha(horarios, null, octubre)).toBeNull();
    const enero = construirDias({ mes: "2027-01", semanaA: SEMANA_A, servicioCalendario: "GrupoHuertas", festivos: [] });
    expect(horarioPorFecha(horarios, "GrupoHuertas", enero)!["2027-01-04"]).toHaveLength(2);
  });

  it("desplaza meses", () => {
    expect(desplazarMes("2026-10", 1)).toBe("2026-11");
    expect(desplazarMes("2026-12", 1)).toBe("2027-01");
    expect(desplazarMes("2026-01", -1)).toBe("2025-12");
  });
});
