import { describe, expect, it } from "vitest";
import { caducidadInicial, horasDeEntorno, renovacion, sesionVigente } from "./caducidad";

const h = (horas: number) => new Date(Date.UTC(2026, 10, 13, 8) + horas * 3_600_000);

describe("caducidad de la sesión (tope de 12 h, 11/11/2026)", () => {
  it("al entrar caduca a las 8 h (la ventana)", () => {
    expect(caducidadInicial(h(0), 8, 12)).toEqual(h(8));
    expect(caducidadInicial(h(0), 24, 12)).toEqual(h(12));
  });

  it("con uso se renueva, pero nunca pasa de 12 h desde que se entró", () => {
    // A las 5 h quedan 3 (< media ventana): se renueva hasta las 13 h → tope 12 h
    expect(renovacion(h(8), h(0), h(5), 8, 12)).toEqual(h(12));
    // A las 2 h quedan 6 (≥ media ventana): no toca
    expect(renovacion(h(8), h(0), h(2), 8, 12)).toBeNull();
    // Ya en el tope: no se renueva
    expect(renovacion(h(12), h(0), h(9), 8, 12)).toBeNull();
  });

  it("una pestaña abierta (campana cada 60 s) ya no la mantiene viva más de 12 h", () => {
    let caduca = caducidadInicial(h(0), 8, 12);
    let ultimaVigente = 0;
    for (let min = 1; min <= 72 * 60; min++) {
      const ahora = h(min / 60);
      if (!sesionVigente(caduca, h(0), ahora, 12)) break;
      ultimaVigente = min;
      caduca = renovacion(caduca, h(0), ahora, 8, 12) ?? caduca;
    }
    expect(ultimaVigente).toBe(12 * 60 - 1);
  });

  it("sin uso, caduca a las 8 h como antes", () => {
    expect(sesionVigente(h(8), h(0), h(7.9), 12)).toBe(true);
    expect(sesionVigente(h(8), h(0), h(8), 12)).toBe(false);
  });

  it("valores de entorno no válidos usan los de por defecto", () => {
    expect(horasDeEntorno(undefined, 12)).toBe(12);
    expect(horasDeEntorno("abc", 12)).toBe(12);
    expect(horasDeEntorno("0", 12)).toBe(12);
    expect(horasDeEntorno("10", 12)).toBe(10);
  });
});
