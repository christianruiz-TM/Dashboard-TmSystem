import { describe, expect, it } from "vitest";
import { activoEntre, ddisFacturables, mesCompleto, mesesDelRango, seSolapan } from "./ddis";

describe("mesesDelRango", () => {
  it("un rango dentro de un mes es ese mes entero", () => {
    expect(mesesDelRango("2026-10-01", "2026-10-08")).toEqual([
      { mes: "2026-10", inicio: "2026-10-01", fin: "2026-10-31" },
    ]);
  });

  it("cruza años y meses de 28 días", () => {
    expect(mesesDelRango("2025-12-20", "2026-02-03").map((m) => [m.mes, m.fin])).toEqual([
      ["2025-12", "2025-12-31"],
      ["2026-01", "2026-01-31"],
      ["2026-02", "2026-02-28"],
    ]);
  });
});

describe("mesCompleto", () => {
  it("solo el mes natural exacto", () => {
    expect(mesCompleto("2026-09-01", "2026-09-30")).toBe("2026-09");
    expect(mesCompleto("2026-02-01", "2026-02-28")).toBe("2026-02");
    expect(mesCompleto("2026-09-01", "2026-09-29")).toBeNull();
    expect(mesCompleto("2026-09-02", "2026-09-30")).toBeNull();
    expect(mesCompleto("2026-09-01", "2026-10-31")).toBeNull();
  });
});

describe("cuota de DDIs (mes entero)", () => {
  const sept = ["2026-09-01", "2026-09-30"] as const;

  const ddi = (numero: string, campaignShortname: string | null, fechaAlta: string | null, fechaBaja: string | null) => ({
    numero,
    campaignShortname,
    fechaAlta,
    fechaBaja,
  });

  it("activo algún día del mes = mes entero", () => {
    expect(activoEntre(ddi("1", "a", "2026-09-30", null), ...sept)).toBe(true);
    expect(activoEntre(ddi("1", "a", "2025-01-10", "2026-09-01"), ...sept)).toBe(true);
  });

  it("no cuenta si entra después o se dio de baja antes, ni sin fecha de alta", () => {
    expect(activoEntre(ddi("1", "a", "2026-10-01", null), ...sept)).toBe(false);
    expect(activoEntre(ddi("1", "a", "2025-01-10", "2026-08-31"), ...sept)).toBe(false);
    expect(activoEntre(ddi("1", "a", null, null), ...sept)).toBe(false);
  });

  it("un número reasignado no choca si los períodos no se pisan (el relevo el mismo día vale)", () => {
    const v7 = { fechaAlta: "2023-12-01", fechaBaja: "2025-01-31" };
    expect(seSolapan(v7, { fechaAlta: "2025-02-01", fechaBaja: null })).toBe(false);
    expect(seSolapan(v7, { fechaAlta: "2025-01-31", fechaBaja: null })).toBe(false);
    expect(seSolapan(v7, { fechaAlta: "2025-01-30", fechaBaja: null })).toBe(true);
    expect(seSolapan({ fechaAlta: "2025-02-01", fechaBaja: null }, { fechaAlta: "2026-01-01", fechaBaja: null })).toBe(true);
    expect(seSolapan({ fechaAlta: "2026-01-01", fechaBaja: "2026-01-01" }, { fechaAlta: "2026-01-01", fechaBaja: null })).toBe(true);
    expect(seSolapan({ fechaAlta: null, fechaBaja: null }, { fechaAlta: "2026-01-01", fechaBaja: null })).toBe(false);
  });

  it("suma DDI-meses por campaña y deja fuera los que no tienen campaña", () => {
    const r = ddisFacturables(
      [
        ddi("1", "gh_a", "2025-03-01", null),
        ddi("2", "gh_a", "2026-09-15", null),
        ddi("3", "gh_b", "2025-03-01", "2026-09-10"),
        ddi("4", null, "2025-03-01", null),
      ],
      "2026-09-01",
      "2026-10-08",
    );
    // gh_a: dos DDIs activos en septiembre y en octubre → 4; gh_b, solo septiembre
    expect(Object.fromEntries(r)).toEqual({ gh_a: 4, gh_b: 1 });
  });

  it("un número que cambia de campaña a mitad de mes se cobra una vez, a la nueva", () => {
    const r = ddisFacturables(
      [ddi("868205179", "gh_vieja", "2025-02-01", "2026-09-10"), ddi("868205179", "gh_nueva", "2026-09-10", null)],
      "2026-08-01",
      "2026-10-31",
    );
    // Agosto, la vieja; septiembre y octubre, la nueva
    expect(Object.fromEntries(r)).toEqual({ gh_vieja: 1, gh_nueva: 2 });
  });

  it("si quien lo tiene al final no tiene campaña (v7), no se cobra a nadie", () => {
    const r = ddisFacturables(
      [ddi("1", "gh_a", "2024-01-01", "2025-01-15"), ddi("1", null, "2025-01-15", "2025-01-31")],
      "2025-01-01",
      "2025-01-31",
    );
    expect(r.size).toBe(0);
  });
});
