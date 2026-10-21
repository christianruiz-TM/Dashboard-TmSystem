import { describe, expect, it } from "vitest";
import { ordenarPorActividad } from "./actividad-servicios";

describe("orden del selector de clientes", () => {
  it("activos por la llamada más reciente; parados abajo", () => {
    const r = ordenarPorActividad(
      ["Avolo", "Bolsas", "CajaRural", "GrupoHuertas", "Wit"],
      {
        Avolo: "2026-10-20 18:10",
        Bolsas: "2026-10-21 09:15",
        CajaRural: "2026-09-30 11:00",
        GrupoHuertas: "2026-10-21 09:20",
        Wit: null,
      },
      "2026-10-21",
    );
    expect(r.activos.map((s) => s.servicio)).toEqual(["GrupoHuertas", "Bolsas", "Avolo"]);
    expect(r.parados.map((s) => s.servicio)).toEqual(["CajaRural", "Wit"]);
  });

  it("el límite son 7 días: el 14/10 sigue activo el 21/10, el 13/10 ya no", () => {
    const r = ordenarPorActividad(["A", "B"], { A: "2026-10-14 08:00", B: "2026-10-13 23:59" }, "2026-10-21");
    expect(r.activos.map((s) => s.servicio)).toEqual(["A"]);
    expect(r.parados.map((s) => s.servicio)).toEqual(["B"]);
  });
});
