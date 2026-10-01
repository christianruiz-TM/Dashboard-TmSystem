import { describe, expect, it } from "vitest";
import {
  actualizarResumen,
  aplicarOperacion,
  aplicarOperaciones,
  esquemaOperacion,
  inicioEnPosicion,
  operacionesQuitarAusencias,
  restarTramos,
  type ContextoEdicion,
  type Operacion,
} from "./edicion";
import { diffPlanes, generarFranjas, textoCambio, type ContextoValidacion } from "./motor";
import type { BloqueTablero } from "./tablero";

// Lunes 05/10/2026, franjas de 1 h de 8 a 20 h. Turno 9-14 y 16-20 para
// todos. GH es la base (entrante, atiende 9-14 y 16-20); UGR y CEFF salientes.
// 0002 no tiene usuario de UGR y tiene una ausencia de 9 a 11.
const F = "2026-10-05";
const TURNO = [
  { inicioMin: 540, finMin: 840 },
  { inicioMin: 960, finMin: 1200 },
];
const AUSENCIA_0002 = { fecha: F, inicioMin: 540, finMin: 660, tipo: "AUS" };

const validacion: ContextoValidacion = {
  pasoMin: 60,
  franjas: generarFranjas(480, 1200, 60),
  clienteBase: "GH",
  clientes: {
    GH: { codigo: "GH", cuentaComo: null, entrante: true, maxHorasSeguidas: null, horario: { [F]: TURNO } },
    UGR: { codigo: "UGR", cuentaComo: null, entrante: false, maxHorasSeguidas: null, horario: null },
    CEFF: { codigo: "CEFF", cuentaComo: null, entrante: false, maxHorasSeguidas: null, horario: null },
  },
  agentes: {
    "0001": { numero: "0001", contratoSemanalH: 30, habilidades: ["GH", "UGR", "CEFF"], turnos: { [F]: TURNO }, ausencias: [] },
    "0002": { numero: "0002", contratoSemanalH: 30, habilidades: ["GH", "CEFF"], turnos: { [F]: TURNO }, ausencias: [AUSENCIA_0002] },
    "0003": { numero: "0003", contratoSemanalH: 30, habilidades: ["GH", "UGR"], turnos: { [F]: TURNO }, ausencias: [] },
  },
  festivos: new Set(),
  semanaDe: { [F]: F },
  minimos: {},
};

const ctx: ContextoEdicion = {
  pasoMin: 60,
  inicioDiaMin: 480,
  finDiaMin: 1200,
  clienteBase: "GH",
  fechas: new Set([F]),
  agentes: new Set(["0001", "0002", "0003"]),
  clientes: new Set(["GH", "UGR", "CEFF"]),
  libre: new Map([
    [`0001|${F}`, TURNO],
    [`0002|${F}`, restarTramos(TURNO, [AUSENCIA_0002])],
    [`0003|${F}`, TURNO],
  ]),
  ausencias: new Map([[`0002|${F}`, [AUSENCIA_0002]]]),
  validacion,
};

const bloque = (id: number, agente: string, cliente: string, ini: number, fin: number, extra: Partial<BloqueTablero> = {}): BloqueTablero => ({
  id,
  agenteNumero: agente,
  fecha: F,
  inicioMin: ini * 60,
  finMin: fin * 60,
  clienteCodigo: cliente,
  regla: cliente === "GH" ? "base_turno" : "objetivo",
  datos: {},
  fijado: false,
  origen: "motor",
  editadoPor: null,
  editadoAt: null,
  ...extra,
});

// 0001: GH 9-11, UGR 11-14, GH 16-20 · 0002: GH 11-14, GH 16-20 · 0003: GH 9-14, GH 16-20
const PLAN: BloqueTablero[] = [
  bloque(1, "0001", "GH", 9, 11),
  bloque(2, "0001", "UGR", 11, 14),
  bloque(3, "0001", "GH", 16, 20),
  bloque(4, "0002", "GH", 11, 14),
  bloque(5, "0002", "GH", 16, 20),
  bloque(6, "0003", "GH", 9, 14),
  bloque(7, "0003", "GH", 16, 20),
];

const cambios = (antes: BloqueTablero[], despues: BloqueTablero[]) => diffPlanes(antes, despues).map((c) => textoCambio(c));

