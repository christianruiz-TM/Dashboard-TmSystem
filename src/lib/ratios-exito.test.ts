import { describe, expect, it } from "vitest";
import type { BaseRatiosExito, FilaBaseRatios } from "@/lib/rdb/types";
import { MIN_CONTACTOS_RATIO, calcularRatiosExito } from "./ratios-exito";

function fila(p: Partial<FilaBaseRatios> & Pick<FilaBaseRatios, "agente" | "campania">): FilaBaseRatios {
  return {
    nombre: `Nombre ${p.agente}`,
    sesiones: 0,
    exitos: 0,
    sinExito: 0,
    atendidas: 0,
    productivoSeg: 0,
    ...p,
  };
}

function base(filas: FilaBaseRatios[], extra: Partial<BaseRatiosExito> = {}): BaseRatiosExito {
  return { filas, horasLogadas: [], campaniasConSinExito: [], ...extra };
}

describe("conversión", () => {
  it("usa contactos (sesiones) y atendidas como denominadores distintos", () => {
    // Caso Bolsas: una sesión agrupa ~1,9 llamadas atendidas
    const r = calcularRatiosExito(
      base([fila({ agente: "Bol_0365", campania: "Bol_0365", sesiones: 3840, atendidas: 6690, exitos: 78 })]),
    );
    const a = r.agentes[0];
    expect(a.convContactosPct).toBe(2.03);
    expect(a.convAtendidasPct).toBe(1.17);
  });

  it("sin contactos ni atendidas la conversión es null, no 0", () => {
    const r = calcularRatiosExito(base([fila({ agente: "GH_0851", campania: "gh_x" })]));
    expect(r.agentes[0].convContactosPct).toBeNull();
    expect(r.agentes[0].convAtendidasPct).toBeNull();
    expect(r.agentes[0].segPorExito).toBeNull();
  });
});

describe("efectividad de cierre", () => {
  it("solo cuenta las campañas que usan «sin éxito»", () => {
    const r = calcularRatiosExito(
      base(
        [
          // GH marca sin éxito: 20 / (20 + 60) = 25 %
          fila({ agente: "A_0001", campania: "gh_x", sesiones: 100, exitos: 20, sinExito: 60 }),
          // Bolsas no lo marca: sus 10 éxitos no entran en la efectividad
          fila({ agente: "A_0001", campania: "Bol_1", sesiones: 100, exitos: 10 }),
        ],
        { campaniasConSinExito: ["gh_x"] },
      ),
    );
    const a = r.agentes[0];
    expect(a.efectividadPct).toBe(25);
    expect(a.campanias.find((c) => c.campania === "Bol_1")!.efectividadPct).toBeNull();
    expect(r.campanias.find((c) => c.campania === "Bol_1")!.efectividadPct).toBeNull();
    expect(r.campanias.find((c) => c.campania === "gh_x")!.marcaSinExito).toBe(true);
  });

  it("es null para un agente que solo trabaja campañas sin esa calificación", () => {
    const r = calcularRatiosExito(base([fila({ agente: "B", campania: "Bol_1", sesiones: 50, exitos: 5 })]));
    expect(r.agentes[0].efectividadPct).toBeNull();
  });
});

