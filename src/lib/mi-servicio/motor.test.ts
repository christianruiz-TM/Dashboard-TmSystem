import { describe, expect, it } from "vitest";
import { motorMiServicio } from "./motor";
import type { DatosMiServicio } from "./tipos";

function datosEjemplo(cambios: Partial<DatosMiServicio> = {}): DatosMiServicio {
  return {
    servicio: "GrupoHuertas",
    desde: "2026-11-02",
    hasta: "2026-11-04",
    generado: "06/11/2026 10:00",
    campanias: [
      { nombre: "gh_bbdd_x", tipo: "BBDD", horas: true },
      { nombre: "gh_leads", tipo: null, horas: true },
    ],
    opcionesTipo: [],
    filtro: { tipo: null, campania: null },
    configurado: true,
    niveles: ["Resultado", "Subresultado"],
    filas: [
      { c: "gh_leads", f: "2026-11-02", ll: 100, ge: 60, ex: 10, gu: 5, fi: 40, fe: 12, nv: 8 },
      { c: "gh_leads", f: "2026-11-03", ll: 50, ge: 30, ex: 5, gu: 2.5, fi: 20, fe: 6, nv: 4 },
      { c: "gh_bbdd_x", f: "2026-11-03", ll: 200, ge: 40, ex: 2, gu: 4, fi: 30, fe: 3, nv: 10 },
    ],
    resultados: [
      { c: "gh_leads", r1: "Cita", r2: null, n: 18, fe: 18, nv: 0 },
      { c: "gh_leads", r1: "No valido", r2: "Teléfono erróneo", n: 12, fe: 0, nv: 12 },
      { c: "gh_leads", r1: "No interesado", r2: "Precio", n: 25, fe: 0, nv: 0 },
      { c: "gh_leads", r1: "No interesado", r2: null, n: 5, fe: 0, nv: 0 },
      { c: "gh_bbdd_x", r1: "No valido", r2: "Fallecido", n: 10, fe: 0, nv: 10 },
      { c: "gh_bbdd_x", r1: "Cita", r2: null, n: 3, fe: 3, nv: 0 },
      { c: "gh_bbdd_x", r1: "No interesado", r2: "Precio", n: 17, fe: 0, nv: 0 },
    ],
    horas: { total: 20, dia: { "2026-11-02": 8, "2026-11-03": 7, "2026-11-04": 5 } },
    ...cambios,
  };
}

