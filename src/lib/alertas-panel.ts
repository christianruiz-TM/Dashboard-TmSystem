// ============================================================
// Campana de alertas de la barra de arriba (04/11/2026, pedida por
// supervisión, como la de la herramienta de tickets). Puro: corre en el
// navegador (cuándo suena) y en el servidor (qué alertas hay y las
// preferencias de cada usuario).
//
// Las alertas son ESTADOS (desaparecen solas cuando se resuelven), no
// mensajes: cada una lleva un `id` estable mientras dura el problema. «Vista»
// es por usuario y se olvida cuando la alerta desaparece: si vuelve, suena
// otra vez. Suena al aparecer una alerta nueva sin ver (alta o media; nunca
// al abrir la página) y, mientras quede alguna ALTA sin ver, cada
// `recordatorioMin` minutos. Hoy solo hay alertas de planificación; las de
// Supervisión (SLA, abandono, Not Ready largo) entran como otro `origen`.
// ============================================================

import type { Alerta } from "./planificacion/alertas";

export type OrigenAlerta = "planificacion";
export type GravedadPanel = "alta" | "media" | "info";

export const NOMBRE_ORIGEN: Record<OrigenAlerta, string> = { planificacion: "Planificación" };

export interface AlertaPanel {
  /** Estable mientras dura el problema (tipo, cliente y agente). */
  id: string;
  origen: OrigenAlerta;
  gravedad: GravedadPanel;
  mensaje: string;
  enlace: { href: string; etiqueta: string } | null;
}

/** Cada cuántos minutos se recuerda una alerta alta sin ver (0 = nunca). */
export const RECORDATORIOS_MIN = [0, 1, 3, 5, 10, 15] as const;

export interface PreferenciasAlertas {
  sonido: boolean;
  recordatorioMin: number;
  /** Ids de las alertas que el usuario ha marcado como vistas (solo las que siguen activas). */
  vistas: string[];
}

export const PREFERENCIAS_POR_DEFECTO: PreferenciasAlertas = { sonido: true, recordatorioMin: 3, vistas: [] };

/** Preferencias guardadas (JSON de app_settings); lo que no se entienda, por defecto. */
export function leerPreferencias(texto: string | null | undefined): PreferenciasAlertas {
  if (!texto) return { ...PREFERENCIAS_POR_DEFECTO };
  try {
    const p = JSON.parse(texto) as Partial<PreferenciasAlertas>;
    return {
      sonido: typeof p.sonido === "boolean" ? p.sonido : PREFERENCIAS_POR_DEFECTO.sonido,
      recordatorioMin: (RECORDATORIOS_MIN as readonly number[]).includes(p.recordatorioMin as number)
        ? (p.recordatorioMin as number)
        : PREFERENCIAS_POR_DEFECTO.recordatorioMin,
      vistas: Array.isArray(p.vistas) ? p.vistas.filter((v): v is string => typeof v === "string").slice(0, 500) : [],
    };
  } catch {
    return { ...PREFERENCIAS_POR_DEFECTO };
  }
}

/** Las alertas de planificación (las de la vista «Hoy») y los borradores de la noche por revisar. */
export function alertasDePlanificacion(
  alertas: readonly Alerta[],
  revisar: readonly { mes: string; numero: number; texto: string; enlace: { href: string; etiqueta: string } }[],
): AlertaPanel[] {
  return [
    ...alertas.map((a) => ({
      id: `plan|${a.tipo}|${a.cliente ?? ""}|${a.agente ?? ""}`,
      origen: "planificacion" as const,
      gravedad: a.gravedad,
      mensaje: a.mensaje,
      enlace: { href: "/planificacion/hoy", etiqueta: "Ver el día" },
    })),
    ...revisar.map((p) => ({
      id: `plan|revisar|${p.mes}|${p.numero}`,
      origen: "planificacion" as const,
      gravedad: "info" as const,
      mensaje: p.texto,
      enlace: p.enlace,
    })),
  ];
}

/** Las vistas que siguen activas (así, si una alerta vuelve, vuelve a sonar). */
export function podarVistas(vistas: readonly string[], alertas: readonly Pick<AlertaPanel, "id">[]): string[] {
  const activas = new Set(alertas.map((a) => a.id));
  return vistas.filter((v) => activas.has(v));
}

export function sinVer<A extends Pick<AlertaPanel, "id">>(alertas: readonly A[], vistas: readonly string[]): A[] {
  const vistasSet = new Set(vistas);
  return alertas.filter((a) => !vistasSet.has(a.id));
}

export type Sonido = "alta" | "media";

/**
 * Qué sonido toca tras una consulta. `antes` = ids de la consulta anterior en
 * esta pestaña (null en la primera: al abrir no suena). `ultimoSonidoMs` = la
 * última vez que sonó (o que se abrió la página).
 */
export function sonidoQueToca(d: {
  antes: ReadonlySet<string> | null;
  alertas: readonly Pick<AlertaPanel, "id" | "gravedad">[];
  preferencias: Pick<PreferenciasAlertas, "sonido" | "recordatorioMin" | "vistas">;
  ultimoSonidoMs: number;
  ahoraMs: number;
}): { sonido: Sonido; motivo: "nueva" | "recordatorio"; nuevas: string[] } | null {
  if (!d.preferencias.sonido) return null;
  const pendientes = sinVer(d.alertas, d.preferencias.vistas).filter((a) => a.gravedad !== "info");
  const nuevas = d.antes ? pendientes.filter((a) => !d.antes!.has(a.id)) : [];
  if (nuevas.length > 0) {
    return { sonido: nuevas.some((a) => a.gravedad === "alta") ? "alta" : "media", motivo: "nueva", nuevas: nuevas.map((a) => a.id) };
  }
  const min = d.preferencias.recordatorioMin;
  if (min > 0 && pendientes.some((a) => a.gravedad === "alta") && d.ahoraMs - d.ultimoSonidoMs >= min * 60_000) {
    return { sonido: "alta", motivo: "recordatorio", nuevas: [] };
  }
  return null;
}
