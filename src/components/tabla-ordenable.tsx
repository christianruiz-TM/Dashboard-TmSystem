"use client";

import { Children, createContext, isValidElement, useContext, useMemo, useState, type ReactElement, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { TableHead } from "@/components/ui/table";
import { compararValores, type ValorOrden } from "@/lib/orden";
import { cn } from "@/lib/utils";

// ============================================================
// Tablas que se ordenan pulsando la cabecera (04/11/2026). Las filas se
// pintan como siempre (también en el servidor) y cada una lleva sus valores
// en `data-orden={valoresOrden(...)}` (lib/orden.ts: se llama también desde
// el servidor); este envoltorio solo las cambia de
// sitio. Empieza SIEMPRE por la primera columna de A a Z (el nombre del
// agente o de la campaña) y no recuerda nada: al volver a la página, otra vez
// alfabético. Las filas de grupo y de total quedan fuera de <FilasOrdenables>
// y no se mueven: se ordena dentro de cada grupo.
//
//   <TablaOrdenable>
//     <Table>
//       <TableHeader><TableRow>
//         <CabeceraOrdenable col={0}>Campaña</CabeceraOrdenable>
//         <CabeceraOrdenable col={1} numerica className="text-right">Llamadas</CabeceraOrdenable>
//       </TableRow></TableHeader>
//       <TableBody>
//         <FilasOrdenables>
//           {filas.map((f) => <TableRow key={f.id} data-orden={valoresOrden(f.nombre, f.llamadas)}>…</TableRow>)}
//         </FilasOrdenables>
//         <TableRow>total…</TableRow>
//       </TableBody>
//     </Table>
//   </TablaOrdenable>
// ============================================================

interface Orden {
  col: number;
  desc: boolean;
}

const ContextoOrden = createContext<{ orden: Orden; ordenar: (col: number, numerica: boolean) => void } | null>(null);

export function TablaOrdenable({ children, inicial = { col: 0, desc: false } }: { children: ReactNode; inicial?: Orden }) {
  const [orden, setOrden] = useState<Orden>(inicial);
  const valor = useMemo(
    () => ({
      orden,
      // La misma columna, al revés; otra: los números de mayor a menor y los textos de la A a la Z
      ordenar: (col: number, numerica: boolean) => setOrden((o) => (o.col === col ? { col, desc: !o.desc } : { col, desc: numerica })),
    }),
    [orden],
  );
  return <ContextoOrden.Provider value={valor}>{children}</ContextoOrden.Provider>;
}

export function CabeceraOrdenable({
  col,
  numerica = false,
  simple = false,
  className,
  title,
  children,
}: {
  col: number;
  /** Columna de números: la primera vez se ordena de mayor a menor. */
  numerica?: boolean;
  /** Un <th> sin el estilo de <TableHead> (tablas con su propio estilo, como las de Dirección). */
  simple?: boolean;
  className?: string;
  title?: string;
  children: ReactNode;
}) {
  const ctx = useContext(ContextoOrden);
  const activa = ctx?.orden.col === col;
  const Celda = simple ? "th" : TableHead;
  return (
    <Celda
      className={className}
      title={title}
      aria-sort={activa ? (ctx.orden.desc ? "descending" : "ascending") : undefined}
    >
      <BotonOrden col={col} numerica={numerica} derecha={className?.includes("text-right")} title={title}>
        {children}
      </BotonOrden>
    </Celda>
  );
}

/** Solo el botón, para una cabecera propia (p. ej. de dos columnas). */
export function BotonOrden({
  col,
  numerica = false,
  derecha = false,
  title,
  children,
}: {
  col: number;
  numerica?: boolean;
  /** Flecha a la izquierda del texto (columnas alineadas a la derecha). */
  derecha?: boolean;
  title?: string;
  children: ReactNode;
}) {
  const ctx = useContext(ContextoOrden);
  const activa = ctx?.orden.col === col;
  const Flecha = !activa ? ArrowUpDown : ctx.orden.desc ? ArrowDown : ArrowUp;
  return (
    <button
      type="button"
      onClick={() => ctx?.ordenar(col, numerica)}
      className={cn(
        "inline-flex items-center gap-1 rounded-sm text-inherit hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        derecha && "flex-row-reverse",
      )}
      title={title ? `${title} (pulsa para ordenar)` : "Pulsa para ordenar"}
    >
      <span>{children}</span>
      <Flecha className={cn("size-3 shrink-0", activa ? "opacity-100" : "opacity-30")} aria-hidden />
    </button>
  );
}

/** Lee los valores de una fila: de su `data-orden` o, si es un Fragment (fila + detalle), del de su primera fila. */
function valoresDe(nodo: ReactNode): ValorOrden[] | null {
  if (!isValidElement(nodo)) return null;
  const props = (nodo as ReactElement<Record<string, unknown>>).props;
  if (typeof props["data-orden"] === "string") return JSON.parse(props["data-orden"]) as ValorOrden[];
  const primera = Children.toArray(props.children as ReactNode)[0];
  return primera ? valoresDe(primera) : null;
}

export function FilasOrdenables({ children }: { children: ReactNode }) {
  const ctx = useContext(ContextoOrden);
  const filas = Children.toArray(children);
  if (!ctx) return <>{filas}</>;
  const { col, desc } = ctx.orden;
  const conValor = filas.map((nodo, i) => ({ nodo, i, v: valoresDe(nodo)?.[col] }));
  // Estable: a igualdad, el orden en que llegaron
  conValor.sort((a, b) => compararValores(a.v, b.v, desc) || a.i - b.i);
  return <>{conValor.map((x) => x.nodo)}</>;
}