describe("motor de Mi servicio", () => {
  const m = motorMiServicio();

  it("suma todas las campañas con las horas logadas de la caja 1", () => {
    const p = m.calcular(datosEjemplo());
    expect(p.todas).toBe(true);
    expect(p.kpis).toMatchObject({
      llamadas: 350,
      gestionadas: 130,
      finalizados: 90,
      noValidos: 22,
      exitos: 17,
      finalizadosExito: 21,
      horas: 20,
      tipoHoras: "logadas",
    });
    expect(p.kpis).not.toHaveProperty("llamadasHora");
    expect(p.kpis.pctNoValidos).toBe(24.44);
    expect(p.kpis.pctExitoLlamada).toBe(13.08);
    expect(p.kpis.brutoPct).toBe(23.33);
    expect(p.kpis.netoPct).toBe(30.88); // 21 ÷ (90 − 22)
    expect(p.kpis.finalizadosPorExito).toBe(4.29);
    expect(p.reparto).toEqual({ exito: 21, noValido: 22, resto: 47 });
  });

  it("con una parte de las campañas, las horas son las de la ficha abierta", () => {
    const p = m.calcular(datosEjemplo(), ["gh_leads"]);
    expect(p.todas).toBe(false);
    expect(p.kpis.tipoHoras).toBe("ficha");
    expect(p.kpis.horas).toBe(7.5);
    expect(p.serie.puntos.map((x) => x.ho)).toEqual([5, 2.5, 0]);
    expect(p.campanias.map((c) => c.nombre)).toEqual(["gh_leads"]);
  });

  it("sin horas logadas en los datos (pantalla filtrada), también la ficha", () => {
    const p = m.calcular(datosEjemplo({ horas: null }));
    expect(p.kpis.tipoHoras).toBe("ficha");
    expect(p.kpis.horas).toBe(11.5);
  });

  it("las campañas que no se facturan por horas no llevan horas (12/11/2026)", () => {
    const sinHorasBbdd = (d: DatosMiServicio) => ({
      ...d,
      campanias: d.campanias.map((c) => (c.nombre === "gh_bbdd_x" ? { ...c, horas: false } : c)),
    });
    // Toda la selección: horas de la ficha, sin las de la bbdd
    const ficha = m.calcular(sinHorasBbdd(datosEjemplo({ horas: null })));
    expect(ficha.kpis.tipoHoras).toBe("ficha");
    expect(ficha.kpis.horas).toBe(7.5);
    expect(ficha.serie.puntos.map((x) => x.ho)).toEqual([5, 2.5, 0]);
    expect(ficha.campanias.find((c) => c.nombre === "gh_bbdd_x")?.horasFicha).toBeNull();
    // Solo la bbdd: ninguna hora
    const solo = m.calcular(sinHorasBbdd(datosEjemplo({ horas: null })), ["gh_bbdd_x"]);
    expect(solo.kpis.tipoHoras).toBe("ninguna");
    expect(solo.kpis.horas).toBeNull();
  });

  it("sin «no válidos» configurados no hay no válidos, ni su %, ni neto, ni etapa de válidos", () => {
    const p = m.calcular(datosEjemplo({ configurado: false }));
    expect(p.kpis.noValidos).toBeNull();
    expect(p.kpis.pctNoValidos).toBeNull();
    expect(p.kpis.netoPct).toBeNull();
    expect(p.embudo.map((e) => e.clave)).toEqual(["ll", "fi", "fe"]);
    expect(p.reparto).toEqual({ exito: 21, noValido: null, resto: 69 });
    expect(p.motivos).toEqual([]);
  });

  it("embudo: cada etapa con su % sobre la anterior", () => {
    const p = m.calcular(datosEjemplo());
    expect(p.embudo).toEqual([
      { clave: "ll", etiqueta: "Llamadas", valor: 350, pctAnterior: null },
      { clave: "fi", etiqueta: "Finalizados", valor: 90, pctAnterior: 25.71 },
      { clave: "va", etiqueta: "Válidos", valor: 68, pctAnterior: 75.56 },
      { clave: "fe", etiqueta: "Finalizados con éxito", valor: 21, pctAnterior: 30.88 },
    ]);
  });

  it("resultados con el segundo nivel dentro y «(sin valor)» para el resto", () => {
    const p = m.calcular(datosEjemplo());
    const noInteresado = p.resultados.find((r) => r.nombre === "No interesado")!;
    expect(noInteresado.n).toBe(47);
    expect(noInteresado.hijos).toEqual([
      { nombre: "Precio", n: 42, pct: 46.67 },
      { nombre: "(sin valor)", n: 5, pct: 5.56 },
    ]);
    // Sin ningún segundo nivel, sin hijos
    expect(p.resultados.find((r) => r.nombre === "Cita")!.hijos).toEqual([]);
    expect(p.motivos).toEqual([
      { nombre: "Teléfono erróneo", n: 12, pct: 54.55 },
      { nombre: "Fallecido", n: 10, pct: 45.45 },
    ]);
  });

  it("evolución por día con las horas logadas de cada día", () => {
    const p = m.calcular(datosEjemplo());
    expect(p.serie.granularidad).toBe("dia");
    expect(p.serie.puntos.map((x) => [x.p, x.etiqueta, x.ll, x.ho])).toEqual([
      ["2026-11-02", "lun 02/11", 100, 8],
      ["2026-11-03", "mar 03/11", 250, 7],
      ["2026-11-04", "mié 04/11", 0, 5],
    ]);
  });

  it("pasados 62 días, por semanas ISO (lunes)", () => {
    const per = m.periodos("2026-09-03", "2026-11-04");
    expect(per.granularidad).toBe("semana");
    expect(per.lista[0]).toEqual({ p: "2026-08-31", etiqueta: "sem. 31/08", etiquetaLarga: "Semana del 31/08/2026" });
    expect(per.de["2026-09-06"]).toBe("2026-08-31");
    expect(per.de["2026-09-07"]).toBe("2026-09-07");
    // El cambio de hora del 25/10 no descoloca ningún día
    expect(per.de["2026-10-26"]).toBe("2026-10-26");
    expect(m.periodos("2026-09-04", "2026-11-04").granularidad).toBe("dia");
  });

  it("la copia de texto del motor (la del informe) calcula lo mismo", () => {
    const copia = new Function(`return (${motorMiServicio.toString()})();`)() as ReturnType<typeof motorMiServicio>;
    const datos = datosEjemplo();
    expect(copia.calcular(datos)).toEqual(m.calcular(datos));
    expect(copia.calcular(datos, ["gh_bbdd_x"])).toEqual(m.calcular(datos, ["gh_bbdd_x"]));
    expect(copia.fmt.horas(1384.2)).toBe("1384,20 h");
  });
});
