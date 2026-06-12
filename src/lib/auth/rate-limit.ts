// ============================================================
// Rate-limit de login en memoria: 5 intentos fallidos por
// usuario+IP en 15 min → bloqueo de 15 min. Suficiente para v0
// en LAN; en la fase de internet se complementará con el proxy.
// ============================================================

const VENTANA_MS = 15 * 60_000;
const MAX_FALLOS = 5;

interface Registro {
  fallos: number;
  primeroEn: number;
  bloqueadoHasta: number | null;
}

const intentos = new Map<string, Registro>();

function claveDe(usuario: string, ip: string | null): string {
  return `${usuario.toLowerCase()}|${ip ?? "?"}`;
}

/** ¿Está bloqueado? Devuelve minutos restantes o null si puede intentar. */
export function minutosBloqueado(usuario: string, ip: string | null): number | null {
  const reg = intentos.get(claveDe(usuario, ip));
  if (!reg?.bloqueadoHasta) return null;
  const restanteMs = reg.bloqueadoHasta - Date.now();
  if (restanteMs <= 0) {
    intentos.delete(claveDe(usuario, ip));
    return null;
  }
  return Math.ceil(restanteMs / 60_000);
}

/** Registra un fallo; devuelve true si este fallo provoca bloqueo. */
export function registrarFallo(usuario: string, ip: string | null): boolean {
  const clave = claveDe(usuario, ip);
  const ahora = Date.now();
  let reg = intentos.get(clave);
  if (!reg || ahora - reg.primeroEn > VENTANA_MS) {
    reg = { fallos: 0, primeroEn: ahora, bloqueadoHasta: null };
  }
  reg.fallos += 1;
  if (reg.fallos >= MAX_FALLOS) reg.bloqueadoHasta = ahora + VENTANA_MS;
  intentos.set(clave, reg);
  return reg.bloqueadoHasta != null;
}

/** Limpia los fallos tras un login correcto. */
export function limpiarFallos(usuario: string, ip: string | null): void {
  intentos.delete(claveDe(usuario, ip));
}
