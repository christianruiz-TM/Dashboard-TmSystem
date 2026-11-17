import { describe, expect, it } from "vitest";
import { calcularDiaPersona, type EntradaDiaPersona, type PausaPersona } from "./dia";
import { acumularPeriodo, resumenApuntadas, totalesPeriodo } from "./periodo";

const h = (hh: number, mm = 0) => hh * 60 + mm;
const pausa = (ini: number, fin: number, motivo: string, codigo = 1): PausaPersona => ({
  inicioMin: ini,
  finMin: fin,
  motivo,
  motivoCodigo: codigo,
  abierta: false,
});
// Sin horario: en esta vista solo cuentan las pausas que son ausencia
const dia = (e: Partial<EntradaDiaPersona>) =>
  calcularDiaPersona({ horario: [], sesiones: [], pausas: [], ausencias: [], ahoraMin: null, configMotivos: {}, ...e });

describe("acumularPeriodo", () => {
  it("suma por motivo el tiempo y las veces, solo las pausas que son ausencia", () => {
    const lunes = dia({
      sesiones: [{ inicioMin: h(8), finMin: h(15) }],
      pausas: [
        pausa(h(8), h(8, 3), "NREADY_REASON_NOT_WORKING", 23),
        pausa(h(10), h(10, 20), "Descanso"),
        pausa(h(11), h(11, 4), "Servicio", 7),
        pausa(h(12), h(12, 10), "Formacion", 3),
      ],
    });
    const martes = dia({
      sesiones: [{ inicioMin: h(8), finMin: h(14) }],
      pausas: [pausa(h(10), h(10, 15), "Descanso"), pausa(h(12), h(12, 5), "Servicio", 7)],
    });
    const libre = dia({});
    const r = acumularPeriodo([lunes, martes, libre]);
    expect(r.diasConectada).toBe(2);
    expect(r.conectadaMin).toBe(13 * 60);
    expect(r.motivos).toEqual([
      { motivo: "Descanso", veces: 2, minutos: 35 },
      { motivo: "Servicio", veces: 2, minutos: 9 },
    ]);
    expect(r.ausenteMin).toBe(44);
    expect(r.ausencias).toBe(4);
  });

  it("sin tiempo sin conectar aunque tuviera horario: solo pausas", () => {
    const d = calcularDiaPersona({
      horario: [{ inicioMin: h(8), finMin: h(15) }],
      sesiones: [{ inicioMin: h(9), finMin: h(15) }],
      pausas: [],
      ausencias: [],
      ahoraMin: null,
      configMotivos: {},
    });
    expect(acumularPeriodo([d]).ausenteMin).toBe(0);
  });
});

describe("totalesPeriodo", () => {
  it("suma las personas", () => {
    const a = acumularPeriodo([dia({ sesiones: [{ inicioMin: h(8), finMin: h(9) }], pausas: [pausa(h(8, 10), h(8, 20), "Descanso")] })]);
    const b = acumularPeriodo([dia({ sesiones: [{ inicioMin: h(8), finMin: h(10) }], pausas: [pausa(h(9), h(9, 5), "Descanso")] })]);
    const t = totalesPeriodo([a, b]);
    expect(t.conectadaMin).toBe(180);
    expect(t.motivos).toEqual([{ motivo: "Descanso", veces: 2, minutos: 15 }]);
  });
});

describe("resumenApuntadas", () => {
  const base = { id: 1, tipoNombre: "Vacaciones", color: "#f0f", computaComoTrabajada: true };
  it("cuenta solo los días dentro del periodo y separa las de unas horas", () => {
    const r = resumenApuntadas(
      [
        { ...base, tipoCodigo: "VAC", desde: "2026-10-28", hasta: "2026-11-03", inicioMin: null, finMin: null },
        { ...base, id: 2, tipoCodigo: "VAC", desde: "2026-11-20", hasta: "2026-11-20", inicioMin: null, finMin: null },
        { ...base, id: 3, tipoCodigo: "PER", tipoNombre: "Permiso", desde: "2026-11-10", hasta: "2026-11-10", inicioMin: 540, finMin: 660 },
        { ...base, id: 4, tipoCodigo: "AUS", desde: "2026-12-01", hasta: "2026-12-02", inicioMin: null, finMin: null },
      ],
      "2026-11-01",
      "2026-11-30",
    );
    expect(r.map((x) => [x.tipoCodigo, x.veces, x.dias, x.horas])).toEqual([
      ["PER", 1, 0, 2],
      ["VAC", 2, 4, 0],
    ]);
  });
});
