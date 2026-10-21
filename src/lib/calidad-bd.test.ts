import { describe, expect, it } from "vitest";
import { calcularCalidad, calidadBaseDatos, type FilaIntentos } from "./calidad-bd";

// Socios el 20/10/2026 (RDBv2), salientes por resultado. El supervisor de
// Altitude enseñaba 825 gestionadas = 80 %, 64 ocupado = 6,2 %, 55 sin
// respuesta = 5,3 % y 45 números inválidos = 4,4 %.
const SOCIOS: [number, number][] = [
  [1, 825],
  [2, 64],
  [4, 55],
  [8, 45],
  [7, 36],
  [6, 12], // abandonadas: fuera
  [10, 6],
  [11, 5], // redirigidas: fuera
];
const fila = (campania: string, dia: string, estado: number, intentos: number): FilaIntentos => ({ campania, dia, estado, intentos });

describe("calidad de la base de datos", () => {
  it("cuenta como Altitude: sin abandonadas ni redirigidas", () => {
    const c = calcularCalidad(
      SOCIOS.map(([e, n]) => fila("Soc_X", "2026-10-20", e, n)),
      400,
    );
    expect(c.intentos).toBe(1031);
    expect(c.porResultado.map((r) => [r.nombre, r.intentos])).toEqual([
      ["Gestionadas", 825],
      ["Sin respuesta", 55],
      ["Ocupado", 64],
      ["Números inválidos", 45],
      ["Rechazadas", 36],
      ["Sin líneas troncales disponibles", 6],
    ]);
    expect(c.pctContactable).toBeCloseTo(80.02, 2);
    expect(c.porResultado.find((r) => r.nombre === "Ocupado")!.pct).toBeCloseTo(6.21, 2);
    expect(c.pctReintentable).toBeCloseTo((119 / 1031) * 100, 6);
    expect(c.pctNoUtil).toBeCloseTo((45 / 1031) * 100, 6);
    expect(c.pctRed).toBeCloseTo((6 / 1031) * 100, 6);
    expect(c.intentosPorContacto).toBeCloseTo(1031 / 400, 6);
  });

  it("sin intentos, sin porcentajes", () => {
    const c = calcularCalidad([fila("A", "2026-10-20", 6, 3)], 0);
    expect(c.intentos).toBe(0);
    expect(c.pctContactable).toBeNull();
    expect(c.intentosPorContacto).toBeNull();
  });

  it("agrupa por tipo de campaña, suma contactos y saca la evolución por día", () => {
    const filas = [
      fila("gh_bbdd_1", "2026-10-19", 1, 10),
      fila("gh_bbdd_1", "2026-10-19", 8, 10),
      fila("gh_bbdd_1", "2026-10-20", 1, 5),
      fila("gh_ventas", "2026-10-20", 1, 30),
      fila("gh_ventas", "2026-10-20", 4, 10),
    ];
    const r = calidadBaseDatos(
      filas,
      [
        { campania: "gh_bbdd_1", contactos: 10 },
        { campania: "gh_ventas", contactos: 20 },
      ],
      [{ nombre: "BBDD", patrones: ["gh_bbdd_%"] }],
    );
    expect(r.total.intentos).toBe(65);
    expect(r.total.contactos).toBe(30);
    expect(r.grupos.map((g) => [g.nombre, g.total.intentos, g.total.pctNoUtil])).toEqual([
      ["BBDD", 25, 40],
      ["Resto", 40, 0],
    ]);
    expect(r.dias).toEqual([
      { dia: "2026-10-19", intentos: 20, pctContactable: 50, pctReintentable: 0, pctNoUtil: 50 },
      { dia: "2026-10-20", intentos: 45, pctContactable: (35 / 45) * 100, pctReintentable: (10 / 45) * 100, pctNoUtil: 0 },
    ]);
  });
});
