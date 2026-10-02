import Link from "next/link";
import { BotonAyuda } from "@/components/planificacion/ayuda";
import { NavConfiguracion } from "@/components/planificacion/nav-configuracion";
import { requireRol, ROLES_PLAN_EDICION } from "@/lib/auth/rbac";

export default async function LayoutConfiguracionPlan({ children }: { children: React.ReactNode }) {
  // Solo para el menú. NO protege las páginas: layout y página se renderizan
  // en paralelo (auditoría 23/09/2026), así que cada page.tsx y cada Server
  // Action comprueban el rol por su cuenta.
  await requireRol(...ROLES_PLAN_EDICION);
  return (
    <div className="space-y-6">
      <div>
        <div className="text-sm text-muted-foreground">
          <Link href="/planificacion" className="hover:underline">
            Planificación
          </Link>{" "}
          /
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-xl font-semibold">Configuración de la planificación</h1>
          <BotonAyuda pantalla="configuracion" />
        </div>
        <p className="text-sm text-muted-foreground">
          Todo vive en SQLite: los cambios se aplican al próximo borrador (colores, nombres, contratos y ausencias se ven
          ya en el tablero).
        </p>
        <NavConfiguracion />
      </div>
      {children}
    </div>
  );
}
