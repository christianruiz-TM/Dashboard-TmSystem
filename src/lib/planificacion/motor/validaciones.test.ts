import { describe, expect, it } from "vitest";
import { generarFranjas } from "./franjas";
import type { BloqueBasico } from "./tipos";
import { validarPlan, type ContextoValidacion } from "./validaciones";

// Un día (lunes 05/10/2026), franjas de 1 h de 8 a 20 h. Turno del agente
// 9-14 y 16-20; GH atiende de 9 a 14 y de 16 a 20.
const FECHA = "2026-10-05";
const TURNO = [
  { inicioMin: 540, finMin: 840 },
  { inicioMin: 960, finMin: 1200 },
];

function contexto(cambios: Partial<ContextoValidacion> = {}): ContextoValidacion {
  const franjas = generarFranjas(480, 1200, 60);
  return {
    pasoMin: 60,
    franjas,
    clienteBase: "GH",
    clientes: {
      GH: { codigo: "GH", cuentaComo: null, entrante: true, maxHorasSeguidas: null, horario: { [FECHA]: TURNO } },
      BD: { codigo: "BD", cuentaComo: "GH", entrante: false, maxHorasSeguidas: null, horario: null },
      UGR: { codigo: "UGR", cuentaComo: null, entrante: false, maxHorasSeguidas: 3, horario: null },
      CR: { codigo: "CR", cuentaComo: null, entrante: false, maxHorasSeguidas: null, horario: { [FECHA]: [{ inicioMin: 540, finMin: 840 }] } },
    },
    agentes: {
      "0001": {
        numero: "0001",
        contratoSemanalH: 5,
        habilidades: ["GH", "BD", "UGR", "CR"],
        turnos: { [FECHA]: TURNO },
        ausencias: [],
      },
      "0002": {
        numero: "0002",
        contratoSemanalH: 38,
        habilidades: ["GH"],
        turnos: { [FECHA]: TURNO },
        ausencias: [{ fecha: FECHA, inicioMin: 540, finMin: 660, tipo: "AUS" }],
      },
    },
    festivos: new Set<string>(),
    semanaDe: { [FECHA]: FECHA },
    minimos: {},
    ...cambios,
  };
}

const b = (agenteNumero: string, clienteCodigo: string, ini: number, fin: number): BloqueBasico => ({
  agenteNumero,
  fecha: FECHA,
  clienteCodigo,
  inicioMin: ini * 60,
  finMin: fin * 60,
});

const codigos = (bloques: BloqueBasico[], ctx = contexto()) =>
  validarPlan(bloques, ctx).map((a) => `${a.gravedad}:${a.codigo}`);

describe("validaciones", () => {
  it("un plan limpio no da incidencias", () => {
    expect(codigos([b("0001", "GH", 9, 11), b("0001", "UGR", 11, 14)])).toEqual([]);
  });

  it("dura: bloques solapados del mismo agente", () => {
    expect(codigos([b("0001", "GH", 9, 12), b("0001", "UGR", 11, 13)])).toContain("dura:solapado");
  });

  it("dura: agente sin usuario de ese cliente", () => {
    expect(codigos([b("0002", "UGR", 16, 18)])).toContain("dura:sin_usuario");
  });

  it("dura: bloque sobre una ausencia", () => {
    expect(codigos([b("0002", "GH", 10, 12)])).toContain("dura:sobre_ausencia");
  });

  it("fuera del horario del servicio: dura en entrantes, blanda en salientes", () => {
    const gh = codigos([b("0001", "GH", 14, 15)]);
    expect(gh).toContain("dura:fuera_horario_servicio");
    const cr = codigos([b("0001", "CR", 16, 18)]);
    expect(cr).toContain("blanda:fuera_horario_servicio");
    expect(cr).not.toContain("dura:fuera_horario_servicio");
  });

  it("blanda: GH por debajo del mínimo (BD cuenta como GH)", () => {
    const ctx = contexto({ minimos: { [FECHA]: generarFranjas(480, 1200, 60).map((f) => (f === 600 ? 2 : 0)) } });
    const avisos = validarPlan([b("0001", "GH", 9, 14)], ctx).filter((a) => a.codigo === "franja_bajo_minimo");
    expect(avisos).toHaveLength(1);
    expect(avisos[0]).toMatchObject({ gravedad: "blanda", inicioMin: 600, datos: { hay: 1, minimo: 2 } });
    expect(codigos([b("0001", "GH", 9, 14), b("0002", "BD", 11, 12)], ctx)).toContain("blanda:franja_bajo_minimo");
    expect(codigos([b("0001", "GH", 9, 14), b("0002", "BD", 10, 11)], ctx)).not.toContain("blanda:franja_bajo_minimo");
  });

  it("blanda: fuera del turno del agente", () => {
    expect(codigos([b("0001", "UGR", 14, 16)])).toContain("blanda:fuera_turno");
  });

  it("blanda: trabajo en festivo", () => {
    expect(codigos([b("0001", "GH", 9, 10)], contexto({ festivos: new Set([FECHA]) }))).toContain("blanda:trabajo_festivo");
  });

  it("blanda: semana por encima de max(contrato, horas del patrón)", () => {
    // Contrato 5 h, patrón 9 h: 9 h no avisa, 10 h (fuera de turno) sí
    expect(codigos([b("0001", "GH", 9, 14), b("0001", "GH", 16, 20)])).not.toContain("blanda:semana_sobre_contrato");
    expect(codigos([b("0001", "GH", 8, 14), b("0001", "GH", 16, 20)])).toContain("blanda:semana_sobre_contrato");
  });

  it("blanda: más horas seguidas del mismo cliente que su máximo (uniendo bloques)", () => {
    expect(codigos([b("0001", "UGR", 9, 11), b("0001", "UGR", 11, 13)])).toContain("blanda:horas_seguidas");
    expect(codigos([b("0001", "UGR", 9, 11), b("0001", "GH", 11, 12), b("0001", "UGR", 12, 14)])).not.toContain(
      "blanda:horas_seguidas",
    );
  });

  it("las duras van primero", () => {
    const avisos = validarPlan([b("0002", "UGR", 16, 18), b("0001", "UGR", 14, 16)], contexto());
    expect(avisos[0].gravedad).toBe("dura");
  });
});
