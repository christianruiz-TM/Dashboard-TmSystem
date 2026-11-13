// ============================================================
// Aviso de «empieza una navegación» (12/11/2026, pedido por Christian: con
// las consultas cargando, la pantalla se quedaba quieta y parecía colgada).
// Los enlaces los detecta solo la capa de carga (components/layout/
// carga-navegacion.tsx); lo que navega desde código (los selectores de
// cliente, fechas e IVR con `router.push`) avisa con esta función justo
// antes. Sin imports: se puede llamar desde cualquier componente de cliente.
// ============================================================

export const EVENTO_NAVEGANDO = "tm:navegando";

/** Avisa de que va a cambiar la página (`destino`: la URL a la que se va). */
export function avisarNavegacion(destino: string): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(EVENTO_NAVEGANDO, { detail: destino }));
}
