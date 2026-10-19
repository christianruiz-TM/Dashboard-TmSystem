"use client";

import { useId, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Filter, X } from "lucide-react";
import {
  finalizadosConFiltro,
  normalizarBusqueda,
  sugerenciasCampo,
  type FiltroCampo as Filtro,
  type ValorCampo,
} from "@/lib/resultados-actividad";
import { cn } from "@/lib/utils";

// ============================================================
// Buscador con autocompletado de un dato del contacto (Supervisión →
// Resultados; GH: el origen del lead). Los valores del período llegan con
// la página (como mucho MAX_VALORES_CAMPO; GH tiene unos 500 en total), así
// que sugerir no consulta nada. Busca por «contiene», sin mayúsculas ni
// tildes; la primera opción filtra por TODOS los valores que contienen el
// texto. Elegir algo cambia `?campo=&modo=` y la página vuelve a consultar.
// ============================================================

const MAX_SUGERENCIAS = 50;

type Opcion = { filtro: Filtro; texto: string; detalle: string; finalizados: number };

const entero = (v: number) => v.toLocaleString("es-ES");

export function FiltroCampo({
  etiqueta,
  valores,
  filtro,
}: {
  etiqueta: string;
  valores: ValorCampo[];
  filtro: Filtro | null;
}) {
  const router = useRouter();
  const ruta = usePathname();
  const params = useSearchParams();
  const id = useId();
  const [texto, setTexto] = useState("");
  const [abierto, setAbierto] = useState(false);
  const [activa, setActiva] = useState(0);
  const lista = useRef<HTMLUListElement>(null);

  const opciones = useMemo<Opcion[]>(() => {
    const t = texto.trim();
    const sugeridos = sugerenciasCampo(valores, t, MAX_SUGERENCIAS);
    const res: Opcion[] = [];
    if (t) {
      const contiene: Filtro = { modo: "contiene", valor: t };
      const buscado = normalizarBusqueda(t);
      const n = valores.filter((v) => v.valor != null && normalizarBusqueda(v.valor).includes(buscado)).length;
      res.push({
        filtro: contiene,
        texto: `Todos los que contienen «${t}»`,
        detalle: `${entero(n)} ${n === 1 ? "valor" : "valores"}`,
        finalizados: finalizadosConFiltro(valores, contiene),
      });
    }
    for (const v of sugeridos) {
      res.push({ filtro: { modo: "exacto", valor: v.valor! }, texto: v.valor!, detalle: "", finalizados: v.finalizados });
    }
    const sinValor = valores.find((v) => v.valor == null);
    if (!t && sinValor) {
      res.push({
        filtro: { modo: "vacio", valor: "" },
        texto: `(sin ${etiqueta.toLowerCase()})`,
        detalle: "",
        finalizados: sinValor.finalizados,
      });
    }
    return res;
  }, [texto, valores, etiqueta]);

  function aplicar(f: Filtro | null) {
    const siguientes = new URLSearchParams(params.toString());
    if (f) {
      siguientes.set("campo", f.valor);
      if (f.modo === "exacto") siguientes.delete("modo");
      else siguientes.set("modo", f.modo);
      if (f.modo === "vacio") siguientes.delete("campo");
    } else {
      siguientes.delete("campo");
      siguientes.delete("modo");
    }
    setAbierto(false);
    setTexto("");
    router.push(`${ruta}?${siguientes.toString()}`);
  }

  function mover(delta: number) {
    if (opciones.length === 0) return;
    const i = (activa + delta + opciones.length) % opciones.length;
    setActiva(i);
    lista.current?.querySelector(`[data-i="${i}"]`)?.scrollIntoView({ block: "nearest" });
  }

  const descripcion =
    filtro == null
      ? null
      : filtro.modo === "vacio"
        ? `sin ${etiqueta.toLowerCase()}`
        : filtro.modo === "contiene"
          ? `contiene «${filtro.valor}»`
          : `= ${filtro.valor}`;

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="inline-flex items-center gap-1 text-muted-foreground">
        <Filter className="h-4 w-4" /> {etiqueta}:
      </span>
      {filtro && descripcion ? (
        <span className="inline-flex max-w-full items-center gap-1 rounded-md bg-primary/15 px-2 py-1 font-medium">
          <span className="truncate" title={descripcion}>
            {descripcion}
          </span>
          <span className="shrink-0 font-normal text-muted-foreground">
            · {entero(finalizadosConFiltro(valores, filtro))} finalizados
          </span>
          <button
            type="button"
            onClick={() => aplicar(null)}
            className="shrink-0 rounded p-0.5 hover:bg-background"
            title="Quitar el filtro"
            aria-label="Quitar el filtro"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </span>
      ) : null}
      <div className="relative w-full sm:w-96">
        <input
          type="text"
          role="combobox"
          aria-expanded={abierto && opciones.length > 0}
          aria-controls={`${id}-lista`}
          aria-activedescendant={abierto && opciones[activa] ? `${id}-op-${activa}` : undefined}
          aria-autocomplete="list"
          className="h-8 w-full rounded-lg border border-border bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          placeholder={filtro ? "Cambiar el filtro…" : `Escribe parte del ${etiqueta.toLowerCase()}…`}
          value={texto}
          onChange={(e) => {
            setTexto(e.target.value);
            setActiva(0);
            setAbierto(true);
          }}
          onFocus={() => setAbierto(true)}
          // Retraso: deja que el clic en una opción llegue antes de cerrar
          onBlur={() => setTimeout(() => setAbierto(false), 150)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setAbierto(true);
              mover(1);
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              mover(-1);
            } else if (e.key === "Enter") {
              e.preventDefault();
              if (opciones[activa]) aplicar(opciones[activa].filtro);
            } else if (e.key === "Escape") {
              setAbierto(false);
            }
          }}
        />
        {abierto && opciones.length > 0 ? (
          <ul
            ref={lista}
            id={`${id}-lista`}
            role="listbox"
            className="absolute z-20 mt-1 max-h-80 w-full overflow-y-auto rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-md"
          >
            {opciones.map((o, i) => (
              <li
                key={`${o.filtro.modo}|${o.filtro.valor}`}
                id={`${id}-op-${i}`}
                data-i={i}
                role="option"
                aria-selected={i === activa}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => aplicar(o.filtro)}
                onMouseEnter={() => setActiva(i)}
                className={cn(
                  "flex cursor-pointer items-baseline justify-between gap-3 rounded-md px-2 py-1.5",
                  i === activa && "bg-muted",
                  o.filtro.modo !== "exacto" && "font-medium",
                )}
              >
                <span className="min-w-0 break-words">
                  {o.texto}
                  {o.detalle ? <span className="ml-1 text-xs font-normal text-muted-foreground">({o.detalle})</span> : null}
                </span>
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                  {entero(o.finalizados)}
                </span>
              </li>
            ))}
            {!texto.trim() && valores.filter((v) => v.valor != null).length > MAX_SUGERENCIAS ? (
              <li className="px-2 py-1.5 text-xs text-muted-foreground">
                Salen los {MAX_SUGERENCIAS} con más finalizados: escribe para buscar entre los{" "}
                {entero(valores.filter((v) => v.valor != null).length)}.
              </li>
            ) : null}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
