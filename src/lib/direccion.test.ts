import { describe, expect, it } from "vitest";
import type { RatiosCampania } from "@/lib/ratios-exito";
import type { UnidadesCampania, VolumenCampania } from "@/lib/rdb/types";
import {
  agruparPorTipo,
  filasCampaniaDireccion,
  formatearMetrica,
  mejorDeDos,
  resumenPorCliente,
  sumarCampanias,
} from "./direccion";

function vol(campania: string, p: Partial<VolumenCampania> = {}): VolumenCampania {
  return {
    campania,
    tipo: "Outbound",
    total: 0,
    inbound: 0,
    outbound: 0,
    atendidas: 0,
    abandonadas: 0,
    abandonadasInbound: 0,
    ahtSeg: null,
    ...p,
  };
}

function uni(campania: string, p: Partial<UnidadesCampania> = {}): UnidadesCampania {
  return { campania, horasProductivas: 0, interacciones: 0, atendidas: 0, exitos: 0, leadsFinalizados: 0, ...p };
}

function rat(campania: string, p: Partial<RatiosCampania> = {}): RatiosCampania {
  return {
    campania,
    marcaSinExito: false,
    contactos: 0,
    atendidas: 0,
    exitos: 0,
    convContactosPct: null,
    convAtendidasPct: null,
    efectividadPct: null,
    exitosHoraProductiva: null,
    conversacionPorExitoSeg: null,
    gestionPorExitoSeg: null,
    muestraPequenia: false,
    ...p,
  };
}

const servicios = new Map([
  ["Bol_0365", "Bolsas"],
  ["Bol_1034", "Bolsas"],
  ["Bol_Fun_N_1", "Bolsas"],
  ["gh_skoda", "GrupoHuertas"],
]);

describe("filas por campaña", () => {
  it("junta las tres fuentes y no pierde campañas que solo cierran contactos", () => {
    const filas = filasCampaniaDireccion(
      [vol("gh_skoda", { total: 100, inbound: 40, abandonadasInbound: 4, atendidas: 80, ahtSeg: 200 })],
      [uni("gh_skoda", { horasProductivas: 4.5, leadsFinalizados: 30 }), uni("gh_bbdd_x", { leadsFinalizados: 12 })],
      [rat("gh_skoda", { contactos: 70, exitos: 14, convContactosPct: 20 })],
      servicios,
    );
    expect(filas.map((f) => f.campania)).toEqual(["gh_skoda", "gh_bbdd_x"]);
    const gh = filas[0];
    expect(gh.servicio).toBe("GrupoHuertas");
    expect(gh.pctAbandono).toBe(10);
    expect(gh.finalizados).toBe(30);
    expect(gh.exitos).toBe(14);
    // Sin cliente conocido y sin llamadas: null y ceros, no undefined
    expect(filas[1]).toMatchObject({ servicio: null, interacciones: 0, finalizados: 12, ahtSeg: null });
  });
});

describe("sumas", () => {
  it("el % de abandono es de entrantes y el AHT se pondera por atendidas", () => {
    const filas = filasCampaniaDireccion(
      [
        vol("a", { total: 10, inbound: 10, abandonadasInbound: 1, atendidas: 9, ahtSeg: 100 }),
        vol("b", { total: 30, outbound: 30, atendidas: 27, ahtSeg: 300 }),
        vol("c", { total: 5, outbound: 5 }),
      ],
      [],
      [rat("a", { contactos: 9, exitos: 1 }), rat("b", { contactos: 21, exitos: 5 })],
      new Map(),
    );
    const t = sumarCampanias(filas);
    expect(t.pctAbandono).toBe(10); // 1 de 10 entrantes, aunque haya 35 salientes
    expect(t.ahtSeg).toBe(250); // (100×9 + 300×27) / 36
    expect(t.convContactosPct).toBe(20); // 6 / 30
    expect(t.campanias).toBe(3);
  });
});

describe("resumen por cliente", () => {
  it("una fila por cliente con sus horas logadas y las campañas sin cliente al final", () => {
    const filas = filasCampaniaDireccion(
      [
        vol("Bol_0365", { total: 50, atendidas: 40 }),
        vol("Bol_Fun_N_1", { total: 20, atendidas: 10 }),
        vol("gh_skoda", { total: 90, atendidas: 60 }),
        vol("suelta", { total: 500 }),
      ],
      [],
      [],
      servicios,
    );
    const r = resumenPorCliente(filas, new Map([["Bolsas", 12.5]]));
    expect(r.map((f) => [f.servicio, f.interacciones, f.horasLogadas])).toEqual([
      ["GrupoHuertas", 90, 0],
      ["Bolsas", 70, 12.5],
      [null, 500, null],
    ]);
    expect(r[1].campanias).toBe(2);
  });
});

describe("grupos por tipo de campaña", () => {
  const cartera = { nombre: "Cartera", patrones: ["Bol[_][0-9][0-9][0-9]", "Bol[_][0-9][0-9][0-9][0-9]"] };
  const filas = filasCampaniaDireccion(
    [
      vol("Bol_0365", { total: 50 }),
      vol("Bol_Fun_N_1", { total: 20 }),
      vol("Bol_1034", { total: 10 }),
      vol("Bol_Incid", { total: 5 }),
    ],
    [],
    [],
    servicios,
  );

  it("Bolsas: cartera (Bol_ + 3-4 cifras) y resto, con su total", () => {
    const g = agruparPorTipo(filas, [cartera]);
    expect(g.map((x) => [x.nombre, x.filas.map((f) => f.campania), x.total.interacciones])).toEqual([
      ["Cartera", ["Bol_0365", "Bol_1034"], 60],
      ["Resto", ["Bol_Fun_N_1", "Bol_Incid"], 25],
    ]);
  });

  it("sin tipos, un solo grupo sin nombre; los grupos vacíos no salen", () => {
    expect(agruparPorTipo(filas, []).map((x) => [x.nombre, x.filas.length])).toEqual([[null, 4]]);
    const soloCartera = filas.filter((f) => /^Bol_\d+$/.test(f.campania));
    expect(agruparPorTipo(soloCartera, [cartera]).map((x) => x.nombre)).toEqual(["Cartera"]);
  });
});

describe("comparador", () => {
  it("formatea cada tipo de métrica y las diferencias con signo", () => {
    expect(formatearMetrica(12345, "entero")).toBe("12.345");
    expect(formatearMetrica(7.5, "pct")).toBe("7,50 %");
    expect(formatearMetrica(2.25, "pct", true)).toBe("+2,25 p.p.");
    expect(formatearMetrica(-30, "seg", true)).toBe("-30,00 s");
    expect(formatearMetrica(null, "horas")).toBe("—");
  });

  it("decide cuál es mejor según la métrica", () => {
    expect(mejorDeDos(10, 20, "alto")).toBe("b");
    expect(mejorDeDos(10, 20, "bajo")).toBe("a");
    expect(mejorDeDos(10, 20, null)).toBeNull();
    expect(mejorDeDos(10, 10, "alto")).toBeNull();
    expect(mejorDeDos(null, 10, "alto")).toBeNull();
  });
});
