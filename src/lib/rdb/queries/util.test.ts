import type { Request } from "mssql";
import { describe, expect, it, vi } from "vitest";
import { claveCampanias, filtroCampanias } from "./util";

function peticion() {
  const input = vi.fn();
  return { request: { input } as unknown as Request, input };
}

describe("filtroCampanias", () => {
  it("sin lista no filtra (todas las campañas)", () => {
    const { request, input } = peticion();
    expect(filtroCampanias(request, undefined, "c.shortname")).toBe("");
    expect(input).not.toHaveBeenCalled();
  });

  it("una lista VACÍA es ninguna campaña, nunca todas (auditoría 11/11/2026)", () => {
    const { request, input } = peticion();
    expect(filtroCampanias(request, [], "c.shortname")).toBe(" AND 1 = 0");
    expect(input).not.toHaveBeenCalled();
  });

  it("con campañas, una por parámetro (nunca concatenadas)", () => {
    const { request, input } = peticion();
    expect(filtroCampanias(request, ["gh_a", "gh_b"], "c.shortname")).toBe(" AND c.shortname IN (@camp0, @camp1)");
    expect(input).toHaveBeenCalledTimes(2);
    expect(input.mock.calls.map((c) => [c[0], c[2]])).toEqual([
      ["camp0", "gh_a"],
      ["camp1", "gh_b"],
    ]);
  });
});

describe("claveCampanias", () => {
  it("distingue todas, ninguna y una lista (ordenada)", () => {
    expect(claveCampanias(undefined)).toBe("todas");
    expect(claveCampanias([])).toBe("ninguna");
    expect(claveCampanias(["b", "a"])).toBe("a,b");
  });
});
