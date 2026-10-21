import { horasDesdeSegundos, horasLegibles, relojDesdeHoras, relojDesdeSegundos, segundosLegibles } from "@/lib/fechas";

// ============================================================
// Un tiempo de Supervisión con su valor de siempre (2 decimales, el que se
// suma y se exporta) y, debajo en pequeño, el mismo tiempo en reloj
// («3 min 12 s», «8 h 31 min 48 s»). Pedido por supervisión el 21/10/2026.
// Sin hooks: sirve en componentes de servidor y de cliente.
// ============================================================

export function Tiempo({
  segundos,
  acumulado = false,
  horas,
}: {
  /** Tiempo por interacción en segundos (AHT, cola…): «192,35 s». */
  segundos?: number | null;
  /** Con `segundos`: es un acumulado y se enseña en horas («8,53 h»). */
  acumulado?: boolean;
  /** Tiempo acumulado que ya viene en horas decimales. */
  horas?: number | null;
}) {
  const texto =
    horas !== undefined ? horasLegibles(horas) : acumulado ? horasDesdeSegundos(segundos) : segundosLegibles(segundos);
  const reloj = horas !== undefined ? relojDesdeHoras(horas) : relojDesdeSegundos(segundos);
  return (
    <>
      <span className="block">{texto}</span>
      {reloj ? <span className="block text-[11px] leading-tight font-normal text-muted-foreground">{reloj}</span> : null}
    </>
  );
}
