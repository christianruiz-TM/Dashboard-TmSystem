import { describe, expect, it } from "vitest";
import type { BillingConfigRow } from "@/lib/db/schema";
import type { FacturacionHorasLogadas } from "@/lib/facturacion-horas-logadas";
import type { TarificacionCampania } from "@/lib/tarificacion";
import {
  consolidarFactura,
  etiquetaCampania,
  aplicarAjustes,
  facturarCampanias,
  importeVigente,
  filasDeCierre,
  lineasDeCierre,
  totalesFactura,
  type ConfigFacturacion,
} from "./facturacion-campania";

let id = 0;
function linea(
  ambito: { servicio: string } | { campania: string },
  unidad: BillingConfigRow["unidad"],
  precio: number | null,
  soloConActividad = false,
): BillingConfigRow {
  return {
    id: ++id,
    serviceName: "servicio" in ambito ? ambito.servicio : null,
    campaignShortname: "campania" in ambito ? ambito.campania : null,
    unidad,
    prefijoUsuario: unidad === "horas_logadas" ? "GH" : null,
    precioUnitario: precio,
    notas: null,
    activo: true,
    soloConActividad,
  };
}

// Como GrupoHuertas: horas logadas, minutos y DDIs por servicio; la bbdd, por contactos
const config: ConfigFacturacion = {
  porServicio: new Map([
    [
      "GrupoHuertas",
      [
        linea({ servicio: "GrupoHuertas" }, "horas_logadas", 28),
        linea({ servicio: "GrupoHuertas" }, "minutos_fijo", 0.02),
        linea({ servicio: "GrupoHuertas" }, "minutos_movil", 0.05),
        linea({ servicio: "GrupoHuertas" }, "ddi", 2.5),
      ],
    ],
  ]),
  porCampania: new Map([
    // La bbdd solo paga su DDI los meses con llamadas (entre tandas, no)
    ["gh_bbdd_x", [linea({ campania: "gh_bbdd_x" }, "leads", 2), linea({ campania: "gh_bbdd_x" }, "ddi", 2.5, true)]],
  ]),
};

const mapa = new Map([
  ["gh_toyota", "GrupoHuertas"],
  ["gh_seat", "GrupoHuertas"],
  ["gh_parada", "GrupoHuertas"],
  ["gh_bbdd_x", "GrupoHuertas"],
  ["otra", "OtroCliente"],
]);

function tarif(campania: string, movil: number, fijo: number): TarificacionCampania {
  return {
    campania,
    minutos: { movil, fijo, especial: 0, sin_coste: 3, sin_numero: 0, otro: 0 },
    llamadas: { movil: 1, fijo: 1, especial: 0, sin_coste: 1, sin_numero: 0, otro: 0 },
    minutosEncuesta: 0,
  };
}

const unidades = [
  { campania: "gh_toyota", horasProductivas: 10, interacciones: 100, atendidas: 60, exitos: 5, leadsFinalizados: 0 },
  { campania: "gh_bbdd_x", horasProductivas: 4, interacciones: 50, atendidas: 30, exitos: 3, leadsFinalizados: 574 },
  { campania: "otra", horasProductivas: 2, interacciones: 10, atendidas: 8, exitos: 0, leadsFinalizados: 0 },
];

const extras = {
  tarificacion: new Map([
    ["gh_toyota", tarif("gh_toyota", 652.824, 3.304)],
    ["gh_seat", tarif("gh_seat", 21.12, 0)],
  ]),
  ddisPorMes: new Map([
    ["gh_toyota", new Map([["2026-09", 6]])],
    ["gh_seat", new Map([["2026-09", 5]])],
    ["gh_parada", new Map([["2026-09", 2]])],
    ["gh_bbdd_x", new Map([["2026-09", 1]])],
  ]),
  mesesConLlamadas: new Map([
    ["gh_toyota", new Set(["2026-09"])],
    ["gh_bbdd_x", new Set(["2026-09"])],
  ]),
};

