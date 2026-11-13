import type { ReactNode } from "react";
import { KpisPrincipales } from "@/components/kpi/kpis-principales";
import { TarjetaKpi } from "@/components/kpi/tarjeta-kpi";
import { relojDesdeSegundos, segundosLegibles } from "@/lib/fechas";
import { ayudaDe } from "@/lib/glosario";
import type { ResultadoRatios } from "@/lib/ratios-exito";
import type { ResultadoResultados } from "@/lib/resultados-actividad";
import type { KpiCampaniaHoy } from "@/lib/rdb/types";
import { sumarKpis } from "@/lib/supervision";

// ============================================================
// Cabecera de Supervisión (Tiempo real e Histórico). Desde el 22/10/2026,
// primero las 12 cajas principales en el orden de Christian (las mismas en
// todas las vistas de Supervisión y en Dirección, KpisPrincipales); después:
//  - Entrantes: recibidas, % abandono, SLA y cola. Solo si el cliente ha
//    recibido llamadas en el período: Bolsas y Socios son de salida.
// La plantilla de ahora (Ready, no disponibles, conectados) ya no va aquí:
// desde el 12/11/2026 está en la franja «Ahora» (FranjaAhora, abajo), que
// Tiempo real enseña en todas sus pestañas.
// Sin hooks: sirve en el panel de cliente (Tiempo real) y en el de servidor.
// ============================================================

function pct1(v: number | null): string {
  return v == null ? "—" : `${v.toLocaleString("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`;
}

function entero(v: number): string {
  return v.toLocaleString("es-ES");
}

function Fila({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{titulo}</h2>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{children}</div>
    </section>
  );
}

export function CabeceraSupervision({
  kpis,
  ratios,
  resultados,
  umbral,
  sinEntrantes = false,
}: {
  kpis: KpiCampaniaHoy[];
  ratios: ResultadoRatios;
  /** Totales de Resultados del mismo alcance (null si no se pudieron calcular). */
  resultados: ResultadoResultados["total"] | null;
  /** Umbral del SLA en segundos. */
  umbral: number;
  /** Tiempo real: las entrantes ya están en la franja «Ahora», justo encima. */
  sinEntrantes?: boolean;
}) {
  const k = sumarKpis(kpis, "Total");
  const pctAbandono = k.recibidas > 0 ? (k.abandonadasInbound / k.recibidas) * 100 : null;

  return (
    <div className="space-y-4">
      <KpisPrincipales ratios={ratios.total} resultados={resultados} />

      {k.recibidas > 0 && !sinEntrantes ? (
        <Fila titulo="Entrantes">
          <TarjetaKpi
            titulo="Recibidas"
            valor={entero(k.recibidas)}
            sub={`${entero(k.atendidasInbound)} atendidas`}
            ayuda={ayudaDe("recibidas")}
          />
          <TarjetaKpi
            titulo="% abandono"
            valor={pct1(pctAbandono)}
            sub={`${entero(k.abandonadasInbound)} abandonadas`}
            ayuda={ayudaDe("abandono")}
          />
          <TarjetaKpi titulo="SLA" valor={pct1(k.slaPct)} sub={`Objetivo: cola ≤ ${umbral} s`} ayuda={ayudaDe("sla")} />
          <TarjetaKpi
            titulo="Cola media (atendidas)"
            valor={segundosLegibles(k.colaMediaSeg)}
            reloj={relojDesdeSegundos(k.colaMediaSeg)}
            sub={`Abandonadas: ${segundosLegibles(k.esperaAbandonadasSeg)} de espera antes de colgar`}
            ayuda={ayudaDe("cola")}
          />
        </Fila>
      ) : null}
    </div>
  );
}

/** Una cifra de la franja «Ahora»: valor grande y etiqueta pequeña, con su ayuda al pasar el ratón. */
function DatoAhora({ valor, etiqueta, ayuda, color }: { valor: string; etiqueta: string; ayuda?: string; color?: string }) {
  return (
    <div title={ayuda} className="min-w-[5.5rem] cursor-help">
      <div className={`text-lg leading-tight font-semibold tabular-nums ${color ?? ""}`}>{valor}</div>
      <div className="text-xs text-muted-foreground">{etiqueta}</div>
    </div>
  );
}

/**
 * Franja «Ahora» de Supervisión → Tiempo real (12/11/2026): lo que se mira a
 * cada rato, visible en todas las pestañas sin bajar. La plantilla de ahora
 * mismo y, si el cliente recibe llamadas, cómo van las entrantes hoy. El
 * detalle de cada cifra está en las pestañas Resumen y Agentes.
 */
export function FranjaAhora({
  kpis,
  umbral,
  equipo,
}: {
  kpis: KpiCampaniaHoy[];
  umbral: number;
  equipo: { ready: number; noDisponibles: number; conectados: number };
}) {
  const k = sumarKpis(kpis, "Total");
  const pctAbandono = k.recibidas > 0 ? (k.abandonadasInbound / k.recibidas) * 100 : null;
  return (
    <section
      aria-label="Ahora"
      className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-lg border bg-card px-4 py-3"
    >
      <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Ahora</span>
      <DatoAhora valor={entero(equipo.ready)} etiqueta="Ready" ayuda={ayudaDe("equipoAhora")} color="text-emerald-700" />
      <DatoAhora
        valor={entero(equipo.noDisponibles)}
        etiqueta="No disponibles"
        ayuda={ayudaDe("equipoAhora")}
        color="text-amber-700"
      />
      <DatoAhora valor={entero(equipo.conectados)} etiqueta="Conectados" ayuda={ayudaDe("equipoAhora")} />
      {k.recibidas > 0 ? (
        <>
          <span className="hidden h-8 w-px bg-border sm:block" aria-hidden />
          <DatoAhora valor={entero(k.recibidas)} etiqueta="Entrantes hoy" ayuda={ayudaDe("recibidas")} />
          <DatoAhora valor={pct1(pctAbandono)} etiqueta="Abandono" ayuda={ayudaDe("abandono")} />
          <DatoAhora valor={pct1(k.slaPct)} etiqueta={`SLA (≤ ${umbral} s)`} ayuda={ayudaDe("sla")} />
          <DatoAhora valor={segundosLegibles(k.colaMediaSeg)} etiqueta="Cola media" ayuda={ayudaDe("cola")} />
        </>
      ) : null}
    </section>
  );
}
