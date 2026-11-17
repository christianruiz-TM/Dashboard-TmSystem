import { describe, expect, it } from "vitest";
import { leerTiposCampania } from "@/lib/resultados-actividad";
import {
  SIN_FILTRO_TIPO,
  campaniasDelTipo,
  etiquetaTipo,
  leerFiltroTipo,
  parametroTipo,
  sinHorasDelTipo,
} from "@/lib/tipo-panel";

const tipos = leerTiposCampania("BBDD: gh_bbdd_%")!;
const campanias = ["gh_bbdd_dimovil", "gh_bbdd_granada", "gh_la_mur_toyota", "gh_skoda_mur"];

describe("filtro por tipo de campaña en los paneles", () => {
  it("por defecto «Sin BBDD» (no va en la URL); «Todas» va como tipo=todas", () => {
    const f = leerFiltroTipo(undefined, tipos, true);
    expect(f.opciones.map((o) => o.etiqueta)).toEqual(["Todas", "Sin BBDD", "Solo BBDD"]);
    expect(f.tipo).toBe("resto");
    expect(f.defecto).toBe("resto");
    expect(parametroTipo(f)).toBeUndefined();
    expect(etiquetaTipo(f)).toBe("Sin BBDD");

    const todas = leerFiltroTipo("todas", tipos, true);
    expect(todas.tipo).toBe("todas");
    expect(parametroTipo(todas)).toBe("todas");
    expect(etiquetaTipo(todas)).toBeNull();

    expect(parametroTipo(leerFiltroTipo("solo:BBDD", tipos, true))).toBe("solo:BBDD");
  });

  it("sin «empiezaSinTodas» se queda como antes: por defecto «Todas»", () => {
    const f = leerFiltroTipo(undefined, tipos, false);
    expect(f.tipo).toBe("todas");
    expect(parametroTipo(f)).toBeUndefined();
    expect(parametroTipo(leerFiltroTipo("resto", tipos, false))).toBe("resto");
  });

  it("un valor que no es de este cliente vuelve a lo de por defecto; sin tipos no hay filtro", () => {
    expect(leerFiltroTipo("solo:Cartera", tipos, true).tipo).toBe("resto");
    expect(leerFiltroTipo("resto", [], true)).toEqual(SIN_FILTRO_TIPO);
  });

  it("filtra las campañas; sin cliente (undefined) no toca nada", () => {
    expect(campaniasDelTipo(campanias, tipos, "resto")).toEqual(["gh_la_mur_toyota", "gh_skoda_mur"]);
    expect(campaniasDelTipo(campanias, tipos, "solo:BBDD")).toEqual(["gh_bbdd_dimovil", "gh_bbdd_granada"]);
    expect(campaniasDelTipo(campanias, tipos, "todas")).toEqual(campanias);
    expect(campaniasDelTipo(undefined, tipos, "resto")).toBeUndefined();
  });

  it("sin horas solo con un tipo cuyas campañas se facturan todas sin horas", () => {
    // Como GH: las bbdd por contactos, el resto por horas logadas
    const porHoras = (c: string) => !c.startsWith("gh_bbdd_");
    expect(sinHorasDelTipo(["gh_bbdd_dimovil", "gh_bbdd_granada"], "solo:BBDD", porHoras)).toBe(true);
    expect(sinHorasDelTipo(["gh_la_mur_toyota"], "resto", porHoras)).toBe(false);
    expect(sinHorasDelTipo(campanias, "todas", porHoras)).toBe(false);
    // Una campaña sin configurar (null) no quita las horas
    expect(sinHorasDelTipo(["gh_bbdd_dimovil"], "solo:BBDD", () => null)).toBe(false);
    expect(sinHorasDelTipo([], "solo:BBDD", porHoras)).toBe(false);
  });
});
