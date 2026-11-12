// ============================================================
// Campana de alertas de la barra de arriba (04/11/2026, pedida por
// supervisión, como la de la herramienta de tickets). Puro: corre en el
// navegador (cuándo suena) y en el servidor (qué alertas hay y las
// preferencias de cada usuario).
//
// Las alertas son ESTADOS (desaparecen solas cuando se resuelven), no
// mensajes: cada una lleva un `id` estable mientras dura el problema y sus
// `partes`, lo que la hace la misma alerta (cada llamada por devolver, la
// franja bajo el mínimo, la desconexión de cada agente). «Vista» es por
// usuario y por parte: una alerta está vista si lo están todas sus partes, y
// una parte nueva la vuelve a dejar sin ver. Suena al aparecer una parte
// nueva sin ver (alta o media; nunca al abrir la página) y, mientras quede
// alguna ALTA sin ver, cada `recordatorioMin` minutos. Hoy solo hay alertas
// de planificación; las de Supervisión (SLA, abandono, Not Ready largo)
// entran como otro `origen`.
//
// 06/11/2026: las vistas de HOY ya no se olvidan cuando la alerta desaparece
// un rato. Antes, la de Ávolo se apagaba cada vez que alguien se conectaba
// con Av_ y volvía «nueva» al desconectarse: sonaba otra vez y había que
// marcarla de nuevo (el 05/11, toda la tarde por una llamada de Alemania).
// ============================================================

import type { AlertaCallback } from "./callback";
import type { Alerta } from "./planificacion/alertas";

export type OrigenAlerta = "planificacion" | "callback";
export type GravedadPanel = "alta" | "media" | "info";

export const NOMBRE_ORIGEN: Record<OrigenAlerta, string> = { planificacion: "Planificación", callback: "Callback" };

export interface AlertaPanel {
  /** Estable mientras dura el problema (tipo, cliente y agente). */
  id: string;
  /** Lo que se marca como visto (al menos una). Las de un día llevan la fecha: `plan|YYYY-MM-DD|…`. */
  partes: string[];
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
      vistas: Array.isArray(p.vistas) ? p.vistas.filter((v): v is string => typeof v === "string").slice(-500) : [],
    };
  } catch {
    return { ...PREFERENCIAS_POR_DEFECTO };
  }
}

/**
 * Las alertas de planificación de `hoy` (las de la vista «Hoy») y los
 * borradores de la noche por revisar. Las partes de las de hoy llevan la
 * fecha: la franja de las 10:00 de mañana es otra alerta.
 */
export function alertasDePlanificacion(
  alertas: readonly Alerta[],
  revisar: readonly { mes: string; numero: number; texto: string; enlace: { href: string; etiqueta: string } }[],
  hoy: string,
): AlertaPanel[] {
  return [
    ...alertas.map((a) => {
      const id = `plan|${a.tipo}|${a.cliente ?? ""}|${a.agente ?? ""}`;
      // Sin el cliente ni el agente de la alerta: la parte de un agente es la misma suelta que en la lista
      const partes = a.partes.map((p) => `plan|${hoy}|${a.tipo}|${p}`);
      return {
        id,
        partes: partes.length > 0 ? partes : [`plan|${hoy}|${id}`],
        origen: "planificacion" as const,
        gravedad: a.gravedad,
        mensaje: a.mensaje,
        enlace: { href: "/planificacion/hoy", etiqueta: "Ver el día" },
      };
    }),
    ...revisar.map((p) => {
      const id = `plan|revisar|${p.mes}|${p.numero}`;
      return { id, partes: [id], origen: "planificacion" as const, gravedad: "info" as const, mensaje: p.texto, enlace: p.enlace };
    }),
  ];
}

/**
 * «Callback sin funcionar» de cada cliente (12/11/2026). Una parte por
 * cliente y día: vista una vez, no vuelve a sonar ese día aunque sigan
 * entrando rechazadas (el ticket ya ha salido por correo).
 */
export function alertasDeCallback(alertas: readonly AlertaCallback[], hoy: string): AlertaPanel[] {
  return alertas.map((a) => {
    const id = `callback|${a.servicio}`;
    return {
      id,
      partes: [`callback|${hoy}|${a.servicio}`],
      origen: "callback" as const,
      gravedad: "alta" as const,
      mensaje:
        `Callback de ${a.servicio} sin funcionar: ${a.rechazadas} llamadas rechazadas desde las ${a.desde.slice(11, 16)} ` +
        `y el IVR no ha creado ninguna ficha para devolverlas${a.ultimaFicha ? ` (la última, a las ${a.ultimaFicha.slice(11, 16)})` : " hoy"}.`,
      enlace: { href: `/supervision?servicio=${encodeURIComponent(a.servicio)}`, etiqueta: "Ver Supervisión" },
    };
  });
}

/**
 * Las vistas que se guardan: las de alertas activas y todas las de `hoy`,
 * aunque su alerta haya desaparecido un rato (si vuelve igual, no suena; si
 * vuelve con otra parte, sí). Las de otros días, cuando ya no están activas.
 */
export function podarVistas(vistas: readonly string[], alertas: readonly Pick<AlertaPanel, "partes">[], hoy: string): string[] {
  const activas = new Set(alertas.flatMap((a) => a.partes));
  return vistas.filter((v) => activas.has(v) || v.includes(`|${hoy}|`));
}

/** Vista = todas sus partes vistas. */
export function estaVista(alerta: Pick<AlertaPanel, "partes">, vistas: ReadonlySet<string>): boolean {
  return alerta.partes.every((p) => vistas.has(p));
}

export function sinVer<A extends Pick<AlertaPanel, "partes">>(alertas: readonly A[], vistas: readonly string[]): A[] {
  const vistasSet = new Set(vistas);
  return alertas.filter((a) => !estaVista(a, vistasSet));
}

export type Sonido = "alta" | "media";

/**
 * Qué sonido toca tras una consulta. `antes` = partes que ya han salido en
 * esta pestaña desde que se abrió (null en la primera consulta: al abrir no
 * suena), así que una alerta sin ver que se va y vuelve igual no cuenta como
 * nueva: la recuerda el recordatorio. `ultimoSonidoMs` = la última vez que
 * sonó (o que se abrió la página). `nuevas` son ids de alerta.
 */
export function sonidoQueToca(d: {
  antes: ReadonlySet<string> | null;
  alertas: readonly Pick<AlertaPanel, "id" | "partes" | "gravedad">[];
  preferencias: Pick<PreferenciasAlertas, "sonido" | "recordatorioMin" | "vistas">;
  ultimoSonidoMs: number;
  ahoraMs: number;
}): { sonido: Sonido; motivo: "nueva" | "recordatorio"; nuevas: string[] } | null {
  if (!d.preferencias.sonido) return null;
  const vistas = new Set(d.preferencias.vistas);
  const pendientes = sinVer(d.alertas, d.preferencias.vistas).filter((a) => a.gravedad !== "info");
  const nuevas = d.antes ? pendientes.filter((a) => a.partes.some((p) => !vistas.has(p) && !d.antes!.has(p))) : [];
  if (nuevas.length > 0) {
    return { sonido: nuevas.some((a) => a.gravedad === "alta") ? "alta" : "media", motivo: "nueva", nuevas: nuevas.map((a) => a.id) };
  }
  const min = d.preferencias.recordatorioMin;
  if (min > 0 && pendientes.some((a) => a.gravedad === "alta") && d.ahoraMs - d.ultimoSonidoMs >= min * 60_000) {
    return { sonido: "alta", motivo: "recordatorio", nuevas: [] };
  }
  return null;
}
