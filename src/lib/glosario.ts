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
    termino: "Reparto de horas logadas por campaña",
    definicion:
      "Cómo se reparten las horas logadas de un cliente entre sus campañas, con el método del Excel de facturación de operaciones. Altitude no registra en qué campaña está un usuario mientras espera (los tiene casi siempre todas abiertas), así que las horas logadas del período se reparten en proporción al tiempo de agente en cada campaña: marcar, hablar, retener y cerrar la llamada, sin la cola, en entrantes y salientes aunque no contesten. No cuentan las salientes sin número marcado ni las campañas que se facturan a su manera (bbdd). Suma exactamente las horas del cliente y es lo que va al albarán de cada campaña.",
  },
  minutosLinea: {
    termino: "Minutos de línea (fijo, móvil y especiales)",
    definicion:
      "Minutos de conversación con el cliente que cuestan línea: llamadas salientes atendidas por un agente y la encuesta que suena después de la gestión (el cliente sigue al teléfono). Se separan por el número marcado: móviles (6xx, 71x-74x), fijos (8xx, 9xx) y especiales (901, 902, 80x, 70x: artículo «TARIFICACION 901,2,X», solo para los clientes que lo tengan en su tarifa). Los gratuitos (800, 900) y las llamadas entrantes no se cobran.",
  },
  ddis: {
    termino: "DDIs (cuota mensual)",
    definicion:
      "Números de teléfono de TmSystem asignados a cada campaña. Se cobra el mes entero por cada DDI activo algún día del mes (puesto en producción antes de que acabe y sin baja o con la baja después de que empiece), sin prorratear. Hay dos artículos: geográficos y móviles (6xx, 71x-74x), cada uno con su precio. El inventario está en Operaciones → DDIs.",
  },
  facturaCampania: {
    termino: "Factura por campaña",
    definicion:
      "Todo lo que se cobra a cada campaña en el período, con el código de la campaña en GS: su parte de las horas logadas del cliente, los minutos de línea, los contactos finalizados, la cuota de DDIs y lo que tenga configurado. Es lo que se guarda al cerrar el mes.",
  },
  articulosGs: {
    termino: "Artículos de GS y tarifas",
    definicion:
      "Lo que se puede facturar, con el nombre del artículo en GS: base de datos, encuestas realizadas, hora de agente, preparación de campaña, minutos a fijos, a móviles y a especiales, alquiler de DDIs geográficos y móviles, leads a gestionar, contactos finalizados en éxito y número de contactos finalizados. Cada cliente factura los que tiene en su tarifa, con su precio (Operaciones → Artículos y tarifas). Los que tiene en la tarifa van también en el fichero de albaranes de GS.",
  },
  cargosPuntuales: {
    termino: "Cargos puntuales",
    definicion:
      "Los artículos que no se miden (BASE DE DATOS y PREPARACIÓN DE CAMPAÑA, «U» en GS): Operaciones los apunta a mano en el mes y la campaña que toca, con su cantidad y, si no es el de la tarifa, su precio. Entran en la factura de esa campaña. Con el mes cerrado no se pueden añadir ni quitar.",
  },
  cierreMes: {
    termino: "Mes cerrado",
    definicion:
      "Foto fija de la factura de un mes completo de un cliente, con las cantidades y los precios de ese momento. Si después cambian los datos o las tarifas, el mes cerrado no cambia (la pantalla avisa de la diferencia). Lo cierra Operaciones, que puede ajustarlo a mano con motivo (quitar algo o cambiar un precio) para las decisiones puntuales de dirección; reabrirlo, solo el administrador.",
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
    termino: "Conversación y gestión por éxito",
    definicion:
      "Solo con los contactos que acabaron en éxito. «Conversación»: lo que se habló, de media, en las llamadas atendidas de cada éxito (si un éxito necesitó dos llamadas, cuentan las dos). «Gestión»: el tiempo medio que el agente tuvo abierto el script de cada éxito, que incluye también lo que tarda en rellenarlo. Las llamadas de 2 horas o más no cuentan, porque son errores de registro.",
  },
  indiceExito: {
    termino: "Índice (frente a la campaña)",
    definicion:
      "Compara a cada agente con la media de las campañas en las que ha trabajado. Se calculan los éxitos que habría conseguido un agente medio con sus mismos contactos y se dividen sus éxitos reales entre esos: 100 = como la media, 120 = un 20 % mejor, 80 = un 20 % peor. Así no sale mejor quien trabaja en una campaña fácil. En verde a partir de 110 y en rojo desde 90 para abajo. Con menos de 30 contactos la muestra es pequeña y la cifra sale en gris.",
  },
  finalizadosTipificados: {
    termino: "Finalizados (resultados)",
    definicion:
      "Contactos que se cerraron en el período y que cerró un agente poniéndoles un resultado en el script. Cada contacto cuenta una vez, el día en que se cerró y para el agente de su última llamada. No cuentan los cerrados sin que nadie hablara con ellos ni los cierres administrativos.",
  },
  ratioBruto: {
    termino: "Ratio bruto",
    definicion: "Éxitos ÷ finalizados. De cada 100 contactos que se cierran, cuántos acaban en éxito.",
  },
  ratioNeto: {
    termino: "Ratio neto",
    definicion:
      "Éxitos ÷ (finalizados − no válidos). Lo mismo que el bruto, pero sin contar los contactos que no servían (teléfono erróneo, duplicado, ya tenía cita…): mide el trabajo del agente con los contactos aprovechables. Solo existe en los servicios que tienen configurado qué resultados son «no válidos».",
  },
  noValidos: {
    termino: "No válidos",
    definicion:
      "Finalizados con un resultado que su servicio considera «no válido» (en GrupoHuertas, el resultado «No valido»: erróneo, duplicado, taller, ya tiene cita…). Qué resultados lo son se elige por servicio en Administración → Resultados. El % de no válidos mide sobre todo la calidad de la base de datos.",
  },
  sinTocar: {
    termino: "Sin tocar",
    definicion:
      "Contactos que se cerraron sin que ningún agente llegara a hablar con ellos (se agotaron los intentos, se cancelaron, entraron por IVR…). Se enseñan aparte y no cuentan en los ratios.",
  },
  cierresAdministrativos: {
    termino: "Cierres administrativos",
    definicion:
      "Contactos con resultado de agente cuya última llamada es de hace más de 90 días: alguien cerró la lista en bloque. Se enseñan aparte para que no inflen los ratios del día del cierre (el 08/09/2026 se cerraron así 278 contactos de GrupoHuertas tipificados en marzo de 2025).",
  },
  desgloseResultados: {
    termino: "Desglose de resultados",
    definicion:
      "Cómo se reparten los finalizados entre los resultados del script (resultado → subresultado), con su número y su % sobre el total. Se puede ver el servicio entero o una campaña.",
  },
  agenteFrenteCampania: {
    termino: "Agente frente a campaña",
    definicion:
      "Compara a cada agente con el resto de agentes de la misma campaña: % de no válidos, ratio bruto y el resultado en el que más se separa. Se marca con una bandera si la diferencia llega a 10 puntos: puede ser que tipifique distinto que los demás. Solo con 30 finalizados o más.",
  },
  semaforoResultados: {
    termino: "Semáforo de objetivos",
    definicion:
      "Compara el ratio bruto, el neto y el % de no válidos con el objetivo de la campaña o de su servicio (Administración → Resultados). Verde: cumple; ámbar: se queda a menos de un 10 % del objetivo; rojo: no llega. Sin objetivo, o con menos de 30 finalizados, no hay color.",
  },
  finalizados: {
    termino: "Finalizados",
    definicion:
      "Contactos que se dieron por cerrados en el período, fechados por su último intento: los mismos «contactos finalizados» de facturación. Incluye los que se cerraron sin hablar con nadie y los cierres en bloque, así que puede ser algo mayor que los finalizados de Supervisión → Resultados (GrupoHuertas, septiembre de 2026: 8.696 frente a 8.417, por 278 cierres administrativos).",
  },
  visionPorCliente: {
    termino: "Visión por cliente",
    definicion:
      "Sin cliente elegido, una fila por cliente con sus cifras del período. Las horas logadas de cada cliente son las de sus campañas, contando cada rato una vez; un agente abierto a la vez en campañas de dos clientes cuenta en los dos, por eso la suma de los clientes puede pasar del total global.",
  },
  gruposCampania: {
    termino: "Grupos de campañas",
    definicion:
      "Si el cliente tiene tipos de campaña (Administración → Resultados; en Bolsas, «Cartera» = Bol_ seguido de 3 o 4 cifras; en GrupoHuertas, «BBDD»), las tablas por campaña de Dirección y de Supervisión salen agrupadas por tipo, con el resto al final y una fila de total en cada grupo. En Supervisión, el SLA, la cola y el abandono del total se calculan con las llamadas de todo el grupo, no haciendo la media de los porcentajes.",
  },
  comparadorCampanias: {
    termino: "Comparar dos campañas",
    definicion:
      "Elige dos campañas del período y se ven todas sus cifras una al lado de la otra, con la diferencia (B − A). En verde la que sale mejor en las métricas donde hay mejor y peor (conversión, abandono, AHT…); en las de volumen no se marca.",
  },
  filtroCampoContacto: {
    termino: "Filtro por campo del contacto",
    definicion:
      "Deja ver los resultados solo de los contactos con un valor en un dato de su ficha (en GrupoHuertas, el origen del lead). Al escribir salen los valores que contienen ese texto, con cuántos finalizados tienen en el período. Se puede elegir un valor concreto o todos los que contienen el texto. Qué dato se filtra en cada cliente se elige en Administración → Resultados.",
  },
  csvContactos: {
    termino: "CSV de contactos",
    definicion:
      "Descarga una fila por cada contacto finalizado que se está viendo (con los filtros de fechas, tipo de campaña y dato del contacto): campaña, ID único del perfil, nombre, resultado, subresultado, fecha y hora de cierre, campaña digital, id de llamada y los dos primeros teléfonos. De momento solo en GrupoHuertas. Se abre con Excel (separado por punto y coma).",
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
      "Cálculo orientativo del importe según la tarifa configurada (por cliente o por campaña) en Operaciones → Artículos y tarifas.",
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
