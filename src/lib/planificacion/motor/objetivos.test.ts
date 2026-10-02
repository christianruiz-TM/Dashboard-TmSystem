import { describe, expect, it } from "vitest";
import {
  calcularObjetivos,
  calcularRitmo,
  cierresNecesarios,
  horasParaCierres,
  prorratearBolsa,
  repartirHoras,
} from "./objetivos";

const SEMANAS_OCTUBRE = [
  { lunes: "2026-09-28", laborables: 2, diasEntreSemana: 2 },
  { lunes: "2026-10-05", laborables: 5, diasEntreSemana: 5 },
  { lunes: "2026-10-12", laborables: 4, diasEntreSemana: 5 },
  { lunes: "2026-10-19", laborables: 5, diasEntreSemana: 5 },
  { lunes: "2026-10-26", laborables: 5, diasEntreSemana: 5 },
];

describe("objetivos", () => {
  // Hoja «Criterios» del prototipo: UGR_EGRE26 con 6.177 contactos y 4.310
  // vivos; la lista de 2025 acabó con 1.562 vivos de 5.516 (28,32 %).
  it("UGR: 6.177 contactos, 4.310 vivos, 28 % y 12 cierres/h → ~2.560 cierres y ~213 h", () => {
    // Con el 28 % redondo salen 2.580 cierres y 215,04 h → 216 h (hacia arriba a la franja)
    expect(cierresNecesarios(6177, 4310, 28)).toBeCloseTo(2580.44, 2);
    expect(horasParaCierres(cierresNecesarios(6177, 4310, 28), 12, 60)).toBe(216);
    // Con el % exacto con que acabó 2025 salen las cifras del prototipo
    const cierres = cierresNecesarios(6177, 4310, 28.32);
    expect(Math.round(cierres)).toBe(2561);
    expect(cierres / 12).toBeCloseTo(213.4, 1);
    expect(horasParaCierres(cierres, 12, 60)).toBe(214); // el prototipo planificó 214 h
  });

  it("CR: 47 vivos a 12,6 cierres/h → 4 h", () => {
    expect(horasParaCierres(cierresNecesarios(265, 47, 0), 12.6, 60)).toBe(4);
    expect(horasParaCierres(cierresNecesarios(265, 47, 0), 12.6, 30)).toBe(4); // 3,73 → 4,0 en medias horas
  });

  it("sin ritmo o sin cierres pendientes, 0 h", () => {
    expect(horasParaCierres(100, 0, 60)).toBe(0);
    expect(horasParaCierres(0, 10, 60)).toBe(0);
    expect(cierresNecesarios(1000, 100, 28)).toBe(0);
    expect(calcularRitmo(10, 0)).toBeNull();
    expect(calcularRitmo(120, 10)).toBe(12);
  });

  it("bolsa prorrateada: 1.324 h × 21/22 = 1.263,82 h", () => {
    expect(prorratearBolsa(1324, 22, 21)).toBe(1263.82);
    expect(prorratearBolsa(154, 22, 21)).toBe(147);
  });

  it("repartir horas cuadra exactamente con el total (mayor resto)", () => {
    const r = repartirHoras(45, [2, 5, 4, 5, 5], 60);
    expect(r.reduce((a, b) => a + b, 0)).toBe(45);
    expect(r).toEqual([4, 11, 8, 11, 11]); // a igualdad de resto, antes la semana anterior
    expect(repartirHoras(4, [2, 5, 4, 5, 5], 60)).toEqual([0, 1, 1, 1, 1]);
    expect(repartirHoras(10, [0, 0], 60)).toEqual([0, 0]);
  });

  it("CEFF con 4 h fijas por semana: prorrateo hacia arriba en semanas incompletas", () => {
    const obj = calcularObjetivos(
      {
        cliente: "CEFF",
        parametros: { pctVivosObjetivo: 0, horasSemanaFijas: 4, curva: "uniforme" },
        total: 1318,
        vivos: 222,
        ritmo: 9.8,
        ritmoOrigen: "medido",
        curvaAnterior: null,
      },
      SEMANAS_OCTUBRE,
      60,
    );
    expect(obj.map((o) => o.horas)).toEqual([2, 4, 4, 4, 4]); // 18 h (4 × 2/5 = 1,6 → 2)
  });

  it("CR «al principio»: todo en la primera semana con laborables", () => {
    const obj = calcularObjetivos(
      {
        cliente: "CR",
        parametros: { pctVivosObjetivo: 0, horasSemanaFijas: null, curva: "inicio" },
        total: 265,
        vivos: 47,
        ritmo: 12.6,
        ritmoOrigen: "medido",
        curvaAnterior: null,
      },
      SEMANAS_OCTUBRE,
      60,
    );
    expect(obj.map((o) => o.horas)).toEqual([4, 0, 0, 0, 0]);
    expect(obj[0].detalle).toMatchObject({ cierresNecesarios: 47, horasLista: 4 });
  });

  it("curva del año anterior ponderada por la parte de la semana dentro del mes", () => {
    const obj = calcularObjetivos(
      {
        cliente: "UGR",
        parametros: { pctVivosObjetivo: 28.32, horasSemanaFijas: null, curva: "anio_anterior" },
        total: 6177,
        vivos: 4310,
        ritmo: 12,
        ritmoOrigen: "medido",
        // Horas UGR de 2025 en las mismas semanas (29/09, 06/10, 13/10...)
        curvaAnterior: { "2026-09-28": 108.6, "2026-10-05": 35.4, "2026-10-12": 50.8 },
      },
      SEMANAS_OCTUBRE,
      60,
    );
    const horas = obj.map((o) => o.horas);
    expect(horas.reduce((a, b) => a + b, 0)).toBe(214);
    expect(horas[3]).toBe(0);
    expect(horas[4]).toBe(0);
    // Sin curva: a partes iguales por laborables
    const uniforme = calcularObjetivos(
      { ...obj[0], cliente: "X", parametros: { pctVivosObjetivo: 0, horasSemanaFijas: null, curva: "anio_anterior" }, total: 310, vivos: 310, ritmo: 6.9, ritmoOrigen: "manual", curvaAnterior: null },
      SEMANAS_OCTUBRE,
      60,
    );
    expect(uniforme.map((o) => o.horas)).toEqual([4, 11, 8, 11, 11]); // 45 h de Lexus
    expect(uniforme[0].detalle).toMatchObject({ criterio: "uniforme (sin curva del año anterior)" });
  });

  it("las horas contratadas que quedan son el tope del mes (redondeado hacia abajo a la franja)", () => {
    const datos = {
      cliente: "UGR",
      parametros: { pctVivosObjetivo: 28.32, horasSemanaFijas: null, curva: "uniforme" as const },
      total: 6177,
      vivos: 4310,
      ritmo: 12,
      ritmoOrigen: "medido" as const,
      curvaAnterior: null,
    };
    const sinTope = calcularObjetivos(datos, SEMANAS_OCTUBRE, 60);
    expect(sinTope.reduce((a, o) => a + o.horas, 0)).toBe(214);
    expect(sinTope[0].detalle).not.toHaveProperty("topeContrato");

    const conTope = calcularObjetivos({ ...datos, topeHoras: 120.6 }, SEMANAS_OCTUBRE, 60);
    expect(conTope.reduce((a, o) => a + o.horas, 0)).toBe(120);
    expect(conTope[0].detalle).toMatchObject({ horasLista: 120, horasSinTope: 214, topeContrato: 120 });
    // Un tope mayor que lo que pide la lista no cambia nada
    expect(calcularObjetivos({ ...datos, topeHoras: 500 }, SEMANAS_OCTUBRE, 60).map((o) => o.horas)).toEqual(
      sinTope.map((o) => o.horas),
    );
    // Con horas fijas por semana (CEFF), el tope corta las últimas semanas
    const ceff = calcularObjetivos(
      { ...datos, parametros: { ...datos.parametros, horasSemanaFijas: 4 }, total: null, vivos: null, ritmo: null, topeHoras: 7 },
      SEMANAS_OCTUBRE,
      60,
    );
    expect(ceff.map((o) => o.horas)).toEqual([2, 4, 1, 0, 0]);
  });
});
