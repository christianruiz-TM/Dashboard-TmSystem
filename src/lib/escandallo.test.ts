import { describe, expect, it } from "vitest";
import { admiteTramos, errorTramos, normalizarTramos, textoTramos, tramoAplicado } from "./escandallo";

const avolo = [
  { desde: 1500, precio: 3 },
  { desde: 600, precio: 4 },
  { desde: 1200, precio: 3.49 },
  { desde: 800, precio: 3.75 },
  { desde: 1000, precio: 3.6 },
];

describe("tramoAplicado", () => {
  it("todas las unidades al precio del tramo alcanzado, sin importar el orden de la lista", () => {
    expect(tramoAplicado(1300, 4, avolo)).toEqual({ precio: 3.49, desde: 1200, siguiente: { desde: 1500, precio: 3 } });
    expect(tramoAplicado(2000, 4, avolo)).toEqual({ precio: 3, desde: 1500, siguiente: null });
    expect(tramoAplicado(0, 4, avolo)).toEqual({ precio: 4, desde: null, siguiente: { desde: 800, precio: 3.75 } });
    // El de 600 vale lo mismo que la base: el siguiente que cuenta es el que baja el precio
    expect(tramoAplicado(444, 4, avolo).siguiente).toEqual({ desde: 800, precio: 3.75 });
    expect(tramoAplicado(10, null, avolo).precio).toBeNull();
  });
});

describe("normalizarTramos y errorTramos", () => {
  it("ordena y descarta lo que no es un tramo", () => {
    expect(normalizarTramos(null)).toEqual([]);
    expect(normalizarTramos([{ desde: 800, precio: 3.75 }, { desde: "x" }, { desde: 600, precio: 4 }])).toEqual([
      { desde: 600, precio: 4 },
      { desde: 800, precio: 3.75 },
    ]);
  });
  it("rechaza inicios repetidos, decimales o ceros", () => {
    expect(errorTramos(avolo)).toBeNull();
    expect(errorTramos([{ desde: 600, precio: 4 }, { desde: 600, precio: 3 }])).toMatch(/mismo/);
    expect(errorTramos([{ desde: 600.5, precio: 4 }])).toMatch(/entero/);
    expect(errorTramos([{ desde: 0, precio: 4 }])).toMatch(/entero/);
  });
});

describe("textoTramos", () => {
  it("como el escandallo del cliente, del volumen más alto al más bajo", () => {
    expect(textoTramos(4, avolo)).toEqual([
      "1500 o más: 3,00 €",
      "1200 a 1499: 3,49 €",
      "1000 a 1199: 3,60 €",
      "800 a 999: 3,75 €",
      "600 a 799: 4,00 €",
      "menos de 600: 4,00 €",
    ]);
    expect(textoTramos(4, [])).toEqual([]);
  });
  it("solo las unidades que se miden día a día admiten tramos", () => {
    expect(admiteTramos("leads")).toBe(true);
    expect(admiteTramos("horas_logadas")).toBe(false);
    expect(admiteTramos("ddi")).toBe(false);
  });
});
