import { describe, expect, it } from "vitest";
import type { BaseRatiosExito, BaseSalientes, FilaBaseRatios } from "@/lib/rdb/types";
import { calcularSalientes, MIN_INTENTOS_FRANJA } from "./salientes";

function filaRatios(p: Partial<FilaBaseRatios> & Pick<FilaBaseRatios, "agente" | "campania">): FilaBaseRatios {
  return {
    nombre: `Nombre ${p.agente}`,
    sesiones: 0,
    exitos: 0,
    sinExito: 0,
    atendidas: 0,
    productivoSeg: 0,
    exitosConConversacion: 0,
    conversacionExitosSeg: 0,
    exitosConGestion: 0,
    gestionExitosSeg: 0,
    guionSeg: 0,
    noExitosConGestion: 0,
    gestionNoExitosSeg: 0,
    llamadasExito: 0,
    duracionLlamadasExitoSeg: 0,
    llamadasNoExito: 0,
    duracionLlamadasNoExitoSeg: 0,
    ...p,
  };
}

function vacia(): BaseSalientes {
  return { franjas: [], alcance: [], intentos: [], rellamadas: [], ready: [] };
}

const sinRatios: BaseRatiosExito = { filas: [], horasLogadas: [], campaniasConSinExito: [] };

describe("ocupación y tiempo esperando", () => {
  it("script abierto ÷ horas logadas por agente y global; por campaña, su peso", () => {
    const r = calcularSalientes(
      { ...vacia(), ready: [{ agente: "GH_0851", horas: 6, esperando: 0.5 }] },
      {
        filas: [
          filaRatios({ agente: "GH_0851", campania: "gh_a", guionSeg: 5 * 3600 }),
          filaRatios({ agente: "GH_0851", campania: "gh_b", guionSeg: 1 * 3600 }),
          filaRatios({ agente: "GH_0925", campania: "gh_a", guionSeg: 2 * 3600 }),
        ],
        horasLogadas: [
          { agente: "GH_0851", horas: 8 },
          { agente: "GH_0925", horas: 4 },
        ],
        campaniasConSinExito: [],
      },
    );
    const a = r.agentes.find((x) => x.clave === "GH_0851")!;
    expect(a.ocupacionPct).toBe(75); // 6 h de script / 8 h logadas
    expect(a.horasEsperando).toBe(0.5);
    expect(a.esperandoPct).toBe(6.25);
    expect(r.total.ocupacionPct).toBe(66.67); // 8 / 12
    const ga = r.campanias.find((x) => x.clave === "gh_a")!;
    expect(ga.ocupacionPct).toBeNull(); // por campaña no hay horas logadas (regla 11)
    expect(ga.pesoGuionPct).toBe(87.5); // 7 de 8 h de script
    expect(ga.horasEsperando).toBeNull();
  });
});

describe("contactabilidad por franja", () => {
  it("suma por agente, campaña y total, y elige la mejor franja con muestra suficiente", () => {
    const n = MIN_INTENTOS_FRANJA;
    const r = calcularSalientes(
      {
        ...vacia(),
        franjas: [
          { agente: "Soc_1124", nombre: "Belén", campania: "Soc_nuevos", hora: 10, intentos: n, contestados: n / 2, preparaciones: 8, preparacionSeg: 8 * 36 },
          { agente: "Soc_1124", nombre: "Belén", campania: "Soc_nuevos", hora: 12, intentos: n, contestados: n / 4, preparaciones: 4, preparacionSeg: 4 * 40 },
          // Una franja con poca muestra y 100 % no puede ser la «mejor»
          { agente: "Soc_1128", nombre: "Yolanda", campania: "Soc_nuevos", hora: 19, intentos: 3, contestados: 3, preparaciones: 0, preparacionSeg: 0 },
          // Intentos del marcador sin agente: cuentan en campaña y total
          { agente: null, nombre: null, campania: "Soc_repesca", hora: 10, intentos: 10, contestados: 0, preparaciones: 0, preparacionSeg: 0 },
        ],
      },
      sinRatios,
    );
    expect(r.total.intentos).toBe(2 * n + 13);
    expect(r.total.mejorFranja?.hora).toBe(10);
    const belen = r.agentes.find((x) => x.clave === "Soc_1124")!;
    expect(belen.nombre).toBe("Belén");
    expect(belen.contactabilidadPct).toBe(37.5);
    expect(belen.preparacionMediaSeg).toBe(37.33); // (288 + 160) / 12
    expect(r.agentes).toHaveLength(2);
    expect(r.campanias.find((x) => x.clave === "Soc_repesca")!.contactabilidadPct).toBe(0);
  });
});

describe("alcance, rellamadas e intentos hasta el éxito", () => {
  it("usa cada nivel del SQL tal cual (los contactos no se suman entre agentes)", () => {
    const r = calcularSalientes(
      {
        ...vacia(),
        alcance: [
          { nivel: "agente", agente: "A", nombre: "Ana", campania: null, contactos: 10, alcanzados: 6, primeras: 5, intentosHastaHablar: 8 },
          { nivel: "agente", agente: "B", nombre: "Bea", campania: null, contactos: 10, alcanzados: 5, primeras: 4, intentosHastaHablar: 4 },
          { nivel: "total", agente: null, nombre: null, campania: null, contactos: 15, alcanzados: 9, primeras: 9, intentosHastaHablar: 12 },
        ],
        rellamadas: [
          { agente: "A", nombre: "Ana", campania: "x", agendadas: 10, hechas: 8, vencidas: 0, conRetraso: 4, retrasoMin: 120 },
          { agente: null, nombre: null, campania: "x", agendadas: 0, hechas: 0, vencidas: 3, conRetraso: 0, retrasoMin: 0 },
        ],
        intentos: [
          { agente: "A", nombre: "Ana", campania: "x", intento: 1, exitos: 6, intentosTotales: 6 },
          { agente: "A", nombre: "Ana", campania: "x", intento: 3, exitos: 2, intentosTotales: 6 },
          { agente: "A", nombre: "Ana", campania: "x", intento: 0, exitos: 2, intentosTotales: 0 },
        ],
      },
      sinRatios,
    );
    expect(r.total.contactos).toBe(15); // no 20
    expect(r.total.alcanzadosPct).toBe(60);
    expect(r.total.intentosHastaHablar).toBe(1.33);
    const a = r.agentes.find((x) => x.clave === "A")!;
    expect(a.hechasPct).toBe(80);
    expect(a.retrasoMedioMin).toBe(30);
    expect(r.total.vencidas).toBe(3);
    expect(a.exitosPorIntento).toEqual([2, 6, 0, 2, 0, 0]);
    // Los éxitos sin llamada de salida (entrantes) no entran en el %
    expect(a.exitoPrimerIntentoPct).toBe(75);
    expect(a.intentosMediosHastaExito).toBe(1.5);
  });

  it("sin datos, null y no 0", () => {
    const r = calcularSalientes(vacia(), sinRatios);
    expect(r.total.contactabilidadPct).toBeNull();
    expect(r.total.ocupacionPct).toBeNull();
    expect(r.total.mejorFranja).toBeNull();
    expect(r.total.retrasoMedioMin).toBeNull();
  });
});
