// ============================================================
// Glosario único de términos del dashboard (en español llano).
// Lo consume el componente <Glosario> en cada panel. Mantener aquí
// las definiciones evita que se contradigan entre vistas.
// ============================================================

export interface DefinicionGlosario {
  termino: string;
  definicion: string;
}

export const GLOSARIO: Record<string, DefinicionGlosario> = {
  interacciones: {
    termino: "Interacciones",
    definicion:
      "Volumen total del período: todas las llamadas entrantes y salientes, incluidas las que no llegaron a atenderse (ocupado, no contesta, número inválido, abandonadas…). Al facturar por «interacciones gestionadas» solo cuentan las atendidas.",
  },
  recibidas: {
    termino: "Recibidas",
    definicion: "Llamadas entrantes (inbound) que llegaron a la campaña.",
  },
  atendidas: {
    termino: "Atendidas",
    definicion: "Interacciones que un agente llegó a atender (no abandonadas).",
  },
  abandonadas: {
    termino: "Abandonadas",
    definicion: "Llamadas entrantes que el cliente colgó antes de ser atendido.",
  },
  abandono: {
    termino: "% Abandono",
    definicion:
      "Porcentaje de llamadas ENTRANTES abandonadas sobre el total de entrantes recibidas. Solo cuenta entrantes en el numerador y en el denominador: una saliente que el marcador corta no es un cliente que se cansa de esperar. Cuanto más bajo, mejor.",
  },
  aht: {
    termino: "AHT (tiempo medio de gestión)",
    definicion:
      "Average Handle Time: tiempo medio que dura gestionar una interacción atendida, incluyendo la conversación y el trabajo posterior (ACW).",
  },
  acw: {
    termino: "ACW (trabajo tras la llamada)",
    definicion:
      "After Call Work: tiempo de trabajo administrativo después de colgar (tipificar, notas, formularios).",
  },
  talk: {
    termino: "Talk (conversación)",
    definicion: "Tiempo medio hablando con el cliente, sin contar el trabajo posterior (ACW).",
  },
  cola: {
    termino: "Cola media",
    definicion:
      "Tiempo medio que las llamadas ENTRANTES ATENDIDAS esperaron en cola hasta que las cogió un agente. Las que no tuvieron que esperar cuentan 0 s. Las abandonadas no entran aquí (ver «Espera de abandonadas»), y las salientes tampoco: su tiempo de enrutado es del marcador, no espera de un cliente.",
  },
  esperaAbandonadas: {
    termino: "Espera de abandonadas",
    definicion:
      "Tiempo medio que esperaron las llamadas ENTRANTES que el cliente colgó antes de ser atendido. Se muestra aparte de la cola media: mezclarlas subía la cola (17,93 s en vez de 12,06 s un día real).",
  },
  sla: {
    termino: "SLA (nivel de servicio)",
    definicion:
      "Service Level Agreement: porcentaje de llamadas ENTRANTES atendidas dentro del tiempo de cola objetivo (p. ej. ≤ 20 s). El objetivo habitual es 80/20. Se calcula solo sobre entrantes atendidas: incluir las salientes (que nunca hacen cola) infla el porcentaje hasta dejarlo casi siempre en 100 %.",
  },
  horasLogadas: {
    termino: "Horas logadas (reales)",
    definicion:
      "Horas reales que los agentes estuvieron conectados (logados) al sistema, contando cada tramo de tiempo UNA vez aunque el agente tenga varias campañas abiertas a la vez. Es una cifra global: no se reparte por campaña porque sumarla campaña a campaña multiplica el tiempo por más de 13. Las sesiones aún abiertas cuentan hasta este momento.",
  },
  horasReady: {
    termino: "Horas ready",
    definicion: "Horas en que el agente estuvo disponible (ready) esperando recibir interacciones.",
  },
  horasProductivas: {
    termino: "Horas productivas",
    definicion:
      "Tiempo real dedicado a gestionar interacciones: la suma exacta de la duración de las atendidas. Es la única medida de horas atribuible a una campaña, porque cada interacción pertenece a una sola. Es la unidad «Horas productivas» de facturación (p. ej. las campañas de bbdd).",
  },
  horasLogadasCliente: {
    termino: "Horas logadas por cliente (facturación)",
    definicion:
      "Tiempo que los usuarios del cliente estuvieron logados en Altitude, de login a logout, haya o no campaña abierta. Solo cuentan los usuarios con el prefijo del cliente seguido del número de agente (GH_0851 para GrupoHuertas): no cuentan los que no llevan el prefijo ni los de bbdd (GH_0851_BD), que se facturan por sus campañas. Si un usuario tiene dos sesiones a la vez, el tiempo cuenta una sola vez.",
  },
  repartoHorasLogadas: {
    termino: "Reparto de horas logadas por campaña (estimado)",
    definicion:
      "Cómo se reparten las horas logadas de un cliente entre sus campañas. Altitude no registra en qué campaña está un usuario mientras espera (los tiene casi siempre todas abiertas), así que cada día las horas logadas de cada usuario se reparten en proporción a su tiempo productivo (gestión de las atendidas) en cada campaña. Los días logados sin ninguna llamada atendida van aparte. Suma exactamente las horas del cliente; lo que se factura es el total.",
  },
  pausas: {
    termino: "Pausas (Not Ready)",
    definicion:
      "Tiempo en que el agente estuvo conectado pero no disponible para recibir interacciones (descanso, formación, administrativo, comida…).",
  },
  exitos: {
    termino: "Éxitos / ventas",
    definicion:
      "Contactos que el agente cerró en el guion con resultado de éxito (venta, cita u objetivo conseguido). Se cuentan por contacto, no por llamada: si un contacto llevó dos llamadas, es un solo éxito.",
  },
  contactosGestionados: {
    termino: "Contactos (gestionados)",
    definicion:
      "Contactos que un agente ha trabajado con el guion (cada sesión de script es un contacto, se califique como se califique). Un contacto puede llevar varias llamadas atendidas: en Bolsas, por ejemplo, el agente suele llamar a un teléfono y después a otro del mismo contacto, así que hay casi el doble de atendidas que de contactos.",
  },
  conversion: {
    termino: "Conversión (contactos / atendidas)",
    definicion:
      "Qué parte acaba en éxito. «Conv. contactos» = éxitos ÷ contactos gestionados: es la que sirve para comparar todas las campañas. «Conv. atendidas» = éxitos ÷ llamadas atendidas: en campañas con una llamada por contacto, como las de GrupoHuertas, sale prácticamente igual.",
  },
  efectividadCierre: {
    termino: "Efectividad de cierre",
    definicion:
      "De los contactos que se han cerrado con un resultado (éxito o sin éxito), qué parte es éxito. Solo se calcula en las campañas que usan la calificación «sin éxito» (en los últimos 90 días): Bolsas y algunas de Socios no la usan y saldrían siempre al 100 %, así que ahí aparece «—».",
  },
  exitosHora: {
    termino: "Éxitos por hora (logada / productiva)",
    definicion:
      "Éxitos ÷ horas. «Logada»: todo el tiempo conectado del usuario del agente (de login a logout), por eso solo existe por agente y no por campaña. «Productiva»: el tiempo de gestión de sus llamadas atendidas; las llamadas de 2 horas o más no cuentan como tiempo, porque son errores de registro.",
  },
  tiempoPorExito: {
    termino: "Tiempo por éxito",
    definicion:
      "Tiempo de gestión de las llamadas atendidas dividido entre los éxitos: cuántos segundos de trabajo cuesta, de media, cada éxito.",
  },
  indiceExito: {
    termino: "Índice (frente a la campaña)",
    definicion:
      "Compara a cada agente con la media de las campañas en las que ha trabajado. Se calculan los éxitos que habría conseguido un agente medio con sus mismos contactos y se dividen sus éxitos reales entre esos: 100 = como la media, 120 = un 20 % mejor, 80 = un 20 % peor. Así no sale mejor quien trabaja en una campaña fácil. En verde a partir de 110 y en rojo desde 90 para abajo. Con menos de 30 contactos la muestra es pequeña y la cifra sale en gris.",
  },
  leads: {
    termino: "Leads finalizados",
    definicion:
      "Contactos de campañas de salida (outbound) cuya gestión se dio por cerrada (estado Done), fechados por su último intento.",
  },
  productivo: {
    termino: "Tiempo productivo",
    definicion: "Tiempo total que el agente dedicó a las interacciones que atendió en el día.",
  },
  estado: {
    termino: "Estado del agente",
    definicion:
      "Situación actual: Ready (disponible), NotReady (en pausa, con motivo), Logado (conectado sin estado activo) o Deslogado (desconectado).",
  },
  penetracion: {
    termino: "Penetración de listas",
    definicion:
      "De una lista de contactos outbound, qué parte se ha trabajado: finalizados, con/sin éxito y sin contactar todavía.",
  },
  inboundOutbound: {
    termino: "Inbound / Outbound",
    definicion:
      "Inbound = llamadas entrantes que recibe el contact center. Outbound = llamadas salientes que el contact center realiza.",
  },
  servicio: {
    termino: "Cliente / Servicio",
    definicion:
      "Cada cliente se corresponde con un servicio de la centralita, que agrupa todas sus campañas. El selector de arriba filtra el panel por cliente.",
  },
  importe: {
    termino: "Importe estimado",
    definicion:
      "Cálculo orientativo del importe según la tarifa configurada (por servicio o por campaña) en Administración → Facturación.",
  },
  ivr: {
    termino: "IVR (campaña automática)",
    definicion:
      "Campaña de respuesta de voz interactiva: locución/menú que atiende y enruta la llamada antes de pasarla (o no) a un agente. Por defecto NO se cuenta en los KPIs; marca «Incluir IVR» para añadirla.",
  },
  ivrAtendidas: {
    termino: "IVR · Atendidas por agente",
    definicion:
      "De las llamadas que entran por un IVR, porcentaje que acaba siendo atendido por un agente humano.",
  },
  ivrNoAtendidas: {
    termino: "IVR · Entrantes no atendidas",
    definicion:
      "De las llamadas que entran por un IVR, el resto que NO fue atendido por un agente (el complemento de las atendidas).",
  },
  ivrNoAtendidasHorario: {
    termino: "IVR · No atendidas en horario",
    definicion:
      "Entrantes no atendidas que entraron mientras HABÍA agentes logados en las campañas del servicio (horario de producción, calculado dinámicamente). Son las accionables; las de fuera de horario es normal que no se atiendan.",
  },
};
