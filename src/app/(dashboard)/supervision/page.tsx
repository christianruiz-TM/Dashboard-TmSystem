import type { Metadata } from "next";
import { AvisoRango } from "@/components/filtros/aviso-rango";
import { ROLES_SUPERVISION, requireRol } from "@/lib/auth/rbac";
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
import { ratiosExitoHoy, ratiosExitoRango } from "@/lib/rdb/queries/ratios-exito";
import { resultadosActividadRango } from "@/lib/rdb/queries/resultados-actividad";
import { configsResultados, objetivosDeResultados } from "@/lib/db/resultados";
import {
  campaniasDeServicio,
  campaniasEfectivas,
  listaServicios,
} from "@/lib/rdb/queries/servicios";
import { PanelHistorico } from "./panel-historico";
import { PanelResultados } from "./panel-resultados";
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
  const usuario = await requireRol(...ROLES_SUPERVISION);
  const params = await searchParams;
  const vista =
    params.vista === "historico" || params.vista === "resultados" ? params.vista : "tiempo-real";
  const umbral = umbralSlaSeg();
  const servicios = await listaServicios();
  const nombresServicios = servicios.map((s) => s.servicio);
  // Métricas principales: IVR excluido salvo check. La tarjeta IVR usa siempre
  // las campañas del servicio (incluidas las IVR), va aparte del toggle.
  const incluirIvr = params.ivr === "1";
  const camp = await campaniasEfectivas(params.servicio, incluirIvr);
  const campServicio = await campaniasDeServicio(params.servicio);

  if (vista === "resultados") {
    // Por defecto el mes en curso: con un solo día la muestra por agente es pequeña
    const presets = presetsRango();
    const mes = presets.find((p) => p.etiqueta === "Mes actual")!;
    const rango = esquemaRango.safeParse({
      desde: params.desde ?? mes.desde,
      hasta: params.hasta ?? mes.hasta,
    });
    const { desde, hasta } = rango.success ? rango.data : mes;
    // Siempre por cliente: sin uno elegido no se consulta nada (todos los
    // servicios a la vez tardaba demasiado en abrir la pestaña)
    const servicioElegido =
      params.servicio && nombresServicios.includes(params.servicio) ? params.servicio : undefined;
    const resultado = servicioElegido
      ? await resultadosActividadRango(
          desde,
          hasta,
          camp,
          configsResultados(),
          objetivosDeResultados(),
        )
      : null;
    return (
      <div className="space-y-6">
        <TabsSupervision
          vista="resultados"
          servicio={params.servicio}
          incluirIvr={incluirIvr}
          desde={params.desde}
          hasta={params.hasta}
        />
        <AvisoRango motivo={motivoRangoInvalido(rango)} alternativa="el mes en curso" />
        <PanelResultados
          resultado={resultado}
          desde={desde}
          hasta={hasta}
          presets={presets}
          servicios={nombresServicios}
          servicio={servicioElegido}
          incluirIvr={incluirIvr}
          esAdmin={usuario.rol === "admin"}
        />
      </div>
    );
  }

  if (vista === "historico") {
    const presets = presetsRango();
    const ayer = presets.find((p) => p.etiqueta === "Ayer")!;
    const rango = esquemaRango.safeParse({
      desde: params.desde ?? ayer.desde,
      hasta: params.hasta ?? ayer.hasta,
    });
    const { desde, hasta } = rango.success ? rango.data : ayer;
    const [kpis, agentes, ivr, ratios] = await Promise.all([
      kpisCampaniasRango(desde, hasta, umbral, camp),
      agentesProductividadRango(desde, hasta, camp),
      metricasIvr(desde, hasta, campServicio),
      ratiosExitoRango(desde, hasta, camp),
    ]);
    return (
      <div className="space-y-6">
        <TabsSupervision
          vista="historico"
          servicio={params.servicio}
          incluirIvr={incluirIvr}
          desde={params.desde}
          hasta={params.hasta}
        />
        <AvisoRango motivo={motivoRangoInvalido(rango)} alternativa="el día de ayer" />
        <PanelHistorico
          kpis={kpis}
          agentes={agentes}
          ivr={ivr}
          ratios={ratios}
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
  const [agentes, kpis, top, ivr, plan, ratios] = await Promise.all([
    estadoAgentes(camp),
    kpisCampaniasHoy(umbral, camp),
    agentesHoy(camp),
    metricasIvr(hoyISO(), hoyISO(), campServicio),
    alertasPlanificacion(),
    ratiosExitoHoy(camp),
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
          ratios,
          umbral,
          actualizado: new Date().toISOString(),
        }}
      />
    </div>
  );
}
