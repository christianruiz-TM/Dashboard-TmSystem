import { describe, expect, it } from "vitest";
import { formatearMetrica, mejorDeDos, valorMetrica } from "./comparador";

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

  it("solo lee números de la fila", () => {
    const fila = { campania: "x", servicio: null, tipo: "Outbound", a: 3, b: null };
    expect(valorMetrica(fila, "a")).toBe(3);
    expect(valorMetrica(fila, "b")).toBeNull();
    expect(valorMetrica(fila, "tipo")).toBeNull();
    expect(valorMetrica(fila, "no_existe")).toBeNull();
  });
});
