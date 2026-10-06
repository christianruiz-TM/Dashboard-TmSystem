import type { Metadata } from "next";
import { AvisoRango } from "@/components/filtros/aviso-rango";
import { requireRol } from "@/lib/auth/rbac";
import { umbralSlaSeg } from "@/lib/db/settings";
import { esquemaRango, hoyISO, motivoRangoInvalido, presetsRango } from "@/lib/fechas";
import {
  agentesHoy,
  agentesProductividadRango,
  estadoAgentes,
  kpisCampaniasHoy,
  kpisCampaniasRango,
  metricasIvr,
} from "@/lib/rdb/queries/supervision";
import {
  campaniasDeServicio,
  campaniasEfectivas,
  listaServicios,
} from "@/lib/rdb/queries/servicios";
import { PanelHistorico } from "./panel-historico";
import { alertasPlanificacion } from "@/lib/planificacion/seguimiento";
import { PanelSupervision } from "./panel-supervision";
import { TabsSupervision } from "./tabs-supervision";

export const metadata: Metadata = { title: "Supervisión" };
export const dynamic = "force-dynamic";

export default async function PaginaSupervision({
  searchParams,
}: {
  searchParams: Promise<{
    vista?: string;
    servicio?: string;
    desde?: string;
    hasta?: string;
    ivr?: string;
  }>;
}) {
  await requireRol("supervision");
  const params = await searchParams;
  const vista = params.vista === "historico" ? "historico" : "tiempo-real";
  const umbral = umbralSlaSeg();
  const servicios = await listaServicios();
  const nombresServicios = servicios.map((s) => s.servicio);
  // Métricas principales: IVR excluido salvo check. La tarjeta IVR usa siempre
  // las campañas del servicio (incluidas las IVR), va aparte del toggle.
  const incluirIvr = params.ivr === "1";
  const camp = await campaniasEfectivas(params.servicio, incluirIvr);
  const campServicio = await campaniasDeServicio(params.servicio);

  if (vista === "historico") {
    const presets = presetsRango();
    const ayer = presets.find((p) => p.etiqueta === "Ayer")!;
    const rango = esquemaRango.safeParse({
      desde: params.desde ?? ayer.desde,
      hasta: params.hasta ?? ayer.hasta,
    });
    const { desde, hasta } = rango.success ? rango.data : ayer;
    const [kpis, agentes, ivr] = await Promise.all([
      kpisCampaniasRango(desde, hasta, umbral, camp),
      agentesProductividadRango(desde, hasta, camp),
      metricasIvr(desde, hasta, campServicio),
    ]);
    return (
      <div className="space-y-6">
        <TabsSupervision vista="historico" servicio={params.servicio} incluirIvr={incluirIvr} />
        <AvisoRango motivo={motivoRangoInvalido(rango)} alternativa="el día de ayer" />
        <PanelHistorico
          kpis={kpis}
          agentes={agentes}
          ivr={ivr}
          umbral={umbral}
          desde={desde}
          hasta={hasta}
          presets={presets}
          servicios={nombresServicios}
          servicio={params.servicio}
          incluirIvr={incluirIvr}
        />
      </div>
    );
  }

  // Tiempo real (hoy, en vivo con polling)
  const [agentes, kpis, top, ivr, plan] = await Promise.all([
    estadoAgentes(camp),
    kpisCampaniasHoy(umbral, camp),
    agentesHoy(camp),
    metricasIvr(hoyISO(), hoyISO(), campServicio),
    alertasPlanificacion(),
  ]);
  return (
    <div className="space-y-6">
      <TabsSupervision vista="tiempo-real" servicio={params.servicio} incluirIvr={incluirIvr} />
      <PanelSupervision
        // Remonta al cambiar de servicio o de toggle IVR
        key={`${params.servicio ?? "todos"}|${incluirIvr ? "ivr" : "noivr"}`}
        servicios={nombresServicios}
        servicio={params.servicio}
        incluirIvr={incluirIvr}
        inicial={{
          agentes,
          kpis,
          top,
          ivr,
          plan,
          umbral,
          actualizado: new Date().toISOString(),
        }}
      />
    </div>
  );
}
