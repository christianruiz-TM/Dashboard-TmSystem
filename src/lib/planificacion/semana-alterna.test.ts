import { describe, expect, it } from "vitest";
import { alternarSemanaEnFoto, bloquesSemanaAlterna } from "./edicion";
import {
  construirDias,
  diasFueraDelMes,
  expandirTurnos,
  type AsignacionTurnoLike,
  type EntradaMotor,
  type PatronLike,
  type Tramo,
} from "./motor";
import type { BloqueTablero } from "./tablero";

// Noviembre de 2026 con la semana A desde el lunes 02/11: A = 02/11, B = 09/11...
// La del 30/11 sigue en diciembre (semana partida) y es A.
// Patrón A: de lunes a viernes 9-14. Patrón B: de lunes a jueves 9-17.
const tramosDias = (dias: number[], inicio: number, fin: number) => dias.map((d) => ({ diaSemana: d, inicioMin: inicio * 60, finMin: fin * 60 }));
const PATRONES: PatronLike[] = [
  { id: 1, tramos: tramosDias([0, 1, 2, 3, 4], 9, 14) },
  { id: 2, tramos: tramosDias([0, 1, 2, 3], 9, 17) },
];
const ASIG: AsignacionTurnoLike[] = [
  { agenteNumero: "0001", patronAId: 1, patronBId: 2, desde: "2026-01-01", hasta: null },
  { agenteNumero: "0002", patronAId: 1, patronBId: 2, desde: "2026-01-01", hasta: null },
];
const DIAS = construirDias({ mes: "2026-11", semanaA: "2026-11-02", servicioCalendario: "Plantilla", festivos: [] });
const FUERA = diasFueraDelMes(DIAS, { servicioCalendario: "Plantilla", festivos: [] });
const T = expandirTurnos(ASIG, PATRONES, DIAS);
const TF = expandirTurnos(ASIG, PATRONES, FUERA);

const FOTO = {
  version: 1,
  mes: "2026-11",
  servicioCalendario: "Plantilla",
  dias: DIAS,
  agentes: ["0001", "0002"].map((numero) => ({
    numero,
    contratoSemanalH: 25,
    habilidades: ["GH"],
    turnos: T[numero],
    turnosFuera: TF[numero],
    ausencias: [],
    ultimaSesion: null,
    forzarActivo: false,
  })),
} as unknown as EntradaMotor;

const h = (inicio: number, fin: number): Tramo => ({ inicioMin: inicio * 60, finMin: fin * 60 });
const turnosDe = (foto: EntradaMotor, numero: string) => foto.agentes.find((a) => a.numero === numero)!;

