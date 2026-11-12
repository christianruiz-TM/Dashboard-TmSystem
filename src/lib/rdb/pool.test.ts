import type { Request } from "mssql";
import { describe, expect, it, vi } from "vitest";
import { conLimite, nombreConsulta } from "./pool";

/** Petición falsa: tarda `ms` en responder; `cancel()` la corta con ECANCEL. */
function peticionFalsa(ms: number) {
  let rechazar: ((e: unknown) => void) | null = null;
  const peticion = {
    query: vi.fn(function (this: unknown) {
      return new Promise((resolve, reject) => {
        rechazar = reject;
        setTimeout(() => resolve({ recordset: [{ x: 1 }] }), ms);
      });
    }),
    cancel: vi.fn(() => {
      rechazar?.(Object.assign(new Error("Canceled."), { code: "ECANCEL" }));
      return true;
    }),
  };
  return peticion;
}

describe("nombreConsulta", () => {
  it("usa el primer comentario de la consulta", () => {
    expect(nombreConsulta("\n  SET NOCOUNT ON;\n  -- Llamadas de salida por franja\n  SELECT 1")).toBe("Llamadas de salida por franja");
  });

  it("sin comentario, el principio del texto en una línea", () => {
    expect(nombreConsulta("SELECT   a,\n  b FROM t")).toBe("SELECT a, b FROM t");
    expect(nombreConsulta("SELECT " + "x".repeat(200))).toHaveLength(100);
  });
});

describe("conLimite (auditoría 11/11/2026, F1)", () => {
  it("una consulta dentro del límite devuelve lo de siempre y no cancela", async () => {
    const falsa = peticionFalsa(10);
    const r = await conLimite(falsa as unknown as Request, 200).query("-- rápida\nSELECT 1");
    expect(r).toEqual({ recordset: [{ x: 1 }] });
    expect(falsa.cancel).not.toHaveBeenCalled();
  });

  it("al pasar del límite cancela en el servidor y falla con un mensaje claro", async () => {
    const falsa = peticionFalsa(5_000);
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const inicio = Date.now();
    await expect(conLimite(falsa as unknown as Request, 50).query("-- tiemposExitos\nSELECT 1")).rejects.toThrow(
      /cancelado al pasar de 0 s \(tiemposExitos\)/,
    );
    expect(Date.now() - inicio).toBeLessThan(1_000);
    expect(falsa.cancel).toHaveBeenCalledTimes(1);
    error.mockRestore();
  });

  it("un error propio de la consulta llega tal cual", async () => {
    const peticion = { query: vi.fn(() => Promise.reject(new Error("Incorrect syntax"))), cancel: vi.fn() };
    await expect(conLimite(peticion as unknown as Request, 200).query("SELECT")).rejects.toThrow("Incorrect syntax");
    expect(peticion.cancel).not.toHaveBeenCalled();
  });

  it("solo cambia ESA petición", () => {
    const a = peticionFalsa(1);
    const original = a.query;
    conLimite(a as unknown as Request, 100);
    expect(a.query).not.toBe(original);
    expect(peticionFalsa(1).query).not.toBe(a.query);
  });
});
