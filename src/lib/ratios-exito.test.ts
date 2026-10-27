import { describe, expect, it } from "vitest";
import type { BaseRatiosExito, FilaBaseRatios } from "@/lib/rdb/types";
import { MIN_CONTACTOS_RATIO, calcularRatiosExito, esUsuarioDelCliente } from "./ratios-exito";

function fila(p: Partial<FilaBaseRatios> & Pick<FilaBaseRatios, "agente" | "campania">): FilaBaseRatios {
  return {
    nombre: `Nombre ${p.agente}`,
    sesiones: 0,
    exitos: 0,
    sinExito: 0,
    atendidas: 0,
    productivoSeg: 0,
    exitosConConversacion: 0,
    conversacionExitosSeg: 0,
    exitosConGestion: 0,
    gestionExitosSeg: 0,
    guionSeg: 0,
    noExitosConGestion: 0,
    gestionNoExitosSeg: 0,
    llamadasExito: 0,
    duracionLlamadasExitoSeg: 0,
    llamadasNoExito: 0,
    duracionLlamadasNoExitoSeg: 0,
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
    expect(r.agentes[0].conversacionPorExitoSeg).toBeNull();
    expect(r.agentes[0].gestionPorExitoSeg).toBeNull();
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
  it("por hora logada en lo agrupado (agente, total) y con script abierto por campaña", () => {
    const r = calcularRatiosExito(
      base(
        [
          fila({ agente: "GH_0851", campania: "gh_a", sesiones: 60, exitos: 9, atendidas: 60, guionSeg: 3 * 3600 }),
          fila({ agente: "GH_0851", campania: "gh_b", sesiones: 40, exitos: 3, atendidas: 40, guionSeg: 3600 }),
          fila({ agente: "GH_0925", campania: "gh_a", sesiones: 10, exitos: 1, atendidas: 10, guionSeg: 900 }),
        ],
        { horasLogadas: [{ agente: "GH_0851", horas: 7.5 }, { agente: "Otro_0001", horas: 8 }] },
      ),
    );
    const a = r.agentes.find((x) => x.agente === "GH_0851")!;
    expect(a.horasLogadas).toBe(7.5);
    expect(a.exitosHoraLogada).toBe(1.6); // 12 / 7,5
    expect(a.llamadasHoraLogada).toBe(13.33); // 100 / 7,5
    // Su detalle por campaña, por hora con el script abierto
    const ga = a.campanias.find((c) => c.campania === "gh_a")!;
    expect(ga.horasGuion).toBe(3);
    expect(ga.exitosHoraGuion).toBe(3); // 9 / 3 h
    expect(ga.llamadasHoraGuion).toBe(20); // 60 / 3 h
    // La campaña suma el script de todos sus agentes: 10 / 3,25 h
    expect(r.campanias.find((c) => c.campania === "gh_a")!.exitosHoraGuion).toBe(3.08);
    // Sin sesión en user_log: null, no 0
    const sinLog = r.agentes.find((x) => x.agente === "GH_0925")!;
    expect(sinLog.exitosHoraLogada).toBeNull();
    expect(sinLog.llamadasHoraLogada).toBeNull();
    // El total solo suma las horas de quien trabajó en el alcance (no Otro_0001)
    expect(r.total.horasLogadas).toBe(7.5);
    expect(r.total.llamadasHoraLogada).toBe(14.67); // 110 / 7,5
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

describe("tiempos de los éxitos", () => {
  it("cada media divide entre los éxitos que tienen ese tiempo", () => {
    const r = calcularRatiosExito(
      base([
        // 10 éxitos: 8 con llamada atendida ligada, los 10 con script
        fila({
          agente: "GH_0851",
          campania: "gh_a",
          sesiones: 40,
          exitos: 10,
          atendidas: 40,
          productivoSeg: 40 * 300,
          exitosConConversacion: 8,
          conversacionExitosSeg: 8 * 320,
          exitosConGestion: 10,
          gestionExitosSeg: 10 * 450,
        }),
        fila({
          agente: "GH_0851",
          campania: "gh_b",
          sesiones: 20,
          exitos: 2,
          exitosConConversacion: 2,
          conversacionExitosSeg: 2 * 200,
          exitosConGestion: 2,
          gestionExitosSeg: 2 * 300,
        }),
      ]),
    );
    const a = r.agentes[0];
    // (2.560 + 400) / 10 = 296; (4.500 + 600) / 12 = 425
    expect(a.conversacionPorExitoSeg).toBe(296);
    expect(a.gestionPorExitoSeg).toBe(425);
    expect(a.campanias.find((c) => c.campania === "gh_a")!.conversacionPorExitoSeg).toBe(320);
    expect(r.campanias.find((c) => c.campania === "gh_b")!.gestionPorExitoSeg).toBe(300);
    expect(r.total.conversacionPorExitoSeg).toBe(296);
    // Ya no depende de la gestión de las atendidas SIN éxito
    expect(r.total.gestionPorExitoSeg).toBe(425);
  });

  it("sin éxitos con tiempo, null y no 0", () => {
    const r = calcularRatiosExito(
      base([fila({ agente: "CEFF_0001", campania: "ceff", sesiones: 5, exitos: 1, exitosConGestion: 1, gestionExitosSeg: 60 })]),
    );
    expect(r.agentes[0].conversacionPorExitoSeg).toBeNull();
    expect(r.agentes[0].gestionPorExitoSeg).toBe(60);
    expect(r.agentes[0].gestionPorNoExitoSeg).toBeNull();
    expect(r.agentes[0].exitosHoraGuion).toBeNull();
  });

  it("duración media de las sesiones sin éxito, aparte de la de los éxitos", () => {
    const r = calcularRatiosExito(
      base([
        fila({ agente: "A", campania: "x", sesiones: 30, exitos: 2, exitosConGestion: 2, gestionExitosSeg: 900, noExitosConGestion: 27, gestionNoExitosSeg: 27 * 95 }),
        fila({ agente: "B", campania: "x", sesiones: 10, noExitosConGestion: 10, gestionNoExitosSeg: 10 * 135 }),
      ]),
    );
    // (2.565 + 1.350) / 37 = 105,81
    expect(r.total.gestionPorNoExitoSeg).toBe(105.81);
    expect(r.total.gestionPorExitoSeg).toBe(450);
  });
});

describe("llamadas por éxito y duración de las llamadas (22/10/2026)", () => {
  it("llamadas ÷ éxitos y duración media de las llamadas de éxito y de no éxito", () => {
    const r = calcularRatiosExito(
      base([
        fila({ agente: "A", campania: "x", sesiones: 50, atendidas: 60, exitos: 4, llamadasExito: 5, duracionLlamadasExitoSeg: 5 * 300, llamadasNoExito: 55, duracionLlamadasNoExitoSeg: 55 * 90 }),
        fila({ agente: "B", campania: "x", sesiones: 30, atendidas: 40, exitos: 1, llamadasExito: 1, duracionLlamadasExitoSeg: 420, llamadasNoExito: 39, duracionLlamadasNoExitoSeg: 39 * 120 }),
      ]),
    );
    expect(r.total.llamadasPorExito).toBe(20); // 100 / 5
    expect(r.total.duracionLlamadaExitoSeg).toBe(320); // (1.500 + 420) / 6
    expect(r.total.duracionLlamadaNoExitoSeg).toBe(102.45); // (4.950 + 4.680) / 94
    expect(r.agentes.find((a) => a.agente === "A")!.llamadasPorExito).toBe(15);
    // Sin éxitos: null, no infinito
    const sin = calcularRatiosExito(base([fila({ agente: "C", campania: "x", sesiones: 5, atendidas: 9 })]));
    expect(sin.total.llamadasPorExito).toBeNull();
    expect(sin.total.duracionLlamadaExitoSeg).toBeNull();
  });
});

describe("horas del cliente por prefijo (23/10/2026)", () => {
  it("el total solo suma las horas de los usuarios con el prefijo del cliente", () => {
    const filas = [
      fila({ agente: "GH_0851", campania: "gh_a", sesiones: 50, atendidas: 40, exitos: 5 }),
      fila({ agente: "Manu", campania: "gh_a", sesiones: 1 }),
    ];
    const horasLogadas = [
      { agente: "GH_0851", horas: 8 },
      { agente: "Manu", horas: 80 },
    ];
    expect(calcularRatiosExito(base(filas, { horasLogadas })).total.horasLogadas).toBe(88);
    const r = calcularRatiosExito(base(filas, { horasLogadas }), "GH");
    expect(r.total.horasLogadas).toBe(8);
    expect(r.total.llamadasHoraLogada).toBe(5);
    // La fila del agente sigue con sus horas
    expect(r.agentes.find((a) => a.agente === "Manu")!.horasLogadas).toBe(80);
  });
});

describe("usuarios del cliente logados sin actividad (27/10/2026)", () => {
  const filas = [fila({ agente: "GH_0851", nombre: "Lourdes", campania: "gh_a", sesiones: 50, atendidas: 40, exitos: 5 })];
  const horasLogadas = [
    { agente: "GH_0851", nombre: "Lourdes", horas: 8 },
    // Logada todo el día sin una sola llamada (GH_1071, 26/10/2026)
    { agente: "GH_1071", nombre: "Miriam Delgado_GH", horas: 7.8 },
    // Cargador de tipo agente: empieza por GH_ pero no es una persona
    { agente: "GH_Cargador2", nombre: "GH_Cargador2", horas: 10.26 },
    // De otro cliente
    { agente: "Av_1071", nombre: "Miriam Delgado", horas: 7.55 },
  ];

  it("con prefijo salen con sus horas y cuentan en el total", () => {
    const r = calcularRatiosExito(base(filas, { horasLogadas }), "GH");
    expect(r.agentes.map((a) => a.agente)).toEqual(["GH_0851", "GH_1071"]);
    const miriam = r.agentes.find((a) => a.agente === "GH_1071")!;
    expect(miriam.nombre).toBe("Miriam Delgado_GH");
    expect(miriam.horasLogadas).toBe(7.8);
    expect(miriam.contactos).toBe(0);
    expect(miriam.llamadasHoraLogada).toBe(0);
    expect(miriam.indice).toBeNull();
    expect(miriam.campanias).toEqual([]);
    expect(r.total.horasLogadas).toBe(15.8);
    expect(r.total.llamadasHoraLogada).toBe(2.53); // 40 / 15,8
  });

  it("sin prefijo, o con un tipo de campaña, no salen", () => {
    expect(calcularRatiosExito(base(filas, { horasLogadas })).agentes).toHaveLength(1);
    const r = calcularRatiosExito(base(filas, { horasLogadas }), "GH", false);
    expect(r.agentes).toHaveLength(1);
    expect(r.total.horasLogadas).toBe(8);
  });

  it("usuario del cliente = PREFIJO_nnnn con sufijo opcional", () => {
    expect(esUsuarioDelCliente("GH_0851", "GH")).toBe(true);
    expect(esUsuarioDelCliente("GH_1067_BD_LX", "GH")).toBe(true);
    expect(esUsuarioDelCliente("GH_Cargador2", "GH")).toBe(false);
    expect(esUsuarioDelCliente("GHX_0851", "GH")).toBe(false);
    expect(esUsuarioDelCliente("Manu", null)).toBe(true);
  });
});
