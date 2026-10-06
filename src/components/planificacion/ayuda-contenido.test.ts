import { describe, expect, it } from "vitest";
import capturas from "./ayuda-capturas.json";
import { buscarAyuda, normalizar, PUNTOS_AYUDA, TAREAS_AYUDA, TEMA_DE, TEMAS_AYUDA } from "./ayuda-contenido";

const CAPTURAS = capturas as Record<string, { src: string; ancho: number; alto: number; puntos: { n: number; x: number; y: number }[] }>;

describe("ayuda de planificación", () => {
  it("el buscador no distingue mayúsculas ni tildes y pide todas las palabras", () => {
    expect(normalizar("Vacaciónes ÁVOLO")).toBe("vacaciones avolo");
    const vac = buscarAyuda("VACACIONES");
    // La que lo lleva en la pregunta, la primera
    expect(vac.tareas[0].id).toBe("vacaciones");
    expect(buscarAyuda("vacaciones").tareas).toEqual(vac.tareas);
    // «publicar» y «avisos» juntas: la tarea de publicar con avisos, no la de apuntar vacaciones
    const pub = buscarAyuda("publicar avisos");
    expect(pub.tareas.map((t) => t.id)).toContain("publicar-avisos");
    expect(pub.tareas.map((t) => t.id)).not.toContain("vacaciones");
    // Busca también en «Si pasa esto» y en las palabras
    expect(buscarAyuda("arrastre").palabras.map(([t]) => t)).toEqual(["Arrastre"]);
    expect(buscarAyuda("solapa").casos.map((c) => c.tema)).toEqual(["ausencias"]);
    // Menos de 3 letras: nada
    expect(buscarAyuda("de").tareas).toEqual([]);
    expect(buscarAyuda("zzzz")).toEqual({ tareas: [], casos: [], palabras: [] });
  });

  it("cada pantalla abre un tema que existe y cada tarea apunta a uno", () => {
    const temas = new Set(TEMAS_AYUDA.map((t) => t.id));
    for (const tema of Object.values(TEMA_DE)) expect(temas.has(tema), tema).toBe(true);
    for (const t of TAREAS_AYUDA) expect(temas.has(t.tema), t.id).toBe(true);
    expect(new Set(TEMAS_AYUDA.map((t) => t.id)).size).toBe(TEMAS_AYUDA.length);
    expect(new Set(TAREAS_AYUDA.map((t) => t.id)).size).toBe(TAREAS_AYUDA.length);
  });

  it("los números de cada captura son los de su «¿Qué veo aquí?»", () => {
    for (const t of TEMAS_AYUDA.filter((x) => x.captura)) {
      const c = CAPTURAS[t.captura!];
      // Sin la captura generada, la ayuda enseña la lista sin imagen: no es un error
      if (!c) continue;
      expect(c.puntos.map((p) => p.n), t.id).toEqual(t.queVeo.map((_, i) => i + 1));
      for (const p of c.puntos) {
        expect(p.x >= 0 && p.x <= c.ancho && p.y >= 0 && p.y <= c.alto, `${t.id} ${p.n}`).toBe(true);
      }
    }
  });

  it("los «?» tienen título y un texto corto", () => {
    for (const [id, { titulo, texto }] of Object.entries(PUNTOS_AYUDA)) {
      expect(titulo.length, id).toBeGreaterThan(0);
      expect(texto.split(/\s+/).length, id).toBeLessThanOrEqual(45);
    }
  });
});
