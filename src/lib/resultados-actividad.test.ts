import { describe, expect, it } from "vitest";
import type { BaseResultados, FilaBaseResultados } from "@/lib/rdb/types";
import {
  MIN_FINALIZADOS,
  SIN_VALOR,
  calcularResultados,
  colorMaximo,
  colorMinimo,
  objetivoDe,
  type ObjetivoResultados,
} from "./resultados-actividad";

// Códigos reales de ao_GrupoHuertas (ph_table_schema_enum_value.code)
const EXITO = 762;
const NO_INTERESA = 759;
const NO_VALIDO = 760;
const ERRONEO = 755;
const TALLER = 750;

function fila(p: Partial<FilaBaseResultados> & Pick<FilaBaseResultados, "campania">): FilaBaseResultados {
  return {
    fecha: "2026-09-15",
    agente: "GH_0851",
    nombre: "Nombre GH_0851",
    categoria: "tipificado",
    codigos: [null, null, null],
    contactos: 0,
    exitos: 0,
    noValidos: 0,
    ...p,
  };
}

function base(filas: FilaBaseResultados[], extra: Partial<BaseResultados> = {}): BaseResultados {
  return {
    filas,
    textos: {
      [EXITO]: "Exito",
      [NO_INTERESA]: "No interesa - No necesita",
      [NO_VALIDO]: "No valido",
      [ERRONEO]: "Erroneo - No existe",
      [TALLER]: "Taller",
    },
    servicioDeCampania: { gh_x: "GrupoHuertas", gh_y: "GrupoHuertas", Bol_1: "Bolsas" },
    niveles: { GrupoHuertas: ["Resultado", "Subresultado"] },
    serviciosConfigurados: ["GrupoHuertas"],
    ...extra,
  };
}

const calcular = (b: BaseResultados, objetivos: ObjetivoResultados[] = [], desde = "2026-09-01", hasta = "2026-09-30") =>
  calcularResultados(b, objetivos, desde, hasta);

function objetivo(p: Partial<ObjetivoResultados>): ObjetivoResultados {
  return {
    campaignShortname: null,
    serviceName: null,
    brutoMin: null,
    netoMin: null,
    maxPctNoValidos: null,
    desde: "2026-01-01",
    hasta: null,
    ...p,
  };
}

describe("ratio bruto y neto", () => {
  it("GH septiembre 2026: bruto sobre finalizados, neto sin los no válidos", () => {
    const r = calcular(
      base([
        fila({ campania: "gh_x", codigos: [EXITO, null, null], contactos: 2597, exitos: 2597 }),
        fila({ campania: "gh_x", codigos: [NO_VALIDO, ERRONEO, null], contactos: 2973, noValidos: 2973 }),
        fila({ campania: "gh_x", codigos: [NO_INTERESA, null, null], contactos: 3125 }),
      ]),
    );
    expect(r.total.finalizados).toBe(8695);
    expect(r.total.brutoPct).toBe(29.87); // 2.597 ÷ 8.695
    expect(r.total.netoPct).toBe(45.39); // 2.597 ÷ (8.695 − 2.973)
    expect(r.total.noValidosPct).toBe(34.19);
  });

  it("sin finalizados o con todos no válidos, el ratio es null y no 0", () => {
    const r = calcular(
      base([fila({ campania: "gh_x", codigos: [NO_VALIDO, null, null], contactos: 5, noValidos: 5 })]),
    );
    expect(r.total.brutoPct).toBe(0);
    expect(r.total.netoPct).toBeNull(); // 0 ÷ (5 − 5)
    const vacio = calcular(base([]));
    expect(vacio.total.brutoPct).toBeNull();
    expect(vacio.total.noValidosPct).toBeNull();
  });

  it("en un servicio sin configurar no hay neto, y el total mixto lo calcula solo con los configurados", () => {
    const r = calcular(
      base([
        fila({ campania: "gh_x", codigos: [EXITO, null, null], contactos: 40, exitos: 40 }),
        fila({ campania: "gh_x", codigos: [NO_VALIDO, null, null], contactos: 20, noValidos: 20 }),
        fila({ campania: "gh_x", codigos: [NO_INTERESA, null, null], contactos: 40 }),
        fila({ agente: "Bol_0001", campania: "Bol_1", contactos: 100, exitos: 2 }),
      ]),
    );
    const bol = r.campanias.find((c) => c.campania === "Bol_1")!;
    expect(bol.configurado).toBe(false);
    expect(bol.netoPct).toBeNull();
    expect(bol.brutoPct).toBe(2);
    expect(r.total.brutoPct).toBe(21); // (40 + 2) ÷ 200
    expect(r.total.netoPct).toBe(50); // 40 ÷ (100 − 20): solo GH
    expect(r.total.noValidosPct).toBe(20); // 20 ÷ 100
    expect(r.serviciosSinConfigurar).toEqual(["Bolsas"]);
  });
});

