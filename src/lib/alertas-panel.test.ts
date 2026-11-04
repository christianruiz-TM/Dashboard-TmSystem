import { describe, expect, it } from "vitest";
import { alertasDePlanificacion, leerPreferencias, podarVistas, sonidoQueToca, type AlertaPanel } from "./alertas-panel";

const AVOLO: AlertaPanel = { id: "plan|a_demanda|AV|", origen: "planificacion", gravedad: "alta", mensaje: "", enlace: null };
const SIN_CONECTAR: AlertaPanel = { id: "plan|sin_conectar|GH|0851", origen: "planificacion", gravedad: "media", mensaje: "", enlace: null };
const REVISAR: AlertaPanel = { id: "plan|revisar|2026-12|3", origen: "planificacion", gravedad: "info", mensaje: "", enlace: null };
const PREF = { sonido: true, recordatorioMin: 3, vistas: [] as string[] };
const MIN = 60_000;

describe("campana de alertas", () => {
  it("ids estables por tipo, cliente y agente; los borradores por revisar, informativos", () => {
    const r = alertasDePlanificacion(
      [
        { tipo: "a_demanda", gravedad: "alta", mensaje: "Ávolo: 2 llamadas por devolver", cliente: "AV" },
        { tipo: "sin_conectar", gravedad: "media", mensaje: "4 agentes…" },
      ],
      [{ mes: "2026-12", numero: 3, texto: "Diciembre: borrador", enlace: { href: "/planificacion/2026-12", etiqueta: "Ver" } }],
    );
    expect(r.map((a) => [a.id, a.gravedad])).toEqual([
      ["plan|a_demanda|AV|", "alta"],
      ["plan|sin_conectar||", "media"],
      ["plan|revisar|2026-12|3", "info"],
    ]);
  });

  it("al abrir la página no suena; suena lo nuevo sin ver, más fuerte si es alta", () => {
    expect(sonidoQueToca({ antes: null, alertas: [AVOLO], preferencias: PREF, ultimoSonidoMs: 0, ahoraMs: 0 })).toBeNull();
    expect(sonidoQueToca({ antes: new Set(), alertas: [SIN_CONECTAR], preferencias: PREF, ultimoSonidoMs: 0, ahoraMs: 0 })).toMatchObject({
      sonido: "media",
      motivo: "nueva",
    });
    expect(sonidoQueToca({ antes: new Set([SIN_CONECTAR.id]), alertas: [SIN_CONECTAR, AVOLO], preferencias: PREF, ultimoSonidoMs: 0, ahoraMs: 0 })).toEqual({
      sonido: "alta",
      motivo: "nueva",
      nuevas: [AVOLO.id],
    });
    // Lo informativo y lo ya visto no suenan; con el sonido quitado, nada
    expect(sonidoQueToca({ antes: new Set(), alertas: [REVISAR], preferencias: PREF, ultimoSonidoMs: 0, ahoraMs: 0 })).toBeNull();
    expect(sonidoQueToca({ antes: new Set(), alertas: [AVOLO], preferencias: { ...PREF, vistas: [AVOLO.id] }, ultimoSonidoMs: 0, ahoraMs: 0 })).toBeNull();
    expect(sonidoQueToca({ antes: new Set(), alertas: [AVOLO], preferencias: { ...PREF, sonido: false }, ultimoSonidoMs: 0, ahoraMs: 0 })).toBeNull();
  });

  it("recuerda cada N minutos las altas sin ver (no las medias)", () => {
    const base = { antes: new Set([AVOLO.id, SIN_CONECTAR.id]), preferencias: PREF, ultimoSonidoMs: 0 };
    expect(sonidoQueToca({ ...base, alertas: [AVOLO], ahoraMs: 2 * MIN })).toBeNull();
    expect(sonidoQueToca({ ...base, alertas: [AVOLO], ahoraMs: 3 * MIN })).toEqual({ sonido: "alta", motivo: "recordatorio", nuevas: [] });
    expect(sonidoQueToca({ ...base, alertas: [SIN_CONECTAR], ahoraMs: 10 * MIN })).toBeNull();
    expect(sonidoQueToca({ ...base, alertas: [AVOLO], preferencias: { ...PREF, recordatorioMin: 0 }, ahoraMs: 60 * MIN })).toBeNull();
  });

  it("las vistas se olvidan cuando la alerta desaparece; preferencias guardadas a prueba de errores", () => {
    expect(podarVistas([AVOLO.id, SIN_CONECTAR.id], [AVOLO])).toEqual([AVOLO.id]);
    expect(leerPreferencias(null)).toEqual({ sonido: true, recordatorioMin: 3, vistas: [] });
    expect(leerPreferencias("no es json")).toEqual({ sonido: true, recordatorioMin: 3, vistas: [] });
    expect(leerPreferencias(JSON.stringify({ sonido: false, recordatorioMin: 7, vistas: ["x", 3] }))).toEqual({
      sonido: false,
      recordatorioMin: 3,
      vistas: ["x"],
    });
  });
});
