import { describe, expect, it } from "vitest";
import { GLOSARIO } from "@/lib/glosario";
import {
  GLOSARIO_OPERACIONES,
  VISTAS_OPERACIONES,
  hrefVistaOperaciones,
  leerVistaOperaciones,
} from "@/lib/operaciones-secciones";

describe("secciones de Operaciones", () => {
  it("lee la vista de la URL; las de antes siguen valiendo y lo desconocido es la factura", () => {
    for (const v of ["facturacion", "cerrados", "listas", "pausas"]) expect(leerVistaOperaciones(v)).toBe(v);
    expect(leerVistaOperaciones("horas")).toBe("horas");
    expect(leerVistaOperaciones(undefined)).toBe("facturacion");
    expect(leerVistaOperaciones("x")).toBe("facturacion");
  });

  it("todas las claves del glosario de cada sección existen", () => {
    for (const v of VISTAS_OPERACIONES) {
      for (const clave of GLOSARIO_OPERACIONES[v]) expect(GLOSARIO[clave], `${v}: ${clave}`).toBeDefined();
    }
  });

  it("los enlaces conservan cliente, rango e IVR; la factura no lleva vista", () => {
    expect(hrefVistaOperaciones("facturacion", { servicio: "GrupoHuertas", desde: "2026-10-01", hasta: "2026-10-31" })).toBe(
      "/operaciones?servicio=GrupoHuertas&desde=2026-10-01&hasta=2026-10-31",
    );
    expect(hrefVistaOperaciones("horas", { servicio: "todos", desde: "2026-11-01", hasta: "2026-11-13", incluirIvr: true })).toBe(
      "/operaciones?vista=horas&servicio=todos&desde=2026-11-01&hasta=2026-11-13&ivr=1",
    );
  });
});