describe("cerrados fuera de los ratios", () => {
  it("los sin tocar y los cierres administrativos se cuentan aparte", () => {
    const r = calcular(
      base([
        fila({ campania: "gh_x", codigos: [EXITO, null, null], contactos: 30, exitos: 30 }),
        fila({ campania: "gh_x", codigos: [NO_INTERESA, null, null], contactos: 70 }),
        fila({ campania: "gh_x", agente: null, nombre: null, categoria: "sinTocar", contactos: 50 }),
        // Lista cerrada en bloque: tipificados hace meses, ya cuentan entonces
        fila({ campania: "gh_x", agente: null, nombre: null, categoria: "administrativo", contactos: 9, exitos: 1 }),
      ]),
    );
    expect(r.total.finalizados).toBe(100);
    expect(r.total.brutoPct).toBe(30);
    expect(r.total.cerrados).toBe(159);
    expect(r.total.sinTocar).toBe(50);
    expect(r.total.administrativos).toBe(9);
    expect(r.agentes).toHaveLength(1);
    const c = r.campanias[0];
    expect([c.cerrados, c.sinTocar, c.administrativos]).toEqual([159, 50, 9]);
  });
});

describe("por agente", () => {
  it("las campañas del agente suman lo mismo que el agente y que el total", () => {
    const r = calcular(
      base([
        fila({ campania: "gh_x", codigos: [EXITO, null, null], contactos: 12, exitos: 12, fecha: "2026-09-01" }),
        fila({ campania: "gh_x", codigos: [EXITO, null, null], contactos: 8, exitos: 8, fecha: "2026-09-02" }),
        fila({ campania: "gh_y", codigos: [NO_VALIDO, TALLER, null], contactos: 10, noValidos: 10 }),
        fila({ agente: "GH_0900", nombre: "Otra", campania: "gh_x", codigos: [NO_INTERESA, null, null], contactos: 5 }),
      ]),
    );
    const a = r.agentes.find((x) => x.agente === "GH_0851")!;
    expect(a.finalizados).toBe(30);
    expect(a.campanias.map((c) => [c.campania, c.finalizados])).toEqual([
      ["gh_x", 20],
      ["gh_y", 10],
    ]);
    expect(r.agentes.reduce((s, x) => s + x.finalizados, 0)).toBe(r.total.finalizados);
  });

  it("con menos finalizados que el mínimo marca muestra pequeña y va al final", () => {
    const r = calcular(
      base([
        fila({ agente: "A_0001", campania: "gh_x", contactos: MIN_FINALIZADOS - 1 }),
        fila({ agente: "A_0002", campania: "gh_x", contactos: MIN_FINALIZADOS }),
      ]),
    );
    expect(r.agentes.map((a) => [a.agente, a.muestraPequenia])).toEqual([
      ["A_0002", false],
      ["A_0001", true],
    ]);
  });
});

describe("desglose", () => {
  it("resultado → subresultado con % sobre los finalizados, y el resto a «(sin valor)»", () => {
    const r = calcular(
      base([
        fila({ campania: "gh_x", codigos: [EXITO, null, null], contactos: 50, exitos: 50 }),
        fila({ campania: "gh_x", codigos: [NO_VALIDO, ERRONEO, null], contactos: 30, noValidos: 30 }),
        fila({ campania: "gh_x", codigos: [NO_VALIDO, null, null], contactos: 20, noValidos: 20 }),
      ]),
    );
    const svc = r.desgloses.find((d) => d.clave === "svc:GrupoHuertas")!;
    expect(svc.niveles).toEqual(["Resultado", "Subresultado"]);
    expect(svc.finalizados).toBe(100);
    expect(svc.nodos.map((n) => [n.nombre, n.contactos, n.pct])).toEqual([
      ["Exito", 50, 50],
      ["No valido", 50, 50],
    ]);
    // Exito no tiene subresultado: sin hijos
    expect(svc.nodos[0].hijos).toEqual([]);
    expect(svc.nodos[1].hijos.map((n) => [n.nombre, n.contactos, n.noValidos])).toEqual([
      ["Erroneo - No existe", 30, 30],
      [SIN_VALOR, 20, 20],
    ]);
    expect(r.desgloses.map((d) => d.clave)).toEqual(["svc:GrupoHuertas", "camp:gh_x"]);
  });

  it("no hay desglose de servicios sin configurar", () => {
    const r = calcular(base([fila({ agente: "Bol_0001", campania: "Bol_1", contactos: 10 })]));
    expect(r.desgloses).toEqual([]);
  });
});

