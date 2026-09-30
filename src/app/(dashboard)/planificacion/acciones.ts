"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ipPeticion, registrarAuditoria } from "@/lib/auth/audit";
import { requireRol, ROLES_PLAN_EDICION } from "@/lib/auth/rbac";
import { generarBorrador } from "@/lib/planificacion/generar";
import { mesesGenerables } from "@/lib/planificacion/vistas";

// ============================================================
// Server Actions del tablero de planificación. Se pueden invocar con un
// POST a mano, así que CADA una comprueba el rol aquí (supervisión; admin
// siempre pasa): operaciones y dirección ven el tablero pero no pueden
// cambiarlo. requireRol redirige a su inicio sin tocar nada.
// ============================================================

export interface EstadoGenerar {
  error: string | null;
}

const esquemaGenerar = z.object({
  mes: z.string().regex(/^\d{4}-\d{2}$/),
  modo: z.enum(["nuevo", "respetar", "cero"]),
});

export async function generarBorradorAccion(_previo: EstadoGenerar, formData: FormData): Promise<EstadoGenerar> {
  const usuario = await requireRol(...ROLES_PLAN_EDICION);
  const datos = esquemaGenerar.safeParse({ mes: formData.get("mes"), modo: formData.get("modo") });
  if (!datos.success) return { error: "Petición no válida." };
  const { mes, modo } = datos.data;
  if (!mesesGenerables().includes(mes)) {
    return { error: `Solo se puede generar el mes actual y los tres siguientes (${mesesGenerables().join(", ")}).` };
  }

  const inicio = Date.now();
  let resultado;
  try {
    resultado = await generarBorrador({ mes, modo, autor: usuario.username });
  } catch (error) {
    console.error(`[planificacion] generar ${mes}:`, error);
    return { error: `No se pudo generar el borrador: ${error instanceof Error ? error.message : String(error)}` };
  }
  registrarAuditoria({
    accion: "plan_generar",
    userId: usuario.id,
    username: usuario.username,
    detalle:
      `mes=${mes} v${resultado.numero} modo=${modo} bloques=${resultado.bloques} fijados=${resultado.fijados} ` +
      `horas=${resultado.planificadoH} duras=${resultado.avisos.dura} blandas=${resultado.avisos.blanda} ` +
      `${Date.now() - inicio} ms`,
    ip: await ipPeticion(),
  });
  revalidatePath("/planificacion");
  redirect(`/planificacion/${mes}`);
}
