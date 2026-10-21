import { describe, expect, it } from "vitest";
import {
  aplicarCalendario,
  CALENDARIO_PLANTILLA,
  calendarioEfectivo,
  construirDias,
  diasSinTrabajoEquipo,
  festivosLaboralesEquipo,
  horarioPorFecha,
  laborablesDelMes,
  type HorarioLike,
} from "./calendario";
import type { ClienteMotor } from "./tipos";

// Calendarios desde el 21/10/2026: copia de festivos_servicio con cambios a
// mano encima y el calendario laboral de la plantilla aparte.
const SEMANA_A = "2026-08-31";
// festivos_servicio real de diciembre de 2026 (GrupoHuertas y GrupoAvolo)
const ALTITUDE = ["2026-12-07", "2026-12-08", "2026-12-24", "2026-12-25", "2026-12-31"].flatMap((fecha) => [
  { fecha, servicio: "GrupoHuertas" },
  { fecha, servicio: "GrupoAvolo" },
]);
// El laboral: los de GH sin el 24 ni el 31 (art. 49.2 del convenio)
const LABORAL = [
  { fecha: "2026-12-07", tipo: "festivo" as const },
  { fecha: "2026-12-08", tipo: "festivo" as const },
  { fecha: "2026-12-25", tipo: "festivo" as const },
];
const LV = [true, true, true, true, true, false, false];
const HORARIOS: HorarioLike[] = [
  { servicio: "GrupoHuertas", dias: LV, entradaMin: 480, salidaMin: 780, desde: "2024-01-01", hasta: "2026-12-31" },
  { servicio: "GrupoHuertas", dias: LV, entradaMin: 900, salidaMin: 1140, desde: "2024-01-01", hasta: "2026-12-31" },
];

const diciembre = (festivos = calendarioEfectivo({ festivosAltitude: ALTITUDE, excepciones: [], laboral: LABORAL })) =>
  construirDias({
    mes: "2026-12",
    semanaA: SEMANA_A,
    servicioCalendario: CALENDARIO_PLANTILLA,
    festivos: festivos.festivos,
    cierresEquipo: festivos.cierresPlantilla,
  });

const dia = (dias: ReturnType<typeof diciembre>, fecha: string) => dias.find((d) => d.fecha === fecha)!;

describe("calendario efectivo", () => {
  it("el 24 y el 31 los cierra GH pero la plantilla trabaja", () => {
    const dias = diciembre();
    expect(dia(dias, "2026-12-24").festivos).toEqual(["GrupoAvolo", "GrupoHuertas"]);
    expect(dia(dias, "2026-12-24").laborable).toBe(true);
    expect(dia(dias, "2026-12-25").festivos).toEqual(["GrupoAvolo", "GrupoHuertas", CALENDARIO_PLANTILLA]);
    expect(dia(dias, "2026-12-25").laborable).toBe(false);
    // 23 de lunes a viernes − 7, 8 y 25 = 20 (con el de GH, 18)
    expect(laborablesDelMes(dias)).toBe(20);
    const gh = construirDias({ mes: "2026-12", semanaA: SEMANA_A, servicioCalendario: "GrupoHuertas", festivos: ALTITUDE });
    expect(laborablesDelMes(gh)).toBe(18);
  });

  it("«abre» quita el festivo del cliente, «cierra» lo pone y «horario» lo abre con otro horario", () => {
    const cal = calendarioEfectivo({
      festivosAltitude: ALTITUDE,
      excepciones: [
        { calendario: "GrupoHuertas", fecha: "2026-12-07", tipo: "abre", tramos: null },
        { calendario: "GrupoHuertas", fecha: "2026-12-09", tipo: "cierra", tramos: null },
        { calendario: "GrupoHuertas", fecha: "2026-12-24", tipo: "horario", tramos: [{ inicioMin: 540, finMin: 900 }] },
      ],
      laboral: LABORAL,
    });
    const dias = diciembre(cal);
    expect(dia(dias, "2026-12-07").festivos).toEqual(["GrupoAvolo", CALENDARIO_PLANTILLA]);
    expect(dia(dias, "2026-12-09").festivos).toEqual(["GrupoHuertas"]);
    expect(dia(dias, "2026-12-24").festivos).toEqual(["GrupoAvolo"]);
    expect(cal.especiales).toEqual({ GrupoHuertas: { "2026-12-24": [{ inicioMin: 540, finMin: 900 }] } });

    const horario = horarioPorFecha(HORARIOS, "GrupoHuertas", dias, cal.especiales.GrupoHuertas)!;
    // Abre: con el horario de siempre
    expect(horario["2026-12-07"]).toEqual([
      { inicioMin: 480, finMin: 780 },
      { inicioMin: 900, finMin: 1140 },
    ]);
    expect(horario["2026-12-09"]).toEqual([]);
    expect(horario["2026-12-24"]).toEqual([{ inicioMin: 540, finMin: 900 }]);
    expect(horario["2026-12-25"]).toEqual([]);
    // Un cambio de GH no toca a Ávolo
    expect(horarioPorFecha(HORARIOS.map((h) => ({ ...h, servicio: "GrupoAvolo" })), "GrupoAvolo", dias)!["2026-12-07"]).toEqual([]);
  });

  it("el cierre de empresa no trabaja, pero no se compensa con FEST", () => {
    const cal = calendarioEfectivo({
      festivosAltitude: ALTITUDE,
      excepciones: [],
      laboral: [...LABORAL, { fecha: "2026-12-24", tipo: "cierre" }],
    });
    const dias = diciembre(cal);
    expect(cal.cierresPlantilla).toEqual(["2026-12-24"]);
    expect(dia(dias, "2026-12-24")).toMatchObject({ laborable: false, cierreEmpresa: true });
    expect(dia(dias, "2026-12-25").cierreEmpresa).toBeUndefined();
    const entrada = { dias, servicioCalendario: CALENDARIO_PLANTILLA };
    expect([...diasSinTrabajoEquipo(entrada)].sort()).toEqual(["2026-12-07", "2026-12-08", "2026-12-24", "2026-12-25"]);
    expect([...festivosLaboralesEquipo(entrada)].sort()).toEqual(["2026-12-07", "2026-12-08", "2026-12-25"]);
  });
});

