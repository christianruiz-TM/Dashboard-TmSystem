import Link from "next/link";
import { cn } from "@/lib/utils";
import { BotonAyuda, type PantallaAyuda } from "./ayuda";

const SECCIONES = [
  { ruta: "", texto: "Tablero" },
  { ruta: "/ausencias", texto: "Ausencias" },
  { ruta: "/bolsas", texto: "Bolsas y objetivos" },
  { ruta: "/versiones", texto: "Versiones y cambios" },
] as const;

/** Migas, título y pestañas de las páginas de un mes del plan. */
export function CabeceraMes({
  mes,
  nombreMes,
  seccion,
  titulo,
  descripcion,
  ayuda,
  children,
}: {
  ayuda: PantallaAyuda;
  mes: string;
  nombreMes: string;
  seccion: (typeof SECCIONES)[number]["ruta"];
  titulo: string;
  descripcion?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <div className="text-sm text-muted-foreground">
        <Link href="/planificacion" className="hover:underline">
          Planificación
        </Link>{" "}
        /{" "}
        <Link href={`/planificacion/${mes}`} className="hover:underline">
          {nombreMes}
        </Link>{" "}
        /
      </div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">
            {titulo} · {nombreMes}
          </h1>
          {descripcion ? <p className="max-w-3xl text-sm text-muted-foreground">{descripcion}</p> : null}
        </div>
        <div className="flex flex-wrap items-start gap-2">
          <BotonAyuda pantalla={ayuda} />
          {children}
        </div>
      </div>
      <nav className="flex flex-wrap gap-1 border-b" aria-label="Páginas del mes">
        {SECCIONES.map((s) => (
          <Link
            key={s.ruta}
            href={`/planificacion/${mes}${s.ruta}`}
            aria-current={s.ruta === seccion ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 px-3 py-1.5 text-sm",
              s.ruta === seccion
                ? "border-foreground font-medium text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {s.texto}
          </Link>
        ))}
      </nav>
    </div>
  );
}
