import { Suspense, type ComponentProps } from "react";
import { ordenarPorActividad } from "@/lib/actividad-servicios";
import { hoyISO } from "@/lib/fechas";
import { actividadServicios } from "@/lib/rdb/queries/servicios";
import { SelectorServicio } from "./selector-servicio";

type Props = Omit<ComponentProps<typeof SelectorServicio>, "orden">;

/** Orden por actividad de los clientes; null si RDBv2 no responde (el selector sale sin él). */
export async function ordenServicios(servicios: string[]) {
  try {
    return ordenarPorActividad(servicios, await actividadServicios(), hoyISO());
  } catch (e) {
    console.error("[servicios] actividad para el selector:", e);
    return undefined;
  }
}

async function ConOrden(props: Props) {
  return <SelectorServicio {...props} orden={await ordenServicios(props.servicios)} />;
}

/**
 * Selector de cliente ordenado por actividad para páginas de servidor. Sale
 * al momento en el orden de siempre y se reordena cuando llega la consulta
 * (0,3 s la primera vez y caché de 1 h): Operaciones tiene que abrir sin
 * esperar a RDBv2.
 */
export function SelectorServicioActividad(props: Props) {
  return (
    <Suspense fallback={<SelectorServicio {...props} />}>
      <ConOrden {...props} />
    </Suspense>
  );
}
