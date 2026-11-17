import { describe, expect, it } from "vitest";
import { calcularDiaPersona, hora, resumenEquipo, unirTramos, type AusenciaPersona, type EntradaDiaPersona, type PausaPersona } from "./dia";

const h = (hh: number, mm = 0) => hh * 60 + mm;
const pausa = (ini: number, fin: number, motivo: string, codigo: number | null = 1, abierta = false): PausaPersona => ({
  inicioMin: ini,
  finMin: fin,
  motivo,
  motivoCodigo: codigo,
  abierta,
});
const vac: AusenciaPersona = {
  id: 7,
  tipoCodigo: "VAC",
  tipoNombre: "Vacaciones",
  color: "#f0f",
  computaComoTrabajada: true,
  inicioMin: null,
  finMin: null,
  notas: null,
};
const base = (e: Partial<EntradaDiaPersona>): EntradaDiaPersona => ({
  horario: [{ inicioMin: h(8), finMin: h(15) }],
  sesiones: [],
  pausas: [],
  ausencias: [],
  ahoraMin: null,
  configMotivos: {},
  ...e,
});

describe("unirTramos", () => {
  it("funde lo que se solapa o se toca y ordena", () => {
    expect(
      unirTramos([
        { inicioMin: 600, finMin: 700 },
        { inicioMin: 480, finMin: 600 },
        { inicioMin: 650, finMin: 720 },
        { inicioMin: 800, finMin: 800 },
      ]),
    ).toEqual([{ inicioMin: 480, finMin: 720 }]);
  });
});

