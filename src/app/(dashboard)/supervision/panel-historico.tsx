import type { ReactNode } from "react";
import { BarraPanel } from "@/components/layout/barra-panel";
import { SelectorRango } from "@/components/filtros/selector-rango";
import { SelectorServicio } from "@/components/filtros/selector-servicio";
import type { ServicioOrdenado } from "@/lib/actividad-servicios";
import { SelectorIvr } from "@/components/filtros/selector-ivr";
import { SelectorTipo } from "@/components/filtros/selector-tipo";
import { AvisoTipo } from "@/components/filtros/aviso-tipo";
import type { FiltroTipo } from "@/lib/tipo-panel";
import type { TipoCampania } from "@/lib/resultados-actividad";
import { NOMBRE_SECCION, type SeccionSupervision } from "@/lib/supervision-secciones";
import type { DatosSupervisionPeriodo } from "@/lib/supervision-servidor";
import { SeccionPeriodo } from "./secciones-supervision";

/**
 * Vista histórica de supervisión: las mismas secciones que el tiempo real
 * (12/11/2026, en pestañas: cada una consulta solo lo suyo) sobre un rango
 * de fechas elegible (ayer, últimos 7 días, mes anterior, intervalo). Sin la
 * franja «Ahora» ni el estado de agentes, que solo valen para el momento.
 */
export function PanelHistorico({
  datos,
  seccion,
  secciones,
  pestanas,
  avisos,
  desde,
  hasta,
  presets,
  servicios,
  ordenServicios,
  servicio,
  incluirIvr,
  tipos,
  filtroTipo,
  servicioDe,
}: {
  datos: DatosSupervisionPeriodo;
  seccion: SeccionSupervision;
  /** Las pestañas de sección ya con su enlace (las monta la página). */
  secciones: { valor: string; etiqueta: string; href: string }[];
  /** Pestañas principales de Supervisión (Tiempo real, Histórico, Resultados). */
  pestanas: ReactNode;
  /** Avisos de la página (cliente que no existe, rango inválido), debajo de la barra. */
  avisos?: ReactNode;
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
  /** Filtro por tipo de campaña (17/11/2026; sin opciones si el cliente no lo tiene). */
  filtroTipo: FiltroTipo;
  /** Cliente de cada campaña (para el comparador sin cliente elegido). */
  servicioDe: Record<string, string>;
}) {
  return (
    <div className="space-y-6">
      <BarraPanel
        pestanas={
          <>
            {pestanas}
            <SelectorRango desde={desde} hasta={hasta} presets={presets} />
          </>
        }
        filtros={
          <>
            <SelectorServicio servicios={servicios} orden={ordenServicios} valor={servicio} />
            <SelectorTipo opciones={filtroTipo.opciones} valor={filtroTipo.tipo} defecto={filtroTipo.defecto} />
            <SelectorIvr incluir={incluirIvr} />
          </>
        }
        secciones={secciones}
        actual={seccion}
      />

      {avisos}
      <AvisoTipo
        filtro={filtroTipo}
        sinHoras={datos.sinHoras}
        delCliente={seccion === "entrantes" ? "La tarjeta del IVR y el callback" : undefined}
      />

      <SeccionPeriodo
        seccion={seccion}
        datos={datos}
        periodo="en el período"
        tipos={tipos}
        servicioDe={servicioDe}
        titulo={`Supervisión · histórico · ${NOMBRE_SECCION[seccion]}`}
        claveComparador={`${servicio ?? "todos"}|${desde}|${hasta}|${incluirIvr ? "ivr" : ""}|${filtroTipo.tipo}`}
      />
    </div>
  );
}
