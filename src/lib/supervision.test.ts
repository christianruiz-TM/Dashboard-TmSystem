import { describe, expect, it } from "vitest";
import type { RatiosCampania } from "@/lib/ratios-exito";
import type { KpiCampaniaHoy } from "@/lib/rdb/types";
import { agruparKpisPorTipo, filasCampaniaSupervision, sumarKpis } from "./supervision";

function kpi(campania: string, p: Partial<KpiCampaniaHoy> = {}): KpiCampaniaHoy {
  return {
    campania,
    tipo: "Outbound",
    recibidas: 0,
    atendidas: 0,
    conversaciones: 0,
    contactos: 0,
    abandonadas: 0,
    atendidasInbound: 0,
    abandonadasInbound: 0,
    exitos: 0,
    ahtSeg: null,
    acwSeg: null,
    colaMediaSeg: null,
    esperaAbandonadasSeg: null,
    colaAtendidasTotalSeg: 0,
    esperaAbandonadasTotalSeg: 0,
    slaPct: null,
    atendidasFueraSla: 0,
    ...p,
  };
}

describe("total de un grupo de campañas", () => {
  // Una entrante grande con buen SLA y una pequeña con malo
  const a = kpi("gh_entrantes", {
    recibidas: 100,
    atendidas: 90,
    atendidasInbound: 90,
    abandonadasInbound: 10,
    colaAtendidasTotalSeg: 900,
    esperaAbandonadasTotalSeg: 300,
    atendidasFueraSla: 9,
    slaPct: 90,
    ahtSeg: 200,
    acwSeg: 20,
    exitos: 5,
  });
  const b = kpi("gh_bbdd_x", {
    recibidas: 10,
    atendidas: 30,
    atendidasInbound: 6,
    abandonadasInbound: 4,
    colaAtendidasTotalSeg: 240,
    esperaAbandonadasTotalSeg: 40,
    atendidasFueraSla: 3,
    slaPct: 50,
    ahtSeg: 100,
    acwSeg: null,
    exitos: 2,
  });

  it("SLA, cola y espera desde los recuentos, no promediando % ni medias", () => {
    const t = sumarKpis([a, b], "Total");
    expect(t.slaPct).toBe(87.5); // (96 − 12) / 96, no (90 + 50) / 2
    expect(t.colaMediaSeg).toBeCloseTo(11.875); // 1.140 / 96
    expect(t.esperaAbandonadasSeg).toBeCloseTo(24.2857); // 340 / 14
    expect(t.recibidas).toBe(110);
    expect(t.abandonadasInbound).toBe(14);
    expect(t.exitos).toBe(7);
    expect(t.campania).toBe("Total");
  });

  it("AHT y ACW ponderados por atendidas, sin contar las campañas sin dato", () => {
    const t = sumarKpis([a, b], "Total");
    expect(t.ahtSeg).toBe(175); // (200×90 + 100×30) / 120
    expect(t.acwSeg).toBe(20); // solo a: b no tiene ACW
  });

  it("sin entrantes no hay SLA ni cola (null, no 0)", () => {
    const t = sumarKpis([kpi("sal", { atendidas: 50, ahtSeg: 90 })], "Total");
    expect(t.slaPct).toBeNull();
    expect(t.colaMediaSeg).toBeNull();
    expect(t.ahtSeg).toBe(90);
  });

  it("agrupa por tipo (GH: BBDD y resto) con el total de cada grupo", () => {
    const g = agruparKpisPorTipo([a, b], [{ nombre: "BBDD", patrones: ["%bbdd%"] }]);
    expect(g.map((x) => [x.nombre, x.kpis.map((k) => k.campania), x.total.campania, x.total.recibidas])).toEqual([
      ["BBDD", ["gh_bbdd_x"], "Total BBDD", 10],
      ["Resto", ["gh_entrantes"], "Total Resto", 100],
    ]);
    expect(agruparKpisPorTipo([a, b], [])).toHaveLength(1);
  });
});

describe("filas del comparador", () => {
  it("junta la tabla y los ratios, con el SLA desde los recuentos", () => {
    const r: RatiosCampania = {
      campania: "Bol_0365",
      marcaSinExito: false,
      contactos: 300,
      atendidas: 560,
      exitos: 6,
      convContactosPct: 2,
      convAtendidasPct: 1.07,
      efectividadPct: null,
      horasGuion: 12,
      llamadasHoraGuion: 46.67,
      exitosHoraGuion: 0.5,
      conversacionPorExitoSeg: 300,
      gestionPorExitoSeg: 470,
      gestionPorNoExitoSeg: 140,
      muestraPequenia: false,
    };
    const filas = filasCampaniaSupervision(
      [kpi("gh_entrantes", { recibidas: 3, atendidasInbound: 3, atendidasFueraSla: 1, slaPct: 66.7 })],
      [r],
      { Bol_0365: "Bolsas" },
    );
    const gh = filas.find((f) => f.campania === "gh_entrantes")!;
    expect(gh.slaPct).toBeCloseTo(66.6667);
    expect(gh.servicio).toBeNull();
    const bol = filas.find((f) => f.campania === "Bol_0365")!;
    // Sin fila en la tabla: los éxitos y ratios salen de los ratios
    expect(bol).toMatchObject({ servicio: "Bolsas", exitos: 6, contactos: 300, recibidas: 0, slaPct: null });
  });
});
