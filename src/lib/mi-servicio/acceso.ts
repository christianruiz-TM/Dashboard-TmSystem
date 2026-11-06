import { esInternoMiServicio } from "@/lib/auth/rbac";
import { obtenerCliente, serviciosConCliente } from "@/lib/db/clientes";
import type { User } from "@/lib/db/schema";
import { compararTexto } from "@/lib/orden";
import { listaServicios } from "@/lib/rdb/queries/servicios";

/**
 * De qué cliente (servicio de Altitude) puede ver «Mi servicio» un usuario
 * (06/11/2026). La página y la descarga del informe usan ESTO, así que el
 * alcance se decide en el servidor y nunca por lo que mande el navegador:
 *  - Roles internos (supervisión, operaciones, dirección, admin): el pedido,
 *    si es de un cliente activo dado de alta con su servicio.
 *  - Rol cliente: siempre el servicio de SU cliente, pida lo que pida.
 */
export async function servicioDeMiServicio(
  usuario: User,
  pedido: string | undefined,
): Promise<{
  interno: boolean;
  /** El servicio que se enseña, o null (sin elegir o sin permiso). */
  servicio: string | null;
  /** Clientes del selector (solo internos), de la A a la Z. */
  opciones: string[];
  /** Rol cliente sin servicio utilizable: el nombre de su cliente, si lo tiene. */
  clienteSinServicio?: string | null;
}> {
  const existentes = new Set((await listaServicios()).map((s) => s.servicio));
  if (esInternoMiServicio(usuario.rol)) {
    const opciones = serviciosConCliente()
      .filter((s) => existentes.has(s))
      .sort(compararTexto);
    return { interno: true, servicio: pedido && opciones.includes(pedido) ? pedido : null, opciones };
  }
  const cliente = usuario.clientId != null ? obtenerCliente(usuario.clientId) : undefined;
  const valido = !!cliente && cliente.activo && !!cliente.serviceName && existentes.has(cliente.serviceName);
  return {
    interno: false,
    servicio: valido ? cliente!.serviceName : null,
    opciones: [],
    clienteSinServicio: valido ? undefined : (cliente?.nombre ?? null),
  };
}
