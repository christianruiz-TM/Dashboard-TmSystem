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
import { calidadBaseDatosRango } from "@/lib/rdb/queries/calidad-bd";
import { calidadBaseDatos } from "@/lib/calidad-bd";
import { resultadosActividadRango } from "@/lib/rdb/queries/resultados-actividad";
import { totalResultados } from "@/lib/resultados-cabecera";
import { prefijoUsuariosDe } from "@/lib/facturacion";
import { resumenSalientes } from "@/lib/rdb/queries/salientes";
import {
  campoContactoDe,
  configsResultados,
  objetivosDeResultados,
  tiposCampaniaDe,
} from "@/lib/db/resultados";
import {
  filtrarPorTipo,
  leerFiltroCampo,
  opcionesTipo,
  seleccionTipo,
} from "@/lib/resultados-actividad";
import { definicionExportContactos } from "@/lib/export-contactos";
import {
  campaniasDeServicio,
  campaniasEfectivas,
  listaServicios,
  mapaCampaniaServicio,
} from "@/lib/rdb/queries/servicios";
import { ordenServicios } from "@/components/filtros/selector-servicio-actividad";
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
    tipo?: string;
    campo?: string;
    modo?: string;
  }>;
}) {
  const usuario = await requireRol(...ROLES_SUPERVISION);
  const params = await searchParams;
  const vista =
    params.vista === "historico" || params.vista === "resultados" ? params.vista : "tiempo-real";
  const umbral = umbralSlaSeg();
  const servicios = await listaServicios();
  const nombresServicios = servicios.map((s) => s.servicio);
  // Clientes con actividad arriba y los parados abajo en el selector (caché de 1 h)
  const orden = await ordenServicios(nombresServicios);
  // Métricas principales: IVR excluido salvo check. La tarjeta IVR usa siempre
  // las campañas del servicio (incluidas las IVR), va aparte del toggle.
  const incluirIvr = params.ivr === "1";
  const camp = await campaniasEfectivas(params.servicio, incluirIvr);
  const campServicio = await campaniasDeServicio(params.servicio);
  // Tiempo real e Histórico: la tabla de campañas se agrupa por los tipos de
  // campaña del cliente (Bolsas: cartera; GH: BBDD) y el comparador agrupa
  // las campañas por cliente
  const tiposCliente =
    params.servicio && nombresServicios.includes(params.servicio) ? tiposCampaniaDe(params.servicio) : [];
  const servicioDe = Object.fromEntries(mapaCampaniaServicio(servicios));
  // Usuarios del cliente (GH_…): solo sus horas van a los totales (23/10/2026)
  const prefijo = params.servicio && nombresServicios.includes(params.servicio) ? prefijoUsuariosDe(params.servicio) : null;

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
    // Tipos de campaña del cliente (GH: BBDD): se filtra la lista antes de consultar
    const tipos = servicioElegido ? tiposCampaniaDe(servicioElegido) : [];
    const tipo = seleccionTipo(params.tipo, tipos);
    // Filtro por un dato del contacto (GH: origen del lead), si el cliente lo tiene
    const campo = servicioElegido ? campoContactoDe(servicioElegido) : null;
    const filtroCampo = campo ? leerFiltroCampo(params.campo, params.modo) : null;
    const campTipo = filtrarPorTipo(camp ?? [], tipos, tipo);
    const [resultado, ratiosRes] = servicioElegido
      ? await Promise.all([
          resultadosActividadRango(
            desde,
            hasta,
            campTipo,
            configsResultados(),
            objetivosDeResultados(),
            campo ? { servicio: servicioElegido, campo, filtro: filtroCampo } : null,
            prefijo,
          ),
          // Las cajas de actividad de la cabecera (22/10/2026): misma caché que
          // las horas de «finalizados por hora»
          ratiosExitoRango(desde, hasta, campTipo, prefijo),
        ])
      : [null, null];
    // CSV de contactos finalizados (solo GH): con los mismos filtros de la pestaña
    let urlCsv: string | null = null;
    if (servicioElegido && definicionExportContactos(servicioElegido)) {
      const p = new URLSearchParams({ servicio: servicioElegido, desde, hasta });
      if (tipo !== "todas") p.set("tipo", tipo);
      if (filtroCampo?.valor) p.set("campo", filtroCampo.valor);
      if (filtroCampo && filtroCampo.modo !== "exacto") p.set("modo", filtroCampo.modo);
      if (incluirIvr) p.set("ivr", "1");
      urlCsv = `/api/export/resultados-contactos?${p.toString()}`;
    }
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
          ratios={ratiosRes}
          desde={desde}
          hasta={hasta}
          presets={presets}
          servicios={nombresServicios}
          ordenServicios={orden}
          servicio={servicioElegido}
          incluirIvr={incluirIvr}
          esAdmin={usuario.rol === "admin"}
          tipos={opcionesTipo(tipos)}
          tipo={tipo}
          campo={campo ? { etiqueta: campo.etiqueta, filtro: filtroCampo } : null}
          urlCsv={urlCsv}
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
    const [kpis, agentes, ivr, ratios, intentos, resultados, salientes] = await Promise.all([
      kpisCampaniasRango(desde, hasta, umbral, camp),
      agentesProductividadRango(desde, hasta, camp),
      metricasIvr(desde, hasta, campServicio),
      ratiosExitoRango(desde, hasta, camp, prefijo),
      calidadBaseDatosRango(desde, hasta, camp),
      totalResultados(desde, hasta, camp, prefijo),
      resumenSalientes(desde, hasta, camp, prefijo),
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
          resultados={resultados}
          salientes={salientes}
          calidad={calidadBaseDatos(intentos.filas, intentos.contactos, tiposCliente)}
          umbral={umbral}
          desde={desde}
          hasta={hasta}
          presets={presets}
          servicios={nombresServicios}
          ordenServicios={orden}
          servicio={params.servicio}
          incluirIvr={incluirIvr}
          tipos={tiposCliente}
          servicioDe={servicioDe}
        />
      </div>
    );
  }

  // Tiempo real (hoy, en vivo con polling)
  const [agentes, kpis, top, ivr, plan, ratios, intentos, resultados, salientes] = await Promise.all([
    estadoAgentes(camp),
    kpisCampaniasHoy(umbral, camp),
    agentesHoy(camp),
    metricasIvr(hoyISO(), hoyISO(), campServicio),
    alertasPlanificacion(),
    ratiosExitoHoy(camp, prefijo),
    calidadBaseDatosRango(hoyISO(), hoyISO(), camp),
    totalResultados(hoyISO(), hoyISO(), camp, prefijo),
    resumenSalientes(hoyISO(), hoyISO(), camp, prefijo),
  ]);
  return (
    <div className="space-y-6">
      <TabsSupervision vista="tiempo-real" servicio={params.servicio} incluirIvr={incluirIvr} />
      <PanelSupervision
        // Remonta al cambiar de servicio o de toggle IVR
        key={`${params.servicio ?? "todos"}|${incluirIvr ? "ivr" : "noivr"}`}
        servicios={nombresServicios}
        ordenServicios={orden}
        servicio={params.servicio}
        incluirIvr={incluirIvr}
        tipos={tiposCliente}
        servicioDe={servicioDe}
        inicial={{
          agentes,
          kpis,
          top,
          ivr,
          plan,
          ratios,
          resultados,
          salientes,
          calidad: calidadBaseDatos(intentos.filas, intentos.contactos, tiposCliente),
          umbral,
          actualizado: new Date().toISOString(),
        }}
      />
    </div>
  );
}
