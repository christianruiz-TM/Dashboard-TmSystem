import { describe, expect, it } from "vitest";
import { construirDias, diasFueraDelMes } from "./calendario";
import { contratoDelDia, horasTurnoSemanas } from "./contrato";

// Patrón de 30 h: lunes y martes partidos (9 h), de miércoles a viernes 4 h
const PARTIDO = [{ inicioMin: 540, finMin: 840 }, { inicioMin: 960, finMin: 1200 }];
const TARDE = [{ inicioMin: 960, finMin: 1200 }];
const turnoDe = (fecha: string) => {
  const ds = (new Date(`${fecha}T12:00:00`).getDay() + 6) % 7;
  return ds <= 1 ? PARTIDO : ds <= 4 ? TARDE : [];
};
const turnos = (fechas: readonly string[]) => Object.fromEntries(fechas.filter((f) => turnoDe(f).length > 0).map((f) => [f, turnoDe(f)]));

const noviembre = construirDias({ mes: "2026-11", semanaA: "2026-08-31", servicioCalendario: "Plantilla", festivos: [] });
const fuera = diasFueraDelMes(noviembre, { servicioCalendario: "Plantilla", festivos: [{ fecha: "2026-12-08", servicio: "Plantilla" }] });

describe("contrato del día según el turno (04/11/2026)", () => {
  it("días de otro mes en las semanas partidas, con la rotación de su semana", () => {
    expect(fuera.map((d) => d.fecha)).toEqual([
      "2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31",
      "2026-12-01", "2026-12-02", "2026-12-03", "2026-12-04", "2026-12-05", "2026-12-06",
    ]);
    expect(fuera.find((d) => d.fecha === "2026-12-01")!.rotacion).toBe(noviembre[noviembre.length - 1].rotacion);
    expect(fuera.find((d) => d.fecha === "2026-10-26")!.rotacion).toBe(noviembre[0].rotacion);
    // Un mes que empieza en lunes y acaba en domingo no tiene días de fuera
    const febrero = construirDias({ mes: "2027-02", semanaA: "2026-08-31", servicioCalendario: "Plantilla", festivos: [] });
    expect(diasFueraDelMes(febrero, { servicioCalendario: "Plantilla", festivos: [] })).toEqual([]);
  });

  it("sin el turno de fuera, las semanas partidas no se conocen (y van con ÷ 5)", () => {
    const fechas = noviembre.map((d) => d.fecha);
    const semanas = horasTurnoSemanas(fechas, turnos(fechas));
    expect(semanas.has("2026-11-30")).toBe(false);
    expect(semanas.has("2026-10-26")).toBe(false);
    expect(semanas.get("2026-11-02")).toEqual({ horas: 30, ultimoDia: "2026-11-06" });
  });

  it("lunes 30/11 de 9 h: 9 h de contrato, sin decimales (10/11/2026)", () => {
    const fechas = noviembre.map((d) => d.fecha);
    const semanas = horasTurnoSemanas(fechas, turnos(fechas), turnos(fuera.map((d) => d.fecha)));
    // El último día con turno de esa semana es el viernes 04/12, de diciembre
    expect(semanas.get("2026-11-30")).toEqual({ horas: 30, ultimoDia: "2026-12-04" });
    expect(contratoDelDia(30, true, "2026-11-30", 9, semanas.get("2026-11-30"))).toBe(9);
    // Con 38 h y una semana de 37 h de turno, también 9 h (antes 38 × 9 ÷ 37 = 9,24)
    expect(contratoDelDia(38, true, "2026-11-30", 9, { horas: 37, ultimoDia: "2026-12-04" })).toBe(9);
    // Sin el turno de la semana: ÷ 5
    expect(contratoDelDia(30, true, "2026-11-30", 9, undefined)).toBe(6);
    // El domingo 01/11 no tiene turno: no lleva contrato
    expect(contratoDelDia(30, false, "2026-11-01", 0, semanas.get("2026-10-26"))).toBe(0);
  });

  it("cada día su turno y el último día la diferencia: la semana suma el contrato", () => {
    const semana = { horas: 39, ultimoDia: "2026-11-06" };
    const dias: [string, number][] = [
      ["2026-11-02", 9],
      ["2026-11-03", 9],
      ["2026-11-04", 9],
      ["2026-11-05", 8],
      ["2026-11-06", 4],
    ];
    const contratos = dias.map(([f, h]) => contratoDelDia(38, true, f, h, semana));
    // 38 h con un patrón de 39 h: de lunes a jueves, su turno; el viernes, 4 − 1
    expect(contratos).toEqual([9, 9, 9, 8, 3]);
    expect(contratos.reduce((a, b) => a + b, 0)).toBe(38);
    // 30 h de contrato con 26 h de turno: el viernes lleva +4
    expect(contratoDelDia(30, true, "2026-11-06", 4, { horas: 26, ultimoDia: "2026-11-06" })).toBe(8);
  });

  it("el último día es el último CON turno (sábado y domingo sin turno no cuentan)", () => {
    const fechas = noviembre.map((d) => d.fecha);
    const semanas = horasTurnoSemanas(fechas, turnos(fechas));
    expect(semanas.get("2026-11-23")).toEqual({ horas: 30, ultimoDia: "2026-11-27" });
  });

  it("sin turno en la semana, el semanal ÷ 5 de lunes a viernes", () => {
    expect(contratoDelDia(25, true, "2026-11-02", 0, { horas: 0, ultimoDia: null })).toBe(5);
    expect(contratoDelDia(25, false, "2026-11-07", 0, { horas: 0, ultimoDia: null })).toBe(0);
  });
});
