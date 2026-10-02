import { describe, expect, it } from "vitest";
import { sumarDias } from "./calendario";
import {
  campaniasDesdeCierres,
  estimarFinCampania,
  fechaAlRitmo,
  horquillaFin,
  laborablesEntre,
  patronesSimilares,
  type CierresDiaCampania,
} from "./estimacion";

/** Cierres repartidos a partes iguales entre los laborables de un rango. */
function cierresEntre(campania: string, desde: string, hasta: string, total: number): CierresDiaCampania[] {
  const dias: string[] = [];
  for (let f = desde; f <= hasta; f = sumarDias(f, 1)) if (laborablesEntre(f, f) === 1) dias.push(f);
  return dias.map((fecha, i) => ({
    fecha,
    campania,
    cierres: Math.floor(total / dias.length) + (i < total % dias.length ? 1 : 0),
  }));
}

// UGR: la campaña de 2025 (UGR_EGRE) tuvo cierres del 18/09 al 16/10/2025; la
// de 2026 (UGR_EGRE26) empezó el 15/09/2026. Cifras de la SQLite real (02/10/2026).
const UGR_2025 = cierresEntre("UGR_EGRE", "2025-09-18", "2025-10-16", 3954);
const UGR_2026 = cierresEntre("UGR_EGRE26", "2026-09-15", "2026-09-29", 2281);
const FIESTA_NACIONAL = new Set(["2026-10-12"]);

describe("estimación de fin de campaña", () => {
  it("laborables y fecha a un ritmo dado (con y sin festivos)", () => {
    expect(laborablesEntre("2025-09-18", "2025-10-16")).toBe(21);
    expect(laborablesEntre("2026-10-12", "2026-10-16", FIESTA_NACIONAL)).toBe(4);
    // 2.166 cierres a 207,4/día = 10,4 laborables desde el 30/09
    expect(fechaAlRitmo("2026-09-29", 2166, 207.4)).toBe("2026-10-14");
    expect(fechaAlRitmo("2026-09-29", 2166, 207.4, FIESTA_NACIONAL)).toBe("2026-10-15");
    expect(fechaAlRitmo("2026-09-29", 0, 207.4)).toBe("2026-09-29");
    expect(fechaAlRitmo("2026-09-29", 100, 0)).toBeNull();
  });

  it("campañas a partir de sus cierres: terminada si lleva 14 días sin cierres", () => {
    const campanias = campaniasDesdeCierres([...UGR_2025, ...UGR_2026], "2026-09-29");
    expect(campanias).toEqual([
      { campania: "UGR_EGRE", inicio: "2025-09-18", fin: "2025-10-16", cierres: 3954, laborables: 21, terminada: true },
      { campania: "UGR_EGRE26", inicio: "2026-09-15", fin: "2026-09-29", cierres: 2281, laborables: 11, terminada: false },
    ]);
  });

  it("patrones de campañas parecidas: sin el año y, de reserva, el primer tramo", () => {
    expect(patronesSimilares(["UGR[_]EGRE26"])).toEqual({ principales: ["UGR[_]EGRE%"], amplios: ["UGR[_]%"] });
    expect(patronesSimilares(["CajaR[_]Autonomos[_]26"])).toEqual({ principales: ["CajaR[_]Autonomos%"], amplios: ["CajaR[_]%"] });
    expect(patronesSimilares(["CEFF%"])).toEqual({ principales: ["CEFF%"], amplios: [] });
  });

  it("UGR: al ritmo reciente, con lo planificado, por la campaña de 2025 y por contrato", () => {
    // 8 h de UGR cada laborable de octubre (sin el 12/10)
    const horasPlan: Record<string, number> = {};
    for (let f = "2026-10-01"; f <= "2026-10-31"; f = sumarDias(f, 1)) {
      if (laborablesEntre(f, f, FIESTA_NACIONAL) === 1) horasPlan[f] = 8;
    }
    const e = estimarFinCampania({
      fechaDatos: "2026-09-29",
      festivos: FIESTA_NACIONAL,
      cierresPendientes: 2166,
      ritmoHora: 14.57,
      cierresRecientes: 2281,
      laborablesRecientes: 11,
      similares: campaniasDesdeCierres(UGR_2025, "2026-09-29"),
      horasPlan,
      contrato: { horas: 400, consumidas: 168 },
    });
    expect(e.ritmoReciente).toEqual({ cierresDia: 2281 / 11, laborables: 11, fecha: "2026-10-15" });
    // 2.166 ÷ 14,57 = 148,66 h → el 19.º laborable de octubre con 8 h/día (sin el 12)
    expect(e.plan).toMatchObject({ horasPlanificadas: 168, fecha: "2026-10-28", faltanHoras: 0 });
    expect(e.plan!.horasNecesarias).toBeCloseTo(148.66, 2);
    // 3.954 cierres en 21 laborables = 188,3/día → 11,5 laborables
    expect(e.similares?.fecha).toBe("2026-10-16");
    expect(e.similares?.cierresDia).toBeCloseTo(188.29, 2);
    expect(e.similares?.referencias.map((r) => r.campania)).toEqual(["UGR_EGRE"]);
    // Quedan 232 h de contrato y en octubre se planifican 168: no se agota este mes
    expect(e.contrato).toEqual({ restantes: 232, fecha: null });
    expect(horquillaFin(e)).toEqual({ desde: "2026-10-15", hasta: "2026-10-28", contratoAntes: false });
  });

  it("lo planificado no llega, la lista ya está en el objetivo o el contrato se agota antes", () => {
    const base = {
      fechaDatos: "2026-09-29",
      ritmoHora: 10,
      cierresRecientes: 0,
      laborablesRecientes: 0,
      similares: [],
      contrato: null,
    };
    const corto = estimarFinCampania({ ...base, cierresPendientes: 500, horasPlan: { "2026-10-01": 20, "2026-10-02": 10 } });
    expect(corto.plan).toEqual({ horasNecesarias: 50, horasPlanificadas: 30, fecha: null, faltanHoras: 20 });
    expect(corto.ritmoReciente).toBeNull();
    expect(corto.similares).toBeNull();

    const hecho = estimarFinCampania({ ...base, cierresPendientes: -40, horasPlan: {} });
    expect(hecho.plan?.fecha).toBe("2026-09-29");
    expect(hecho.cierresPendientes).toBe(0);

    const contrato = estimarFinCampania({
      ...base,
      cierresPendientes: 500,
      horasPlan: { "2026-10-01": 20, "2026-10-02": 10, "2026-10-05": 30 },
      contrato: { horas: 100, consumidas: 75 },
    });
    expect(contrato.contrato).toEqual({ restantes: 25, fecha: "2026-10-02" });
    // Lo planificado acaba la lista el 05/10, pero el contrato se agota el 02/10
    expect(horquillaFin(contrato)).toEqual({ desde: "2026-10-05", hasta: "2026-10-05", contratoAntes: true });
    expect(horquillaFin(corto)).toBeNull();

    // Una lista de goteo de más de 3 meses no es una campaña parecida
    const goteo = { campania: "gh_us_gougo_torre", inicio: "2025-07-08", fin: "2026-09-09", cierres: 807, laborables: 307 };
    expect(estimarFinCampania({ ...base, cierresPendientes: 300, horasPlan: {}, similares: [goteo] }).similares).toBeNull();
  });
});
