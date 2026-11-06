import { describe, expect, it } from "vitest";
import { alertasDePlanificacion, leerPreferencias, podarVistas, sinVer, sonidoQueToca, type AlertaPanel } from "./alertas-panel";

const HOY = "2026-11-05";
const alerta = (id: string, gravedad: AlertaPanel["gravedad"], partes: string[]): AlertaPanel => ({
  id,
  partes,
  origen: "planificacion",
  gravedad,
  mensaje: "",
  enlace: null,
});
const AVOLO = alerta("plan|a_demanda|AV|", "alta", [`plan|${HOY}|a_demanda|AV|2130481`]);
const SIN_CONECTAR = alerta("plan|sin_conectar|GH|0851", "media", [`plan|${HOY}|sin_conectar|0851|09:00`]);
const REVISAR = alerta("plan|revisar|2026-12|3", "info", ["plan|revisar|2026-12|3"]);
const PREF = { sonido: true, recordatorioMin: 3, vistas: [] as string[] };
const MIN = 60_000;

describe("campana de alertas", () => {
  it("ids estables por tipo, cliente y agente; partes con la fecha; los borradores por revisar, informativos", () => {
    const r = alertasDePlanificacion(
      [
        { tipo: "a_demanda", gravedad: "alta", mensaje: "Ávolo: 2 llamadas por devolver", cliente: "AV", partes: ["AV|11", "AV|12"] },
        { tipo: "sin_conectar", gravedad: "media", mensaje: "4 agentes…", partes: ["0851|09:00", "0892|09:00"] },
        { tipo: "sin_conectar", gravedad: "media", mensaje: "0851…", agente: "0851", cliente: "GH", partes: ["0851|09:00"] },
      ],
      [{ mes: "2026-12", numero: 3, texto: "Diciembre: borrador", enlace: { href: "/planificacion/2026-12", etiqueta: "Ver" } }],
      HOY,
    );
    expect(r.map((a) => [a.id, a.gravedad, a.partes])).toEqual([
      ["plan|a_demanda|AV|", "alta", [`plan|${HOY}|a_demanda|AV|11`, `plan|${HOY}|a_demanda|AV|12`]],
      ["plan|sin_conectar||", "media", [`plan|${HOY}|sin_conectar|0851|09:00`, `plan|${HOY}|sin_conectar|0892|09:00`]],
      // La parte de un agente es la misma suelta que dentro de la lista
      ["plan|sin_conectar|GH|0851", "media", [`plan|${HOY}|sin_conectar|0851|09:00`]],
      ["plan|revisar|2026-12|3", "info", ["plan|revisar|2026-12|3"]],
    ]);
  });

  it("al abrir la página no suena; suena lo nuevo sin ver, más fuerte si es alta", () => {
    expect(sonidoQueToca({ antes: null, alertas: [AVOLO], preferencias: PREF, ultimoSonidoMs: 0, ahoraMs: 0 })).toBeNull();
    expect(sonidoQueToca({ antes: new Set(), alertas: [SIN_CONECTAR], preferencias: PREF, ultimoSonidoMs: 0, ahoraMs: 0 })).toMatchObject({
      sonido: "media",
      motivo: "nueva",
    });
    expect(
      sonidoQueToca({ antes: new Set(SIN_CONECTAR.partes), alertas: [SIN_CONECTAR, AVOLO], preferencias: PREF, ultimoSonidoMs: 0, ahoraMs: 0 }),
    ).toEqual({ sonido: "alta", motivo: "nueva", nuevas: [AVOLO.id] });
    // Lo informativo y lo ya visto no suenan; con el sonido quitado, nada
    expect(sonidoQueToca({ antes: new Set(), alertas: [REVISAR], preferencias: PREF, ultimoSonidoMs: 0, ahoraMs: 0 })).toBeNull();
    expect(sonidoQueToca({ antes: new Set(), alertas: [AVOLO], preferencias: { ...PREF, vistas: AVOLO.partes }, ultimoSonidoMs: 0, ahoraMs: 0 })).toBeNull();
    expect(sonidoQueToca({ antes: new Set(), alertas: [AVOLO], preferencias: { ...PREF, sonido: false }, ultimoSonidoMs: 0, ahoraMs: 0 })).toBeNull();
  });

  it("recuerda cada N minutos las altas sin ver (no las medias)", () => {
    const base = { antes: new Set([...AVOLO.partes, ...SIN_CONECTAR.partes]), preferencias: PREF, ultimoSonidoMs: 0 };
    expect(sonidoQueToca({ ...base, alertas: [AVOLO], ahoraMs: 2 * MIN })).toBeNull();
    expect(sonidoQueToca({ ...base, alertas: [AVOLO], ahoraMs: 3 * MIN })).toEqual({ sonido: "alta", motivo: "recordatorio", nuevas: [] });
    expect(sonidoQueToca({ ...base, alertas: [SIN_CONECTAR], ahoraMs: 10 * MIN })).toBeNull();
    expect(sonidoQueToca({ ...base, alertas: [AVOLO], preferencias: { ...PREF, recordatorioMin: 0 }, ahoraMs: 60 * MIN })).toBeNull();
  });

  it("05/11: vista la de Ávolo, alguien se conecta con Av_ y se va; no vuelve a sonar ni a quedar sin ver", () => {
    // 10:10 la marcan como vista
    let vistas = [...AVOLO.partes];
    // 10:25 se conecta Av_0940: la alerta desaparece y la consulta poda las vistas
    vistas = podarVistas(vistas, [], HOY);
    expect(vistas).toEqual(AVOLO.partes);
    // 11:49 se desconecta y la misma llamada sigue sin devolver: vuelve la alerta, ya vista y en silencio
    expect(sinVer([AVOLO], vistas)).toEqual([]);
    const pref = { ...PREF, vistas };
    expect(sonidoQueToca({ antes: new Set(AVOLO.partes), alertas: [AVOLO], preferencias: pref, ultimoSonidoMs: 0, ahoraMs: 99 * MIN })).toBeNull();
    // Entra otra perdida: otra parte, suena y queda sin ver
    const otra = { ...AVOLO, partes: [...AVOLO.partes, `plan|${HOY}|a_demanda|AV|2133420`] };
    expect(sinVer([otra], vistas)).toEqual([otra]);
    expect(sonidoQueToca({ antes: new Set(AVOLO.partes), alertas: [otra], preferencias: pref, ultimoSonidoMs: 0, ahoraMs: 99 * MIN })).toEqual({
      sonido: "alta",
      motivo: "nueva",
      nuevas: [AVOLO.id],
    });
  });

  it("una alerta sin ver que se va y vuelve no es nueva: la recuerda el recordatorio", () => {
    const antes = new Set(AVOLO.partes);
    expect(sonidoQueToca({ antes, alertas: [AVOLO], preferencias: PREF, ultimoSonidoMs: 0, ahoraMs: MIN })).toBeNull();
    expect(sonidoQueToca({ antes, alertas: [AVOLO], preferencias: PREF, ultimoSonidoMs: 0, ahoraMs: 3 * MIN })).toMatchObject({ motivo: "recordatorio" });
  });

  it("las vistas de otro día se olvidan cuando la alerta ya no está; preferencias guardadas a prueba de errores", () => {
    const ayer = "plan|2026-11-04|a_demanda|AV|2125059";
    expect(podarVistas([ayer, ...AVOLO.partes, ...SIN_CONECTAR.partes, REVISAR.partes[0]], [AVOLO], HOY)).toEqual([
      ...AVOLO.partes,
      ...SIN_CONECTAR.partes,
    ]);
    expect(podarVistas([REVISAR.partes[0]], [REVISAR], HOY)).toEqual(REVISAR.partes);
    expect(leerPreferencias(null)).toEqual({ sonido: true, recordatorioMin: 3, vistas: [] });
    expect(leerPreferencias("no es json")).toEqual({ sonido: true, recordatorioMin: 3, vistas: [] });
    expect(leerPreferencias(JSON.stringify({ sonido: false, recordatorioMin: 7, vistas: ["x", 3] }))).toEqual({
      sonido: false,
      recordatorioMin: 3,
      vistas: ["x"],
    });
  });
});
