import { describe, expect, it } from "vitest";
import { esEstadoFallido, hrefExcelFallidos, infoEstado, resumirFallidos, type ContactoFallido } from "@/lib/fallidos";

const fila = (contacto: number, campania: string, estado: string, fecha: string): ContactoFallido => ({
  contacto,
  campania,
  estado,
  fecha: new Date(fecha),
  agente: null,
  idUnico: null,
  nombre: null,
  telefono: null,
});

describe("contactos fallidos (19/11/2026)", () => {
  it("son fallidos todos los Aborted…, Invalid y Rejected; nada más", () => {
    for (const n of ["AbortedNoAddresses", "AbortedMaxTries", "AbortedByAgentLost", "AbortedCustomCallStatus3", "Invalid", "Rejected"]) {
      expect(esEstadoFallido(n), n).toBe(true);
    }
    for (const n of ["Started", "Executing", "Stopped", "Done", "Canceled", "Created", "Suspended", "BeingCanceled", "Restart", "", null]) {
      expect(esEstadoFallido(n), String(n)).toBe(false);
    }
  });

  it("cada estado lleva qué significa y qué hacer; uno desconocido, el genérico", () => {
    expect(infoEstado("AbortedNoAddresses").texto).toMatch(/teléfono/);
    expect(infoEstado("AbortedCustomCallStatus5").queHacer).toMatch(/supervisor/);
  });

  it("agrupa por campaña y estado, y ordena la lista por campaña y lo más reciente", () => {
    const r = resumirFallidos([
      fila(1, "gh_mg_mur", "AbortedNoAddresses", "2026-11-10T10:00:00"),
      fila(2, "Curso_maquinista", "AbortedMaxTries", "2026-11-18T10:00:00"),
      fila(3, "Curso_maquinista", "AbortedMaxTries", "2026-11-17T10:00:00"),
      fila(4, "Curso_maquinista", "AbortedNoAddresses", "2026-11-18T12:00:00"),
    ]);
    expect(r.total).toBe(4);
    expect(r.grupos).toEqual([
      { campania: "Curso_maquinista", estado: "AbortedMaxTries", contactos: 2 },
      { campania: "Curso_maquinista", estado: "AbortedNoAddresses", contactos: 1 },
      { campania: "gh_mg_mur", estado: "AbortedNoAddresses", contactos: 1 },
    ]);
    expect(r.estados).toEqual([
      { estado: "AbortedMaxTries", contactos: 2 },
      { estado: "AbortedNoAddresses", contactos: 2 },
    ]);
    expect(r.contactos.map((c) => c.contacto)).toEqual([4, 2, 3, 1]);
    expect(r.contactos[0].fecha).toBe("18/11/2026 12:00");
  });

  it("sin fallidos, todo vacío", () => {
    expect(resumirFallidos([])).toEqual({ total: 0, grupos: [], estados: [], contactos: [] });
  });

  it("el Excel conserva cliente, tipo (solo con cliente) e IVR", () => {
    expect(hrefExcelFallidos({})).toBe("/api/export/fallidos");
    expect(hrefExcelFallidos({ servicio: "GrupoHuertas", tipo: "solo:BBDD", incluirIvr: true })).toBe(
      "/api/export/fallidos?servicio=GrupoHuertas&tipo=solo%3ABBDD&ivr=1",
    );
    expect(hrefExcelFallidos({ tipo: "todas" })).toBe("/api/export/fallidos");
  });
});
