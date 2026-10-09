import { describe, expect, it } from "vitest";
import {
  esUsuarioDelCliente,
  facturarHorasLogadas,
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

describe("reparto estimado de las horas logadas por campaña", () => {
  const base = {
    logado: [
      { usuario: "GH_0851", fecha: "2026-09-01", horas: 7 },
      { usuario: "GH_0851", fecha: "2026-09-02", horas: 6 },
      { usuario: "GH_0900", fecha: "2026-09-01", horas: 5 },
      // Día logado sin ninguna atendida
      { usuario: "GH_0900", fecha: "2026-09-02", horas: 2 },
      // De otro cliente o de bbdd: no cuentan
      { usuario: "GH_0851_BD", fecha: "2026-09-01", horas: 3 },
      { usuario: "UGR_0851", fecha: "2026-09-01", horas: 4 },
    ],
    productivo: [
      { usuario: "GH_0851", fecha: "2026-09-01", campania: "gh_toyota", horas: 3 },
      { usuario: "GH_0851", fecha: "2026-09-01", campania: "gh_seat", horas: 1 },
      { usuario: "GH_0851", fecha: "2026-09-02", campania: "gh_seat", horas: 2 },
      { usuario: "GH_0900", fecha: "2026-09-01", campania: "gh_toyota", horas: 2 },
      { usuario: "GH_0851_BD", fecha: "2026-09-01", campania: "gh_bbdd_x", horas: 2 },
    ],
  };

  it("reparte por usuario y día según lo productivo y deja aparte los días sin llamadas", () => {
    const r = repartirHorasLogadas(base, "GH", 20, 28);
    expect(r).toEqual([
      // 7 × 3/4 + 5 = 10,25 h · productivas 3 + 2 = 5 de 8
      { campania: "gh_toyota", horasProductivas: 5, pctProductivo: 62.5, horasLogadas: 10.25, importe: 287 },
      // 7 × 1/4 + 6 = 7,75 h
      { campania: "gh_seat", horasProductivas: 3, pctProductivo: 37.5, horasLogadas: 7.75, importe: 217 },
      { campania: null, horasProductivas: 0, pctProductivo: null, horasLogadas: 2, importe: 56 },
    ]);
  });

  it("las filas suman exactamente el total facturado", () => {
    const tercios = {
      logado: [{ usuario: "GH_0851", fecha: "2026-09-01", horas: 1 }],
      productivo: ["a", "b", "c"].map((campania) => ({ usuario: "GH_0851", fecha: "2026-09-01", campania, horas: 1 })),
    };
    const r = repartirHorasLogadas(tercios, "GH", 1, null);
    expect(r.map((x) => x.horasLogadas).sort()).toEqual([0.33, 0.33, 0.34]);
    expect(r.reduce((a, x) => a + Math.round(x.horasLogadas * 100), 0)).toBe(100);
    expect(r.every((x) => x.importe === null)).toBe(true);
  });

  it("facturarHorasLogadas añade el reparto a cada cliente", () => {
    const [gh] = facturarHorasLogadas(
      [{ servicio: "GrupoHuertas", prefijo: "GH", precioUnitario: 28, notas: null }],
      [
        { prefijo: "GH", usuario: "GH_0851", horas: 13, sesiones: 2 },
        { prefijo: "GH", usuario: "GH_0900", horas: 7, sesiones: 2 },
      ],
      base,
    );
    expect(gh.horas).toBe(20);
    expect(gh.campanias.reduce((a, c) => a + c.horasLogadas, 0)).toBeCloseTo(gh.horas, 10);
  });
});
