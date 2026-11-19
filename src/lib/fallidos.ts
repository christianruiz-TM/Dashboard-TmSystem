// ============================================================
// Contactos FALLIDOS (19/11/2026, pedido por Christian para Supervisión).
// Un contacto fallido es el que Altitude ha dejado parado con un estado de
// error (`activity.status`, enumerado `InteractionDetailedStatus`): todos los
// `Aborted…` («abortado»), `Invalid` y `Rejected`. No se vuelve a llamar
// hasta que supervisión lo corrige en la herramienta de supervisor de
// Altitude. Solo cuentan los que han tenido movimiento en los últimos
// `DIAS_FALLIDOS` días: hay miles de listas ya acabadas (84.000 sin teléfono
// de hace años, 249 de UGR de octubre) que nadie tiene que tocar.
// Es una FOTO DE AHORA: en Tiempo real y en Histórico se ve lo mismo.
// Puro (sin I/O), con tests. SQL en rdb/queries/fallidos.ts.
// ============================================================

import { compararTexto } from "@/lib/orden";

/** Días hacia atrás con movimiento del contacto para que cuente (decidido con Christian). */
export const DIAS_FALLIDOS = 30;

/** ¿Este nombre de `InteractionDetailedStatus` es un estado fallido? (por nombre, regla 5). */
export function esEstadoFallido(nombre: string | null | undefined): boolean {
  const n = (nombre ?? "").trim();
  return /^Aborted/.test(n) || n === "Invalid" || n === "Rejected";
}

/** Qué significa cada estado y qué hacer en Altitude, en lenguaje sencillo. */
export const INFO_ESTADO: Record<string, { texto: string; queHacer: string }> = {
  AbortedNoAddresses: {
    texto: "Sin teléfono válido para llamar",
    queHacer: "Corregir o añadir el teléfono del contacto y volver a activarlo.",
  },
  AbortedMaxTries: {
    texto: "Ha agotado los intentos de llamada",
    queHacer: "Decidir si se vuelve a programar (más intentos) o se cancela.",
  },
  AbortedByAgentLost: {
    texto: "Se cortó la sesión de la agente con la ficha abierta",
    queHacer: "Revisar la ficha y volver a programarlo para que lo llame una agente.",
  },
  AbortedInvalidNumber: {
    texto: "El número no es válido",
    queHacer: "Corregir el teléfono y volver a activarlo, o cancelarlo.",
  },
  AbortedRejected: {
    texto: "La red rechazó la llamada",
    queHacer: "Comprobar el número y volver a programarlo.",
  },
  AbortedBusy: { texto: "Comunica en todos los intentos", queHacer: "Volver a programarlo o cancelarlo." },
  AbortedNoAnswer: { texto: "No contesta en ningún intento", queHacer: "Volver a programarlo o cancelarlo." },
  AbortedMachine: { texto: "Salta siempre un contestador", queHacer: "Volver a programarlo o cancelarlo." },
  AbortedFax: { texto: "El número es un fax", queHacer: "Corregir el teléfono o cancelarlo." },
  AbortedModem: { texto: "El número es un módem", queHacer: "Corregir el teléfono o cancelarlo." },
  AbortedNuisance: {
    texto: "Llamada molesta: se colgó al descolgar el cliente",
    queHacer: "Revisar el contacto y volver a programarlo.",
  },
  AbortedOverflow: { texto: "Desbordado: no había a quién pasar la llamada", queHacer: "Volver a programarlo." },
  AbortedLineOverflow: { texto: "Sin líneas libres para llamar", queHacer: "Volver a programarlo." },
  AbortedTimeout: { texto: "Se agotó el tiempo de espera", queHacer: "Volver a programarlo." },
  AbortedWorkflow: { texto: "Lo paró un flujo automático", queHacer: "Revisar el contacto y volver a programarlo." },
  Invalid: { texto: "Contacto no válido", queHacer: "Revisar los datos del contacto y corregirlos o cancelarlo." },
  Rejected: { texto: "Altitude rechazó el contacto", queHacer: "Revisar los datos del contacto y volver a cargarlo." },
};

