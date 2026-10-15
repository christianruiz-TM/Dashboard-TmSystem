import { describe, expect, it } from "vitest";
import {
  esUsuarioDelCliente,
  facturarHorasLogadas,
  leerPrefijosExcluidos,
  patronLikeUsuarios,
  repartirHorasLogadas,
} from "./facturacion-horas-logadas";

describe("usuarios del cliente para horas logadas", () => {
  it("solo cuenta PREFIJO_nnnn exacto", () => {
    expect(esUsuarioDelCliente("GH_0851", "GH")).toBe(true);
    expect(esUsuarioDelCliente("GH_1118   ", "GH")).toBe(true); // usr_name es char con relleno
    expect(esUsuarioDelCliente("gh_0851", "GH")).toBe(true); // RDBv2 no distingue mayúsculas
    for (const u of ["GH_0851_BD", "GH_1067_BD_LX", "GH_Cargador2", "Angeles", "UGR_0851", "GH_851"]) {
      expect(esUsuarioDelCliente(u, "GH")).toBe(false);
    }
  });

  it("admite prefijos con guion bajo sin confundirlos con otro cliente", () => {
    expect(esUsuarioDelCliente("Soc_Fed_0892", "Soc_Fed")).toBe(true);
    expect(esUsuarioDelCliente("Soc_Fed_0892", "Soc")).toBe(false);
    expect(esUsuarioDelCliente("Soc_0307", "Soc")).toBe(true);
  });

  it("el patrón LIKE escapa el «_» y fija los 4 dígitos", () => {
    expect(patronLikeUsuarios("GH")).toBe("GH[_][0-9][0-9][0-9][0-9]");
    expect(patronLikeUsuarios("Soc_Fed")).toBe("Soc[_]Fed[_][0-9][0-9][0-9][0-9]");
    expect(() => patronLikeUsuarios("GH%")).toThrow();
    expect(() => patronLikeUsuarios("GH_")).toThrow();
    expect(esUsuarioDelCliente("GH_0851", "G.")).toBe(false);
  });
});

describe("facturarHorasLogadas", () => {
  const linea = { servicio: "GrupoHuertas", prefijo: "GH", precioUnitario: 28, notas: null };

  it("suma solo los usuarios del cliente y redondea solo el total", () => {
    const [r] = facturarHorasLogadas(
      [linea],
      [
        { prefijo: "GH", usuario: "GH_0892", horas: 1.004, sesiones: 2 },
        { prefijo: "GH", usuario: "GH_0851", horas: 1.004, sesiones: 1 },
        { prefijo: "GH", usuario: "GH_0925", horas: 1.004, sesiones: 1 },
        { prefijo: "UGR", usuario: "UGR_0851", horas: 50, sesiones: 9 },
      ],
    );
    // 3 × 1,004 = 3,012 → 3,01 (redondear cada uno y sumar daría 3,00)
    expect(r.horas).toBe(3.01);
    expect(r.importe).toBe(84.28);
    expect(r.usuarios.map((u) => u.usuario)).toEqual(["GH_0851", "GH_0892", "GH_0925"]);
  });

  it("sin precio no hay importe y sin usuarios son 0 h", () => {
    const [r] = facturarHorasLogadas([{ ...linea, precioUnitario: null }], []);
    expect(r).toMatchObject({ horas: 0, importe: null, usuarios: [] });
  });
});

