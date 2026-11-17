import { describe, expect, it } from "vitest";
import { categoriaMotivo, etiquetaMotivo, leerConfigMotivos } from "./motivos";

describe("motivos de pausa", () => {
  it("clasificación por defecto (decidida el 16/11/2026)", () => {
    expect(categoriaMotivo(1, "Descanso", {})).toBe("ausencia");
    expect(categoriaMotivo(7, "Servicio", {})).toBe("ausencia");
    expect(categoriaMotivo(3, "Formacion", {})).toBe("trabajo");
    expect(categoriaMotivo(6, "Llamada manual", {})).toBe("trabajo");
    expect(categoriaMotivo(21, "NREADY_REASON_SIGNOFF", {})).toBe("oculto");
    expect(categoriaMotivo(99, "Motivo nuevo", {})).toBe("ausencia");
    expect(categoriaMotivo(null, "Sin razón", {})).toBe("ausencia");
  });

  it("la de RRHH manda", () => {
    expect(categoriaMotivo(7, "Servicio", { "7": "trabajo" })).toBe("trabajo");
  });

  it("nombres de pantalla de los motivos de sistema", () => {
    expect(etiquetaMotivo("EL_FINREADY_REASON_RONA   ")).toBe("No cogió una llamada");
    expect(etiquetaMotivo("Descanso")).toBe("Descanso");
  });

  it("descarta configuración no válida", () => {
    expect(leerConfigMotivos('{"1":"trabajo","2":"otra","x":"ausencia"}')).toEqual({ "1": "trabajo" });
    expect(leerConfigMotivos("no es json")).toEqual({});
    expect(leerConfigMotivos(null)).toEqual({});
  });
});
