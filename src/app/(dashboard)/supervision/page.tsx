import type { Metadata } from "next";
import { AvisoRango, AvisoServicio } from "@/components/filtros/aviso-rango";
import { ROLES_SUPERVISION, requireRol } from "@/lib/auth/rbac";
import { esquemaRango, motivoRangoInvalido, presetsRango } from "@/lib/fechas";
import { ratiosExitoRango } from "@/lib/rdb/queries/ratios-exito";
import { resultadosActividadRango } from "@/lib/rdb/queries/resultados-actividad";
import { prefijoUsuariosDe } from "@/lib/facturacion";
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
  campaniasEfectivas,
  listaServicios,
  mapaCampaniaServicio,
} from "@/lib/rdb/queries/servicios";
import { ordenServicios } from "@/components/filtros/selector-servicio-actividad";
import { PanelHistorico } from "./panel-historico";
import { PanelResultados } from "./panel-resultados";
import { datosSupervisionHoy, datosSupervisionRango } from "@/lib/supervision-servidor";
import { leerSeccion, pestanasSeccion } from "@/lib/supervision-secciones";
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
    seccion?: string;
  }>;
}) {
  const usuario = await requireRol(...ROLES_SUPERVISION);
  const params = await searchParams;
  const vista =
    params.vista === "historico" || params.vista === "resultados" ? params.vista : "tiempo-real";
  // Sección de Tiempo real e Histórico (12/11/2026): cada pestaña consulta solo lo suyo
  const seccion = leerSeccion(params.seccion);
  const servicios = await listaServicios();
  const nombresServicios = servicios.map((s) => s.servicio);
  // Clientes con actividad arriba y los parados abajo en el selector (caché de 1 h)
  const orden = await ordenServicios(nombresServicios);
  // Métricas principales: IVR excluido salvo check. La tarjeta IVR usa siempre
  // las campañas del servicio (incluidas las IVR), va aparte del toggle.
  const incluirIvr = params.ivr === "1";
  // Un cliente que no existe (enlace viejo, nombre mal escrito) se trata como
  // sin cliente elegido, con aviso
  const servicio = params.servicio && nombresServicios.includes(params.servicio) ? params.servicio : undefined;
  const servicioInexistente = params.servicio && !servicio ? params.servicio : null;
  const camp = await campaniasEfectivas(servicio, incluirIvr);
  // Tiempo real e Histórico: la tabla de campañas se agrupa por los tipos de
  // campaña del cliente (Bolsas: cartera; GH: BBDD) y el comparador agrupa
  // las campañas por cliente
  const tiposCliente = servicio ? tiposCampaniaDe(servicio) : [];
  const servicioDe = Object.fromEntries(mapaCampaniaServicio(servicios));
  // Usuarios del cliente (GH_…): solo sus horas van a los totales (23/10/2026)
  const prefijo = servicio ? prefijoUsuariosDe(servicio) : null;

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
    const servicioElegido = servicio;
    // Tipos de campaña del cliente (GH: BBDD): se filtra la lista antes de consultar
    const tipos = servicioElegido ? tiposCampaniaDe(servicioElegido) : [];
    const tipo = seleccionTipo(params.tipo, tipos);
    // Filtro por un dato del contacto (GH: origen del lead), si el cliente lo tiene
    const campo = servicioElegido ? campoContactoDe(servicioElegido) : null;
    const filtroCampo = campo ? leerFiltroCampo(params.campo, params.modo) : null;
    const campTipo = filtrarPorTipo(camp ?? [], tipos, tipo);
    // Con un tipo de campaña no se puede saber de qué tipo es quien no llamó:
    // los usuarios logados sin actividad solo salen con el cliente entero
    const sinActividad = tipo === "todas";
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
            sinActividad,
          ),
          // Las cajas de actividad de la cabecera (22/10/2026): misma caché que
          // las horas de «finalizados por hora»
          ratiosExitoRango(desde, hasta, campTipo, prefijo, sinActividad),
        ])
      : [null, null];
    // Excel de contactos finalizados (solo GH): con los mismos filtros de la pestaña
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
      <PanelResultados
        pestanas={
          <TabsSupervision
            vista="resultados"
            servicio={servicio}
            incluirIvr={incluirIvr}
            desde={params.desde}
            hasta={params.hasta}
          />
        }
        avisos={
          <>
            <AvisoServicio pedido={servicioInexistente} alternativa="la lista de clientes para elegir uno" />
            <AvisoRango motivo={motivoRangoInvalido(rango)} alternativa="el mes en curso" />
          </>
        }
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
    const datos = await datosSupervisionRango(desde, hasta, servicio, incluirIvr, seccion);
    return (
      <PanelHistorico
        datos={datos}
        seccion={seccion}
        secciones={pestanasSeccion({ vista: "historico", servicio, incluirIvr, desde, hasta })}
        pestanas={
          <TabsSupervision
            vista="historico"
            servicio={servicio}
            incluirIvr={incluirIvr}
            desde={params.desde}
            hasta={params.hasta}
            seccion={seccion}
          />
        }
        avisos={
          <>
            <AvisoServicio pedido={servicioInexistente} alternativa="todos los clientes" />
            <AvisoRango motivo={motivoRangoInvalido(rango)} alternativa="el día de ayer" />
          </>
        }
        desde={desde}
        hasta={hasta}
        presets={presets}
        servicios={nombresServicios}
        ordenServicios={orden}
        servicio={servicio}
        incluirIvr={incluirIvr}
        tipos={tiposCliente}
        servicioDe={servicioDe}
      />
    );
  }

  // Tiempo real (hoy, en vivo con polling): solo la sección abierta y la franja «Ahora»
  const inicial = await datosSupervisionHoy(servicio, incluirIvr, seccion);
  return (
    <PanelSupervision
      // Remonta al cambiar de servicio, de toggle IVR o de sección
      key={`${servicio ?? "todos"}|${incluirIvr ? "ivr" : "noivr"}|${seccion}`}
      inicial={inicial}
      seccion={seccion}
      secciones={pestanasSeccion({ vista: "tiempo-real", servicio, incluirIvr })}
      pestanas={<TabsSupervision vista="tiempo-real" servicio={servicio} incluirIvr={incluirIvr} seccion={seccion} />}
      avisos={<AvisoServicio pedido={servicioInexistente} alternativa="todos los clientes" />}
      servicios={nombresServicios}
      ordenServicios={orden}
      servicio={servicio}
      incluirIvr={incluirIvr}
      tipos={tiposCliente}
      servicioDe={servicioDe}
    />
  );
}
