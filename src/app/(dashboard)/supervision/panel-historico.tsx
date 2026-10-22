import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SelectorRango } from "@/components/filtros/selector-rango";
import { SelectorServicio } from "@/components/filtros/selector-servicio";
import type { ServicioOrdenado } from "@/lib/actividad-servicios";
import { SelectorIvr } from "@/components/filtros/selector-ivr";
import { Glosario } from "@/components/glosario";
import { CabeceraSupervision } from "@/components/kpi/cabecera-supervision";
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
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Supervisión · histórico</h1>
        <p className="text-sm text-muted-foreground">
          Actividad, éxitos y productividad de agentes en el período seleccionado ({desde} a {hasta})
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <SelectorRango desde={desde} hasta={hasta} presets={presets} />
        <div className="flex flex-wrap items-center gap-4">
          <SelectorServicio servicios={servicios} orden={ordenServicios} valor={servicio} />
          <SelectorIvr incluir={incluirIvr} />
        </div>
      </div>

      <CabeceraSupervision kpis={kpis} ratios={ratios} umbral={umbral} periodo="en el período" />

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

      <RatiosExito ratios={ratios} periodo="en el período" sinTarjetas />

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
          "preparacion",
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
