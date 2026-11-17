import { Filter } from "lucide-react";
import { etiquetaTipo, type FiltroTipo } from "@/lib/tipo-panel";

/**
 * Aviso del filtro de tipo de campaña (17/11/2026, lib/tipo-panel.ts): qué se
 * está viendo, si faltan las horas («Solo BBDD») y qué sigue siendo del
 * cliente entero en esta pantalla (`delCliente`: «la tarjeta del IVR y el
 * callback»). Sin tipo elegido («Todas») no sale. Sin hooks.
 */
export function AvisoTipo({
  filtro,
  sinHoras = false,
  notaHoras = true,
  delCliente,
}: {
  filtro: FiltroTipo;
  sinHoras?: boolean;
  /** ¿Explica de quién son las horas logadas? (Operaciones no: allí son las de facturación). */
  notaHoras?: boolean;
  /** Lo que en esta pantalla no se filtra por tipo, si hay algo. */
  delCliente?: string;
}) {
  const etiqueta = etiquetaTipo(filtro);
  if (!etiqueta) return null;
  return (
    <p className="flex items-start gap-2 rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
      <Filter className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <span>
        Viendo solo las campañas «{etiqueta}».
        {sinHoras
          ? " Estas campañas no se facturan por horas: no salen las horas logadas ni las cifras por hora."
          : notaHoras
            ? " Las horas logadas son las de los usuarios que trabajaron en ellas (sin los logados sin llamadas)."
            : ""}
        {delCliente ? ` ${delCliente} son de todo el cliente.` : ""}
      </span>
    </p>
  );
}
