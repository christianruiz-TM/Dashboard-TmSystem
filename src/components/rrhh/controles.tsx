"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { avisarNavegacion } from "@/lib/navegacion";

// ============================================================
// Controles del panel de RRHH (16/11/2026): el día (calendario) y el
// buscador de personas. Las flechas y «Hoy» son enlaces normales (los pinta
// la página); esto es lo que necesita el navegador.
// ============================================================

/** Calendario: al elegir un día, va a él (avisando a la capa de «Cargando…»). */
export function SelectorDia({ fecha, maximo }: { fecha: string; maximo: string }) {
  const router = useRouter();
  return (
    <Input
      type="date"
      aria-label="Día"
      className="h-9 w-40"
      value={fecha}
      max={maximo}
      onChange={(e) => {
        const valor = e.target.value;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(valor) || valor > maximo) return;
        const destino = `/rrhh?fecha=${valor}`;
        avisarNavegacion(destino);
        router.push(destino);
      }}
    />
  );
}

const normal = (t: string) =>
  t
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

/**
 * Buscador: oculta las filas (`[data-buscar]` dentro de `#${contenedor}`) que
 * no contienen lo escrito, sin tildes ni mayúsculas. Se busca por código,
 * usuario o nombre.
 */
export function BuscadorPersonas({ contenedor }: { contenedor: string }) {
  const [texto, setTexto] = useState("");
  useEffect(() => {
    const raiz = document.getElementById(contenedor);
    if (!raiz) return;
    const buscado = normal(texto.trim());
    let visibles = 0;
    raiz.querySelectorAll<HTMLElement>("[data-buscar]").forEach((fila) => {
      const casa = buscado === "" || normal(fila.dataset.buscar ?? "").includes(buscado);
      fila.hidden = !casa;
      if (casa) visibles++;
    });
    const aviso = raiz.querySelector<HTMLElement>("[data-sin-resultados]");
    if (aviso) aviso.hidden = visibles > 0;
  }, [texto, contenedor]);
  return (
    <div className="relative">
      <Search aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="search"
        aria-label="Buscar persona"
        placeholder="Buscar persona…"
        className="h-9 w-56 pl-8"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
      />
    </div>
  );
}
