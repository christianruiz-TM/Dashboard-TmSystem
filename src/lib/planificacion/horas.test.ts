import { describe, expect, it } from "vitest";
import { escalaHoras, periodoInicial, periodosHoras, resumenHoras, sumarFilas, type DiaHorasLike } from "./horas";

// Semana del 02/11/2026 vista el jueves 05: lunes a miércoles ya han pasado
const DIAS: DiaHorasLike[] = [
  { fecha: "2026-11-02", cerrado: true, contrato: 9, planificadas: 9, efectivas: 8.5 },
  { fecha: "2026-11-03", cerrado: true, contrato: 9, planificadas: 9, efectivas: 9.25 },
  { fecha: "2026-11-04", cerrado: true, contrato: 4, planificadas: 0, efectivas: 0 }, // VAC: sin plan
  { fecha: "2026-11-05", cerrado: false, contrato: 4, planificadas: 4, efectivas: null },
  { fecha: "2026-11-06", cerrado: false, contrato: 4, planificadas: 4, efectivas: null },
  { fecha: "2026-11-07", cerrado: false, contrato: 0, planificadas: 0, efectivas: null },
  { fecha: "2026-11-08", cerrado: false, contrato: 0, planificadas: 0, efectivas: null },
];
const FECHAS = DIAS.map((d) => d.fecha);
const SEMANAS = [{ lunes: "2026-11-02", fechas: FECHAS }];

describe("horas: contrato, planificadas y efectivas", () => {
  it("periodos por día, semana y mes, y el que se abre por defecto", () => {
    expect(periodosHoras("dia", FECHAS, SEMANAS).slice(0, 2).map((p) => p.etiqueta)).toEqual(["Lunes 02/11", "Martes 03/11"]);
    expect(periodosHoras("semana", FECHAS, SEMANAS)).toEqual([{ clave: "2026-11-02", etiqueta: "Semana 02/11–08/11", fechas: FECHAS }]);
    expect(periodosHoras("mes", FECHAS, SEMANAS)[0].clave).toBe("mes");
    const dias = periodosHoras("dia", FECHAS, SEMANAS);
    expect(periodoInicial(dias, "2026-11-05").clave).toBe("2026-11-05");
    expect(periodoInicial(dias, "2026-12-15").clave).toBe("2026-11-08"); // mes pasado: el último
    expect(periodoInicial(dias, "2026-10-20").clave).toBe("2026-11-02"); // aún no ha empezado: el primero
  });

  it("semana a medias: las efectivas se comparan con lo planificado hasta ayer", () => {
    const r = resumenHoras(DIAS, FECHAS);
    expect(r).toMatchObject({ contrato: 30, planificadas: 26, efectivas: 17.75, planificadasHastaAyer: 18, contratoHastaAyer: 22, terminado: false, empezado: true });
    expect(r.diferencia).toBeCloseTo(-0.25, 10);
  });

  it("un día que aún no ha pasado no tiene efectivas; un fin de semana sin nada no tiene datos", () => {
    expect(resumenHoras(DIAS, ["2026-11-05"])).toMatchObject({ efectivas: 0, empezado: false, terminado: false, conDatos: true });
    expect(resumenHoras(DIAS, ["2026-11-07", "2026-11-08"]).conDatos).toBe(false);
    expect(resumenHoras(DIAS, ["2026-11-02"])).toMatchObject({ terminado: true, diferencia: -0.5 });
  });

  it("total del equipo y fondo común de las barras", () => {
    const otro = DIAS.map((d) => ({ ...d, contrato: 1, planificadas: 2, efectivas: d.cerrado ? 3 : null }));
    const total = sumarFilas([DIAS, otro]);
    expect(total.map((d) => [d.contrato, d.planificadas, d.efectivas])).toEqual([
      [10, 11, 11.5],
      [10, 11, 12.25],
      [5, 2, 3],
      [5, 6, null],
      [5, 6, null],
      [1, 2, null],
      [1, 2, null],
    ]);
    expect(escalaHoras([resumenHoras(DIAS, FECHAS), resumenHoras(otro, FECHAS)])).toBe(30);
    expect(escalaHoras([])).toBe(1);
  });
});
