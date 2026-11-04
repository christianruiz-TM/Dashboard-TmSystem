// NOTA: solo servidor. Lo que pide la campana de alertas (04/11/2026): las
// alertas de ahora y las preferencias de cada usuario, guardadas en
// app_settings (`alertas.usuario.<id>`, sin migración), como pidió
// supervisión: por usuario, iguales en cualquier PC. Lógica en alertas-panel.ts.
import { guardarAjuste, obtenerAjuste } from "@/lib/db/settings";
import { alertasPlanificacion } from "@/lib/planificacion/seguimiento";
import {
  alertasDePlanificacion,
  leerPreferencias,
  podarVistas,
  type AlertaPanel,
  type PreferenciasAlertas,
} from "./alertas-panel";

const clave = (userId: number) => `alertas.usuario.${userId}`;

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
export async function alertasCampana(): Promise<{ alertas: AlertaPanel[]; errores: string[] }> {
  const plan = await alertasPlanificacion();
  return {
    alertas: alertasDePlanificacion(plan.alertas, plan.revisar),
    errores: plan.error ? [`Planificación: ${plan.error}`] : [],
  };
}

/**
 * Alertas y preferencias de un usuario. Las «vistas» que ya no están activas
 * se olvidan (y se guarda), para que una alerta que vuelve suene otra vez.
 * Si la consulta falló, no se olvida nada: no se sabe qué sigue activo.
 */
export async function campanaDeUsuario(userId: number) {
  const { alertas, errores } = await alertasCampana();
  const preferencias = preferenciasAlertas(userId);
  if (errores.length === 0) {
    const vistas = podarVistas(preferencias.vistas, alertas);
    if (vistas.length !== preferencias.vistas.length) {
      preferencias.vistas = vistas;
      guardarPreferenciasAlertas(userId, preferencias);
    }
  }
  return { alertas, errores, preferencias };
}
