import { describe, expect, it } from "vitest";
import { aprenderPatrones, compararPatrones, minutosDistintos, type SesionDia, type TramoDia } from "./aprender";
import { parsearTramos, rotacionDe, sumarDias, textoTramos } from "./calendario";
import { generarFranjas } from "./franjas";

const SEMANA_A = "2026-08-31";
const FRANJAS = generarFranjas(480, 1200, 60);
// 8 semanas completas: del 03/08 (A) al 21/09 (B)
const SEMANAS = Array.from({ length: 8 }, (_, i) => sumarDias("2026-08-03", 7 * i));
const h = (hora: number, min = 0) => (hora * 60 + min) * 60;

/** Turno de 1086 en septiembre: A = L partido y M-V tardes; B = mañanas L-V. */
function sesionesDe(fecha: string, rot: "A" | "B", d: number): SesionDia[] {
  if (d > 4) return [];
  if (rot === "A") {
    const tarde = { fecha, inicioSeg: h(15, 58), finSeg: h(20, 1) };
    // Lunes con dos usuarios a la vez (GH y UGR): cuenta una vez
    return d === 0
      ? [{ fecha, inicioSeg: h(9, 3), finSeg: h(14) }, { fecha, inicioSeg: h(10), finSeg: h(12) }, tarde]
      : [tarde];
  }
  return [{ fecha, inicioSeg: h(8, 58), finSeg: h(13, 20) }];
}

function construirSesiones(opciones: { vacaciones?: string; extra?: SesionDia[] } = {}): SesionDia[] {
  const sesiones: SesionDia[] = [];
  for (const lunes of SEMANAS) {
    if (lunes === opciones.vacaciones) continue;
    const rot = rotacionDe(lunes, SEMANA_A);
    for (let d = 0; d < 7; d++) sesiones.push(...sesionesDe(sumarDias(lunes, d), rot, d));
  }
  return [...sesiones, ...(opciones.extra ?? [])];
}

const tramosDe = (tramos: readonly TramoDia[], d: number) => textoTramos(tramos.filter((t) => t.diaSemana === d));

describe("aprender patrones", () => {
  it("reconstruye el patrón A/B con 8 semanas de sesiones", () => {
    const r = aprenderPatrones(construirSesiones(), {
      semanas: SEMANAS,
      semanaA: SEMANA_A,
      festivos: new Set(),
      franjas: FRANJAS,
      pasoMin: 60,
    });
    expect(r.A?.semanas).toBe(4);
    expect(r.B?.semanas).toBe(4);
    expect(tramosDe(r.A!.tramos, 0)).toBe("9-14, 16-20");
    expect([1, 2, 3, 4].map((d) => tramosDe(r.A!.tramos, d))).toEqual(["16-20", "16-20", "16-20", "16-20"]);
    // 13:20 es menos de media franja de 13-14: la B acaba a las 13
    expect([0, 1, 2, 3, 4].map((d) => tramosDe(r.B!.tramos, d))).toEqual(["9-13", "9-13", "9-13", "9-13", "9-13"]);
    expect(r.A!.horas).toBe(25);
    expect(r.B!.horas).toBe(20);
  });

  it("no cuentan las semanas sin sesiones, los festivos ni lo esporádico", () => {
    const festivo = "2026-08-24"; // lunes de una semana B: sin sesiones, pero no es ausencia
    const sesiones = construirSesiones({
      vacaciones: "2026-08-03", // semana A entera sin sesiones
      extra: [{ fecha: "2026-09-09", inicioSeg: h(16), finSeg: h(20) }], // una tarde suelta en semana B
    }).filter((s) => s.fecha !== festivo);
    const r = aprenderPatrones(sesiones, {
      semanas: SEMANAS,
      semanaA: SEMANA_A,
      festivos: new Set([festivo]),
      franjas: FRANJAS,
      pasoMin: 60,
    });
    expect(r.A?.semanas).toBe(3);
    expect(tramosDe(r.A!.tramos, 0)).toBe("9-14, 16-20");
    // Sin el festivo, el lunes B sigue siendo de mañana (3 de 3 días válidos)
    expect(tramosDe(r.B!.tramos, 0)).toBe("9-13");
    // La tarde suelta del miércoles B (1 de 4) no entra
    expect(tramosDe(r.B!.tramos, 2)).toBe("9-13");
  });

  it("sin ninguna semana de una rotación no propone nada", () => {
    const soloA = construirSesiones().filter((s) => rotacionDe(s.fecha, SEMANA_A) === "A");
    const r = aprenderPatrones(soloA, { semanas: SEMANAS, semanaA: SEMANA_A, festivos: new Set(), franjas: FRANJAS, pasoMin: 60 });
    expect(r.A).not.toBeNull();
    expect(r.B).toBeNull();
  });

  it("compara con el configurado día a día", () => {
    const configurado: TramoDia[] = [
      { diaSemana: 0, inicioMin: 540, finMin: 840 },
      { diaSemana: 0, inicioMin: 960, finMin: 1200 },
      { diaSemana: 1, inicioMin: 540, finMin: 840 },
    ];
    const aprendido: TramoDia[] = [
      { diaSemana: 0, inicioMin: 540, finMin: 840 },
      { diaSemana: 0, inicioMin: 960, finMin: 1140 },
      { diaSemana: 1, inicioMin: 600, finMin: 840 },
      { diaSemana: 2, inicioMin: 960, finMin: 1200 },
    ];
    const c = compararPatrones(configurado, aprendido);
    expect(c.dias.map((d) => [d.diaSemana, d.distintos])).toEqual([
      [0, 60],
      [1, 60],
      [2, 240],
    ]);
    expect(c.distintos).toBe(360);
    expect(minutosDistintos([{ inicioMin: 540, finMin: 840 }], [{ inicioMin: 540, finMin: 840 }])).toBe(0);
  });
});

describe("tramos en texto", () => {
  it("entiende el formato de la plantilla", () => {
    expect(parsearTramos("9-14, 16-20")).toEqual([
      { inicioMin: 540, finMin: 840 },
      { inicioMin: 960, finMin: 1200 },
    ]);
    expect(parsearTramos("16-20; 9:30-14")).toEqual([
      { inicioMin: 570, finMin: 840 },
      { inicioMin: 960, finMin: 1200 },
    ]);
    expect(parsearTramos("9-14 y 16-20")).toHaveLength(2);
    expect(parsearTramos("9-12, 11-14")).toEqual([{ inicioMin: 540, finMin: 840 }]); // se funden
    expect(parsearTramos("")).toEqual([]);
  });

  it("rechaza lo que no se entiende", () => {
    expect(parsearTramos("14-9")).toBeNull();
    expect(parsearTramos("9")).toBeNull();
    expect(parsearTramos("9-25")).toBeNull();
    expect(parsearTramos("9:75-10")).toBeNull();
    expect(parsearTramos("mañana")).toBeNull();
  });

  it("escribe los tramos como la plantilla", () => {
    expect(textoTramos([{ inicioMin: 960, finMin: 1200 }, { inicioMin: 570, finMin: 840 }])).toBe("9:30-14, 16-20");
    expect(textoTramos([])).toBe("");
  });
});
