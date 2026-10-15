import { describe, expect, it } from "vitest";
import { clasificarPrefijo, tarificacionPorCampania, tipoDeFila } from "./tarificacion";

describe("clasificarPrefijo (plan de numeración español)", () => {
  it("móviles: 6xx y 71x-74x", () => {
    for (const p of ["600", "677", "699", "711", "722", "744"]) expect(clasificarPrefijo(p)).toBe("movil");
  });

  it("fijos: 8xx y 9xx geográficos", () => {
    for (const p of ["958", "968", "950", "910", "828", "868", "881"]) expect(clasificarPrefijo(p)).toBe("fijo");
  });

  it("sin coste: 800 y 900", () => {
    expect(clasificarPrefijo("800")).toBe("sin_coste");
    expect(clasificarPrefijo("900")).toBe("sin_coste");
  });

  it("especiales: 901-909, 803-807 y personales 70x", () => {
    for (const p of ["901", "902", "905", "803", "806", "807", "700", "704"]) {
      expect(clasificarPrefijo(p)).toBe("especial");
    }
  });

  it("lo demás es otro formato", () => {
    for (const p of ["118", "500", "780", "00", "abc", "0067"]) expect(clasificarPrefijo(p)).toBe("otro");
  });

  it("destinos cortos (hunt group, extensión) y largos no son nacionales", () => {
    expect(tipoDeFila({ formato: "corto", prefijo: null })).toBe("sin_numero");
    expect(tipoDeFila({ formato: "largo", prefijo: null })).toBe("otro");
    expect(tipoDeFila({ formato: "nacional", prefijo: "600" })).toBe("movil");
  });
});

describe("tarificacionPorCampania", () => {
  it("suma por campaña y tipo, y aparta lo de la encuesta", () => {
    const t = tarificacionPorCampania([
      { campania: "gh_a", fuente: "saliente", formato: "nacional", prefijo: "600", llamadas: 10, minutos: 12.5 },
      { campania: "gh_a", fuente: "saliente", formato: "nacional", prefijo: "677", llamadas: 4, minutos: 3.25 },
      { campania: "gh_a", fuente: "ivr", formato: "nacional", prefijo: "600", llamadas: 3, minutos: 1.5 },
      { campania: "gh_a", fuente: "saliente", formato: "nacional", prefijo: "958", llamadas: 1, minutos: 2 },
      { campania: "gh_a", fuente: "saliente", formato: "nacional", prefijo: "900", llamadas: 1, minutos: 4 },
      // Encuesta de una llamada entrante: la paga quien llama
      { campania: "gh_a", fuente: "ivr", formato: "corto", prefijo: null, llamadas: 2, minutos: 1 },
      { campania: "gh_b", fuente: "saliente", formato: "nacional", prefijo: "902", llamadas: 1, minutos: 0.5 },
    ]);
    const a = t.get("gh_a")!;
    expect(a.minutos.movil).toBeCloseTo(17.25, 10);
    expect(a.llamadas.movil).toBe(17);
    expect(a.minutos.fijo).toBe(2);
    expect(a.minutos.sin_coste).toBe(4);
    expect(a.minutos.sin_numero).toBe(1);
    expect(a.minutosEncuesta).toBe(1.5);
    expect(t.get("gh_b")!.minutos.especial).toBe(0.5);
  });
});