describe("calcularDiaPersona", () => {
  it("llega 12 min tarde, descansa 15 min y se va a su hora", () => {
    const d = calcularDiaPersona(
      base({
        sesiones: [{ inicioMin: h(8, 12), finMin: h(15) }],
        pausas: [
          pausa(h(8, 12), h(8, 15), "NREADY_REASON_NOT_WORKING", 23),
          pausa(h(10, 30), h(10, 45), "Descanso"),
          pausa(h(11), h(11, 4), "Llamada manual", 6),
        ],
      }),
    );
    expect(d.entradaMin).toBe(h(8, 12));
    expect(d.salidaMin).toBe(h(15));
    expect(d.llegoTarde).toBe(true);
    expect(d.tardeMin).toBe(12);
    expect(d.salidaAntesMin).toBe(0);
    expect(d.arranqueMin).toBe(3);
    expect(d.pausasAusenciaMin).toBe(15);
    expect(d.pausasTrabajoMin).toBe(4);
    expect(d.tiempoAusenteMin).toBe(27);
    expect(d.tramos.map((t) => t.tipo)).toEqual([
      "sin_conectar",
      "arranque",
      "conectada",
      "pausa",
      "conectada",
      "pausa",
      "conectada",
    ]);
    expect(d.tramos[0]).toMatchObject({ porQue: "tarde" });
    expect(d.porMotivo.map((m) => [m.motivo, m.veces, m.minutos])).toEqual([
      ["Descanso", 1, 15],
      ["Llamada manual", 1, 4],
      ["Hasta ponerse disponible", 1, 3],
    ]);
  });

  it("«hasta ponerse disponible» empieza en el login (sin un tramo conectada de segundos delante)", () => {
    const d = calcularDiaPersona(
      base({
        sesiones: [{ inicioMin: h(8), finMin: h(15) }],
        pausas: [pausa(h(8) + 0.12, h(8, 3), "NREADY_REASON_NOT_WORKING", 23)],
      }),
    );
    expect(d.tramos.slice(0, 2).map((t) => [t.tipo, t.inicioMin])).toEqual([
      ["arranque", h(8)],
      ["conectada", h(8, 3)],
    ]);
    expect(d.arranqueMin).toBe(3);
  });

  it("las pausas de menos de 1 minuto no cuentan (Fin de Jornada al cambiar de usuario)", () => {
    const d = calcularDiaPersona(
      base({
        sesiones: [{ inicioMin: h(8), finMin: h(15) }],
        pausas: [
          pausa(h(10), h(10) + 0.25, "Fin de Jornada", 2),
          pausa(h(11), h(11) + 0.99, "Fin de Jornada", 2),
          pausa(h(12), h(12, 1), "Fin de Jornada", 2),
        ],
      }),
    );
    expect(d.porMotivo).toEqual([{ motivo: "Fin de Jornada", categoria: "ausencia", veces: 1, minutos: 1 }]);
    expect(d.conectadaMin).toBe(7 * 60);
  });

  it("HOY: una pausa abierta sale aunque aún no llegue al minuto", () => {
    const d = calcularDiaPersona(
      base({ ahoraMin: h(10) + 0.5, sesiones: [{ inicioMin: h(8), finMin: h(10) + 0.5 }], pausas: [pausa(h(10), h(10) + 0.5, "Descanso", 1, true)] }),
    );
    expect(d.pausasAusenciaMin).toBe(0.5);
  });

  it("menos de 1 minuto tarde no cuenta", () => {
    const d = calcularDiaPersona(base({ sesiones: [{ inicioMin: h(8) + 0.67, finMin: h(15) }] }));
    expect(d.llegoTarde).toBe(false);
    expect(d.sinConectarMin).toBe(0);
  });

  it("un hueco a mitad y una salida antes de hora", () => {
    const d = calcularDiaPersona(
      base({
        sesiones: [
          { inicioMin: h(8), finMin: h(11) },
          { inicioMin: h(11, 35), finMin: h(14, 30) },
        ],
      }),
    );
    expect(d.huecosMin).toBe(35);
    expect(d.salidaAntesMin).toBe(30);
    expect(d.tardeMin).toBe(0);
  });

  it("la NOT_WORKING a mitad de jornada es una pausa sin motivo (ausencia)", () => {
    const d = calcularDiaPersona(
      base({ sesiones: [{ inicioMin: h(8), finMin: h(15) }], pausas: [pausa(h(12), h(12, 10), "NREADY_REASON_NOT_WORKING", 23)] }),
    );
    expect(d.arranqueMin).toBe(0);
    expect(d.pausasAusenciaMin).toBe(10);
    expect(d.porMotivo[0].motivo).toBe("Pausa sin motivo");
  });

  it("RRHH puede cambiar la categoría de un motivo y ocultarlo", () => {
    const entrada = base({ sesiones: [{ inicioMin: h(8), finMin: h(15) }], pausas: [pausa(h(9), h(9, 20), "Descanso", 1)] });
    expect(calcularDiaPersona({ ...entrada, configMotivos: { "1": "trabajo" } }).pausasTrabajoMin).toBe(20);
    const oculto = calcularDiaPersona({ ...entrada, configMotivos: { "1": "oculto" } });
    expect(oculto.pausasAusenciaMin).toBe(0);
    expect(oculto.tramos.map((t) => t.tipo)).toEqual(["conectada"]);
  });

  it("la misma pausa en dos usuarios a la vez cuenta una vez", () => {
    const d = calcularDiaPersona(
      base({
        sesiones: [
          { inicioMin: h(8), finMin: h(15) },
          { inicioMin: h(9), finMin: h(13) },
        ],
        pausas: [pausa(h(10), h(10, 20), "Descanso"), pausa(h(10), h(10, 20), "Descanso")],
      }),
    );
    expect(d.pausasAusenciaMin).toBe(20);
    expect(d.conectadaMin).toBe(7 * 60);
  });

  it("vacaciones de jornada completa: ausente todo el día, sin tiempo sin conectar", () => {
    const d = calcularDiaPersona(base({ ausencias: [vac] }));
    expect(d.ausenteTodoElDia).toBe(true);
    expect(d.ausenciaCompleta?.tipoCodigo).toBe("VAC");
    expect(d.sinConectarMin).toBe(0);
    expect(d.ausenciaApuntadaMin).toBe(7 * 60);
  });

  it("una VAC en un día sin horario (fin de semana) no la hace ausente", () => {
    expect(calcularDiaPersona(base({ horario: [], ausencias: [vac] })).ausenteTodoElDia).toBe(false);
  });

  it("médico de 8 a 10 apuntado y llega a las 10:05: 5 min tarde", () => {
    const medico = { ...vac, id: 8, tipoCodigo: "PER", inicioMin: h(8), finMin: h(10) };
    const d = calcularDiaPersona(base({ ausencias: [medico], sesiones: [{ inicioMin: h(10, 5), finMin: h(15) }] }));
    expect(d.ausenciaApuntadaMin).toBe(120);
    expect(d.tardeMin).toBe(5);
  });

  it("sin conectarse en todo el día y sin nada apuntado", () => {
    const d = calcularDiaPersona(base({}));
    expect(d.ausenteTodoElDia).toBe(true);
    expect(d.sinEntrarMin).toBe(7 * 60);
    expect(d.ausenciaCompleta).toBeNull();
  });

  it("HOY: lo que aún no ha pasado no cuenta y sigue conectada", () => {
    const d = calcularDiaPersona(
      base({
        ahoraMin: h(10),
        sesiones: [{ inicioMin: h(8, 3), finMin: h(10) }],
        pausas: [pausa(h(9, 50), h(10), "Descanso", 1, true)],
      }),
    );
    expect(d.conectadaAhora).toBe(true);
    expect(d.salidaMin).toBeNull();
    expect(d.tardeMin).toBe(3);
    expect(d.salidaAntesMin).toBe(0);
    expect(d.pausasAusenciaMin).toBe(10);
    expect(d.tramos.at(-1)).toMatchObject({ tipo: "pausa", abierta: true });
  });

  it("HOY antes de su hora de entrada: no está ausente", () => {
    const d = calcularDiaPersona(base({ ahoraMin: h(7, 30) }));
    expect(d.ausenteTodoElDia).toBe(false);
    expect(d.sinConectarMin).toBe(0);
  });

  it("HOY se ha ido a mitad de su horario: de momento es un hueco, no una salida", () => {
    const d = calcularDiaPersona(base({ ahoraMin: h(12), sesiones: [{ inicioMin: h(8), finMin: h(11) }] }));
    expect(d.huecosMin).toBe(60);
    expect(d.salidaAntesMin).toBe(0);
  });

  it("turno partido: tarde por la tarde también", () => {
    const d = calcularDiaPersona(
      base({
        horario: [
          { inicioMin: h(9), finMin: h(14) },
          { inicioMin: h(16), finMin: h(20) },
        ],
        sesiones: [
          { inicioMin: h(9), finMin: h(14) },
          { inicioMin: h(16, 20), finMin: h(20) },
        ],
      }),
    );
    expect(d.tardeMin).toBe(20);
    expect(d.huecosMin).toBe(0);
  });
});

describe("resumenEquipo", () => {
  it("cuenta personas y suma minutos", () => {
    const a = calcularDiaPersona(base({ sesiones: [{ inicioMin: h(8, 10), finMin: h(15) }] }));
    const b = calcularDiaPersona(base({ ausencias: [vac] }));
    const c = calcularDiaPersona(base({}));
    const r = resumenEquipo([a, b, c]);
    expect(r.conHorario).toBe(3);
    expect(r.ausentesTodoElDia).toBe(2);
    expect(r.ausentesPorTipo).toEqual([
      { tipo: "VAC", personas: 1 },
      { tipo: "Sin apuntar", personas: 1 },
    ]);
    expect(r.llegadasTarde).toBe(1);
    expect(r.tardeMin).toBe(10);
    expect(r.sinConectarMin).toBe(10 + 7 * 60);
  });
});

describe("hora", () => {
  it("formatea minutos del día", () => {
    expect(hora(h(9, 5))).toBe("09:05");
    expect(hora(h(9, 5) + 0.99)).toBe("09:05");
  });
});