describe("aplicarCalendario (tablero con el calendario de ahora)", () => {
  // Foto de antes del 21/10/2026: el calendario de la plantilla era el de GH
  const fotoDias = construirDias({ mes: "2026-12", semanaA: SEMANA_A, servicioCalendario: "GrupoHuertas", festivos: ALTITUDE });
  const cliente = (calendario: string | null): ClienteMotor =>
    ({ codigo: "GH", parametros: { calendario }, horario: horarioPorFecha(HORARIOS, calendario, fotoDias) }) as unknown as ClienteMotor;
  const foto = { dias: fotoDias, servicioCalendario: "GrupoHuertas", clientes: [cliente("GrupoHuertas"), cliente(null)] };
  const ahora = { ...calendarioEfectivo({ festivosAltitude: ALTITUDE, excepciones: [], laboral: LABORAL }), horarios: HORARIOS };

  it("pasa al calendario de la plantilla y avisa del 24 y el 31", () => {
    const r = aplicarCalendario(foto, ahora);
    expect(r.servicioCalendario).toBe(CALENDARIO_PLANTILLA);
    expect(r.cambiadas).toEqual(["2026-12-24", "2026-12-31"]);
    expect(dia(r.dias, "2026-12-24").laborable).toBe(true);
    // La rotación es la de la foto
    expect(r.dias.map((d) => d.rotacion)).toEqual(fotoDias.map((d) => d.rotacion));
    // El horario de GH no cambia (el 24 sigue cerrado para GH) y el cliente sin calendario sigue sin él
    expect(r.clientes[0].horario!["2026-12-24"]).toEqual([]);
    expect(r.clientes[1].horario).toBeNull();
  });

  it("un horario especial de GH es un día cambiado", () => {
    const r = aplicarCalendario(foto, {
      ...calendarioEfectivo({
        festivosAltitude: ALTITUDE,
        excepciones: [{ calendario: "GrupoHuertas", fecha: "2026-12-14", tipo: "horario", tramos: [{ inicioMin: 540, finMin: 840 }] }],
        laboral: [...LABORAL, { fecha: "2026-12-24", tipo: "festivo" }, { fecha: "2026-12-31", tipo: "festivo" }],
      }),
      horarios: HORARIOS,
    });
    expect(r.cambiadas).toEqual(["2026-12-14"]);
    expect(r.clientes[0].horario!["2026-12-14"]).toEqual([{ inicioMin: 540, finMin: 840 }]);
  });
});
