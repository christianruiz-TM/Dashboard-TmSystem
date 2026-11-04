// ============================================================
// Avisos fuera de la página para la campana de alertas (04/11/2026), como
// en la herramienta de tickets: sonido, contador en el título y en el icono
// de la pestaña y notificación de Windows. Solo navegador.
//
// La notificación de Windows exige un «contexto seguro» (HTTPS) y el panel va
// por HTTP en la red interna: en cada PC hay que marcar la dirección como
// segura una vez (docs/notificaciones-escritorio.md). Sin eso, quedan el
// sonido, el título y el icono. Todo funciona con el panel abierto en alguna
// pestaña, aunque esté minimizada.
// ============================================================

import type { Sonido } from "@/lib/alertas-panel";

export type PermisoEscritorio = "no_disponible" | "default" | "granted" | "denied";

export function permisoEscritorio(): PermisoEscritorio {
  if (typeof window === "undefined" || typeof Notification === "undefined" || !window.isSecureContext) return "no_disponible";
  return Notification.permission;
}

/** Solo desde un clic: el navegador no deja pedirlo solo. */
export async function pedirPermisoEscritorio(): Promise<PermisoEscritorio> {
  if (permisoEscritorio() === "no_disponible") return "no_disponible";
  return Notification.requestPermission();
}

/** Notificación de Windows. `tag` evita duplicados con varias pestañas abiertas. */
export function notificarEscritorio(titulo: string, cuerpo: string, tag: string, alPulsar: () => void): void {
  if (permisoEscritorio() !== "granted") return;
  try {
    const n = new Notification(titulo, { body: cuerpo, tag, icon: "/favicon.ico" });
    n.onclick = () => {
      window.focus();
      alPulsar();
      n.close();
    };
  } catch {
    // Algunos navegadores solo dejan notificar desde un service worker: se queda el sonido
  }
}

// ---------- Sonido ----------

let contexto: AudioContext | null = null;

/**
 * El navegador no deja sonar hasta que se toca la página: el primer clic
 * prepara el audio y después suena aunque la pestaña esté en segundo plano.
 */
export function prepararAudio(): void {
  if (typeof window === "undefined" || contexto) return;
  try {
    contexto = new AudioContext();
  } catch {
    contexto = null;
  }
}

const CLAVE_ULTIMO_SONIDO = "alertas.ultimoSonido";

/**
 * Notas cortas generadas (sin fichero): tres para una alerta alta, dos para
 * una media. Con varias pestañas abiertas suena una sola vez.
 */
export function tocarSonido(sonido: Sonido, forzar = false): void {
  if (!forzar) {
    try {
      const ahora = Date.now();
      if (ahora - Number(localStorage.getItem(CLAVE_ULTIMO_SONIDO) ?? 0) < 5000) return;
      localStorage.setItem(CLAVE_ULTIMO_SONIDO, String(ahora));
    } catch {
      // Sin almacenamiento, suena en cada pestaña
    }
  }
  prepararAudio();
  const ctx = contexto;
  if (!ctx) return;
  try {
    if (ctx.state === "suspended") void ctx.resume();
    const notas = sonido === "alta" ? [988, 784, 988] : [784, 988];
    notas.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const inicio = ctx.currentTime + i * 0.2;
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, inicio);
      gain.gain.exponentialRampToValueAtTime(0.2, inicio + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, inicio + 0.18);
      osc.connect(gain).connect(ctx.destination);
      osc.start(inicio);
      osc.stop(inicio + 0.2);
    });
  } catch {
    // Sin audio: quedan el contador y el título
  }
}

// ---------- Título e icono de la pestaña ----------

const PREFIJO = /^\(\d+\+?\) /;
let iconoOriginal: string | null = null;
const ICONO_AVISO = "/favicon-alerta.svg";

/** «(3) Supervisión · …» y el icono con un punto rojo mientras haya alertas sin ver. */
export function marcarPestana(n: number): void {
  if (typeof document === "undefined") return;
  const base = document.title.replace(PREFIJO, "");
  const titulo = n > 0 ? `(${n > 9 ? "9+" : n}) ${base}` : base;
  if (document.title !== titulo) document.title = titulo;
  const enlaces = [...document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]')];
  for (const l of enlaces) {
    if (iconoOriginal == null && !l.href.endsWith(ICONO_AVISO)) iconoOriginal = l.getAttribute("href");
    const destino = n > 0 ? ICONO_AVISO : (iconoOriginal ?? l.getAttribute("href"));
    if (destino && l.getAttribute("href") !== destino) {
      l.setAttribute("href", destino);
      if (n > 0) l.setAttribute("type", "image/svg+xml");
      else l.removeAttribute("type");
    }
  }
}
