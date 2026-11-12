// ============================================================
// Caducidad de las sesiones (puro, con tests).
//
// La sesión es deslizante (SESSION_HORAS, 8 h por defecto): cada petición la
// renueva si queda menos de media ventana. Pero la campana consulta cada
// 60 s en todas las páginas, y Tiempo real, «Hoy» y «Mi servicio» también se
// refrescan solos: con una pestaña abierta la sesión no caducaba NUNCA (un PC
// olvidado el viernes seguía dentro el lunes). Desde el 11/11/2026 (auditoría
// de Fable, F3, decidido con Christian) tiene además un TOPE ABSOLUTO desde
// que se entró (SESSION_MAX_HORAS, 12 h por defecto): da para una jornada
// entera y obliga a entrar de nuevo cada día.
// ============================================================

const HORA_MS = 3_600_000;

/** Horas de un valor de entorno (positivo), o las de por defecto. */
export function horasDeEntorno(valor: string | undefined, porDefecto: number): number {
  const n = Number(valor);
  return Number.isFinite(n) && n > 0 ? n : porDefecto;
}

/** Ventana deslizante (h). */
export function horasVentana(): number {
  return horasDeEntorno(process.env.SESSION_HORAS, 8);
}

/** Tope absoluto desde el login (h). */
export function horasMaximas(): number {
  return horasDeEntorno(process.env.SESSION_MAX_HORAS, 12);
}

/** Momento en que la sesión deja de valer pase lo que pase. */
export function limiteAbsoluto(creada: Date, maxHoras: number): Date {
  return new Date(creada.getTime() + maxHoras * HORA_MS);
}

/** ¿Sigue valiendo? Ni caducada por la ventana ni pasado el tope. */
export function sesionVigente(caduca: Date, creada: Date, ahora: Date, maxHoras: number): boolean {
  return caduca.getTime() > ahora.getTime() && limiteAbsoluto(creada, maxHoras).getTime() > ahora.getTime();
}

/**
 * Nueva caducidad si toca renovar (queda menos de media ventana), o null si
 * no. Nunca pasa del tope absoluto.
 */
export function renovacion(caduca: Date, creada: Date, ahora: Date, ventanaHoras: number, maxHoras: number): Date | null {
  const ventanaMs = ventanaHoras * HORA_MS;
  if (caduca.getTime() - ahora.getTime() >= ventanaMs / 2) return null;
  const nueva = Math.min(ahora.getTime() + ventanaMs, limiteAbsoluto(creada, maxHoras).getTime());
  return nueva > caduca.getTime() ? new Date(nueva) : null;
}

/** Caducidad al crear la sesión: la ventana, sin pasar del tope. */
export function caducidadInicial(ahora: Date, ventanaHoras: number, maxHoras: number): Date {
  return new Date(ahora.getTime() + Math.min(ventanaHoras, maxHoras) * HORA_MS);
}