describe("índice frente a la campaña", () => {
  // Campaña fácil (20 %) y difícil (2 %). A trabaja en la fácil, B en la difícil.
  const filas = [
    fila({ agente: "A", campania: "facil", sesiones: 100, exitos: 25 }),
    fila({ agente: "C", campania: "facil", sesiones: 100, exitos: 15 }),
    fila({ agente: "B", campania: "dificil", sesiones: 100, exitos: 3 }),
    fila({ agente: "D", campania: "dificil", sesiones: 100, exitos: 1 }),
  ];

  it("compara cada agente con la media de SU campaña", () => {
    const r = calcularRatiosExito(base(filas));
    const de = (ag: string) => r.agentes.find((a) => a.agente === ag)!;
    // A: 25 esperados 20 → 125; B: 3 esperados 2 → 150 (mejor aunque convierta menos)
    expect(de("A").indice).toBe(125);
    expect(de("B").indice).toBe(150);
    expect(de("C").indice).toBe(75);
    expect(de("D").indice).toBe(50);
    expect(r.agentes.map((a) => a.agente)).toEqual(["B", "A", "C", "D"]);
  });

  it("pondera por los contactos de cada campaña", () => {
    const r = calcularRatiosExito(
      base([...filas, fila({ agente: "E", campania: "facil", sesiones: 50, exitos: 10 }),
        fila({ agente: "E", campania: "dificil", sesiones: 50, exitos: 1 })]),
    );
    const e = r.agentes.find((a) => a.agente === "E")!;
    // Conversión de las campañas con E dentro: fácil 50/250 = 0,2; difícil 5/250 = 0,02
    // Esperados = 50×0,2 + 50×0,02 = 11; reales 11 → 100
    expect(e.exitosEsperados).toBe(11);
    expect(e.indice).toBe(100);
    expect(e.campanias.find((c) => c.campania === "dificil")!.indice).toBe(100);
  });

  it("sin éxitos en sus campañas no hay índice", () => {
    const r = calcularRatiosExito(base([fila({ agente: "A", campania: "x", sesiones: 40 })]));
    expect(r.agentes[0].indice).toBeNull();
    expect(r.agentes[0].campanias[0].indice).toBeNull();
  });
});

describe("horas y totales", () => {
  it("éxitos por hora logada solo por agente, desde user_log", () => {
    const r = calcularRatiosExito(
      base(
        [
          fila({ agente: "GH_0851", campania: "gh_a", sesiones: 60, exitos: 9, atendidas: 60, productivoSeg: 3 * 3600 }),
          fila({ agente: "GH_0851", campania: "gh_b", sesiones: 40, exitos: 3, atendidas: 40, productivoSeg: 3600 }),
          fila({ agente: "GH_0925", campania: "gh_a", sesiones: 10, exitos: 1, atendidas: 10, productivoSeg: 900 }),
        ],
        { horasLogadas: [{ agente: "GH_0851", horas: 7.5 }, { agente: "Otro_0001", horas: 8 }] },
      ),
    );
    const a = r.agentes.find((x) => x.agente === "GH_0851")!;
    expect(a.horasLogadas).toBe(7.5);
    expect(a.exitosHoraLogada).toBe(1.6); // 12 / 7,5
    expect(a.exitosHoraProductiva).toBe(3); // 12 / 4 h
    expect(a.segPorExito).toBe(1200); // 14.400 s / 12
    // Sin sesión en user_log: null, no 0
    expect(r.agentes.find((x) => x.agente === "GH_0925")!.exitosHoraLogada).toBeNull();
    // El total solo suma las horas de quien trabajó en el alcance (no Otro_0001)
    expect(r.total.horasLogadas).toBe(7.5);
    expect(r.total.exitos).toBe(13);
    expect(r.total.contactos).toBe(110);
  });

  it("la suma de los agentes cuadra con la de las campañas", () => {
    const r = calcularRatiosExito(
      base([
        fila({ agente: "A", campania: "x", sesiones: 7, exitos: 2 }),
        fila({ agente: "B", campania: "x", sesiones: 5, exitos: 1 }),
        fila({ agente: "B", campania: "y", sesiones: 9, exitos: 4 }),
      ]),
    );
    const suma = (xs: { exitos: number }[]) => xs.reduce((s, x) => s + x.exitos, 0);
    expect(suma(r.agentes)).toBe(suma(r.campanias));
    expect(suma(r.agentes)).toBe(r.total.exitos);
  });

  it("marca la muestra pequeña y la manda al final", () => {
    const r = calcularRatiosExito(
      base([
        fila({ agente: "poco", campania: "x", sesiones: MIN_CONTACTOS_RATIO - 1, exitos: 20 }),
        fila({ agente: "mucho", campania: "x", sesiones: 200, exitos: 10 }),
      ]),
    );
    expect(r.agentes.map((a) => [a.agente, a.muestraPequenia])).toEqual([
      ["mucho", false],
      ["poco", true],
    ]);
  });
});
