import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SelectorRango } from "@/components/filtros/selector-rango";
import { SelectorServicio } from "@/components/filtros/selector-servicio";
import type { ServicioOrdenado } from "@/lib/actividad-servicios";
import { SelectorIvr } from "@/components/filtros/selector-ivr";
import { Glosario } from "@/components/glosario";
import { TarjetaKpi } from "@/components/kpi/tarjeta-kpi";
import { TarjetaIvr } from "@/components/kpi/tarjeta-ivr";
import { RatiosExito } from "@/components/kpi/ratios-exito";
import { ComparadorCampanias } from "@/components/kpi/comparador-campanias";
import { TablaKpisCampania } from "@/components/kpi/tabla-kpis-campania";
import type { ResultadoRatios } from "@/lib/ratios-exito";
import type { TipoCampania } from "@/lib/resultados-actividad";
import {
  METRICAS_SUPERVISION,
  agruparKpisPorTipo,
  filasCampaniaSupervision,
} from "@/lib/supervision";
import { TablaAgentesSupervision } from "@/components/kpi/tabla-agentes-supervision";
import { CalidadBaseDatos } from "@/components/kpi/calidad-bd";
import type { ResultadoCalidadBd } from "@/lib/calidad-bd";
import { relojDesdeSegundos, segundosLegibles } from "@/lib/fechas";
import type { AgenteHoy, KpiCampaniaHoy, MetricasIvr } from "@/lib/rdb/types";

/**
 * Vista histórica de supervisión: mismos KPIs de campaña (cola, SLA) y
 * productividad de agentes que el tiempo real, pero sobre un rango de fechas
 * elegible (ayer, últimos 7 días, mes anterior, intervalo personalizado).
 * No incluye el "estado de agentes ahora" porque solo aplica al momento actual.
 */
