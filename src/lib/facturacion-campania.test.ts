import { describe, expect, it } from "vitest";
import type { BillingConfigRow } from "@/lib/db/schema";
import type { FacturacionHorasLogadas } from "@/lib/facturacion-horas-logadas";
import type { TarificacionCampania } from "@/lib/tarificacion";
import {
  consolidarFactura,
  etiquetaCampania,
  agruparPorServicio,
  aplicarAjustes,
  facturarCampanias,
  importeVigente,
  filasDeCierre,
  lineasDeCierre,
  totalesFactura,
  totalesUnidades,
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
  { campania: "gh_toyota", horasProductivas: 10, interacciones: 100, atendidas: 60, exitos: 5, leadsFinalizados: 0, sesiones: 0, exitosFinalizados: 0 },
  { campania: "gh_bbdd_x", horasProductivas: 4, interacciones: 50, atendidas: 30, exitos: 3, leadsFinalizados: 574, sesiones: 0, exitosFinalizados: 0 },
  { campania: "otra", horasProductivas: 2, interacciones: 10, atendidas: 8, exitos: 0, leadsFinalizados: 0, sesiones: 0, exitosFinalizados: 0 },
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

  it("cada campaña lleva su cliente", () => {
    expect(de("gh_toyota").servicio).toBe("GrupoHuertas");
    expect(de("otra").servicio).toBe("OtroCliente");
  });

  it("totales de «Unidades por campaña» por cliente", () => {
    const grupos = agruparPorServicio(r);
    expect(grupos.map((g) => [g.servicio, g.filas.map((f) => f.campania)])).toEqual([
      ["GrupoHuertas", ["gh_toyota", "gh_bbdd_x", "gh_parada", "gh_seat"]],
      ["OtroCliente", ["otra"]],
    ]);
    const gh = totalesUnidades(grupos[0].filas);
    expect(gh).toMatchObject({ horasProductivas: 14, interacciones: 150, atendidas: 90, exitos: 8, leadsFinalizados: 574, ddis: 14 });
    expect(gh.minutosMovil).toBeCloseTo(652.824 + 21.12, 10);
    expect(gh.minutosFijo).toBeCloseTo(3.304, 10);
    // 47,71 (toyota) + 1.150,50 (bbdd) + 5 (parada) + 1,06 + 12,50 (seat)
    expect(gh.importe).toBe(1216.77);
    expect(totalesUnidades(grupos[1].filas).importe).toBeNull();
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

describe("artículos de GS añadidos el 19/10/2026", () => {
  const medidas = (campania: string, p: Partial<(typeof unidades)[number]> = {}) => ({
    campania,
    horasProductivas: 0,
    interacciones: 0,
    atendidas: 0,
    exitos: 0,
    leadsFinalizados: 0,
    sesiones: 0,
    exitosFinalizados: 0,
    ...p,
  });
  const servicioEnc: ConfigFacturacion = {
    porServicio: new Map([
      [
        "Encuestas",
        [
          linea({ servicio: "Encuestas" }, "encuestas", 1.5),
          linea({ servicio: "Encuestas" }, "minutos_especial", 0.3),
          linea({ servicio: "Encuestas" }, "ddi", 2.5),
          linea({ servicio: "Encuestas" }, "ddi_movil", 6),
          linea({ servicio: "Encuestas" }, "leads_recibidos", 0.2),
          linea({ servicio: "Encuestas" }, "exitos_finalizados", 10),
          linea({ servicio: "Encuestas" }, "preparacion", 300),
        ],
      ],
    ]),
    porCampania: new Map(),
  };
  const mapaEnc = new Map([
    ["enc_a", "Encuestas"],
    ["enc_b", "Encuestas"],
  ]);
  const r = facturarCampanias(servicioEnc, [medidas("enc_a", { sesiones: 136, exitosFinalizados: 25 })], mapaEnc, {
    tarificacion: new Map([["enc_a", { ...tarif("enc_a", 10, 5), minutos: { movil: 10, fijo: 5, especial: 3.456, sin_coste: 0, sin_numero: 0, otro: 0 } }]]),
    ddisPorMes: new Map([["enc_a", new Map([["2026-09", 3]])]]),
    ddisMovilPorMes: new Map([["enc_a", new Map([["2026-09", 1]])]]),
    leadsRecibidos: new Map([["enc_a", 500]]),
    cargos: [
      { campania: "enc_a", unidad: "preparacion", cantidad: 1, precioUnitario: null, concepto: "Puesta en marcha" },
      // Una campaña sin actividad que solo tiene un cargo, con su propio precio
      { campania: "enc_b", unidad: "base_datos", cantidad: 2, precioUnitario: 150, concepto: "Lista octubre" },
    ],
  });
  const de = (c: string) => r.find((f) => f.campania === c)!;
  const cant = (c: string, u: string) => de(c).lineas.find((l) => l.unidad === u);

  it("cada artículo con su medida: sesiones, 90X, DDIs geográficos y móviles, leads recibidos y éxitos", () => {
    expect(cant("enc_a", "encuestas")).toMatchObject({ cantidad: 136, importe: 204 });
    expect(cant("enc_a", "minutos_especial")).toMatchObject({ cantidad: 3.46, importe: 1.04 });
    expect(cant("enc_a", "ddi")).toMatchObject({ cantidad: 3, importe: 7.5 });
    expect(cant("enc_a", "ddi_movil")).toMatchObject({ cantidad: 1, importe: 6 });
    expect(cant("enc_a", "leads_recibidos")).toMatchObject({ cantidad: 500, importe: 100 });
    expect(cant("enc_a", "exitos_finalizados")).toMatchObject({ cantidad: 25, importe: 250 });
  });

  it("cargo puntual sin precio: el de la tarifa; la tarifa sola no cobra nada", () => {
    expect(cant("enc_a", "preparacion")).toMatchObject({ cantidad: 1, precioUnitario: 300, importe: 300, notas: "Puesta en marcha" });
    expect(de("enc_a").lineas.filter((l) => l.unidad === "preparacion")).toHaveLength(1);
  });

  it("un cargo se cobra aunque la unidad no esté en la tarifa, y saca la campaña aunque no tenga actividad", () => {
    expect(r.map((f) => f.campania)).toEqual(["enc_a", "enc_b"]);
    expect(cant("enc_b", "base_datos")).toMatchObject({ cantidad: 2, precioUnitario: 150, importe: 300 });
  });

  it("varios cargos de la misma unidad: una línea con la suma y el precio medio", () => {
    const [f] = facturarCampanias({ porServicio: new Map(), porCampania: new Map() }, [], new Map(), {
      cargos: [
        { campania: "x", unidad: "base_datos", cantidad: 1, precioUnitario: 100, concepto: "A" },
        { campania: "x", unidad: "base_datos", cantidad: 3, precioUnitario: 200, concepto: "B" },
      ],
    });
    expect(f.lineas).toEqual([{ unidad: "base_datos", cantidad: 4, precioUnitario: 175, importe: 700, notas: "A · B" }]);
  });

  it("la factura los ordena como la lista de artículos de GS", () => {
    const [fila] = consolidarFactura(r.filter((f) => f.campania === "enc_a"), [], mapaEnc, new Map());
    expect(fila.lineas.map((l) => l.unidad)).toEqual([
      "encuestas",
      "preparacion",
      "minutos_especial",
      "ddi",
      "ddi_movil",
      "leads_recibidos",
      "exitos_finalizados",
    ]);
  });

  it("totales de «Unidades por campaña» con las medidas nuevas", () => {
    expect(totalesUnidades(r)).toMatchObject({ sesiones: 136, exitosFinalizados: 25, leadsRecibidos: 500, ddis: 3, ddisMovil: 1 });
  });
});
