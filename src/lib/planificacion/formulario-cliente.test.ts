import { describe, expect, it } from "vitest";
import {
  aFormulario,
  desdeFormulario,
  diferenciasParametros,
  numeroTexto,
  parsearBloques,
  perdidasAlEditar,
  resumenParametros,
  textoHorario,
  type FilaHorario,
  type FormularioCliente,
} from "./formulario-cliente";

// Los parámetros de la semilla (scripts/planificacion-semilla.ts): lo que hay
// en la SQLite real tiene que caber entero en el formulario.
const SEMILLA: Record<string, Record<string, unknown>> = {
  GH: { calendario: "GrupoHuertas", erlang: { ahtSeg: null, slaPct: 80, umbralSeg: 20, margen: 1 } },
  BD: {
    bloques: [{ inicioMin: 540, finMin: 660 }, { inicioMin: 1080, finMin: 1200 }],
    maxBloquesDiaAgente: 1, horasSemanaFijas: 10, kDia: 4, pesoContacto: 0,
  },
  LX: {
    bloques: [{ inicioMin: 540, finMin: 660 }, { inicioMin: 1080, finMin: 1200 }],
    maxBloquesDiaAgente: 1, ritmoManual: 6.9, kDia: 4, pesoContacto: 0,
  },
  AV: { calendario: "GrupoAvolo" },
  UGR: {
    bloques: [{ inicioMin: 660, finMin: 840, bonus: 0.3 }, { inicioMin: 960, finMin: 1080, bonus: 0 }],
    evitar: [{ inicioMin: 1080, finMin: 1140 }],
    maxHorasDiaAgente: 5, pctVivosObjetivo: 28.32, curva: "uniforme", kDia: 6,
  },
  CAJAR: {
    bloques: [{ inicioMin: 600, finMin: 720, bonus: 0.3 }, { inicioMin: 960, finMin: 1080 }],
    maxBloquesDiaAgente: 1, curva: "inicio",
  },
  CEFF: { bloques: [{ inicioMin: 1080, finMin: 1200 }], maxBloquesDiaAgente: 1, horasSemanaFijas: 4, curva: "uniforme" },
};

const vacio = (): FormularioCliente => aFormulario({});
const guardar = (cambios: Partial<FormularioCliente>) => desdeFormulario({ ...vacio(), ...cambios });

