import { describe, expect, it } from "vitest";
import { deserializar, serializar } from "@/lib/serializar";

describe("serializar / deserializar", () => {
  it("conserva Map, Set y Date, también anidados", () => {
    const valor = {
      horas: new Map([
        ["GrupoHuertas", 1027.88],
        ["Avolo", 23.45],
      ]),
      campanias: new Set(["gh_a", "gh_b"]),
      cuando: new Date("2026-11-13T09:20:00"),
      filas: [{ fecha: new Date(2026, 9, 1), n: 3, nada: null }],
      anidado: new Map([["x", { d: new Date(0), s: new Set([1, 2]) }]]),
    };
    const vuelta = deserializar<typeof valor>(serializar(valor));
    expect(vuelta).toEqual(valor);
    expect(vuelta.horas).toBeInstanceOf(Map);
    expect(vuelta.cuando).toBeInstanceOf(Date);
    expect(vuelta.anidado.get("x")?.s).toBeInstanceOf(Set);
  });

  it("no confunde un objeto que ya tenga la clave de la marca", () => {
    const valor = { a: { __tipo: "Date", v: 5 } };
    expect(deserializar(serializar(valor))).toEqual(valor);
  });

  it("los valores normales salen igual que con JSON", () => {
    const valor = { a: 1, b: "dos", c: [1, 2, { d: true }], e: null };
    expect(serializar(valor)).toBe(JSON.stringify(valor));
    expect(deserializar(serializar(valor))).toEqual(valor);
  });
});
