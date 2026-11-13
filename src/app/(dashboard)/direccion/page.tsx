import type { Metadata } from "next";
import { Suspense } from "react";
import { AvisoRango, AvisoServicio } from "@/components/filtros/aviso-rango";
import { SelectorRango } from "@/components/filtros/selector-rango";
import { SelectorServicioActividad } from "@/components/filtros/selector-servicio-actividad";
import { SelectorIvr } from "@/components/filtros/selector-ivr";
import { SeccionCargando } from "@/components/cargando";
import { Glosario } from "@/components/glosario";
import { BarraPanel } from "@/components/layout/barra-panel";
import { requireRol } from "@/lib/auth/rbac";
import { tiposCampaniaDe } from "@/lib/db/resultados";
import {
  GLOSARIO_DIRECCION,
  NOMBRE_SECCION_DIRECCION,
  leerSeccionDireccion,
  pestanasSeccionDireccion,
  rangoAnterior,
} from "@/lib/direccion-secciones";
import { prefijoUsuariosDe } from "@/lib/facturacion";
import { esquemaRango, motivoRangoInvalido, presetsRango } from "@/lib/fechas";
import { campaniasEfectivas, listaServicios, mapaCampaniaServicio } from "@/lib/rdb/queries/servicios";
import { cargaDireccion } from "./datos";
import {
  CajasDireccion,
  CallbackDireccion,
  CalidadDireccion,
  CampaniasDireccion,
  ClientesDireccion,
  ExitosDireccion,
  SalientesDireccion,
  TendenciasDireccion,
  Top10Direccion,
  VolumenDireccion,
} from "./secciones";

export const metadata: Metadata = { title: "Dirección" };
export const dynamic = "force-dynamic";

/**
 * Dirección · visión global. Desde el 12/11/2026 en pestañas por sección
 * (lib/direccion-secciones.ts), como Supervisión: la página apilaba 12
 * bloques (13.736 px de alto). Cada pestaña consulta solo lo suyo (datos.ts)
 * y cada bloque va en su <Suspense>: la barra sale al momento y las cifras
 * según llegan.
 */
export default async function PaginaDireccion({
  searchParams,
}: {
  searchParams: Promise<{
    desde?: string;
    hasta?: string;
    servicio?: string;
    ivr?: string;
    seccion?: string;
  }>;
}) {
  await requireRol("direccion");
  const presets = presetsRango();
  const mesActual = presets.find((p) => p.etiqueta === "Mes actual")!;
  const params = await searchParams;
  const rango = esquemaRango.safeParse({
    desde: params.desde ?? mesActual.desde,
    hasta: params.hasta ?? mesActual.hasta,
  });
  const { desde, hasta } = rango.success ? rango.data : mesActual;
  const anterior = rangoAnterior(desde, hasta);
  const seccion = leerSeccionDireccion(params.seccion);

  // Scoping por cliente/servicio; IVR excluido salvo que se marque el check
  const incluirIvr = params.ivr === "1";
  const servicios = await listaServicios();
  // Sin cliente elegido (o uno que no existe, con aviso): visión por cliente
  const servicioElegido = servicios.some((s) => s.servicio === params.servicio) ? params.servicio : undefined;
  const servicioInexistente = params.servicio && !servicioElegido ? params.servicio : null;
  const camp = await campaniasEfectivas(servicioElegido, incluirIvr);
  // Grupos del detalle: los tipos de campaña del cliente (Bolsas: cartera y resto)
  const tipos = servicioElegido ? tiposCampaniaDe(servicioElegido) : [];

  const datos = cargaDireccion({
    desde,
    hasta,
    anterior,
    campanias: camp,
    prefijo: prefijoUsuariosDe(servicioElegido),
    servicio: servicioElegido,
    servicioDe: mapaCampaniaServicio(servicios),
  });
  const hrefCliente = (servicio: string) => {
    const p = new URLSearchParams({ servicio, desde, hasta });
    if (incluirIvr) p.set("ivr", "1");
    return `/direccion?${p.toString()}`;
  };
  const fecha = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

  return (
    <div className="space-y-6">
      <BarraPanel
        pestanas={<SelectorRango desde={desde} hasta={hasta} presets={presets} />}
        filtros={
          <>
            <SelectorServicioActividad servicios={servicios.map((s) => s.servicio)} valor={servicioElegido} />
            <SelectorIvr incluir={incluirIvr} />
          </>
        }
        secciones={pestanasSeccionDireccion({ desde, hasta, servicio: servicioElegido, incluirIvr })}
        actual={seccion}
        estado={
          seccion === "resumen" ? (
            <span>
              Variación frente al {fecha(anterior.desde)}-{fecha(anterior.hasta)}
            </span>
          ) : undefined
        }
      />
      <AvisoServicio pedido={servicioInexistente} alternativa="la visión por cliente" />
      <AvisoRango motivo={motivoRangoInvalido(rango)} alternativa="el mes actual" />

      {seccion === "resumen" ? (
        <>
          <Suspense fallback={<SeccionCargando texto="Calculando las cifras principales…" alto="h-[23rem]" />}>
            <CajasDireccion datos={datos} />
          </Suspense>
          <Suspense fallback={<SeccionCargando texto="Calculando el volumen…" alto="h-28" />}>
            <VolumenDireccion datos={datos} />
          </Suspense>
          {servicioElegido ? null : (
            <Suspense fallback={<SeccionCargando texto="Calculando la visión por cliente…" alto="h-80" />}>
              <ClientesDireccion datos={datos} hrefCliente={hrefCliente} />
            </Suspense>
          )}
        </>
      ) : null}

      {seccion === "tendencias" ? (
        <>
          <TendenciasDireccion campanias={camp} />
          <Suspense fallback={<SeccionCargando texto="Calculando las campañas con más volumen…" alto="h-96" />}>
            <Top10Direccion datos={datos} />
          </Suspense>
        </>
      ) : null}

      {seccion === "campanias" ? (
        <Suspense fallback={<SeccionCargando texto="Calculando el detalle por campaña…" alto="h-96" />}>
          <CampaniasDireccion
            datos={datos}
            tipos={tipos}
            claveComparador={`${servicioElegido ?? "todos"}|${desde}|${hasta}|${incluirIvr ? "ivr" : ""}`}
          />
        </Suspense>
      ) : null}

      {seccion === "exitos" ? (
        <Suspense fallback={<SeccionCargando texto="Calculando el rendimiento por éxitos…" alto="h-96" />}>
          <ExitosDireccion datos={datos} />
        </Suspense>
      ) : null}

      {seccion === "salientes" ? (
        <>
          {/* Un mes de todos los clientes tarda ~7 s: la calidad sale antes, sin esperarla */}
          <Suspense fallback={<SeccionCargando texto="Calculando los KPIs de salida…" alto="h-80" />}>
            <SalientesDireccion datos={datos} />
          </Suspense>
          <Suspense fallback={<SeccionCargando texto="Calculando la calidad de la base de datos…" alto="h-80" />}>
            <CalidadDireccion datos={datos} tipos={tipos} />
          </Suspense>
        </>
      ) : null}

      {seccion === "callback" ? (
        <Suspense fallback={<SeccionCargando texto="Calculando el callback…" alto="h-64" />}>
          <CallbackDireccion datos={datos} />
        </Suspense>
      ) : null}

      {GLOSARIO_DIRECCION[seccion].length > 0 ? (
        <Glosario titulo={`Dirección · ${NOMBRE_SECCION_DIRECCION[seccion]}`} claves={GLOSARIO_DIRECCION[seccion]} />
      ) : null}
    </div>
  );
}
