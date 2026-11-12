import { describe, expect, it } from "vitest";
import type { BaseResultados } from "@/lib/rdb/types";
import { armarDatosMiServicio, type EntradaMiServicio } from "./datos";
import { dibujoMiServicio } from "./dibujo";
import { informeHtml, nombreFicheroInforme } from "./informe";
import { motorMiServicio } from "./motor";
import { notasInternas } from "./glosario";
import { vistaMiServicio } from "./vista";

function resultados(filas: BaseResultados["filas"], configurado = true): BaseResultados {
  return {
    filas,
    textos: { 1: "Cita", 2: "No valido", 3: "Teléfono erróneo", 4: "No interesado" },
    servicioDeCampania: {},
    niveles: { GrupoHuertas: ["Resultado", "Subresultado"] },
    serviciosConfigurados: configurado ? ["GrupoHuertas"] : [],
  };
}

function entrada(cambios: Partial<EntradaMiServicio> = {}): EntradaMiServicio {
  const fila = (campania: string, fecha: string, codigos: (number | null)[], contactos: number, exitos: number, noValidos: number) => ({
    fecha,
    campania,
    agente: "GH_0851",
    nombre: "Agente",
    categoria: "tipificado" as const,
    codigos,
    contactos,
    exitos,
    noValidos,
    llamadasExitos: 0,
    exitosConLlamadas: 0,
  });
  return {
    servicio: "GrupoHuertas",
    desde: "2026-11-02",
    hasta: "2026-11-03",
    generado: "06/11/2026 10:00",
    tipos: [{ nombre: "BBDD", patrones: ["gh_bbdd_%"] }],
    filtro: { tipo: null, campania: null },
    llamadas: [
      { fecha: "2026-11-02", campania: "gh_leads", llamadas: 100 },
      { fecha: "2026-11-02", campania: "gh_bbdd_x", llamadas: 40 },
      { fecha: "2026-11-03", campania: "gh_vacia", llamadas: 0 },
    ],
    actividad: [{ fecha: "2026-11-02", campania: "gh_leads", gestionadas: 60, exitos: 9, guionSeg: 7200 }],
    resultados: resultados([
      fila("gh_leads", "2026-11-02", [1, null, null], 9, 9, 0),
      fila("gh_leads", "2026-11-03", [2, 3, null], 5, 0, 5),
      fila("gh_bbdd_x", "2026-11-03", [4, null, null], 6, 0, 0),
      // Cierre administrativo: cuenta como cerrado (facturación), no como finalizado
      { ...fila("gh_leads", "2026-11-03", [null, null, null], 3, 0, 0), categoria: "administrativo", agente: null },
    ]),
    configurado: true,
    // La bbdd se factura por contactos: sin horas (12/11/2026)
    sinHoras: ["gh_bbdd_x"],
    horas: {
      total: 15.5,
      usuarios: ["GH_0851", "GH_0900"],
      porUsuarioDia: [
        { agente: "GH_0851", fecha: "2026-11-02", horas: 8 },
        { agente: "GH_0900", fecha: "2026-11-03", horas: 7.5 },
        // De otro cliente: no cuenta
        { agente: "UGR_0851", fecha: "2026-11-03", horas: 6 },
      ],
    },
    ...cambios,
  };
}

describe("armado de los datos", () => {
  it("junta llamadas, actividad y resultados por campaña y día", () => {
    const { datos, cerrados } = armarDatosMiServicio(entrada());
    expect(cerrados).toBe(23);
    // Sin datos, la campaña no sale; de la A a la Z
    expect(datos.campanias).toEqual([
      { nombre: "gh_bbdd_x", tipo: "BBDD", horas: false },
      { nombre: "gh_leads", tipo: null, horas: true },
    ]);
    expect(datos.filas).toEqual([
      { c: "gh_bbdd_x", f: "2026-11-02", ll: 40, ge: 0, ex: 0, gu: 0, fi: 0, fe: 0, nv: 0 },
      { c: "gh_leads", f: "2026-11-02", ll: 100, ge: 60, ex: 9, gu: 2, fi: 9, fe: 9, nv: 0 },
      { c: "gh_bbdd_x", f: "2026-11-03", ll: 0, ge: 0, ex: 0, gu: 0, fi: 6, fe: 0, nv: 0 },
      { c: "gh_leads", f: "2026-11-03", ll: 0, ge: 0, ex: 0, gu: 0, fi: 5, fe: 0, nv: 5 },
    ]);
    expect(datos.resultados).toContainEqual({ c: "gh_leads", r1: "No valido", r2: "Teléfono erróneo", n: 5, fe: 0, nv: 5 });
    expect(datos.horas).toEqual({ total: 15.5, dia: { "2026-11-02": 8, "2026-11-03": 7.5 } });
    expect(datos.opcionesTipo).toEqual([
      { etiqueta: "Todas", campanias: ["gh_bbdd_x", "gh_leads"] },
      { etiqueta: "Sin BBDD", campanias: ["gh_leads"] },
      { etiqueta: "Solo BBDD", campanias: ["gh_bbdd_x"] },
    ]);
  });

  it("sin «no válidos» configurados no hay no válidos ni desglose", () => {
    const { datos } = armarDatosMiServicio(entrada({ configurado: false }));
    expect(datos.filas.reduce((s, f) => s + f.nv, 0)).toBe(0);
    expect(datos.resultados).toEqual([]);
  });
});

