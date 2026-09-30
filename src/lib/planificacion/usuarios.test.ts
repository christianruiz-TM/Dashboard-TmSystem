import { describe, expect, it } from "vitest";
import { parsearUsuario, resolverCliente } from "./usuarios";

describe("usuarios de agente", () => {
  it("separa prefijo, nº y sufijo", () => {
    expect(parsearUsuario("GH_0851")).toEqual({ usrName: "GH_0851", prefijo: "GH", numero: "0851", sufijo: "" });
    expect(parsearUsuario("GH_1067_BD_LX")).toMatchObject({ prefijo: "GH", numero: "1067", sufijo: "_BD_LX" });
    expect(parsearUsuario("Soc_Fed_0892")).toMatchObject({ prefijo: "Soc_Fed", numero: "0892", sufijo: "" });
    expect(parsearUsuario("Av_0940_2")).toMatchObject({ prefijo: "Av", numero: "0940", sufijo: "_2" });
  });

  it("los usuarios sin nº de agente quedan fuera", () => {
    for (const u of ["Angeles", "TM_Carmen Sevilla", "1053_KIT", "940", "Christian", "GH_Cargador2"]) {
      expect(parsearUsuario(u)).toBeNull();
    }
  });

  it("resuelve el cliente por prefijo+sufijo exactos", () => {
    const prefijos = [
      { prefijo: "GH", sufijo: "", clienteCodigo: "GH" },
      { prefijo: "GH", sufijo: "_BD", clienteCodigo: "BD" },
      { prefijo: "GH", sufijo: "_BD_LX", clienteCodigo: "LX" },
      { prefijo: "Av", sufijo: "", clienteCodigo: "AV" },
    ];
    expect(resolverCliente("GH", "_BD_LX", prefijos)).toBe("LX");
    expect(resolverCliente("GH", "_BD", prefijos)).toBe("BD");
    expect(resolverCliente("AV", "", prefijos)).toBe("AV");
    expect(resolverCliente("Av", "_2", prefijos)).toBeNull();
    expect(resolverCliente("AEP", "", prefijos)).toBeNull();
  });
});