describe("formulario de parámetros de cliente", () => {
  it("la configuración de cada cliente de la semilla pasa por el formulario sin perder nada", () => {
    for (const [codigo, p] of Object.entries(SEMILLA)) {
      expect(perdidasAlEditar(p), codigo).toEqual([]);
      const r = desdeFormulario(aFormulario(p));
      expect(r.ok, codigo).toBe(true);
      if (r.ok) expect(diferenciasParametros(p, r.parametros), codigo).toEqual([]);
    }
  });

  it("muestra las horas como en Patrones y separa los bloques preferidos", () => {
    const f = aFormulario(SEMILLA.UGR);
    expect(f.bloquesPreferidos).toBe("11-14");
    expect(f.bloquesOtros).toBe("16-18");
    expect(f.evitar).toBe("18-19");
    expect(f.pctVivosObjetivo).toBe("28,32");
    expect(f.pesoPreferidos).toBe("0,3");
    expect(f.erlang).toBe(false);
  });

  it("guarda solo lo que no vale lo de por defecto", () => {
    expect(guardar({})).toEqual({ ok: true, parametros: {} });
    const r = guardar({
      calendario: "GrupoHuertas",
      bloquesPreferidos: "11-14",
      bloquesOtros: "16-18",
      horasContratadas: "1200",
      inicioContrato: "2026-09-01",
      pctVivosObjetivo: "28,32",
      erlang: true,
    });
    expect(r).toEqual({
      ok: true,
      parametros: {
        calendario: "GrupoHuertas",
        erlang: { ahtSeg: null, slaPct: 80, umbralSeg: 20, margen: 1 },
        bloques: [{ inicioMin: 660, finMin: 840, bonus: 0.3 }, { inicioMin: 960, finMin: 1080 }],
        pctVivosObjetivo: 28.32,
        horasContratadas: 1200,
        inicioContrato: "2026-09-01",
      },
    });
  });

  it("no funde bloques contiguos: cada uno se coloca entero", () => {
    expect(parsearBloques("11-13, 13-15")).toEqual([
      { inicioMin: 660, finMin: 780 },
      { inicioMin: 780, finMin: 900 },
    ]);
    expect(parsearBloques("16-18 y 9:30-11")).toEqual([
      { inicioMin: 570, finMin: 660 },
      { inicioMin: 960, finMin: 1080 },
    ]);
    expect(parsearBloques("")).toEqual([]);
    expect(parsearBloques("11 a 14")).toBeNull();
    expect(parsearBloques("14-11")).toBeNull();
  });

  it("explica los errores con el nombre del campo", () => {
    const error = (cambios: Partial<FormularioCliente>) => {
      const r = guardar(cambios);
      return r.ok ? null : r.error;
    };
    expect(error({ horasContratadas: "1.200", inicioContrato: "2026-09-01" })).toMatch(/^Horas contratadas: .*sin puntos de miles \(1200\)/);
    expect(error({ horasContratadas: "1200" })).toMatch(/^Contrato desde: /);
    expect(error({ inicioContrato: "2026-09-01" })).toMatch(/^Horas contratadas: /);
    expect(error({ inicioContrato: "2026-02-30", horasContratadas: "10" })).toMatch(/^Contrato desde: fecha no válida/);
    expect(error({ bloquesPreferidos: "11 a 14" })).toMatch(/^Bloques preferidos: escribe las horas/);
    expect(error({ bloquesPreferidos: "11-14", bloquesOtros: "11-14" })).toMatch(/^Otros bloques posibles: 11-14 ya está/);
    expect(error({ erlang: true, slaPct: "150" })).toMatch(/^Nivel de servicio \(%\): no puede ser mayor que 100/);
    expect(error({ maxBloquesDiaAgente: "1,5" })).toMatch(/entero/);
    expect(error({ ritmoManual: "abc" })).toMatch(/^Ritmo fijo: tiene que ser un número/);
    expect(error({ campaniasSimilares: "UGR_EGRE%\nUGR EGRE" })).toMatch(/«UGR EGRE» no vale/);
    // Sin la casilla de entrantes, sus campos no se miran
    expect(error({ erlang: false, slaPct: "150" })).toBeNull();
  });

  it("avisa de lo que el formulario no puede mostrar tal cual", () => {
    // Bloques preferidos con pesos distintos: al guardar quedan todos con el mayor
    const pesos = { bloques: [{ inicioMin: 600, finMin: 720, bonus: 0.3 }, { inicioMin: 960, finMin: 1080, bonus: 0.5 }] };
    expect(perdidasAlEditar(pesos)).toEqual(["Bloques: 10-12 (+0,3), 16-18 (+0,5) → 10-12 (+0,5), 16-18 (+0,5)"]);
    // Un peso negativo no tiene casilla: pasa a «otros bloques»
    expect(perdidasAlEditar({ bloques: [{ inicioMin: 600, finMin: 720, bonus: -1 }] })).toHaveLength(1);
    // Una clave que el motor no conoce
    expect(perdidasAlEditar({ maxHorasDia: 4 })[0]).toMatch(/^Lo guardado no es válido/);
  });

  it("describe los cambios para la auditoría", () => {
    expect(diferenciasParametros(SEMILLA.CEFF, { ...SEMILLA.CEFF, horasContratadas: 300, inicioContrato: "2026-10-01" })).toEqual([
      "Horas contratadas: — → 300 h",
      "Contrato desde: — → 01/10/2026",
    ]);
    expect(diferenciasParametros(SEMILLA.GH, { calendario: "GrupoHuertas" })).toEqual([
      "Llamadas entrantes: 80 % antes de 20 s · 1 persona de margen · duración medida → no se calculan",
    ]);
    // El orden de los bloques y las franjas partidas de «Nunca en» no son cambios
    expect(
      diferenciasParametros(
        { bloques: [{ inicioMin: 960, finMin: 1080 }, { inicioMin: 600, finMin: 720 }], evitar: [{ inicioMin: 1080, finMin: 1110 }, { inicioMin: 1110, finMin: 1140 }] },
        { bloques: [{ inicioMin: 600, finMin: 720 }, { inicioMin: 960, finMin: 1080 }], evitar: [{ inicioMin: 1080, finMin: 1140 }] },
      ),
    ).toEqual([]);
  });

  it("resume lo configurado en frases cortas", () => {
    expect(resumenParametros(SEMILLA.UGR)).toEqual([
      "Bloques: 11-14 (preferido), 16-18",
      "Nunca en 18-19",
      "Por persona: máx. 5 h al día",
      "Puede quedar 28,32 % de la lista",
    ]);
    expect(resumenParametros(SEMILLA.GH)).toEqual(["Horario: GrupoHuertas", "Entrantes: 80 % antes de 20 s"]);
    expect(resumenParametros({ horasContratadas: 1200, inicioContrato: "2026-09-01" })).toEqual(["Contrato: 1200 h desde el 01/09/2026"]);
    expect(resumenParametros({ pctVivosObjetivo: 150 })).toEqual(["Configuración no válida: revísala"]);
    expect(numeroTexto(12000)).toBe("12.000");
  });
});

describe("horario de atención en texto", () => {
  const lv = [true, true, true, true, true, false, false];
  const FILAS: FilaHorario[] = [
    { servicio: "GrupoHuertas", dias: lv, entradaMin: 540, salidaMin: 840, desde: "2024-01-01", hasta: "2026-12-31" },
    { servicio: "GrupoHuertas", dias: lv, entradaMin: 960, salidaMin: 1200, desde: "2024-01-01", hasta: "2026-12-31" },
    { servicio: "GrupoHuertas", dias: [false, false, false, false, false, true, false], entradaMin: 600, salidaMin: 780, desde: "2024-01-01", hasta: "2026-12-31" },
    { servicio: "GrupoAvolo", dias: lv, entradaMin: 540, salidaMin: 840, desde: "2024-01-01", hasta: "2026-12-31" },
    { servicio: "GrupoAvolo", dias: lv, entradaMin: 960, salidaMin: 1080, desde: "2026-07-12", hasta: "2026-12-31" },
  ];

  it("junta los días con el mismo horario", () => {
    expect(textoHorario(FILAS, "GrupoHuertas", "2026-10-09")).toEqual({ texto: "L-V 9-14, 16-20 · S 10-13", hasta: "2026-12-31" });
  });

  it("respeta la vigencia de cada tramo y, fuera de ella, usa el último", () => {
    expect(textoHorario(FILAS, "GrupoAvolo", "2026-07-01")?.texto).toBe("L-V 9-14");
    expect(textoHorario(FILAS, "GrupoAvolo", "2026-10-09")?.texto).toBe("L-V 9-14, 16-18");
    expect(textoHorario(FILAS, "GrupoAvolo", "2027-01-15")).toEqual({ texto: "L-V 9-14, 16-18", hasta: "2026-12-31" });
  });

  it("null si el calendario no tiene horario", () => {
    expect(textoHorario(FILAS, "UGR", "2026-10-09")).toBeNull();
  });
});
