import { describe, expect, it } from "vitest";
import { periodosHoras, resumenMesHoras, sumaPeriodo, sumarFilas } from "./horas";

// Del viernes 27 al lunes 30/11/2026; el lunes aún no ha pasado (previsto)
const DIAS = [
  { fecha: "2026-11-27", cerrado: true, contrato: 4, logadas: 4.5 },
  { fecha: "2026-11-28", cerrado: true, contrato: 0, logadas: 0 },
  { fecha: "2026-11-29", cerrado: true, contrato: 0, logadas: 0 },
  { fecha: "2026-11-30", cerrado: false, contrato: 9, logadas: 9 },
];

describe("horas de contrato frente a logadas", () => {
  it("columnas por día, por semana (con las semanas partidas) y del mes", () => {
    const fechas = DIAS.map((d) => d.fecha);
    const semanas = [
      { lunes: "2026-11-23", fechas: fechas.slice(0, 3) },
      { lunes: "2026-11-30", fechas: fechas.slice(3) },
    ];
    expect(periodosHoras("dia", fechas, semanas).map((p) => p.etiqueta)).toEqual(["Vie 27/11", "Sáb 28/11", "Dom 29/11", "Lun 30/11"]);
    expect(periodosHoras("semana", fechas, semanas).map((p) => [p.etiqueta, p.detalle])).toEqual([
      ["Sem. 23/11", "3 días del mes"],
      ["Sem. 30/11", "1 día del mes"],
    ]);
    expect(periodosHoras("mes", fechas, semanas)).toEqual([{ clave: "mes", etiqueta: "Mes", detalle: null, fechas }]);
  });

  it("suma de un periodo: diferencia, previsto si algún día con horas no ha pasado, y vacío sin contrato ni horas", () => {
    expect(sumaPeriodo(DIAS, ["2026-11-27", "2026-11-28"])).toEqual({ contrato: 4, logadas: 4.5, diferencia: 0.5, previsto: false, conDatos: true });
    expect(sumaPeriodo(DIAS, ["2026-11-30"])).toMatchObject({ contrato: 9, diferencia: 0, previsto: true });
    expect(sumaPeriodo(DIAS, ["2026-11-28", "2026-11-29"]).conDatos).toBe(false);
  });

  it("el mes: hasta ayer y previsto a fin de mes", () => {
    const r = resumenMesHoras(DIAS);
    expect(r.real).toMatchObject({ contrato: 4, logadas: 4.5, previsto: false });
    expect(r.previsto).toMatchObject({ contrato: 13, logadas: 13.5, diferencia: 0.5, previsto: true });
  });

  it("total del equipo: suma por fecha", () => {
    const otro = DIAS.map((d) => ({ ...d, contrato: 1, logadas: 2 }));
    expect(sumarFilas([DIAS, otro]).map((d) => [d.fecha, d.contrato, d.logadas])).toEqual([
      ["2026-11-27", 5, 6.5],
      ["2026-11-28", 1, 2],
      ["2026-11-29", 1, 2],
      ["2026-11-30", 10, 11],
    ]);
  });
});
