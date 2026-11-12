// NOTA: solo servidor. Lo que pide la campana de alertas (04/11/2026): las
// alertas de ahora y las preferencias de cada usuario, guardadas en
// app_settings (`alertas.usuario.<id>`, sin migración), como pidió
// supervisión: por usuario, iguales en cualquier PC. Lógica en alertas-panel.ts.
import { guardarAjuste, obtenerAjuste } from "@/lib/db/settings";
import { hoyISO } from "@/lib/fechas";
import { alertasPlanificacion } from "@/lib/planificacion/seguimiento";
import { alertasCallbackHoy } from "@/lib/callback-servidor";
import {
  alertasDeCallback,
  alertasDePlanificacion,
  leerPreferencias,
  podarVistas,
  type AlertaPanel,
  type PreferenciasAlertas,
} from "./alertas-panel";

const clave = (userId: number) => `alertas.usuario.${userId}`;

const ARRANQUE = `${process.pid}-${Date.now()}`;

/**
 * Identifica el servidor en marcha (cada despliegue arranca uno nuevo). La
 * campana la compara con la de cuando se abrió la página: si cambia, esa
 * pestaña sigue con el código viejo, cuyas acciones ya no existen («Marcar
 * como vista» no se guardaba, 06/11/2026). Un reinicio sin cambios también
 * pide recargar, sin más consecuencia.
 */
export function versionPanel(): string {
  return ARRANQUE;
}

export function preferenciasAlertas(userId: number): PreferenciasAlertas {
  return leerPreferencias(obtenerAjuste(clave(userId), ""));
}

export function guardarPreferenciasAlertas(userId: number, p: PreferenciasAlertas): void {
  guardarAjuste(clave(userId), JSON.stringify(p));
}

/**
 * Alertas de ahora para la campana. Las de planificación son las de la vista
 * «Hoy» (sus consultas a RDBv2 van cacheadas 60 s y compartidas entre todos
 * los que miran). Si una fuente falla, las demás siguen y se avisa.
 */
export async function alertasCampana(hoy = hoyISO()): Promise<{ alertas: AlertaPanel[]; errores: string[] }> {
  const [plan, callback] = await Promise.all([
    alertasPlanificacion(),
    // Callback sin funcionar (12/11/2026): consulta cacheada 60 s, la misma de Supervisión
    alertasCallbackHoy().then(
      (a) => ({ alertas: a, error: null as string | null }),
      (e: unknown) => ({ alertas: [], error: e instanceof Error ? e.message : String(e) }),
    ),
  ]);
  return {
    alertas: [...alertasDePlanificacion(plan.alertas, plan.revisar, hoy), ...alertasDeCallback(callback.alertas, hoy)],
    errores: [...(plan.error ? [`Planificación: ${plan.error}`] : []), ...(callback.error ? [`Callback: ${callback.error}`] : [])],
  };
}

/**
 * Alertas y preferencias de un usuario. Las «vistas» de otros días que ya no
 * están activas se olvidan (y se guarda); las de hoy se quedan hasta mañana
 * (`podarVistas`). Si la consulta falló, no se olvida nada: no se sabe qué
 * sigue activo.
 */
export async function campanaDeUsuario(userId: number) {
  const hoy = hoyISO();
  const { alertas, errores } = await alertasCampana(hoy);
  const preferencias = preferenciasAlertas(userId);
  if (errores.length === 0) {
    const vistas = podarVistas(preferencias.vistas, alertas, hoy);
    if (vistas.length !== preferencias.vistas.length) {
      preferencias.vistas = vistas;
      guardarPreferenciasAlertas(userId, preferencias);
    }
  }
  return { alertas, errores, preferencias };
}