export function PanelHistorico({
  kpis,
  agentes,
  ivr,
  ratios,
  calidad,
  umbral,
  desde,
  hasta,
  presets,
  servicios,
  ordenServicios,
  servicio,
  incluirIvr,
  tipos,
  servicioDe,
}: {
  kpis: KpiCampaniaHoy[];
  agentes: AgenteHoy[];
  ivr: MetricasIvr;
  ratios: ResultadoRatios;
  calidad: ResultadoCalidadBd;
  umbral: number;
  desde: string;
  hasta: string;
  presets: { etiqueta: string; desde: string; hasta: string }[];
  servicios: string[];
  /** Clientes por actividad para el selector (null: en el orden de `servicios`). */
  ordenServicios?: { activos: ServicioOrdenado[]; parados: ServicioOrdenado[] };
  servicio?: string;
  incluirIvr: boolean;
  /** Tipos de campaña del cliente (Bolsas: cartera; GH: BBDD): agrupan la tabla. */
  tipos: TipoCampania[];
  /** Cliente de cada campaña (para el comparador sin cliente elegido). */
  servicioDe: Record<string, string>;
}) {
  const recibidas = kpis.reduce((acc, k) => acc + k.recibidas, 0);
  const atendidas = kpis.reduce((acc, k) => acc + k.atendidas, 0);
  const conversaciones = kpis.reduce((acc, k) => acc + k.conversaciones, 0);
  const exitos = kpis.reduce((acc, k) => acc + k.exitos, 0);
  // Abandono y SLA solo sobre entrantes (las salientes no hacen cola)
  const atendidasIn = kpis.reduce((acc, k) => acc + k.atendidasInbound, 0);
  const abandonadasIn = kpis.reduce((acc, k) => acc + k.abandonadasInbound, 0);
  const pctAbandono = recibidas > 0 ? (abandonadasIn / recibidas) * 100 : null;
  // SLA global desde los recuentos, no ponderando los % ya redondeados
  const fueraSla = kpis.reduce((acc, k) => acc + k.atendidasFueraSla, 0);
  const slaGlobal = atendidasIn > 0 ? ((atendidasIn - fueraSla) / atendidasIn) * 100 : null;
  // Cola de las atendidas y espera de las abandonadas (entrantes), por separado.
  // Medias globales desde las sumas exactas, no promediando medias redondeadas.
  const colaGlobal =
    atendidasIn > 0
      ? kpis.reduce((acc, k) => acc + k.colaAtendidasTotalSeg, 0) / atendidasIn
      : null;
  const esperaAbandGlobal =
    abandonadasIn > 0
      ? kpis.reduce((acc, k) => acc + k.esperaAbandonadasTotalSeg, 0) / abandonadasIn
      : null;
  const ahtMedio =
    atendidas > 0
      ? kpis.reduce((acc, k) => acc + (k.ahtSeg ?? 0) * k.atendidas, 0) / atendidas
      : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Supervisión · histórico</h1>
        <p className="text-sm text-muted-foreground">
          Cola, SLA y productividad de agentes en el período seleccionado ({desde} a {hasta})
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <SelectorRango desde={desde} hasta={hasta} presets={presets} />
        <div className="flex flex-wrap items-center gap-4">
          <SelectorServicio servicios={servicios} orden={ordenServicios} valor={servicio} />
          <SelectorIvr incluir={incluirIvr} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
        <TarjetaKpi titulo="Recibidas" valor={recibidas.toLocaleString("es-ES")} />
        <TarjetaKpi
          titulo="Llamadas gestionadas"
          valor={atendidas.toLocaleString("es-ES")}
          sub={`${conversaciones.toLocaleString("es-ES")} con conversación`}
        />
        <TarjetaKpi
          titulo="Éxitos"
          valor={exitos.toLocaleString("es-ES")}
          sub="Ventas / objetivos"
        />
        <TarjetaKpi
          titulo="% Abandono"
          valor={pctAbandono != null ? `${pctAbandono.toFixed(1)} %` : "—"}
          // Mismo alcance que el %: solo entrantes (antes mostraba las de todos los orígenes)
          sub={`${abandonadasIn.toLocaleString("es-ES")} entrantes abandonadas`}
        />
        <TarjetaKpi
          titulo="SLA global"
          valor={slaGlobal != null ? `${slaGlobal.toFixed(1)} %` : "—"}
          sub={`Objetivo: cola ≤ ${umbral}s`}
        />
        <TarjetaKpi
          titulo="Cola media (atendidas)"
          valor={segundosLegibles(colaGlobal)}
          reloj={relojDesdeSegundos(colaGlobal)}
          sub={`Abandonadas: ${segundosLegibles(esperaAbandGlobal)} de espera antes de colgar`}
        />
        <TarjetaKpi titulo="AHT medio" valor={segundosLegibles(ahtMedio)} reloj={relojDesdeSegundos(ahtMedio)} />
      </div>

      <TarjetaIvr ivr={ivr} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Campañas en el período</CardTitle>
        </CardHeader>
        <CardContent>
          <TablaKpisCampania
            grupos={agruparKpisPorTipo(kpis, tipos)}
            vacio="Sin actividad en el período seleccionado"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Productividad de agentes en el período</CardTitle>
        </CardHeader>
        <CardContent>
          <TablaAgentesSupervision agentes={agentes} vacio="Sin llamadas gestionadas en el período" />
        </CardContent>
      </Card>

      <RatiosExito ratios={ratios} periodo="en el período" />

      <CalidadBaseDatos datos={calidad} periodo="en el período" />

      <ComparadorCampanias
        // Remonta al cambiar de cliente o de rango: las campañas elegidas pueden no estar
        key={`${servicio ?? "todos"}|${desde}|${hasta}|${incluirIvr ? "ivr" : ""}`}
        filas={filasCampaniaSupervision(kpis, ratios.campanias, servicioDe)}
        metricas={METRICAS_SUPERVISION}
      />

      <Glosario
        titulo="Supervisión · histórico"
        claves={[
          "servicio",
          "gruposCampania",
          "comparadorCampanias",
          "recibidas",
          "atendidas",
          "calidadBd",
          "conversaciones",
          "tiempoReloj",
          "exitos",
          "contactosGestionados",
          "conversion",
          "efectividadCierre",
          "exitosHora",
          "tiempoPorExito",
          "indiceExito",
          "abandono",
          "cola",
          "esperaAbandonadas",
          "sla",
          "aht",
          "acw",
          "talk",
          "productivo",
          "ivr",
          "ivrAtendidas",
          "ivrNoAtendidas",
          "ivrNoAtendidasHorario",
        ]}
      />
    </div>
  );
}
