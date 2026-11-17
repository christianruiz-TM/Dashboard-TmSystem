import { describe, expect, it } from "vitest";
import { aprenderHorario, contratosDistintos, diaSemanaDe, horasSemana, jornadaDelDia, lunesDeFecha, textoHorario, type DiaConectada } from "./horario";

const dia = (fecha: string, ini: string, fin: string): DiaConectada => {
  const m = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  return { fecha, inicioMin: m(ini), finMin: m(fin) };
};

describe("fechas", () => {
  it("día de la semana ISO y lunes", () => {
    expect(diaSemanaDe("2026-11-16")).toBe(1);
    expect(diaSemanaDe("2026-11-22")).toBe(7);
    expect(lunesDeFecha("2026-11-22")).toBe("2026-11-16");
    expect(lunesDeFecha("2026-11-01")).toBe("2026-10-26");
  });
});

describe("aprenderHorario", () => {
  it("de lunes a viernes de 8 a 15 aunque entre a las 07:57", () => {
    const dias: DiaConectada[] = [];
    for (const lunes of ["2026-10-19", "2026-10-26", "2026-11-02", "2026-11-09"]) {
      for (let i = 0; i < 5; i++) {
        const [a, m, d] = lunes.split("-").map(Number);
        const f = new Date(Date.UTC(a, m - 1, d + i)).toISOString().slice(0, 10);
        dias.push(dia(f, i % 2 ? "07:57" : "08:01", "15:02"));
      }
    }
    // Un sábado suelto no hace horario
    dias.push(dia("2026-10-24", "09:00", "13:00"));
    const h = aprenderHorario(dias);
    expect(Object.keys(h)).toEqual(["1", "2", "3", "4", "5"]);
    expect(h[1]).toEqual([{ inicioMin: 480, finMin: 900 }]);
    expect(horasSemana(h)).toBe(35);
    expect(textoHorario(h)).toBe("L-V 08:00-15:00");
  });

  it("un día de la semana que se trabaja menos de la mitad de las semanas no entra", () => {
    const h = aprenderHorario([
      dia("2026-10-19", "09:00", "14:00"),
      dia("2026-10-26", "09:00", "14:00"),
      dia("2026-11-02", "09:00", "14:00"),
      dia("2026-11-09", "09:00", "14:00"),
      dia("2026-11-06", "09:00", "14:00"),
      dia("2026-11-13", "10:00", "14:00"),
    ]);
    expect(h[1]).toEqual([{ inicioMin: 540, finMin: 840 }]);
    // viernes: 2 de 4 semanas → entra (la mitad); mediana 09:30
    expect(h[5]).toEqual([{ inicioMin: 570, finMin: 840 }]);
  });

  it("varias sesiones el mismo día: primera entrada y última salida", () => {
    const h = aprenderHorario([
      dia("2026-11-02", "09:00", "11:00"),
      dia("2026-11-02", "11:30", "14:00"),
      dia("2026-11-09", "09:00", "14:00"),
    ]);
    expect(h[1]).toEqual([{ inicioMin: 540, finMin: 840 }]);
  });

  it("turno partido: los jueves de Bolsas (08-15 y 17-20)", () => {
    const h = aprenderHorario([
      dia("2026-11-05", "08:01", "15:18"),
      dia("2026-11-05", "17:00", "20:03"),
      dia("2026-11-12", "07:51", "15:16"),
      dia("2026-11-12", "16:56", "19:29"),
      dia("2026-10-29", "07:58", "15:00"),
      dia("2026-10-29", "16:58", "20:00"),
      // un jueves sin tarde no lo cambia
      dia("2026-10-22", "08:00", "15:00"),
    ]);
    expect(h[4]).toEqual([
      { inicioMin: 480, finMin: 915 },
      { inicioMin: 1020, finMin: 1200 },
    ]);
    expect(horasSemana(h)).toBe(10.25);
  });

  it("un corte de menos de 1 h no parte el día", () => {
    expect(jornadaDelDia([{ inicioMin: 480, finMin: 600 }, { inicioMin: 640, finMin: 900 }])).toEqual([{ inicioMin: 480, finMin: 900 }]);
    expect(jornadaDelDia([{ inicioMin: 480, finMin: 600 }, { inicioMin: 660, finMin: 900 }])).toHaveLength(2);
  });

  it("texto con días distintos", () => {
    expect(
      textoHorario({
        1: [{ inicioMin: 540, finMin: 840 }],
        2: [{ inicioMin: 540, finMin: 840 }],
        4: [
          { inicioMin: 480, finMin: 900 },
          { inicioMin: 1020, finMin: 1200 },
        ],
        5: [{ inicioMin: 540, finMin: 780 }],
      }),
    ).toBe("L-M 09:00-14:00 · J 08:00-15:00 y 17:00-20:00 · V 09:00-13:00");
  });
});

describe("contratosDistintos", () => {
  it("compara a la centésima y no compara sin dato", () => {
    expect(contratosDistintos(38, 38.001)).toBe(false);
    expect(contratosDistintos(38, 35)).toBe(true);
    expect(contratosDistintos(null, 35)).toBe(false);
  });
});
