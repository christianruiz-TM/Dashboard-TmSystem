import { describe, expect, it } from "vitest";
import { DIAS_REHACER, rangoAutomaticoAgregados } from "./agregados-rango";

describe("rangoAutomaticoAgregados", () => {
  it("con todo al día rehace los últimos 7 días hasta ayer", () => {
    expect(DIAS_REHACER).toBe(7);
    expect(rangoAutomaticoAgregados("2026-11-09", "2026-11-10")).toEqual({ desde: "2026-11-04", hasta: "2026-11-10" });
  });

  it("si una noche falló, rellena el hueco desde el día siguiente al último agregado", () => {
    // Falta el 10/11 y ayer es el 11/11: la ventana de 7 días ya lo cubre
    expect(rangoAutomaticoAgregados("2026-11-09", "2026-11-11")).toEqual({ desde: "2026-11-05", hasta: "2026-11-11" });
    // Diez días sin correr: empieza en el primer día sin agregar
    expect(rangoAutomaticoAgregados("2026-10-31", "2026-11-11")).toEqual({ desde: "2026-11-01", hasta: "2026-11-11" });
  });

  it("con la tabla vacía, los últimos 7 días", () => {
    expect(rangoAutomaticoAgregados(null, "2026-11-10")).toEqual({ desde: "2026-11-04", hasta: "2026-11-10" });
  });

  it("cruza meses y años en hora local", () => {
    expect(rangoAutomaticoAgregados("2026-12-31", "2027-01-02")).toEqual({ desde: "2026-12-27", hasta: "2027-01-02" });
  });

  it("si ya se agregó ayer (segunda ejecución del día), vuelve a rehacer la semana", () => {
    expect(rangoAutomaticoAgregados("2026-11-10", "2026-11-10")).toEqual({ desde: "2026-11-04", hasta: "2026-11-10" });
  });
});