/** Texto y qué hacer de un estado (los que no estén en la lista, uno genérico). */
export function infoEstado(nombre: string): { texto: string; queHacer: string } {
  return (
    INFO_ESTADO[nombre] ?? {
      texto: "Altitude paró el contacto con un error",
      queHacer: "Revisarlo en la herramienta de supervisor y volver a programarlo o cancelarlo.",
    }
  );
}

/** Un contacto fallido (una fila de la consulta). */
export interface ContactoFallido {
  /** Código del contacto en Altitude (`activity.code`). */
  contacto: number;
  campania: string;
  /** Nombre del estado (`InteractionDetailedStatus`). */
  estado: string;
  /** Último movimiento del contacto (cuándo falló, más o menos). */
  fecha: Date;
  /** Última agente que lo tocó, si alguna. */
  agente: string | null;
  /** ID único del perfil del directorio. */
  idUnico: string | null;
  nombre: string | null;
  telefono: string | null;
}

export interface GrupoFallidos {
  campania: string;
  estado: string;
  contactos: number;
}

/** Un fallido para la pantalla: la fecha ya en texto (Tiempo real viaja como JSON). */
export type FilaFallido = Omit<ContactoFallido, "fecha"> & {
  /** Último movimiento en hora local, «dd/mm/aaaa hh:mm». */
  fecha: string;
  /** El mismo momento en milisegundos, para ordenar la tabla. */
  ts: number;
};

export interface ResultadoFallidos {
  total: number;
  /** Por campaña y estado (campaña de la A a la Z, y dentro, el estado con más). */
  grupos: GrupoFallidos[];
  /** Estados que aparecen, con cuántos (para la explicación). */
  estados: { estado: string; contactos: number }[];
  /** La lista, de la campaña de la A a la Z y, dentro, el más reciente primero. */
  contactos: FilaFallido[];
}

/** Agrupa la lista de fallidos para la pestaña y la casilla del resumen. */
export function resumirFallidos(lista: readonly ContactoFallido[]): ResultadoFallidos {
  const porGrupo = new Map<string, GrupoFallidos>();
  const porEstado = new Map<string, number>();
  for (const c of lista) {
    const clave = `${c.campania}\u0000${c.estado}`;
    const g = porGrupo.get(clave) ?? { campania: c.campania, estado: c.estado, contactos: 0 };
    g.contactos += 1;
    porGrupo.set(clave, g);
    porEstado.set(c.estado, (porEstado.get(c.estado) ?? 0) + 1);
  }
  const grupos = [...porGrupo.values()].sort(
    (a, b) => compararTexto(a.campania, b.campania) || b.contactos - a.contactos || compararTexto(a.estado, b.estado),
  );
  const estados = [...porEstado.entries()]
    .map(([estado, contactos]) => ({ estado, contactos }))
    .sort((a, b) => b.contactos - a.contactos || compararTexto(a.estado, b.estado));
  const contactos = [...lista]
    .sort((a, b) => compararTexto(a.campania, b.campania) || b.fecha.getTime() - a.fecha.getTime() || a.contacto - b.contacto)
    .map((c) => ({ ...c, fecha: fechaHoraLocal(c.fecha), ts: c.fecha.getTime() }));
  return { total: lista.length, grupos, estados, contactos };
}

/** «dd/mm/aaaa hh:mm» en hora local (nunca toISOString, que da UTC). */
export function fechaHoraLocal(d: Date): string {
  const dos = (n: number) => String(n).padStart(2, "0");
  return `${dos(d.getDate())}/${dos(d.getMonth() + 1)}/${d.getFullYear()} ${dos(d.getHours())}:${dos(d.getMinutes())}`;
}

/**
 * Descarga en Excel de los fallidos con los filtros del panel (cliente, tipo
 * de campaña e IVR). Sin cliente, de todos.
 */
export function hrefExcelFallidos(f: { servicio?: string; incluirIvr?: boolean; tipo?: string }): string {
  const p = new URLSearchParams();
  if (f.servicio) p.set("servicio", f.servicio);
  if (f.servicio && f.tipo) p.set("tipo", f.tipo);
  if (f.incluirIvr) p.set("ivr", "1");
  const qs = p.toString();
  return qs ? `/api/export/fallidos?${qs}` : "/api/export/fallidos";
}
