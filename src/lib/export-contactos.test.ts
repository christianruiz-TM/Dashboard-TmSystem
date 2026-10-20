import { describe, expect, it } from "vitest";
import {
  EXPORT_CONTACTOS,
  definicionExportContactos,
  filasExportContactos,
  nombreArchivoExport,
  type ContactoExport,
} from "./export-contactos";

const contacto: ContactoExport = {
  campania: "gh_skoda_mur",
  cierre: new Date(2026, 8, 1, 9, 4, 2),
  niveles: [762, null],
  perfil: { unique_id: "# 1050913", phone_01_value: "602837994 ", phone_02_value: "" },
  directorio: { dir_fdlt_nombre: "  Ahmed  ", dir_fdlt_idllamada: 8200814 },
  actividad: { nombre_campdig: "HUE1306_SKODA_PROPIA_VN_SCALA_LIQUIDACION_05082026" },
};

describe("CSV de contactos finalizados", () => {
  it("GH: las columnas de su listado, en orden y sin idcall", () => {
    const titulos = definicionExportContactos("GrupoHuertas")!.map((c) => c.titulo);
    expect(titulos).toEqual([
      "Campaña",
      "Perfil del Directorio.ID Único",
      "dir_fdlt_nombre",
      "resultado",
      "subresultado",
      "Fecha",
      "nombre_campdig",
      "dir_fdlt_idllamada",
      "Contacto.Telefono01",
      "Contacto.Telefono02",
    ]);
    expect(definicionExportContactos("Bolsas")).toBeNull();
    expect(definicionExportContactos(undefined)).toBeNull();
  });

  it("textos del resultado, fecha local con segundos y sin espacios de relleno", () => {
    const [fila] = filasExportContactos(EXPORT_CONTACTOS.GrupoHuertas, [contacto], { 762: "Venta" });
    expect(fila).toEqual([
      "gh_skoda_mur",
      "# 1050913",
      "Ahmed",
      "Venta",
      null,
      "01/09/2026 09:04:02",
      "HUE1306_SKODA_PROPIA_VN_SCALA_LIQUIDACION_05082026",
      8200814,
      "602837994",
      null,
    ]);
  });

  it("un código sin texto sale como #código", () => {
    const [fila] = filasExportContactos(EXPORT_CONTACTOS.GrupoHuertas, [{ ...contacto, niveles: [999, 5] }], {});
    expect(fila.slice(3, 5)).toEqual(["#999", "#5"]);
  });

  it("nombre del fichero con el cliente, el rango y si va filtrado", () => {
    expect(nombreArchivoExport("GrupoHuertas", "2026-09-01", "2026-09-30", false)).toBe(
      "contactos_GrupoHuertas_2026-09-01_2026-09-30.csv",
    );
    expect(nombreArchivoExport("GrupoHuertas", "2026-09-01", "2026-09-30", true)).toBe(
      "contactos_GrupoHuertas_2026-09-01_2026-09-30_filtrado.csv",
    );
  });
});