describe("semana A↔B cambiada a mano", () => {
  it("expandirTurnos: solo cambia la rotación de ese agente esa semana", () => {
    const t = expandirTurnos(ASIG, PATRONES, DIAS, new Set(["0001|2026-11-02"]));
    expect(t["0001"]["2026-11-02"]).toEqual([h(9, 17)]); // B
    expect(t["0001"]["2026-11-06"]).toBeUndefined(); // el viernes B no trabaja
    expect(t["0001"]["2026-11-09"]).toEqual([h(9, 17)]); // la semana del 09/11 ya era B
    expect(t["0001"]["2026-11-16"]).toEqual([h(9, 14)]);
    expect(t["0002"]["2026-11-02"]).toEqual([h(9, 14)]); // el otro agente, igual
  });

  it("cambia el turno de la semana en la foto y se deshace pulsando otra vez", () => {
    const r = alternarSemanaEnFoto(FOTO, "0001", "2026-11-02", ASIG, PATRONES);
    if (!r.ok) throw new Error(r.error);
    expect(r).toMatchObject({ rotacion: "B", cambiada: true });
    expect(r.foto.semanasAlternas).toEqual([{ agenteNumero: "0001", lunes: "2026-11-02" }]);
    const a = turnosDe(r.foto, "0001");
    expect(a.turnos["2026-11-02"]).toEqual([h(9, 17)]);
    expect(a.turnos["2026-11-06"]).toBeUndefined();
    expect(a.turnos["2026-11-16"]).toEqual([h(9, 14)]);
    expect(turnosDe(r.foto, "0002")).toBe(FOTO.agentes[1]);
    expect(FOTO.semanasAlternas).toBeUndefined(); // no muta la foto de partida

    const vuelta = alternarSemanaEnFoto(r.foto, "0001", "2026-11-02", ASIG, PATRONES);
    if (!vuelta.ok) throw new Error(vuelta.error);
    expect(vuelta).toMatchObject({ rotacion: "A", cambiada: false });
    expect("semanasAlternas" in vuelta.foto).toBe(false);
    expect(turnosDe(vuelta.foto, "0001").turnos).toEqual(turnosDe(FOTO, "0001").turnos);
  });

  it("en una semana partida cambia también los días del mes vecino (reparten el contrato)", () => {
    const r = alternarSemanaEnFoto(FOTO, "0001", "2026-11-30", ASIG, PATRONES);
    if (!r.ok) throw new Error(r.error);
    const a = turnosDe(r.foto, "0001");
    expect(a.turnos["2026-11-30"]).toEqual([h(9, 17)]);
    expect(a.turnosFuera?.["2026-12-03"]).toEqual([h(9, 17)]);
    expect(a.turnosFuera?.["2026-12-04"]).toBeUndefined();
    // La semana partida del principio (26/10) no se toca
    expect(a.turnosFuera?.["2026-10-30"]).toEqual(turnosDe(FOTO, "0001").turnosFuera?.["2026-10-30"]);
  });

  it("errores: sin patrón para la otra semana, A y B iguales, agente o semana que no son del plan", () => {
    const sinB = [{ ...ASIG[0], patronBId: null }];
    expect(alternarSemanaEnFoto(FOTO, "0001", "2026-11-02", sinB, PATRONES)).toMatchObject({ ok: false });
    const iguales = [{ ...ASIG[0], patronBId: 1 }];
    const r = alternarSemanaEnFoto(FOTO, "0001", "2026-11-02", iguales, PATRONES);
    expect(r.ok === false && r.error).toMatch(/iguales/);
    expect(alternarSemanaEnFoto(FOTO, "0009", "2026-11-02", ASIG, PATRONES)).toMatchObject({ ok: false });
    expect(alternarSemanaEnFoto(FOTO, "0001", "2026-12-07", ASIG, PATRONES)).toMatchObject({ ok: false });
  });

  it("bloques: los de la semana se quitan (salvo fijados) y el turno nuevo entero va al cliente base", () => {
    const bloque = (id: number, fecha: string, cliente: string, ini: number, fin: number, extra: Partial<BloqueTablero> = {}): BloqueTablero => ({
      id,
      agenteNumero: "0001",
      fecha,
      inicioMin: ini * 60,
      finMin: fin * 60,
      clienteCodigo: cliente,
      regla: "base_turno",
      datos: {},
      fijado: false,
      origen: "motor",
      editadoPor: null,
      editadoAt: null,
      ...extra,
    });
    const antes = [
      bloque(1, "2026-11-02", "GH", 9, 11),
      bloque(2, "2026-11-02", "UGR", 11, 14),
      bloque(3, "2026-11-03", "AV", 10, 12, { fijado: true }),
      bloque(4, "2026-11-06", "GH", 9, 14),
      bloque(5, "2026-11-16", "GH", 9, 14), // otra semana
      { ...bloque(6, "2026-11-02", "GH", 9, 14), agenteNumero: "0002" }, // otro agente
    ];
    const libre = new Map([
      ["0001|2026-11-02", [h(9, 17)]],
      ["0001|2026-11-03", [h(9, 17)]],
      ["0001|2026-11-04", [h(9, 12)]], // con una ausencia de 12 a 17
    ]);
    const semana = ["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-07", "2026-11-08"];
    const final = bloquesSemanaAlterna(antes, "0001", semana, "B", { libre, clienteBase: "GH" });
    expect(final.filter((b) => [3, 5, 6].includes(b.id)).length).toBe(3);
    expect(final.some((b) => [1, 2, 4].includes(b.id))).toBe(false);
    const nuevos = final.filter((b) => b.id < 0);
    expect(nuevos.map((b) => [b.fecha, b.inicioMin / 60, b.finMin / 60, b.clienteCodigo])).toEqual([
      ["2026-11-02", 9, 17, "GH"],
      ["2026-11-03", 9, 10, "GH"],
      ["2026-11-03", 12, 17, "GH"],
      ["2026-11-04", 9, 12, "GH"],
    ]);
    expect(nuevos.every((b) => b.origen === "manual" && b.regla === "manual" && b.datos.accion === "semana" && b.datos.rotacion === "B")).toBe(true);
    expect(new Set(nuevos.map((b) => b.id)).size).toBe(nuevos.length);
  });
});
