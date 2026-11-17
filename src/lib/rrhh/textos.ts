// ============================================================
// Panel de RRHH: cómo se llama cada tramo del día en pantalla, en el globo
// y en el Excel (la misma fuente para los tres). Puro.
// ============================================================

import { hora, type PorQueSinConectar, type TramoDia } from "./dia";
import { ETIQUETA_ARRANQUE } from "./motivos";

export const NOMBRE_SIN_CONECTAR: Record<PorQueSinConectar, string> = {
  tarde: "Llegada tarde",
  salida_antes: "Salida antes de hora",
  hueco: "Sin conectar a mitad de jornada",
  sin_entrar: "No se conectó",
};

/** Grupo del tramo (columna «Tipo» del Excel y leyenda). */
export function tipoTramo(t: TramoDia): string {
  switch (t.tipo) {
    case "conectada":
      return "Conectada";
    case "arranque":
      return ETIQUETA_ARRANQUE;
    case "pausa":
      return t.categoria === "ausencia" ? "Pausa (ausencia)" : "Pausa (trabajo sin cola)";
    case "sin_conectar":
      return "Sin conectar en su horario";
    case "ausencia":
      return "Ausencia apuntada";
  }
}

/** Qué fue exactamente: el motivo, el tipo de ausencia, por qué no estaba... */
export function detalleTramo(t: TramoDia): string {
  switch (t.tipo) {
    case "conectada":
      return "Conectada";
    case "arranque":
      return ETIQUETA_ARRANQUE;
    case "pausa":
      return t.abierta ? `${t.motivo} (sigue en pausa)` : t.motivo;
    case "sin_conectar":
      return NOMBRE_SIN_CONECTAR[t.porQue];
    case "ausencia":
      return `${t.ausencia.tipoNombre}${t.ausencia.notas ? ` · ${t.ausencia.notas}` : ""}`;
  }
}

/** Duración en reloj: 15,5 → «15 min 30 s», 125 → «2 h 05 min». */
export function duracion(min: number): string {
  const s = Math.round(min * 60);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const seg = s % 60;
  if (h > 0) return `${h} h ${String(m).padStart(2, "0")} min`;
  if (m > 0) return `${m} min ${String(seg).padStart(2, "0")} s`;
  return `${seg} s`;
}

/** «10:30–10:45 · Descanso · 15 min 00 s». */
export function textoTramo(t: TramoDia): string {
  return `${hora(t.inicioMin)}–${hora(t.finMin)} · ${detalleTramo(t)} · ${duracion(t.finMin - t.inicioMin)}`;
}
