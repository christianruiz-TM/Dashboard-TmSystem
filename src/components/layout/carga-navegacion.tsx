"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { AvisoCargando } from "@/components/cargando";
import { EVENTO_NAVEGANDO } from "@/lib/navegacion";

// ============================================================
// Capa de «Cargando» al cambiar de página o de filtro (12/11/2026, pedido
// por Christian). Next deja la página anterior quieta hasta que el servidor
// tiene la nueva, y con consultas de varios segundos parecía colgada. Ahora,
// en cuanto se pulsa un enlace interno o se cambia un selector (avisan con
// `avisarNavegacion`, lib/navegacion.ts), el contenido se emborrona con la
// rueda de carga encima, hasta que la URL cambia. Después, cada sección que
// siga calculando enseña su propio hueco (<Suspense> con SeccionCargando).
// Solo cubre el contenido: el menú de la izquierda sigue respondiendo.
// - No sale en las descargas (`download`), en `/api/…` ni en pestañas nuevas.
// - Espera 200 ms: una navegación rápida no parpadea.
// - Como mucho 130 s (las consultas se cortan a los 120 s): si algo falla y la
//   URL no cambia, no se queda puesta para siempre.
// ============================================================

const RETRASO_MS = 200;
const MAXIMO_MS = 130_000;

export function CargaNavegacion() {
  const pathname = usePathname();
  const params = useSearchParams();
  const qs = params.toString();
  const actual = qs ? `${pathname}?${qs}` : pathname;
  const actualRef = useRef(actual);
  useEffect(() => {
    actualRef.current = actual;
  }, [actual]);

  // Navegación en curso: desde qué URL salió y un número para distinguir una de otra
  const [inicio, setInicio] = useState<{ url: string; n: number } | null>(null);
  // Número de la navegación cuya capa ya se ve (pasado el retraso)
  const [mostrada, setMostrada] = useState(0);
  const cargando = inicio !== null && inicio.url === actual;
  const visible = cargando && mostrada === inicio.n;

  useEffect(() => {
    let n = 0;
    const empezar = (destino: URL) => {
      if (destino.origin !== location.origin) return;
      if (destino.pathname.startsWith("/api/")) return;
      // A la misma página (o un ancla de la misma) no hay nada que esperar
      if (destino.pathname === location.pathname && destino.search === location.search) return;
      setInicio({ url: actualRef.current, n: ++n });
    };
    const alClic = (e: MouseEvent) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const enlace = (e.target as Element | null)?.closest?.("a[href]");
      if (!(enlace instanceof HTMLAnchorElement)) return;
      if ((enlace.target && enlace.target !== "_self") || enlace.hasAttribute("download")) return;
      empezar(new URL(enlace.href, location.href));
    };
    const alAviso = (e: Event) => {
      const destino = (e as CustomEvent<string>).detail;
      if (typeof destino === "string") empezar(new URL(destino, location.href));
    };
    // En la fase de captura: los <Link> de Next cancelan el clic antes de que suba
    document.addEventListener("click", alClic, true);
    window.addEventListener(EVENTO_NAVEGANDO, alAviso);
    return () => {
      document.removeEventListener("click", alClic, true);
      window.removeEventListener(EVENTO_NAVEGANDO, alAviso);
    };
  }, []);

  useEffect(() => {
    if (!cargando) return;
    const n = inicio.n;
    const retraso = setTimeout(() => setMostrada(n), RETRASO_MS);
    const tope = setTimeout(() => setInicio(null), MAXIMO_MS);
    return () => {
      clearTimeout(retraso);
      clearTimeout(tope);
    };
  }, [cargando, inicio]);

  if (!visible) return null;
  return (
    <div
      aria-busy="true"
      className="absolute inset-0 z-30 animate-in bg-background/45 backdrop-blur-[3px] duration-300 fade-in"
    >
      {/* Pegada a la vista aunque la página sea larga */}
      <div className="sticky top-[38vh] flex justify-center px-4">
        <AvisoCargando texto="Cargando datos…" className="px-6 py-5 text-base" />
      </div>
    </div>
  );
}
