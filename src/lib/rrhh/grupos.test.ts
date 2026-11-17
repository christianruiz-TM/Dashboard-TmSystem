import { describe, expect, it } from "vitest";
import { grupoAutomatico, leerGrupo } from "./grupos";

describe("grupoAutomatico", () => {
  it("la plantilla de Planificación es GH (multicliente), aunque su usuario sea de otro cliente", () => {
    expect(grupoAutomatico({ enPlanificacion: true, codigo: "Av_0940" })).toBe("gh");
    expect(grupoAutomatico({ enPlanificacion: true, codigo: "CR_0985" })).toBe("gh");
    expect(grupoAutomatico({ enPlanificacion: true, codigo: "Bol_0001" })).toBe("gh");
  });

  it("fuera de la plantilla, por el prefijo del usuario principal", () => {
    expect(grupoAutomatico({ enPlanificacion: false, codigo: "Bol_0927" })).toBe("bolsas");
    expect(grupoAutomatico({ enPlanificacion: false, codigo: "Soc_1131" })).toBe("socios");
    expect(grupoAutomatico({ enPlanificacion: false, codigo: "Soc_Fed_0892" })).toBe("socios");
    expect(grupoAutomatico({ enPlanificacion: false, codigo: "UGR_0851" })).toBe("gh");
    expect(grupoAutomatico({ enPlanificacion: false, codigo: "1053" })).toBe("gh");
  });
});

describe("leerGrupo", () => {
  it("solo los tres grupos; lo demás es «todos»", () => {
    expect(leerGrupo("bolsas")).toBe("bolsas");
    expect(leerGrupo("BOLSAS")).toBeNull();
    expect(leerGrupo(undefined)).toBeNull();
  });
});
