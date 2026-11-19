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

  it("los fallidos van en el resumen (la casilla) y en su pestaña, en las dos vistas (19/11/2026)", () => {
    for (const enVivo of [false, true]) {
      expect(datosDeSeccion("resumen", enVivo).has("fallidos")).toBe(true);
      expect(datosDeSeccion("fallidos", enVivo).has("fallidos")).toBe(true);
      expect(datosDeSeccion("agentes", enVivo).has("fallidos")).toBe(false);
    }
    expect(hrefSeccion("fallidos", { vista: "tiempo-real", servicio: "CEFF" })).toBe("/supervision?seccion=fallidos&servicio=CEFF");
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

  it("conservan el tipo de campaña, solo con cliente (17/11/2026)", () => {
    expect(hrefSeccion("exitos", { vista: "tiempo-real", servicio: "GrupoHuertas", tipo: "solo:BBDD" })).toBe(
      "/supervision?seccion=exitos&servicio=GrupoHuertas&tipo=solo%3ABBDD",
    );
    expect(hrefSeccion("exitos", { vista: "tiempo-real", tipo: "todas" })).toBe("/supervision?seccion=exitos");
  });
});
