import Link from "next/link";
import { requireRol } from "@/lib/auth/rbac";

const SECCIONES = [
  { ruta: "/admin", etiqueta: "Resumen" },
  { ruta: "/admin/usuarios", etiqueta: "Usuarios" },
  { ruta: "/admin/clientes", etiqueta: "Clientes" },
  { ruta: "/admin/facturacion", etiqueta: "Facturación y SLA" },
  { ruta: "/admin/auditoria", etiqueta: "Auditoría" },
];

export default async function LayoutAdmin({ children }: { children: React.ReactNode }) {
  await requireRol(); // solo admin (requireRol sin roles extra = solo admin)
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Administración</h1>
        <nav className="mt-2 flex flex-wrap gap-1 border-b">
          {SECCIONES.map((s) => (
            <Link
              key={s.ruta}
              href={s.ruta}
              className="rounded-t-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            >
              {s.etiqueta}
            </Link>
          ))}
        </nav>
      </div>
      {children}
    </div>
  );
}
