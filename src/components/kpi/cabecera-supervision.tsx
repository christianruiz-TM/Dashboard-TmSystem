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
//  - Equipo ahora (solo Tiempo real): agentes Ready, no disponibles y
//    conectados.
//  - Entrantes: recibidas, % abandono, SLA y cola. Solo si el cliente ha
//    recibido llamadas en el período: Bolsas y Socios son de salida.
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
  equipo,
}: {
  kpis: KpiCampaniaHoy[];
  ratios: ResultadoRatios;
  /** Totales de Resultados del mismo alcance (null si no se pudieron calcular). */
  resultados: ResultadoResultados["total"] | null;
  /** Umbral del SLA en segundos. */
  umbral: number;
  /** Solo Tiempo real: la plantilla ahora mismo. */
  equipo?: { ready: number; noDisponibles: number; conectados: number };
}) {
  const k = sumarKpis(kpis, "Total");
  const pctAbandono = k.recibidas > 0 ? (k.abandonadasInbound / k.recibidas) * 100 : null;

  return (
    <div className="space-y-4">
      <KpisPrincipales ratios={ratios.total} resultados={resultados} />

      {equipo ? (
        <Fila titulo="Equipo ahora">
          <TarjetaKpi titulo="Agentes Ready" valor={entero(equipo.ready)} sub="Esperando llamada" ayuda={ayudaDe("equipoAhora")} />
          <TarjetaKpi
            titulo="No disponibles"
            valor={entero(equipo.noDisponibles)}
            sub="Not Ready ahora mismo"
            ayuda={ayudaDe("equipoAhora")}
          />
          <TarjetaKpi
            titulo="Conectados"
            valor={entero(equipo.conectados)}
            sub="Con sesión abierta ahora"
            ayuda={ayudaDe("equipoAhora")}
          />
        </Fila>
      ) : null}

      {k.recibidas > 0 ? (
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
