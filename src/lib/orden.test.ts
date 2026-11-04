import { describe, expect, it } from "vitest";
import { compararTexto, compararValores, ordenarPorTexto } from "./orden";

describe("orden alfabético (04/11/2026)", () => {
  it("sin distinguir mayúsculas ni tildes y con los números en su orden", () => {
    const campanias = ["gh_skoda", "Bol_1200", "GH_Audi", "Bol_0365", "Ávolo_Citas", "Avo_Info", "gh_bbdd_x"];
    expect([...campanias].sort(compararTexto)).toEqual(["Avo_Info", "Ávolo_Citas", "Bol_0365", "Bol_1200", "GH_Audi", "gh_bbdd_x", "gh_skoda"]);
    expect(ordenarPorTexto([{ u: "GH_1067" }, { u: "GH_0851" }, { u: "UGR_0851" }], (x) => x.u).map((x) => x.u)).toEqual([
      "GH_0851",
      "GH_1067",
      "UGR_0851",
    ]);
  });

  it("valores: números de menor a mayor (o al revés) y los vacíos siempre al final", () => {
    const v = [3, null, 10, undefined, 1];
    expect([...v].sort((a, b) => compararValores(a, b))).toEqual([1, 3, 10, null, undefined]);
    expect([...v].sort((a, b) => compararValores(a, b, true))).toEqual([10, 3, 1, null, undefined]);
    expect(["b", null, "A"].sort((a, b) => compararValores(a, b, true))).toEqual(["b", "A", null]);
  });
});
