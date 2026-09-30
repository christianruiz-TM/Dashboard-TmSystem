import { redirect } from "next/navigation";
import { requireRol, ROLES_PLAN_EDICION } from "@/lib/auth/rbac";

export default async function PaginaConfiguracionPlan() {
  await requireRol(...ROLES_PLAN_EDICION);
  redirect("/planificacion/configuracion/clientes");
}
