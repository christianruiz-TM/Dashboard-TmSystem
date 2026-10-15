import { describe, expect, it } from "vitest";
import { estadoDdi, fechaISO, lineasDeFilasCerradas, numero, texto } from "./facturacion-excel";

describe("lectura de celdas del Excel de operaciones", () => {
  it("números: fórmulas, guiones contables y texto con coma", () => {
    expect(numero(3.9885)).toBe(3.9885);
    expect(numero({ formula: "A1*2", result: 11.7 })).toBe(11.7);
    expect(numero("                    -  ")).toBeNull();
    expect(numero("1.027,88")).toBe(1027.88);
    expect(numero(null)).toBeNull();
  });

  it("fechas a YYYY-MM-DD sin desplazarse por la zona horaria", () => {
    expect(fechaISO(new Date("2026-09-01T00:00:00.000Z"))).toBe("2026-09-01");
    // Número de serie de Excel en una celda sin formato de fecha
    expect(fechaISO(46097)).toBe("2026-03-16");
    expect(fechaISO(12)).toBeNull();
    expect(fechaISO("2026-09-01")).toBeNull();
  });

  it("texto recortado y estados del DDI", () => {
    expect(texto(" 04 - dimovil_mercedes_gh_digital ")).toBe("04 - dimovil_mercedes_gh_digital");
    expect(texto("   ")).toBeNull();
    expect(estadoDdi("EN PRODUCCIÓN")).toBe("en_produccion");
    expect(estadoDdi("BAJA")).toBe("baja");
    expect(estadoDdi("DESHABILITADO")).toBe("deshabilitado");
    expect(estadoDdi("otro")).toBeNull();
  });
});

describe("lineasDeFilasCerradas", () => {
  it("una línea por unidad con algo, precio implícito e importe tal cual", () => {
    const lineas = lineasDeFilasCerradas([
      {
        mes: "2026-09",
        codigoAltitude: 93,
        campania: "gh_aclasse_mer",
        valores: {
          horas_logadas: { cantidad: 34.47, importe: 965.16 },
          minutos_fijo: { cantidad: 0, importe: 0 },
          minutos_movil: { cantidad: 360.17, importe: 18.0085 },
          leads: { cantidad: null, importe: null },
          ddi: { cantidad: 24, importe: 60 },
        },
        total: 1043.1685,
      },
    ]);
    expect(lineas.map((l) => [l.unidad, l.cantidad, l.precioUnitario, l.importe])).toEqual([
      ["horas_logadas", 34.47, 28, 965.16],
      ["minutos_movil", 360.17, 0.05, 18.0085],
      ["ddi", 24, 2.5, 60],
    ]);
    expect(lineas.reduce((a, l) => a + (l.importe ?? 0), 0)).toBeCloseTo(1043.1685, 10);
  });
});
