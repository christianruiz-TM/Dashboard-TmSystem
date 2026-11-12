// ============================================================
// «Mi servicio» (06/11/2026): el panel de cada cliente y su informe.
// DatosMiServicio es lo que sale del servidor; con él, el MOTOR
// (motor.ts) calcula el panel de una selección de campañas, en el servidor
// para la pantalla y en el navegador para el informe descargado, que
// lleva estos datos dentro. Todo lo que va aquí lo puede ver el cliente:
// nada de agentes ni de cifras internas (esas van en ExtrasInternos).
// ============================================================

/** Una campaña y un día. Claves cortas: van tal cual dentro del informe. */
export interface FilaMiServicio {
  /** Campaña. */
  c: string;
  /** Día (YYYY-MM-DD). */
  f: string;
  /** Llamadas: todas, entrantes y salientes, contesten o no (caja «Llamadas»). */
  ll: number;
  /** Llamadas gestionadas (las que pasaron por un agente). */
  ge: number;
  /** Éxitos: sesiones de éxito, el día de la llamada (caja «Éxitos», regla 17). */
  ex: number;
  /** Horas con la ficha del guion abierta. */
  gu: number;
  /** Finalizados: contactos cerrados por un agente, el día del cierre (regla 18). */
  fi: number;
  /** Finalizados con éxito (contacto cerrado en éxito): base del aprovechamiento. */
  fe: number;
  /** No válidos (0 si el cliente no los tiene configurados). */
  nv: number;
}

/** Finalizados de una campaña por resultado (primer y segundo nivel). */
export interface FilaResultadoMiServicio {
  c: string;
  r1: string;
  r2: string | null;
  n: number;
  fe: number;
  nv: number;
}

export interface CampaniaMiServicio {
  nombre: string;
  /** Tipo de campaña del cliente (/admin/resultados), o null. */
  tipo: string | null;
  /**
   * ¿Salen sus horas? Solo en las campañas que se facturan por horas (o sin
   * facturación configurada): las bbdd de GH se cobran por contactos y no
   * llevan horas (12/11/2026).
   */
  horas: boolean;
}

/** Botón de tipo del informe: qué campañas marca. */
export interface OpcionTipoMiServicio {
  etiqueta: string;
  campanias: string[];
}

export interface DatosMiServicio {
  servicio: string;
  desde: string;
  hasta: string;
  /** Cuándo se sacaron los datos («06/11/2026 10:45»). */
  generado: string;
  /** Campañas con datos en el periodo, de la A a la Z. */
  campanias: CampaniaMiServicio[];
  /** Tipos de campaña del cliente («Sin BBDD», «Solo BBDD»); vacío si no tiene. */
  opcionesTipo: OpcionTipoMiServicio[];
  /** Filtro de la pantalla al sacar los datos (textos), o null. */
  filtro: { tipo: string | null; campania: string | null };
  /** ¿Tiene el cliente los «no válidos» configurados? Si no, no hay no válidos ni neto. */
  configurado: boolean;
  /** Nombres de los niveles del resultado («Resultado», «Subresultado»). */
  niveles: string[];
  filas: FilaMiServicio[];
  resultados: FilaResultadoMiServicio[];
  /**
   * Horas logadas de los usuarios del cliente, total y por día: con el
   * cliente entero, las de la caja 1; con un tipo («Sin BBDD»), las de
   * Supervisión → Resultados con ese tipo (los usuarios que trabajaron en
   * sus campañas, 12/11/2026). null con una campaña o con un tipo que no se
   * factura por horas: entonces, las de la ficha abierta (o ninguna).
   */
  horas: { total: number; dia: Record<string, number> } | null;
}

/** Lo que solo ven los roles internos (globos), nunca va al informe. */
export interface ExtrasInternos {
  /** Contactos cerrados como en facturación (con cierres administrativos y sin tocar). */
  cerrados: number;
  /** Prefijo de los usuarios del cliente con el que se cuentan las horas, o null. */
  prefijo: string | null;
}

// ------------------------------------------------------------
// Lo que calcula el motor
// ------------------------------------------------------------

/** «ninguna»: ninguna campaña de la selección se factura por horas. */
export type TipoHoras = "logadas" | "ficha" | "ninguna";

export interface KpisMiServicio {
  llamadas: number;
  gestionadas: number;
  finalizados: number;
  noValidos: number | null;
  pctNoValidos: number | null;
  exitos: number;
  pctExitoLlamada: number | null;
  finalizadosExito: number;
  horas: number | null;
  tipoHoras: TipoHoras;
  finalizadosPorExito: number | null;
  brutoPct: number | null;
  netoPct: number | null;
}

export interface PuntoMiServicio {
  /** Día o lunes de la semana. */
  p: string;
  etiqueta: string;
  etiquetaLarga: string;
  ll: number;
  fi: number;
  ex: number;
  ho: number;
  fe: number;
  nv: number;
}

export interface EtapaEmbudo {
  clave: "ll" | "fi" | "va" | "fe";
  etiqueta: string;
  valor: number;
  /** % sobre la etapa anterior (la primera no tiene). */
  pctAnterior: number | null;
}

export interface NodoResultadoMiServicio {
  nombre: string;
  n: number;
  pct: number | null;
  fe: number;
  nv: number;
  hijos: { nombre: string; n: number; pct: number | null }[];
}

export interface CampaniaCalculada {
  nombre: string;
  tipo: string | null;
  ll: number;
  ge: number;
  fi: number;
  nv: number | null;
  pctNv: number | null;
  ex: number;
  fe: number;
  /** Horas con la ficha abierta; null si la campaña no se factura por horas. */
  horasFicha: number | null;
  brutoPct: number | null;
  netoPct: number | null;
}

export interface PanelMiServicio {
  seleccion: string[];
  /** ¿Están todas las campañas de los datos? (horas logadas si las hay). */
  todas: boolean;
  kpis: KpisMiServicio;
  serie: { granularidad: "dia" | "semana"; puntos: PuntoMiServicio[] };
  embudo: EtapaEmbudo[];
  /** Finalizados por cómo acabaron (resto = ni éxito ni no válido). */
  reparto: { exito: number; noValido: number | null; resto: number };
  resultados: NodoResultadoMiServicio[];
  motivos: { nombre: string; n: number; pct: number | null }[];
  campanias: CampaniaCalculada[];
}
