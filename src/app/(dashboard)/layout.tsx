import { LogOut, KeyRound } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LogoTm } from "@/components/logo-tm";
import { NavLateral } from "@/components/layout/nav-lateral";
import { requireSesion, rutasVisibles } from "@/lib/auth/rbac";
import { esMock } from "@/lib/rdb/pool";
import { cerrarSesion } from "./acciones";

const NOMBRE_ROL: Record<string, string> = {
  admin: "Administrador",
  direccion: "Dirección",
  operaciones: "Operaciones",
  supervision: "Supervisión",
  cliente: "Cliente",
};

export default async function LayoutDashboard({
  children,
}: {
  children: React.ReactNode;
}) {
  const usuario = await requireSesion();
  const items = rutasVisibles(usuario.rol);

  return (
    <div className="flex min-h-screen w-full">
      {/* Sidebar (escritorio) */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar md:flex">
        <div className="flex h-14 items-center border-b border-sidebar-border px-4">
          <LogoTm claro />
        </div>
        <div className="flex-1 overflow-y-auto py-4">
          <NavLateral items={items} />
        </div>
        <div className="border-t border-sidebar-border p-4 text-xs text-sidebar-foreground/60">
          TmSystem · Telemarketing Sistemas
        </div>
      </aside>

      {/* Contenido */}
      <div className="flex min-w-0 flex-1 flex-col">
        {esMock() ? (
          <div className="bg-amber-400/90 px-4 py-1 text-center text-xs font-medium text-amber-950">
            Modo demo: datos ficticios (RDB_MOCK=1). Configura las credenciales de
            RDBv2 en el .env para ver datos reales.
          </div>
        ) : null}
        <header className="flex h-14 items-center justify-between gap-4 border-b bg-card px-4 md:px-6">
          <div className="md:hidden">
            <LogoTm />
          </div>
          <div className="hidden text-sm font-medium text-muted-foreground md:block">
            Panel del contact center
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-sm font-medium leading-tight">{usuario.nombre}</div>
              <Badge variant="secondary" className="text-[10px]">
                {NOMBRE_ROL[usuario.rol] ?? usuario.rol}
              </Badge>
            </div>
            <Button
              render={<Link href="/cambiar-password" />}
              variant="ghost"
              size="icon"
              title="Cambiar contraseña"
            >
              <KeyRound className="h-4 w-4" />
            </Button>
            <form action={cerrarSesion}>
              <Button variant="ghost" size="icon" type="submit" title="Cerrar sesión">
                <LogOut className="h-4 w-4" />
              </Button>
            </form>
          </div>
        </header>

        {/* Navegación móvil simple */}
        <div className="border-b bg-card px-2 py-1 md:hidden">
          <div className="flex gap-1 overflow-x-auto text-sm">
            {items.map((i) => (
              <Link
                key={i.ruta}
                href={i.ruta}
                className="whitespace-nowrap rounded px-3 py-1.5 font-medium text-muted-foreground hover:bg-accent"
              >
                {i.etiqueta}
              </Link>
            ))}
          </div>
        </div>

        <main className="flex-1 space-y-6 p-4 md:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
