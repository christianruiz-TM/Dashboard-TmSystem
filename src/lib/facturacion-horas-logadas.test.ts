import { describe, expect, it } from "vitest";
import {
  esUsuarioDelCliente,
  facturarHorasLogadas,
  patronLikeUsuarios,
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
