import { describe, expect, it } from "vitest";
import { horasCubiertas, saldoAgente, type DiaParaSaldo } from "./saldo";

// Semana del 12/10/2026: el lunes es festivo; datos cerrados hasta el miércoles 14
const DIAS: DiaParaSaldo[] = [
  { fecha: "2026-10-12", entreSemana: true, festivo: true },
  { fecha: "2026-10-13", entreSemana: true, festivo: false },
  { fecha: "2026-10-14", entreSemana: true, festivo: false },
  { fecha: "2026-10-15", entreSemana: true, festivo: false },
  { fecha: "2026-10-16", entreSemana: true, festivo: false },
  { fecha: "2026-10-17", entreSemana: false, festivo: false },
  { fecha: "2026-10-18", entreSemana: false, festivo: false },
];
// Turno de 9 h el lunes (9-14 y 16-20) y de 6 h el resto
const TURNO = { "2026-10-12": 9, "2026-10-13": 6, "2026-10-14": 6, "2026-10-15": 6, "2026-10-16": 6 };

describe("saldo", () => {
  it("días cerrados con lo logado, el resto con lo planificado; el festivo cuenta las horas de su turno", () => {
    const r = saldoAgente({
      contratoSemanalH: 30,
      fechaDatos: "2026-10-14",
      dias: DIAS,
      // Plan 6 h cada laborable; el 15 tiene VAC (sin plan) y el 16 se planifican 7 h
      planH: { "2026-10-13": 6, "2026-10-14": 6, "2026-10-16": 7 },
      realH: { "2026-10-13": 6.5, "2026-10-14": 5.25 },
      // Una ausencia en el festivo no suma encima de él
      justificadasH: { "2026-10-15": 6, "2026-10-12": 6 },
      turnoH: TURNO,
      ajustesH: { "2026-10-14": 0.5 },
    })!;
    expect(r.dias.map((d) => [d.fecha, d.cerrado, d.trabajadas, d.justificadas, d.contrato, d.saldo])).toEqual([
      ["2026-10-12", true, 0, 9, 6, 3], // festivo: 9 h de su turno, contrato de un día normal
      ["2026-10-13", true, 6.5, 0, 6, 0.5],
      ["2026-10-14", true, 5.25, 0, 6, -0.25], // −0,75 + 0,5 de ajuste
      ["2026-10-15", false, 0, 6, 6, 0],
      ["2026-10-16", false, 7, 0, 6, 1],
      ["2026-10-17", false, 0, 0, 0, 0],
      ["2026-10-18", false, 0, 0, 0, 0],
    ]);
    expect(r.totales.real).toEqual({ trabajadas: 11.75, justificadas: 9, contrato: 18, ajustes: 0.5, saldo: 3.25 });
    expect(r.totales.previsto).toEqual({ trabajadas: 18.75, justificadas: 15, contrato: 30, ajustes: 0.5, saldo: 4.25 });
  });

  it("si trabaja el festivo cuentan sus horas trabajadas, no el turno (luego se compensa con FEST)", () => {
    const r = saldoAgente({
      contratoSemanalH: 30,
      fechaDatos: "2026-10-12",
      dias: DIAS.slice(0, 1),
      planH: {},
      realH: { "2026-10-12": 4 },
      justificadasH: {},
      turnoH: TURNO,
      ajustesH: {},
    })!;
    expect(r.dias[0]).toMatchObject({ trabajadas: 4, justificadas: 0, contrato: 6, saldo: -2 });
  });

  it("38 h con festivo: la semana sale en horas enteras (antes, −0,40 h)", () => {
    const r = saldoAgente({
      contratoSemanalH: 38,
      fechaDatos: "2026-10-01",
      dias: DIAS,
      // Martes a viernes 9 + 9 + 7 + 5 = 30 h planificadas
      planH: { "2026-10-13": 9, "2026-10-14": 9, "2026-10-15": 7, "2026-10-16": 5 },
      realH: {},
      justificadasH: {},
      turnoH: TURNO,
      ajustesH: {},
    })!;
    // 30 planificadas + 9 del festivo − 38 de contrato
    expect(Math.round(r.totales.previsto.saldo * 100) / 100).toBe(1);
    expect(Math.round(r.totales.previsto.contrato * 100) / 100).toBe(38);
  });

  it("sin contrato no hay saldo", () => {
    expect(
      saldoAgente({ contratoSemanalH: null, fechaDatos: "2026-10-14", dias: DIAS, planH: {}, realH: {}, justificadasH: {}, turnoH: {}, ajustesH: {} }),
    ).toBeNull();
  });

  it("horas de turno cubiertas por ausencias, sin contar dos veces lo solapado", () => {
    const turno = [
      { inicioMin: 540, finMin: 840 },
      { inicioMin: 960, finMin: 1200 },
    ];
    expect(horasCubiertas(turno, [{ inicioMin: 0, finMin: 1440 }])).toBe(9);
    expect(horasCubiertas(turno, [{ inicioMin: 600, finMin: 720 }, { inicioMin: 660, finMin: 1020 }])).toBe(5); // 10-14 y 16-17
    expect(horasCubiertas(turno, [])).toBe(0);
  });
});
