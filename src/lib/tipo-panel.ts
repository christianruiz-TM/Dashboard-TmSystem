import { filtrarPorTipo, opcionesTipo, type SeleccionTipo, type TipoCampania } from "@/lib/resultados-actividad";

// ============================================================
// Filtro por tipo de campaña en los paneles (17/11/2026, pedido por
// Christian: «me falta la opción de tipo con base de datos o sin base de
// datos en todas las pestañas de GH»). Puro, sin I/O.
//
// Decidido con él:
//  - Sale en Supervisión (Tiempo real, Histórico y Resultados), Dirección y
//    Operaciones (Horas logadas, Unidades, Listas y Pausas; NO en la Factura,
//    los Meses cerrados ni las descargas, que son siempre del cliente entero).
//  - Solo en los clientes marcados en /admin/resultados («Filtrar los paneles
//    por tipo», `resultados.filtroPaneles.<servicio>`): hoy, GrupoHuertas.
//    Bolsas tiene tipos (Cartera) y sigue como antes.
//  - Tres opciones (Todas · Sin BBDD · Solo BBDD) y por defecto la primera
//    que no es «Todas» («Sin BBDD»), que es la que NO va en la URL; «Todas»
//    va como `?tipo=todas`.
//  - Horas como en «Mi servicio»: con un tipo elegido, sin los usuarios
//    logados sin actividad (no se sabe de qué tipo son), y si TODAS las
//    campañas del tipo se facturan sin horas (las bbdd de GH, por contactos),
//    ninguna cifra de horas logadas ni «por hora», tampoco en las tablas.
//  - Se filtra la LISTA de campañas antes de consultar, como en Resultados:
//    ningún cálculo cambia. Del 01/10 al 16/11/2026 los usuarios GH_nnnn solo
//    trabajaron en campañas que no son BBDD y los GH_nnnn_BD solo en gh_bbdd_*
//    (sesiones, llamadas y pausas), así que filtrar por campaña separa
//    también a las personas (pausas y estado de agentes).
// ============================================================

export interface FiltroTipo {
  /** Opciones del selector; vacío = este panel no filtra por tipo para el cliente. */
  opciones: { valor: SeleccionTipo; etiqueta: string }[];
  /** La elegida. */
  tipo: SeleccionTipo;
  /** La de por defecto: la que no va en la URL. */
  defecto: SeleccionTipo;
}

/** Sin filtro de tipo (sin cliente, cliente sin tipos o sin la casilla marcada). */
export const SIN_FILTRO_TIPO: FiltroTipo = { opciones: [], tipo: "todas", defecto: "todas" };

/**
 * `?tipo=` → filtro. Con `empiezaSinTodas`, lo de por defecto es la primera
 * opción que no es «Todas» («Sin BBDD»); si no, «Todas», como hasta ahora.
 * Un valor que no es de este cliente vuelve a lo de por defecto.
 */
export function leerFiltroTipo(
  valor: string | null | undefined,
  tipos: TipoCampania[],
  empiezaSinTodas: boolean,
): FiltroTipo {
  const opciones = opcionesTipo(tipos);
  if (opciones.length === 0) return SIN_FILTRO_TIPO;
  const defecto: SeleccionTipo = empiezaSinTodas
    ? (opciones.find((o) => o.valor !== "todas")?.valor ?? "todas")
    : "todas";
  const tipo = opciones.find((o) => o.valor === valor)?.valor ?? defecto;
  return { opciones, tipo, defecto };
}

/** Lo que va en `?tipo=` de un enlace: nada si es lo de por defecto. */
export function parametroTipo(f: Pick<FiltroTipo, "tipo" | "defecto">): string | undefined {
  return f.tipo === f.defecto ? undefined : f.tipo;
}

/** Etiqueta de la opción elegida («Sin BBDD»), o null con «Todas» o sin filtro. */
export function etiquetaTipo(f: FiltroTipo): string | null {
  if (f.tipo === "todas") return null;
  return f.opciones.find((o) => o.valor === f.tipo)?.etiqueta ?? null;
}

/** Las campañas del tipo elegido. `undefined` (todos los clientes) se queda igual. */
export function campaniasDelTipo(
  campanias: string[] | undefined,
  tipos: TipoCampania[],
  tipo: SeleccionTipo,
): string[] | undefined {
  return campanias === undefined ? undefined : filtrarPorTipo(campanias, tipos, tipo);
}

/**
 * ¿Sin horas? Con un tipo elegido y todas sus campañas facturadas sin horas
 * (`facturaPorHoras` = false: las bbdd de GH). Con «Todas», una campaña sin
 * configurar (null) o alguna por horas, sí hay horas.
 */
export function sinHorasDelTipo(
  campanias: string[] | undefined,
  tipo: SeleccionTipo,
  facturaPorHoras: (campania: string) => boolean | null,
): boolean {
  if (tipo === "todas" || !campanias || campanias.length === 0) return false;
  return campanias.every((c) => facturaPorHoras(c) === false);
}