describe("facturarCampanias", () => {
  const r = facturarCampanias(config, unidades, mapa, extras);
  const de = (c: string) => r.find((f) => f.campania === c)!;

  it("salen también las campañas que solo tienen minutos o DDIs", () => {
    expect(r.map((f) => f.campania)).toEqual(["gh_toyota", "gh_bbdd_x", "otra", "gh_parada", "gh_seat"]);
  });

  it("cobra minutos (redondeados a centésimas) y DDIs con la config del servicio", () => {
    expect(de("gh_toyota").lineas).toEqual([
      { unidad: "minutos_fijo", cantidad: 3.3, precioUnitario: 0.02, importe: 0.07, notas: null },
      { unidad: "minutos_movil", cantidad: 652.82, precioUnitario: 0.05, importe: 32.64, notas: null },
      { unidad: "ddi", cantidad: 6, precioUnitario: 2.5, importe: 15, notas: null },
    ]);
    expect(de("gh_toyota")).toMatchObject({ ambito: "servicio", porHorasLogadas: true, importeTotal: 47.71 });
    expect(de("gh_parada").lineas.find((l) => l.unidad === "ddi")?.importe).toBe(5);
  });

  it("la config de campaña sustituye a la del servicio (bbdd por contactos)", () => {
    expect(de("gh_bbdd_x")).toMatchObject({ ambito: "campania", porHorasLogadas: false, importeTotal: 1150.5 });
    expect(de("gh_bbdd_x").lineas.map((l) => [l.unidad, l.cantidad])).toEqual([
      ["leads", 574],
      ["ddi", 1],
    ]);
  });

  it("DDIs «solo los meses con llamadas»: la bbdd sin llamadas no los paga; el resto, sí", () => {
    const agosto = facturarCampanias(config, [], mapa, {
      ddisPorMes: new Map([
        ["gh_bbdd_x", new Map([["2026-08", 1]])],
        ["gh_parada", new Map([["2026-08", 2]])],
      ]),
      mesesConLlamadas: new Map(),
    });
    const bbdd = agosto.find((f) => f.campania === "gh_bbdd_x")!;
    expect(bbdd.lineas.find((l) => l.unidad === "ddi")).toMatchObject({ cantidad: 0, importe: 0 });
    expect(bbdd).toMatchObject({ ddis: 1, ddisConLlamadas: 0 });
    // La línea del servicio no lleva la opción: la campaña parada paga sus DDIs
    expect(agosto.find((f) => f.campania === "gh_parada")!.lineas.find((l) => l.unidad === "ddi")?.cantidad).toBe(2);
  });

  it("sin config no hay líneas ni importe", () => {
    expect(de("otra")).toMatchObject({ ambito: null, lineas: [], importeTotal: null });
  });
});

