import { describe, expect, it } from "vitest";
import { GLOSARIO } from "@/lib/glosario";
import {
  GLOSARIO_DIRECCION,
  SECCIONES_DIRECCION,
  hrefSeccionDireccion,
  leerSeccionDireccion,
} from "@/lib/direccion-secciones";

describe("secciones de Dirección", () => {
  it("lee la sección de la URL y cae en el resumen si no la conoce", () => {
    expect(leerSeccionDireccion("tendencias")).toBe("tendencias");
    expect(leerSeccionDireccion(undefined)).toBe("resumen");
    expect(leerSeccionDireccion("x")).toBe("resumen");
  });

  it("todas las claves del glosario de cada sección existen", () => {
    for (const s of SECCIONES_DIRECCION) {
      for (const clave of GLOSARIO_DIRECCION[s]) expect(GLOSARIO[clave], `${s}: ${clave}`).toBeDefined();
    }
  });

  it("los enlaces conservan rango, cliente e IVR", () => {
    expect(hrefSeccionDireccion("resumen", { desde: "2026-11-01", hasta: "2026-11-12" })).toBe(
      "/direccion?desde=2026-11-01&hasta=2026-11-12",
    );
    expect(
      hrefSeccionDireccion("salientes", { desde: "2026-10-01", hasta: "2026-10-31", servicio: "GrupoHuertas", incluirIvr: true }),
    ).toBe("/direccion?seccion=salientes&desde=2026-10-01&hasta=2026-10-31&servicio=GrupoHuertas&ivr=1");
  });
});
