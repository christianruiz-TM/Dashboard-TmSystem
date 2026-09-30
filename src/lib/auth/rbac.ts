import { redirect } from "next/navigation";
import type { Rol, User } from "@/lib/db/schema";
import { obtenerSesion } from "./session";

// ============================================================
// Control de acceso por rol. El middleware solo comprueba que
// exista cookie; la autorización REAL ocurre aquí, en servidor.
// `admin` tiene acceso a todo.
// Se llama desde CADA page.tsx (y cada Server Action / route
// handler), nunca solo desde un layout: el layout se renderiza en
// paralelo a la página y no impide que esta se envíe.
// ============================================================

/** Ruta de inicio según el rol del usuario. */
export const RUTA_POR_ROL: Record<Rol, string> = {
  admin: "/direccion",
  direccion: "/direccion",
  operaciones: "/operaciones",
  supervision: "/supervision",
  cliente: "/clientes",
};

/**
 * Planificación de turnos: supervisión (y admin) generan, editan, publican y
 * configuran; operaciones y dirección solo leen (con nombres de agentes: son
 * roles internos). El rol cliente nunca entra.
 */
export const ROLES_PLAN_LECTURA: Rol[] = ["supervision", "operaciones", "direccion"];
export const ROLES_PLAN_EDICION: Rol[] = ["supervision"];

/** ¿Puede este rol generar, editar o configurar la planificación? (admin siempre). */
export function puedeEditarPlan(rol: Rol): boolean {
  return rol === "admin" || ROLES_PLAN_EDICION.includes(rol);
}

/** Entradas de navegación visibles por rol (layout del dashboard). */
export function rutasVisibles(rol: Rol): { ruta: string; etiqueta: string }[] {
  const todas = [
    { ruta: "/direccion", etiqueta: "Dirección", roles: ["admin", "direccion"] },
    { ruta: "/operaciones", etiqueta: "Operaciones", roles: ["admin", "operaciones"] },
    { ruta: "/supervision", etiqueta: "Supervisión", roles: ["admin", "supervision"] },
    { ruta: "/planificacion", etiqueta: "Planificación", roles: ["admin", ...ROLES_PLAN_LECTURA] },
    { ruta: "/clientes", etiqueta: "Mi servicio", roles: ["admin", "cliente"] },
    { ruta: "/admin", etiqueta: "Administración", roles: ["admin"] },
  ];
  return todas
    .filter((r) => r.roles.includes(rol))
    .map(({ ruta, etiqueta }) => ({ ruta, etiqueta }));
}

/**
 * Exige sesión válida. Redirige a /login si no la hay y fuerza el
 * cambio de contraseña pendiente salvo que se indique lo contrario.
 */
export async function requireSesion(
  opciones: { permitirCambioPendiente?: boolean } = {},
): Promise<User> {
  const usuario = await obtenerSesion();
  if (!usuario) redirect("/login");
  if (usuario.mustChangePassword && !opciones.permitirCambioPendiente) {
    redirect("/cambiar-password");
  }
  return usuario;
}

/** Exige uno de los roles indicados (admin siempre pasa). */
export async function requireRol(...roles: Rol[]): Promise<User> {
  const usuario = await requireSesion();
  if (usuario.rol !== "admin" && !roles.includes(usuario.rol)) {
    redirect(RUTA_POR_ROL[usuario.rol]);
  }
  return usuario;
}
