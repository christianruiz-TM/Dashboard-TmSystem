"use server";

import { z } from "zod";
import { veAlertas } from "@/lib/auth/rbac";
import { obtenerSesion } from "@/lib/auth/session";
import { RECORDATORIOS_MIN } from "@/lib/alertas-panel";
import { guardarPreferenciasAlertas, preferenciasAlertas } from "@/lib/alertas-servidor";

// Acciones de la campana de alertas (04/11/2026): marcar como vistas y las
// preferencias de sonido de cada usuario. Cada una comprueba la sesión.

async function usuarioConCampana() {
  const usuario = await obtenerSesion();
  if (!usuario || !veAlertas(usuario.rol)) throw new Error("No autorizado");
  return usuario;
}

const esquemaIds = z.array(z.string().min(1).max(300)).max(500);

/** Marca como vistas estas partes de alertas: dejan de contar en la campana y de recordarse. */
export async function marcarAlertasVistas(ids: string[]): Promise<void> {
  const usuario = await usuarioConCampana();
  const nuevas = esquemaIds.parse(ids);
  const p = preferenciasAlertas(usuario.id);
  guardarPreferenciasAlertas(usuario.id, { ...p, vistas: [...new Set([...p.vistas, ...nuevas])].slice(-500) });
}

const esquemaAjustes = z.object({
  sonido: z.boolean(),
  recordatorioMin: z.number().refine((n) => (RECORDATORIOS_MIN as readonly number[]).includes(n), "Valor no permitido"),
});

/** Sonido sí o no y cada cuántos minutos se recuerdan las alertas altas sin ver. */
export async function guardarAjustesAlertas(ajustes: { sonido: boolean; recordatorioMin: number }): Promise<void> {
  const usuario = await usuarioConCampana();
  const a = esquemaAjustes.parse(ajustes);
  guardarPreferenciasAlertas(usuario.id, { ...preferenciasAlertas(usuario.id), ...a });
}
