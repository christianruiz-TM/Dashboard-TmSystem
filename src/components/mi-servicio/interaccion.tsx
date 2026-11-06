"use client";

import { useEffect, useRef, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { dibujoMiServicio } from "@/lib/mi-servicio/dibujo";
import { motorMiServicio } from "@/lib/mi-servicio/motor";

/** Refresco de «Mi servicio» cuando el periodo llega a hoy (06/11/2026). */
const CADA_MS = 60_000;

/**
 * Raíz del panel: pone el globo de las gráficas y de las tarjetas (el mismo
 * que el informe) en todo lo que lleve `data-tip`.
 */
export function InteraccionMiServicio({ children }: { children: ReactNode }) {
  const raiz = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!raiz.current) return;
    return dibujoMiServicio(motorMiServicio().fmt).instalarInteraccion(raiz.current);
  }, []);
  return (
    <div ref={raiz} className="ms-raiz space-y-6">
      {children}
    </div>
  );
}

/**
 * «Datos a las 10:45»; si el periodo llega a hoy, vuelve a pedir la página
 * cada 60 s (solo con la pestaña a la vista) y lo dice.
 */
export function RefrescoMiServicio({ enVivo, generado }: { enVivo: boolean; generado: string }) {
  const router = useRouter();
  const [refrescando, iniciar] = useTransition();
  useEffect(() => {
    if (!enVivo) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") iniciar(() => router.refresh());
    }, CADA_MS);
    return () => window.clearInterval(id);
  }, [enVivo, router]);

  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      {enVivo ? <RefreshCw className={refrescando ? "size-3.5 animate-spin" : "size-3.5"} aria-hidden /> : null}
      Datos a {generado}
      {enVivo ? " · se actualiza cada minuto" : ""}
    </span>
  );
}
