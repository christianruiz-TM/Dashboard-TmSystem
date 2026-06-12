import { redirect } from "next/navigation";
import { requireSesion, RUTA_POR_ROL } from "@/lib/auth/rbac";

/** La home solo decide la vista de inicio según el rol. */
export default async function PaginaInicio() {
  const usuario = await requireSesion();
  redirect(RUTA_POR_ROL[usuario.rol]);
}