function aplicarOk(op: Operacion, bloques = PLAN) {
  const r = aplicarOperacion(bloques, op, ctx);
  if (!r.ok) throw new Error(r.error);
  return r;
}

describe("edición del tablero", () => {
  it("mover UGR a otra agente: pisa su GH y el hueco de la primera vuelve a GH", () => {
    const r = aplicarOk({ tipo: "mover", id: 2, agenteNumero: "0003", fecha: F, inicioMin: 660 });
    expect(cambios(PLAN, r.bloques)).toEqual(["0001 05/10 11-14: UGR → GH", "0003 05/10 11-14: GH → UGR"]);
    const movido = r.bloques.find((b) => b.id === 2)!;
    expect(movido).toMatchObject({ agenteNumero: "0003", inicioMin: 660, finMin: 840, origen: "manual", regla: "manual" });
    expect(movido.datos).toEqual({ accion: "movido", clienteAnterior: "UGR", reglaAnterior: "objetivo" });
    // El GH 9-14 de 0003 se queda en 9-11 (mismo id) y el hueco de 0001 es un GH nuevo
    expect(r.bloques.find((b) => b.id === 6)).toMatchObject({ inicioMin: 540, finMin: 660, origen: "motor" });
    expect(r.bloques.find((b) => b.id === -1)).toMatchObject({
      agenteNumero: "0001", clienteCodigo: "GH", inicioMin: 660, finMin: 840, datos: { accion: "relleno", clienteAnterior: "UGR" },
    });
    expect(r.foco).toBe(2);
  });

  it("mover dentro del mismo día: solo vuelve a GH lo que deja libre", () => {
    const r = aplicarOk({ tipo: "mover", id: 2, agenteNumero: "0001", fecha: F, inicioMin: 600 });
    expect(cambios(PLAN, r.bloques)).toEqual(["0001 05/10 10-11: GH → UGR", "0001 05/10 13-14: UGR → GH"]);
  });

  it("mover un bloque del cliente base deja el hueco libre", () => {
    const r = aplicarOk({ tipo: "mover", id: 4, agenteNumero: "0003", fecha: F, inicioMin: 660 });
    expect(cambios(PLAN, r.bloques)).toEqual(["0002 05/10 11-14: GH → libre"]);
  });

  it("una incidencia dura impide soltar: sin usuario del cliente o encima de una ausencia", () => {
    const sinUsuario = aplicarOperacion(PLAN, { tipo: "mover", id: 2, agenteNumero: "0002", fecha: F, inicioMin: 660 }, ctx);
    expect(sinUsuario).toEqual({ ok: false, error: expect.stringContaining("no tiene usuario de UGR") });
    const ausencia = aplicarOperacion(PLAN, { tipo: "mover", id: 4, agenteNumero: "0002", fecha: F, inicioMin: 600 }, ctx);
    expect(ausencia).toEqual({ ok: false, error: expect.stringContaining("coincide con una ausencia") });
    // Entrante fuera del horario del servicio
    const horario = aplicarOperacion(PLAN, { tipo: "redimensionar", id: 3, inicioMin: 840, finMin: 1200 }, ctx);
    expect(horario).toEqual({ ok: false, error: expect.stringContaining("fuera del horario del servicio") });
  });

  it("las duras que ya había no bloquean otras ediciones del mismo día", () => {
    // Una ausencia dada de alta después de generar deja el GH 9-14 de 0002 encima
    const conDura = [...PLAN.filter((b) => b.id !== 4), bloque(4, "0002", "GH", 9, 14)];
    const r = aplicarOperacion(conDura, { tipo: "redimensionar", id: 5, inicioMin: 960, finMin: 1140 }, ctx);
    expect(r.ok).toBe(true);
    // ...y encogerlo para que no la pise sí se puede
    expect(aplicarOperacion(conDura, { tipo: "redimensionar", id: 4, inicioMin: 660, finMin: 840 }, ctx).ok).toBe(true);
  });

  it("no se pisa un bloque fijado", () => {
    const conFijado = PLAN.map((b) => (b.id === 6 ? { ...b, fijado: true } : b));
    const r = aplicarOperacion(conFijado, { tipo: "mover", id: 2, agenteNumero: "0003", fecha: F, inicioMin: 660 }, ctx);
    expect(r).toEqual({ ok: false, error: expect.stringContaining("fijado") });
  });

  it("estirar recorta al vecino y encoger devuelve a GH lo que queda dentro del turno", () => {
    const estirado = aplicarOk({ tipo: "redimensionar", id: 2, inicioMin: 600, finMin: 840 });
    expect(cambios(PLAN, estirado.bloques)).toEqual(["0001 05/10 10-11: GH → UGR"]);
    expect(estirado.bloques.find((b) => b.id === 1)).toMatchObject({ inicioMin: 540, finMin: 600 });
    const encogido = aplicarOk({ tipo: "redimensionar", id: 2, inicioMin: 660, finMin: 720 });
    expect(cambios(PLAN, encogido.bloques)).toEqual(["0001 05/10 12-14: UGR → GH"]);
  });

  it("dividir y unir no cambian ninguna celda", () => {
    const dividido = aplicarOk({ tipo: "dividir", id: 6, enMin: 660 });
    expect(dividido.bloques.filter((b) => b.agenteNumero === "0003" && b.inicioMin < 840)).toHaveLength(2);
    expect(cambios(PLAN, dividido.bloques)).toEqual([]);
    const unido = aplicarOk({ tipo: "unir", id: 6 }, dividido.bloques);
    expect(unido.bloques.find((b) => b.id === 6)).toMatchObject({ inicioMin: 540, finMin: 840, origen: "motor" });
    expect(unido.bloques).toHaveLength(PLAN.length);
    expect(aplicarOperacion(PLAN, { tipo: "dividir", id: 6, enMin: 690 }, ctx).ok).toBe(false);
    expect(aplicarOperacion(PLAN, { tipo: "dividir", id: 6, enMin: 540 }, ctx).ok).toBe(false);
  });

  it("cambiar de cliente, eliminar (hueco libre), fijar y crear encima", () => {
    const cliente = aplicarOk({ tipo: "cambiarCliente", id: 6, clienteCodigo: "UGR" });
    expect(cambios(PLAN, cliente.bloques)).toEqual(["0003 05/10 9-14: GH → UGR"]);
    expect(aplicarOperacion(PLAN, { tipo: "cambiarCliente", id: 4, clienteCodigo: "UGR" }, ctx).ok).toBe(false);

    const eliminado = aplicarOk({ tipo: "eliminar", id: 2 });
    expect(cambios(PLAN, eliminado.bloques)).toEqual(["0001 05/10 11-14: UGR → libre"]);

    const fijado = aplicarOk({ tipo: "fijar", id: 3, fijado: true });
    expect(fijado.bloques.find((b) => b.id === 3)).toMatchObject({ fijado: true, origen: "motor", regla: "base_turno" });
    expect(aplicarOk({ tipo: "fijar", id: 3, fijado: false }).cambia).toBe(false);

    const creado = aplicarOk({ tipo: "crear", agenteNumero: "0001", fecha: F, inicioMin: 1080, finMin: 1200, clienteCodigo: "CEFF" });
    expect(cambios(PLAN, creado.bloques)).toEqual(["0001 05/10 18-20: GH → CEFF"]);
    expect(creado.bloques.find((b) => b.id === creado.foco)).toMatchObject({
      clienteCodigo: "CEFF", origen: "manual", datos: { accion: "creado", clienteAnterior: "GH" },
    });
  });

  it("horarios fuera de franja, del día o del mes se rechazan", () => {
    expect(aplicarOperacion(PLAN, { tipo: "mover", id: 2, agenteNumero: "0001", fecha: F, inicioMin: 630 }, ctx).ok).toBe(false);
    expect(aplicarOperacion(PLAN, { tipo: "mover", id: 2, agenteNumero: "0001", fecha: F, inicioMin: 1080 }, ctx).ok).toBe(false);
    expect(aplicarOperacion(PLAN, { tipo: "mover", id: 2, agenteNumero: "0001", fecha: "2026-11-02", inicioMin: 660 }, ctx).ok).toBe(false);
    expect(aplicarOperacion(PLAN, { tipo: "mover", id: 2, agenteNumero: "9999", fecha: F, inicioMin: 660 }, ctx).ok).toBe(false);
    expect(aplicarOperacion(PLAN, { tipo: "eliminar", id: 99 }, ctx).ok).toBe(false);
  });

  it("repetir las operaciones da exactamente lo mismo, ids nuevos incluidos (así guarda el servidor)", () => {
    const ops: Operacion[] = [
      { tipo: "mover", id: 2, agenteNumero: "0003", fecha: F, inicioMin: 660 },
      { tipo: "dividir", id: 7, enMin: 1080 },
      { tipo: "cambiarCliente", id: -2, clienteCodigo: "UGR" },
      { tipo: "fijar", id: -2, fijado: true },
    ];
    // En el navegador, una a una
    let paso = PLAN;
    for (const op of ops) paso = aplicarOk(op, paso).bloques;
    // En el servidor, el lote entero (y validado con zod, como llega)
    const lote = aplicarOperaciones(PLAN, ops.map((o) => esquemaOperacion.parse(o)), ctx);
    expect(lote).toEqual({ ok: true, bloques: paso });
    expect(paso.find((b) => b.id === -2)).toMatchObject({ agenteNumero: "0003", inicioMin: 1080, clienteCodigo: "UGR", fijado: true });
    // El primero que falla para el lote
    expect(aplicarOperaciones(PLAN, [ops[0], { tipo: "eliminar", id: 99 }], ctx)).toMatchObject({ ok: false, indice: 1 });
  });

  it("quitar lo que pisa una ausencia: deja el hueco libre y conserva el resto del bloque", () => {
    const conDura = [...PLAN.filter((b) => b.id !== 4), bloque(4, "0002", "GH", 9, 14)];
    const ops = operacionesQuitarAusencias(conDura, ctx);
    expect(ops).toEqual([{ tipo: "quitarAusencias", agenteNumero: "0002", fecha: F }]);
    const r = aplicarOperaciones(conDura, ops, ctx);
    if (!r.ok) throw new Error(r.error);
    expect(r.bloques.find((b) => b.id === 4)).toMatchObject({ inicioMin: 660, finMin: 840, origen: "motor" });
    expect(cambios(conDura, r.bloques)).toEqual(["0002 05/10 9-11: GH → libre"]);
    expect(operacionesQuitarAusencias(PLAN, ctx)).toEqual([]);
  });

  it("el resumen de la versión se pone al día con las horas editadas", () => {
    const resumen = {
      capacidadH: 50,
      planificadoH: 0,
      semanas: [{ lunes: F, rotacion: "A" as const, fechas: [F], laborables: 1 }],
      clientes: [
        { codigo: "GH", horas: 0, porSemana: {}, objetivo: null, bolsa: 100 },
        { codigo: "UGR", horas: 0, porSemana: {}, objetivo: 3, bolsa: null },
      ],
      agentes: [{ numero: "0001", activo: true, capacidadH: 9, horas: 0, contratoMesH: 6, porCliente: {}, porSemana: {} }],
    };
    const r = actualizarResumen(resumen, PLAN);
    expect(r.planificadoH).toBe(25);
    expect(r.clientes).toEqual([
      { codigo: "GH", horas: 22, porSemana: { [F]: 22 }, objetivo: null, bolsa: 100 },
      { codigo: "UGR", horas: 3, porSemana: { [F]: 3 }, objetivo: 3, bolsa: null },
    ]);
    expect(r.agentes[0]).toMatchObject({ capacidadH: 9, horas: 9, porCliente: { GH: 6, UGR: 3 }, porSemana: { [F]: 9 } });
  });

  it("posición de soltar: ajustada a la franja y sin salirse del día", () => {
    const c = { pasoMin: 60, inicioDiaMin: 480, finDiaMin: 1200 };
    expect(inicioEnPosicion(0, 180, c)).toBe(480);
    expect(inicioEnPosicion(3.4 / 12, 180, c)).toBe(660);
    expect(inicioEnPosicion(3.6 / 12, 180, c)).toBe(720);
    expect(inicioEnPosicion(0.99, 180, c)).toBe(1020);
    expect(inicioEnPosicion(-0.2, 60, c)).toBe(480);
  });

  it("restar tramos", () => {
    expect(restarTramos(TURNO, [{ inicioMin: 600, finMin: 1020 }])).toEqual([
      { inicioMin: 540, finMin: 600 },
      { inicioMin: 1020, finMin: 1200 },
    ]);
  });
});
