import type { Metadata } from "next";
import Link from "next/link";
import { PanelHoy } from "@/components/planificacion/panel-hoy";
import { requireRol, ROLES_PLAN_LECTURA } from "@/lib/auth/rbac";
import { datosHoy } from "@/lib/planificacion/seguimiento";

export const metadata: Metadata = { title: "Hoy · Planificación" };
export const dynamic = "force-dynamic";

export default async function PaginaHoy() {
  await requireRol(...ROLES_PLAN_LECTURA);
  let inicial: Awaited<ReturnType<typeof datosHoy>> | null = null;
  let error: string | null = null;
  try {
    inicial = await datosHoy();
  } catch (e) {
    error = e instanceof Error ? e.message : "Error consultando los datos de hoy";
  }
  return (
    <div className="space-y-4">
      <div className="text-sm text-muted-foreground">
        <Link href="/planificacion" className="hover:underline">
          Planificación
        </Link>{" "}
        /
      </div>
      {inicial ? (
        <PanelHoy inicial={inicial} />
      ) : (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-2 text-sm text-destructive">
          No se pudieron leer los datos de hoy ({error}). Vuelve a intentarlo en un minuto.
        </div>
      )}
    </div>
  );
}
