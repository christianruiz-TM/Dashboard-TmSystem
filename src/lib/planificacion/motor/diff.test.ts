import { describe, expect, it } from "vitest";
import { balanceCambios, diffPlanes, textoCambio } from "./diff";
import type { BloqueBasico } from "./tipos";

const b = (agenteNumero: string, fecha: string, clienteCodigo: string, ini: number, fin: number): BloqueBasico => ({
  agenteNumero,
  fecha,
  clienteCodigo,
  inicioMin: ini * 60,
  finMin: fin * 60,
});

const L = "2026-10-05";
const M = "2026-10-06";

describe("diff de versiones", () => {
  it("planes iguales: ningún cambio, aunque los bloques estén partidos de otra forma", () => {
    const antes = [b("0851", L, "GH", 9, 14), b("0851", L, "GH", 16, 20)];
    const despues = [b("0851", L, "GH", 9, 11), b("0851", L, "GH", 11, 14), b("0851", L, "GH", 16, 20)];
    expect(diffPlanes(antes, despues)).toEqual([]);
  });

  it("muestra exactamente las celdas cambiadas: UGR 11-14 vuelve a GH", () => {
    const antes = [b("0851", M, "GH", 9, 11), b("0851", M, "UGR", 11, 14), b("0851", M, "GH", 16, 20)];
    const despues = [b("0851", M, "GH", 9, 14), b("0851", M, "GH", 16, 20)];
    const cambios = diffPlanes(antes, despues);
    expect(cambios).toEqual([
      { agenteNumero: "0851", fecha: M, inicioMin: 660, finMin: 840, antes: "UGR", despues: "GH" },
    ]);
    expect(textoCambio(cambios[0], "Lourdes")).toBe("0851 Lourdes 06/10 11-14: UGR → GH");
  });

  it("mover un bloque a otra agente: un cambio en cada fila", () => {
    const antes = [b("0851", L, "GH", 9, 11), b("0851", L, "UGR", 11, 14), b("0925", L, "GH", 9, 14)];
    const despues = [b("0851", L, "GH", 9, 14), b("0925", L, "GH", 9, 11), b("0925", L, "UGR", 11, 14)];
    expect(diffPlanes(antes, despues).map((c) => textoCambio(c))).toEqual([
      "0851 05/10 11-14: UGR → GH",
      "0925 05/10 11-14: GH → UGR",
    ]);
  });

  it("huecos y bloques nuevos, y tramos contiguos con distinto cambio por separado", () => {
    const antes = [b("0940", L, "GH", 9, 14), b("0940", L, "GH", 16, 18), b("0940", L, "CEFF", 18, 20)];
    const despues = [b("0940", L, "GH", 9, 10), b("0940", L, "UGR", 11, 13), b("0940", L, "GH", 16, 20), b("0940", L, "BD", 20, 21)];
    expect(diffPlanes(antes, despues).map((c) => textoCambio(c))).toEqual([
      "0940 05/10 10-11: GH → libre",
      "0940 05/10 11-13: GH → UGR",
      "0940 05/10 13-14: GH → libre",
      "0940 05/10 18-20: CEFF → GH",
      "0940 05/10 20-21: libre → BD",
    ]);
  });

  it("vale para medias horas sin tocar nada", () => {
    const antes = [{ ...b("0851", L, "GH", 9, 14) }];
    const despues = [
      { ...b("0851", L, "GH", 9, 14), finMin: 11 * 60 + 30 },
      { ...b("0851", L, "UGR", 11, 14), inicioMin: 11 * 60 + 30 },
    ];
    expect(diffPlanes(antes, despues).map((c) => textoCambio(c))).toEqual(["0851 05/10 11:30-14: GH → UGR"]);
  });

  it("orden por fecha, agente y hora, y balance de horas por cliente", () => {
    const antes = [b("0925", M, "GH", 9, 12), b("0851", M, "GH", 9, 12), b("0851", L, "GH", 9, 12)];
    const despues = [b("0925", M, "UGR", 9, 12), b("0851", M, "CR", 9, 10), b("0851", L, "GH", 9, 12)];
    const cambios = diffPlanes(antes, despues);
    expect(cambios.map((c) => textoCambio(c))).toEqual([
      "0851 06/10 9-10: GH → CR",
      "0851 06/10 10-12: GH → libre",
      "0925 06/10 9-12: GH → UGR",
    ]);
    expect(balanceCambios(cambios)).toEqual({ GH: -6, CR: 1, UGR: 3 });
  });
});