describe("consolidarFactura", () => {
  const facturacion = facturarCampanias(config, unidades, mapa, extras);
  const cliente: FacturacionHorasLogadas = {
    servicio: "GrupoHuertas",
    prefijo: "GH",
    precioUnitario: 28,
    notas: null,
    horas: 20,
    importe: 560,
    usuarios: [],
    campanias: [
      { campania: "gh_toyota", horasAgente: 6, pctAgente: 60, horasLogadas: 12, importe: 336 },
      { campania: "gh_seat", horasAgente: 4, pctAgente: 40, horasLogadas: 8, importe: 224 },
    ],
  };
  const filas = consolidarFactura(facturacion, [cliente], mapa, new Map([["gh_toyota", "0002330"]]));

  it("una fila por campaña con su parte de las horas logadas primero y el código de GS", () => {
    const toyota = filas.find((f) => f.campania === "gh_toyota")!;
    expect(toyota.codigoGs).toBe("0002330");
    expect(toyota.lineas.map((l) => l.unidad)).toEqual(["horas_logadas", "minutos_fijo", "minutos_movil", "ddi"]);
    expect(toyota.importeTotal).toBe(383.71);
    expect(filas.find((f) => f.campania === "gh_seat")!.codigoGs).toBeNull();
  });

  it("quita las líneas a cero y las campañas sin nada que cobrar", () => {
    expect(filas.map((f) => f.campania)).toEqual(["gh_bbdd_x", "gh_parada", "gh_seat", "gh_toyota"]);
    expect(filas.find((f) => f.campania === "gh_parada")!.lineas.map((l) => l.unidad)).toEqual(["ddi"]);
  });

  it("los totales suman las filas", () => {
    const t = totalesFactura(filas);
    expect(t.porUnidad.find((u) => u.unidad === "horas_logadas")).toEqual({ unidad: "horas_logadas", cantidad: 20, importe: 560 });
    expect(t.porUnidad.find((u) => u.unidad === "ddi")).toEqual({ unidad: "ddi", cantidad: 14, importe: 35 });
    expect(t.importe).toBe(
      Math.round(filas.reduce((a, f) => a + (f.importeTotal ?? 0), 0) * 100) / 100,
    );
  });

  it("un cierre guardado vuelve a las mismas filas", () => {
    const lineas = lineasDeCierre(filas);
    expect(lineas.find((l) => l.campania === "gh_toyota" && l.unidad === "horas_logadas")).toEqual({
      campania: "gh_toyota",
      codigoGs: "0002330",
      unidad: "horas_logadas",
      cantidad: 12,
      precioUnitario: 28,
      importe: 336,
    });
    const vuelta = filasDeCierre(lineas, "GrupoHuertas");
    expect(vuelta.map((f) => [f.campania, f.importeTotal])).toEqual(filas.map((f) => [f.campania, f.importeTotal]));
    expect(totalesFactura(vuelta)).toEqual(totalesFactura(filas));
  });

  it("ajustes manuales de un cierre: quitar y cambiar el precio (agosto y julio de 2026)", () => {
    const guardadas = lineasDeCierre(filas).map((l, i) => ({ ...l, id: i + 1, cierreId: 7 }));
    const ddiBbdd = guardadas.find((l) => l.campania === "gh_bbdd_x" && l.unidad === "ddi")!;
    const leadsBbdd = guardadas.find((l) => l.campania === "gh_bbdd_x" && l.unidad === "leads")!;
    const ajustadas = aplicarAjustes(guardadas, [
      { id: 1, lineaId: ddiBbdd.id, tipo: "quitar", precioNuevo: null, motivo: "Sin tanda: no se factura", autor: "ops" },
      { id: 2, lineaId: leadsBbdd.id, tipo: "precio", precioNuevo: 1.6315, motivo: "Precio pactado con dirección", autor: "ops" },
    ]);
    const ddi = ajustadas.find((l) => l.id === ddiBbdd.id)!;
    expect(ddi).toMatchObject({ quitada: true, importe: 2.5, ajuste: { tipo: "quitar", importeOriginal: 2.5 } });
    const leads = ajustadas.find((l) => l.id === leadsBbdd.id)!;
    // 574 × 1,6315 = 936,481 → 936,48
    expect(leads).toMatchObject({ quitada: false, precioUnitario: 1.6315, importe: 936.48, ajuste: { precioOriginal: 2, importeOriginal: 1148 } });
    const sinAjustes = importeVigente(aplicarAjustes(guardadas, []));
    expect(importeVigente(ajustadas)).toBeCloseTo(sinAjustes - 2.5 - 1148 + 936.48, 10);
  });

  it("horas logadas sin tiempo de agente: fila sin campaña del cliente", () => {
    const sin = consolidarFactura([], [{ ...cliente, campanias: [{ campania: null, horasAgente: 0, pctAgente: null, horasLogadas: 3, importe: 84 }] }], mapa, new Map());
    expect(sin).toHaveLength(1);
    expect(etiquetaCampania(sin[0])).toBe("(sin campaña) GrupoHuertas");
    expect(sin[0]).toMatchObject({ campania: null, codigoGs: null, importeTotal: 84 });
  });
});