describe("reparto de las horas logadas por campaña (método del Excel de operaciones)", () => {
  const base = {
    tiempoAgente: [
      { usuario: "GH_0851", campania: "gh_toyota", prefijo: "7101", horas: 3 },
      { usuario: "GH_0851", campania: "gh_seat", prefijo: "7101", horas: 1 },
      { usuario: "GH_0900", campania: "gh_toyota", prefijo: "7101", horas: 2 },
      { usuario: "GH_0900", campania: "gh_seat", prefijo: "7101", horas: 2 },
      // De bbdd o de otro cliente: no cuentan
      { usuario: "GH_0851_BD", campania: "gh_bbdd_x", prefijo: "7101", horas: 5 },
      { usuario: "UGR_0851", campania: "ugr_egre", prefijo: "7101", horas: 4 },
    ],
  };

  it("reparte el total de una vez en proporción al tiempo de agente", () => {
    const r = repartirHorasLogadas(base, "GH", 20, 28);
    expect(r).toEqual([
      // 5 h de agente de 8 → 62,5 % de 20 h
      { campania: "gh_toyota", horasAgente: 5, pctAgente: 62.5, horasLogadas: 12.5, importe: 350 },
      { campania: "gh_seat", horasAgente: 3, pctAgente: 37.5, horasLogadas: 7.5, importe: 210 },
    ]);
  });

  it("solo reparte entre las campañas del cliente que se le indican", () => {
    const r = repartirHorasLogadas(base, "GH", 10, null, new Set(["gh_seat", "gh_bbdd_x"]));
    expect(r).toEqual([{ campania: "gh_seat", horasAgente: 3, pctAgente: 100, horasLogadas: 10, importe: null }]);
  });

  it("las filas suman exactamente el total facturado", () => {
    const tercios = {
      tiempoAgente: ["a", "b", "c"].map((campania) => ({ usuario: "GH_0851", campania, prefijo: "7101", horas: 1 })),
    };
    const r = repartirHorasLogadas(tercios, "GH", 1, null);
    expect(r.map((x) => x.horasLogadas).sort()).toEqual([0.33, 0.33, 0.34]);
    expect(r.reduce((a, x) => a + Math.round(x.horasLogadas * 100), 0)).toBe(100);
    expect(r.every((x) => x.importe === null)).toBe(true);
  });

  it("los prefijos excluidos del cliente no cuentan para el reparto (segmentador del Excel)", () => {
    const conHuntGroup = {
      tiempoAgente: [
        ...base.tiempoAgente,
        // Entrantes por el hunt group 8259 de gh_seat: 6 h que no deben pesar
        { usuario: "GH_0851", campania: "gh_seat", prefijo: "8259", horas: 6 },
      ],
    };
    expect(repartirHorasLogadas(conHuntGroup, "GH", 20, null).find((r) => r.campania === "gh_seat")?.horasAgente).toBe(9);
    const r = repartirHorasLogadas(conHuntGroup, "GH", 20, 28, undefined, new Set(["8259", "0673"]));
    // Sin el 8259 queda como sin la fila: 12,5 h y 7,5 h
    expect(r.map((x) => [x.campania, x.horasLogadas])).toEqual([
      ["gh_toyota", 12.5],
      ["gh_seat", 7.5],
    ]);
  });

  it("leerPrefijosExcluidos: números de hasta 4 cifras, sin repetidos y ordenados", () => {
    expect(leerPrefijosExcluidos("8259, 0673\n1161;0673  7190")).toEqual(["0673", "1161", "7190", "8259"]);
    expect(leerPrefijosExcluidos("")).toEqual([]);
    expect(leerPrefijosExcluidos("8259, 82A9")).toBeNull();
    expect(leerPrefijosExcluidos("12345")).toBeNull();
  });

  it("horas logadas sin tiempo de agente: una fila sin campaña, sin inventar el reparto", () => {
    expect(repartirHorasLogadas({ tiempoAgente: [] }, "GH", 3.5, 28)).toEqual([
      { campania: null, horasAgente: 0, pctAgente: null, horasLogadas: 3.5, importe: 98 },
    ]);
    expect(repartirHorasLogadas({ tiempoAgente: [] }, "GH", 0, 28)).toEqual([]);
  });

  it("facturarHorasLogadas añade el reparto a cada cliente con sus campañas", () => {
    const [gh] = facturarHorasLogadas(
      [{ servicio: "GrupoHuertas", prefijo: "GH", precioUnitario: 28, notas: null }],
      [
        { prefijo: "GH", usuario: "GH_0851", horas: 13, sesiones: 2 },
        { prefijo: "GH", usuario: "GH_0900", horas: 7.004, sesiones: 2 },
      ],
      base,
      new Map([["GrupoHuertas", new Set(["gh_toyota", "gh_seat"])]]),
    );
    expect(gh.horas).toBe(20);
    expect(gh.campanias.map((c) => c.campania)).toEqual(["gh_toyota", "gh_seat"]);
    expect(gh.campanias.reduce((a, c) => a + Math.round(c.horasLogadas * 100), 0)).toBe(2000);
    expect(gh.campanias.reduce((a, c) => a + (c.importe ?? 0), 0)).toBeCloseTo(gh.importe ?? 0, 10);
  });
});