describe("dibujo", () => {
  const d = dibujoMiServicio(motorMiServicio().fmt);
  it("escapa los textos (nombres de campaña, resultados)", () => {
    const svg = d.composicion(
      [{ nombre: '<img src=x onerror="alert(1)">', total: 3, fe: 1, nv: 1, detalle: "a & b", globo: ["<b>", "línea 2"] }],
      "Título <x>",
    );
    expect(svg).not.toContain("<img");
    expect(svg).toContain("&lt;img");
    expect(svg).toContain("a &amp; b");
    expect(svg).toContain('data-tip="&lt;b&gt;&#10;línea 2"');
  });

  it("columnas con el extremo redondeado y nada sin datos", () => {
    const m = motorMiServicio();
    const per = m.periodos("2026-11-02", "2026-11-03");
    const puntos = per.lista.map((x, i) => ({ ...x, ll: i === 0 ? 10 : 0, fi: 0, ex: 0, ho: 0, fe: 0, nv: 0 }));
    const svg = d.tira(puntos, [{ clave: "ll", titulo: "Llamadas", color: "--ms-ll", formato: "entero" }]);
    expect(svg.match(/class="ms-barra"/g)?.length).toBe(1);
    expect(svg.match(/class="ms-zona"/g)?.length).toBe(2);
    expect(svg).toContain("Llamadas: 10");
  });
});

describe("informe", () => {
  const { datos, cerrados } = armarDatosMiServicio(entrada());

  it("es un solo fichero sin nada de fuera", () => {
    const html = informeHtml(datos, { comentarios: null });
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).not.toMatch(/(src|href)="(https?:)?\/\//);
    expect(html).not.toMatch(/<script[^>]+src=/);
    expect(html).toContain('src="data:image/png;base64,');
    // Ya pintado (se lee sin JavaScript)
    expect(html).toContain('<div id="ms-kpis"><div class="t-fila');
  });

  it("los comentarios van escapados y conservan los saltos de línea", () => {
    const html = informeHtml(datos, { comentarios: "Hola <script>alert(1)</script>\nadiós" });
    expect(html).toContain("Hola &lt;script&gt;alert(1)&lt;/script&gt;&#10;adiós");
    expect(html.match(/<\/script>/g)?.length).toBe(2);
  });

  it("ningún texto de los datos puede cerrar la etiqueta de los datos", () => {
    const raro = armarDatosMiServicio(entrada({ servicio: "A</script><script>alert(1)//" })).datos;
    const html = informeHtml(raro, { comentarios: null });
    expect(html.match(/<\/script>/g)?.length).toBe(2);
  });

  it("no lleva lo interno (cerrados de facturación, notas de los roles internos)", () => {
    const html = informeHtml(datos, { comentarios: null });
    const notas = notasInternas({ cerrados, prefijo: "GH" });
    for (const nota of Object.values(notas)) expect(html).not.toContain(nota!.slice(0, 40));
    expect(html).not.toContain("GH_0851");
  });

  it("nombre del fichero", () => {
    expect(nombreFicheroInforme(datos)).toBe("Informe GrupoHuertas 2026-11-02 a 2026-11-03.html");
    expect(nombreFicheroInforme({ ...datos, servicio: "Ávolo/€", hasta: datos.desde })).toBe("Informe Ávolo 2026-11-02.html");
  });

  it("la copia de texto de la vista pinta lo mismo que la original", () => {
    const m = motorMiServicio();
    const d = dibujoMiServicio(m.fmt);
    const v = vistaMiServicio(m, d);
    const copia = new Function(
      "m",
      "d",
      `var __name=function(f){return f};return (${vistaMiServicio.toString()})(m,d);`,
    )(m, d) as ReturnType<typeof vistaMiServicio>;
    const panel = m.calcular(datos, ["gh_leads"]);
    expect(copia.secciones(datos, panel, {})).toEqual(v.secciones(datos, panel, {}));
  });
});
