import { describe, expect, it } from "vitest";
import type { FilaFactura } from "@/lib/facturacion-campania";
import { filasFicheroGs, generarFicheroGs, unidadesExtraGs } from "./albaranes-gs";

const linea = (unidad: FilaFactura["lineas"][number]["unidad"], cantidad: number) => ({
  unidad,
  cantidad,
  precioUnitario: null,
  importe: null,
  notas: null,
});

// Filas reales de los ficheros de ejemplo de septiembre 2026
const filas: FilaFactura[] = [
  {
    campania: "gh_gra_pre_mer",
    servicio: "GrupoHuertas",
    codigoGs: "0002329",
    lineas: [linea("horas_logadas", 108.08), linea("minutos_fijo", 0.25), linea("minutos_movil", 1288.92), linea("ddi", 15)],
    importeTotal: null,
  },
  {
    campania: "gh_aclasse_mer",
    servicio: "GrupoHuertas",
    codigoGs: "0002330",
    lineas: [linea("horas_logadas", 34.47), linea("minutos_movil", 360.17), linea("ddi", 24)],
    importeTotal: null,
  },
  {
    campania: "gh_la_toyota_et",
    servicio: "GrupoHuertas",
    codigoGs: "0003133",
    lineas: [linea("horas_logadas", 3.26), linea("ddi", 1)],
    importeTotal: null,
  },
  {
    campania: "gh_bbdd_autoclasse",
    servicio: "GrupoHuertas",
    codigoGs: "0003313",
    lineas: [linea("leads", 574), linea("ddi", 1)],
    importeTotal: null,
  },
  // Una bbdd sin contactos este mes: va a promociones por su config
  { campania: "gh_bbdd_lexus", servicio: "GrupoHuertas", codigoGs: "0003318", lineas: [linea("ddi", 1)], importeTotal: null },
  { campania: "gh_nueva", servicio: "GrupoHuertas", codigoGs: null, lineas: [linea("horas_logadas", 1)], importeTotal: null },
];
const esBbdd = (c: string | null) => (c ?? "").startsWith("gh_bbdd_");

describe("fichero de albaranes de GS", () => {
  it("ventas: el formato del ejemplo, ordenado por código, con CRLF", () => {
    const { filas: ventas, sinCodigo } = filasFicheroGs(filas, "ventas", esBbdd);
    expect(generarFicheroGs(ventas, "ventas")).toBe(
      [
        "Cod Camp\tHoras Logadas\tTarif Fija\tTarif Movil\tDdis",
        "0002329\t108,08\t0,25\t1288,92\t15",
        "0002330\t34,47\t0,00\t360,17\t24",
        "0003133\t3,26\t0,00\t0,00\t1",
        "",
      ].join("\r\n"),
    );
    expect(sinCodigo).toEqual(["gh_nueva"]);
  });

  it("promociones: contactos enteros, también la bbdd que este mes solo paga el DDI", () => {
    const { filas: promo } = filasFicheroGs(filas, "promociones", esBbdd);
    expect(generarFicheroGs(promo, "promociones")).toBe(
      [
        "Cod Camp\tContactos Finalizados\tTarif Fija\tTarif Movil\tDdis",
        "0003313\t574\t0,00\t0,00\t1",
        "0003318\t0\t0,00\t0,00\t1",
        "",
      ].join("\r\n"),
    );
  });

  it("sin separador de miles", () => {
    const [fila] = filasFicheroGs(
      [{ campania: "x", servicio: null, codigoGs: "1", lineas: [linea("horas_logadas", 1027.88)], importeTotal: null }],
      "ventas",
    ).filas;
    expect(generarFicheroGs([fila], "ventas")).toContain("1\t1027,88\t0,00\t0,00\t0");
  });
});

describe("artículos de GS en columnas añadidas", () => {
  const conArticulos: FilaFactura[] = [
    {
      campania: "enc_bol",
      servicio: "Encuestas_Bolsas",
      codigoGs: "0004001",
      lineas: [linea("encuestas", 136), linea("minutos_movil", 12.5), linea("preparacion", 1)],
      importeTotal: null,
    },
    {
      campania: "enc_soc",
      servicio: "Encuestas_Bolsas",
      codigoGs: "0004002",
      lineas: [linea("encuestas", 9), linea("ddi_movil", 2)],
      importeTotal: null,
    },
  ];

  it("sin artículos nuevos, el fichero de siempre (GH septiembre)", () => {
    expect(unidadesExtraGs(filas.slice(0, 3), "ventas", ["horas_logadas", "minutos_fijo", "minutos_movil", "ddi"])).toEqual([]);
  });

  it("una columna por artículo de la tarifa o con cantidad, en el orden de GS y con 0 si no tiene", () => {
    // La tarifa lleva además los minutos 90X, aunque este mes no haya ninguno
    const extra = unidadesExtraGs(conArticulos, "ventas", ["encuestas", "minutos_especial"]);
    expect(extra).toEqual(["encuestas", "preparacion", "minutos_especial", "ddi_movil"]);
    const { filas: ventas } = filasFicheroGs(conArticulos, "ventas");
    expect(generarFicheroGs(ventas, "ventas", extra)).toBe(
      [
        "Cod Camp\tHoras Logadas\tTarif Fija\tTarif Movil\tDdis\tEncuestas\tPreparacion Campana\tTarif 90X\tDdis Movil",
        "0004001\t0,00\t0,00\t12,50\t0\t136\t1,00\t0,00\t0",
        "0004002\t0,00\t0,00\t0,00\t0\t9\t0,00\t0,00\t2",
        "",
      ].join("\r\n"),
    );
  });

  it("las atendidas y los éxitos por sesión no son artículo de GS: no salen", () => {
    expect(unidadesExtraGs([], "ventas", ["interacciones", "exitos"])).toEqual([]);
  });
});