describe("agente frente al resto de su campaña", () => {
  it("marca al que tipifica muchos más no válidos que el resto", () => {
    const r = calcular(
      base([
        // GH_0851: 40 % de no válidos; el resto: 10 %
        fila({ campania: "gh_x", codigos: [NO_VALIDO, null, null], contactos: 40, noValidos: 40 }),
        fila({ campania: "gh_x", codigos: [NO_INTERESA, null, null], contactos: 60 }),
        fila({ agente: "GH_0900", nombre: "Otra", campania: "gh_x", codigos: [NO_VALIDO, null, null], contactos: 10, noValidos: 10 }),
        fila({ agente: "GH_0900", nombre: "Otra", campania: "gh_x", codigos: [NO_INTERESA, null, null], contactos: 90 }),
      ]),
    );
    const c = r.comparaciones.find((x) => x.agente === "GH_0851")!;
    expect(c.noValidosPct).toBe(40);
    expect(c.noValidosRestoPct).toBe(10);
    expect(c.difNoValidosPp).toBe(30);
    expect(c.resultadoDesviado).toMatchObject({ difPp: 30 });
    expect(c.marcado).toBe(true);
    expect(r.comparaciones[0].agente).toBe("GH_0851"); // los marcados primero
  });

  it("no compara con muestra pequeña ni sin resto de campaña", () => {
    const r = calcular(
      base([
        fila({ campania: "gh_x", contactos: MIN_FINALIZADOS - 1 }),
        fila({ agente: "GH_0900", campania: "gh_x", contactos: 200 }),
        fila({ agente: "GH_0901", campania: "gh_y", contactos: 200 }),
      ]),
    );
    expect(r.comparaciones).toEqual([]);
  });
});

describe("evolución", () => {
  it("por día rellena los días sin cierres", () => {
    const r = calcular(
      base([fila({ campania: "gh_x", codigos: [EXITO, null, null], contactos: 4, exitos: 1, fecha: "2026-09-02" })]),
      [],
      "2026-09-01",
      "2026-09-03",
    );
    expect(r.serie.granularidad).toBe("dia");
    expect(r.serie.puntos.map((p) => [p.periodo, p.finalizados, p.brutoPct])).toEqual([
      ["2026-09-01", 0, null],
      ["2026-09-02", 4, 25],
      ["2026-09-03", 0, null],
    ]);
  });

  it("pasa a semanas (lunes ISO) en rangos de más de 62 días", () => {
    const r = calcular(
      base([
        fila({ campania: "gh_x", contactos: 2, fecha: "2026-07-01" }), // miércoles
        fila({ campania: "gh_x", contactos: 3, fecha: "2026-07-05" }), // domingo, misma semana
      ]),
      [],
      "2026-07-01",
      "2026-09-30",
    );
    expect(r.serie.granularidad).toBe("semana");
    expect(r.serie.puntos[0]).toMatchObject({ periodo: "2026-06-29", finalizados: 5 });
    expect(r.serie.puntos.at(-1)!.periodo).toBe("2026-09-28");
  });
});

describe("objetivos y semáforo", () => {
  it("la campaña prevalece sobre el servicio y gana la vigencia más reciente", () => {
    const svc = objetivo({ serviceName: "GrupoHuertas", brutoMin: 30 });
    const svcNuevo = objetivo({ serviceName: "GrupoHuertas", brutoMin: 32, desde: "2026-09-01" });
    const camp = objetivo({ campaignShortname: "gh_y", brutoMin: 20 });
    const caducado = objetivo({ campaignShortname: "gh_x", brutoMin: 99, hasta: "2026-08-31" });
    const lista = [svc, svcNuevo, camp, caducado];
    expect(objetivoDe(lista, "gh_x", "GrupoHuertas", "2026-09-01", "2026-09-30")).toBe(svcNuevo);
    expect(objetivoDe(lista, "gh_y", "GrupoHuertas", "2026-09-01", "2026-09-30")).toBe(camp);
    expect(objetivoDe(lista, "Bol_1", "Bolsas", "2026-09-01", "2026-09-30")).toBeNull();
  });

  it("verde si cumple, ámbar a menos del 10 % y rojo por debajo (al revés en los no válidos)", () => {
    expect(colorMinimo(30, 30)).toBe("verde");
    expect(colorMinimo(27, 30)).toBe("ambar");
    expect(colorMinimo(26.99, 30)).toBe("rojo");
    expect(colorMinimo(null, 30)).toBeNull();
    expect(colorMinimo(10, null)).toBeNull();
    expect(colorMaximo(30, 30)).toBe("verde");
    expect(colorMaximo(33, 30)).toBe("ambar");
    expect(colorMaximo(33.01, 30)).toBe("rojo");
  });

  it("colorea campañas y total con el objetivo común; sin color con muestra pequeña", () => {
    const o = objetivo({ serviceName: "GrupoHuertas", brutoMin: 30, netoMin: 70, maxPctNoValidos: 25 });
    const r = calcular(
      base([
        fila({ campania: "gh_x", codigos: [EXITO, null, null], contactos: 30, exitos: 30 }),
        fila({ campania: "gh_x", codigos: [NO_VALIDO, null, null], contactos: 40, noValidos: 40 }),
        fila({ campania: "gh_x", codigos: [NO_INTERESA, null, null], contactos: 30 }),
        fila({ agente: "GH_0900", campania: "gh_y", contactos: 5 }),
      ]),
      [o],
    );
    const x = r.campanias.find((c) => c.campania === "gh_x")!;
    expect(x.semaforo).toEqual({ bruto: "verde", neto: "rojo", noValidos: "rojo" }); // 30 %, 50 %, 40 %
    const y = r.campanias.find((c) => c.campania === "gh_y")!;
    expect(y.semaforo).toEqual({ bruto: null, neto: null, noValidos: null });
    expect(r.total.objetivo).toBe(o);
  });
});
