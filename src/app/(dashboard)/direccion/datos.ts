import { callbackPeriodo } from "@/lib/callback-servidor";
import { filasCampaniaDireccion } from "@/lib/direccion";
import { totalResultados } from "@/lib/resultados-cabecera";
import { horasAgenteReales, horasLogadasPorServicio } from "@/lib/rdb/queries/agentes";
import { calidadBaseDatosRango } from "@/lib/rdb/queries/calidad-bd";
import { unidadesPorCampania } from "@/lib/rdb/queries/facturacion";
import { volumenPorCampania } from "@/lib/rdb/queries/interacciones";
import { ratiosExitoRango } from "@/lib/rdb/queries/ratios-exito";
import { resumenSalientes } from "@/lib/rdb/queries/salientes";

// ============================================================
// Datos de Dirección por sección (12/11/2026). Cada consulta es una función
// que la lanza la PRIMERA vez que alguien la pide y devuelve la misma promesa
// a los demás: las secciones (en <Suspense>) solo piden lo suyo y lo común
// (los ratios, el volumen…) se consulta una vez aunque lo usen varios bloques.
// La página no espera a nada: cada bloque sale cuando llegan sus datos.
// ============================================================

/** La consulta, perezosa y compartida. */
function una<T>(consulta: () => Promise<T>): () => Promise<T> {
  let promesa: Promise<T> | null = null;
  return () => (promesa ??= consulta());
}

export interface FiltrosDireccion {
  desde: string;
  hasta: string;
  /** El mismo rango del mes anterior, para la variación. */
  anterior: { desde: string; hasta: string };
  campanias: string[] | undefined;
  /** Usuarios del cliente (GH_…): solo sus horas van a los totales (23/10/2026). */
  prefijo: string | null;
  servicio: string | undefined;
  servicioDe: Map<string, string>;
}

export function cargaDireccion(f: FiltrosDireccion) {
  const { desde, hasta, anterior, campanias: camp, prefijo } = f;
  const volumen = una(() => volumenPorCampania(desde, hasta, camp));
  const unidades = una(() => unidadesPorCampania(desde, hasta, camp));
  // Ratios de éxito en vivo, la MISMA consulta que Supervisión (regla 17)
  const ratios = una(() => ratiosExitoRango(desde, hasta, camp, prefijo));
  return {
    volumen,
    volumenAnterior: una(() => volumenPorCampania(anterior.desde, anterior.hasta, camp)),
    unidades,
    // Horas logadas REALES (unión de intervalos por agente, global)
    horasReales: una(() => horasAgenteReales(desde, hasta, camp)),
    ratios,
    ratiosAnterior: una(() => ratiosExitoRango(anterior.desde, anterior.hasta, camp, prefijo)),
    horasPorServicio: una(() => horasLogadasPorServicio(desde, hasta, camp)),
    intentos: una(() => calidadBaseDatosRango(desde, hasta, camp)),
    // Contactos cerrados (Resultados, regla 18): las cajas de finalizados y aprovechamiento
    resultados: una(() => totalResultados(desde, hasta, camp, prefijo)),
    resultadosAnterior: una(() => totalResultados(anterior.desde, anterior.hasta, camp, prefijo)),
    salientes: una(() => resumenSalientes(desde, hasta, camp, prefijo)),
    // Callback de los clientes que lo tienen (12/11/2026); si falla, sin la sección
    callback: una(() =>
      callbackPeriodo(desde, hasta, f.servicio).catch((e) => {
        console.error("[direccion] callback:", e);
        return null;
      }),
    ),
    // Una fila por campaña con las tres fuentes: detalle, clientes y comparador
    filas: una(async () => {
      const [v, u, r] = await Promise.all([volumen(), unidades(), ratios()]);
      return filasCampaniaDireccion(v, u, r.campanias, f.servicioDe);
    }),
  };
}

export type CargaDireccion = ReturnType<typeof cargaDireccion>;
