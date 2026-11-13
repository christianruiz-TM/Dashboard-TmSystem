import { describe, expect, it } from "vitest";
import { GLOSARIO } from "@/lib/glosario";
import {
  GLOSARIO_SECCION,
  SECCIONES_SUPERVISION,
  datosDeSeccion,
  hrefSeccion,
  leerSeccion,
} from "@/lib/supervision-secciones";

describe("secciones de Supervisión", () => {
  it("lee la sección de la URL y cae en el resumen si no la conoce", () => {
    expect(leerSeccion("agentes")).toBe("agentes");
    expect(leerSeccion(undefined)).toBe("resumen");
    expect(leerSeccion("inventada")).toBe("resumen");
  });

  it("cada sección pide solo sus consultas; Tiempo real añade los KPIs de la franja", () => {
    expect([...datosDeSeccion("entrantes", false)].sort()).toEqual(["callback", "ivr"]);
    expect(datosDeSeccion("entrantes", true).has("kpis")).toBe(true);
    // El IVR (la consulta lenta) solo lo pide su pestaña
    for (const s of SECCIONES_SUPERVISION) {
      expect(datosDeSeccion(s, true).has("ivr")).toBe(s === "entrantes");
    }
  });

  it("todas las claves del glosario de cada sección existen", () => {
    for (const s of SECCIONES_SUPERVISION) {
      for (const clave of GLOSARIO_SECCION[s]) expect(GLOSARIO[clave], `${s}: ${clave}`).toBeDefined();
    }
  });

  it("los enlaces conservan cliente, IVR y rango (solo en Histórico)", () => {
    expect(hrefSeccion("resumen", { vista: "tiempo-real" })).toBe("/supervision");
    expect(hrefSeccion("agentes", { vista: "tiempo-real", servicio: "GrupoHuertas", incluirIvr: true })).toBe(
      "/supervision?seccion=agentes&servicio=GrupoHuertas&ivr=1",
    );
    expect(
      hrefSeccion("salientes", { vista: "historico", desde: "2026-11-01", hasta: "2026-11-11" }),
    ).toBe("/supervision?vista=historico&seccion=salientes&desde=2026-11-01&hasta=2026-11-11");
  });
});
