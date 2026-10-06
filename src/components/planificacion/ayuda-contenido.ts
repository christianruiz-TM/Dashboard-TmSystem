// ============================================================
// Textos de la ayuda de planificación para supervisión, en lenguaje
// sencillo. Es la ÚNICA fuente: de aquí salen la ventana «Ayuda» de cada
// pantalla (ayuda.tsx), los «?» junto a cada parte (punto-ayuda.tsx) y la
// «Guía de planificación de turnos para supervisión» compartida. Si cambia
// cómo funciona una pantalla, se cambia aquí (y se regeneran las capturas
// con `node scripts/ayuda-capturas.mjs`).
//
// Solo texto (sin JSX), para que lo puedan leer también los scripts y los
// tests. Los nombres de botones van entre «».
// ============================================================

/** Pantallas que abren la ayuda en su tema. */
export type PantallaAyuda =
  | "inicio"
  | "tablero"
  | "ausencias"
  | "bolsas"
  | "versiones"
  | "configuracion"
  | "hoy"
  | "adherencia"
  | "saldos"
  | "cierre";

export interface CasoAyuda {
  caso: string;
  haz: string;
}

export interface TemaAyuda {
  id: string;
  /** Nombre corto en la lista de temas. */
  etiqueta: string;
  titulo: string;
  /** Una frase: para qué sirve. */
  intro: string;
  /** Nombre de la captura en ayuda-capturas.json (sus números son los de `queVeo`). */
  captura?: string;
  queVeo: string[];
  queHacer: string[];
  siPasa: CasoAyuda[];
  /** Bloque extra que dibuja la ventana (tabla de teclas). */
  extra?: "teclas";
}

export interface TareaAyuda {
  id: string;
  pregunta: string;
  pasos: string[];
  /** Tema donde está explicada la pantalla. */
  tema: string;
  /** Más palabras con las que se debe encontrar al buscar. */
  palabras?: string;
}

export const TEMAS_AYUDA: TemaAyuda[] = [
  {
    id: "inicio",
    etiqueta: "Pantalla de inicio",
    titulo: "Inicio de Planificación",
    intro: "Es la primera pantalla. Te dice si los datos están al día y qué meses tienen plan.",
    captura: "inicio",
    queVeo: [
      "El botón «Hoy»: lo que está pasando ahora mismo (quién está conectada y las alertas).",
      "«Estado de los datos»: si todo sale en verde, se puede preparar el plan. Si algo sale en amarillo, léelo: dice qué hacer.",
      "La lista de meses. Cada mes tiene su borrador (el plan que se está preparando) y su versión publicada (el plan que vale).",
      "Los botones de cada mes: «Ver tablero», «Versiones», «Seguimiento» y «Generar borrador».",
    ],
    queHacer: [
      "Mira que «Estado de los datos» esté en verde.",
      "Para preparar un mes nuevo, pulsa «Generar borrador» en su fila. Tarda unos segundos.",
      "Para ver o cambiar un mes, pulsa «Ver tablero».",
    ],
    siPasa: [
      {
        caso: "Sale «Faltan los datos de los últimos días».",
        haz: "Avisa a TI antes de generar el plan: saldría con datos viejos.",
      },
      {
        caso: "Una persona sale como «inactiva».",
        haz: "Lleva 30 días sin conectarse y no se planifica. Si vuelve, ve a Configuración → Agentes y marca «Forzar activo».",
      },
      {
        caso: "Sale un usuario «sin cliente».",
        haz: "Es un usuario de Altitude que no está asignado a ningún cliente. Asígnaselo en Configuración → Clientes (abajo, «Prefijos») o avisa a TI.",
      },
      {
        caso: "Una persona sale «sin turno».",
        haz: "No tiene horario. Pónselo en Configuración → Patrones.",
      },
      {
        caso: "Alguien sale «fuera de plantilla» con horas.",
        haz: "Trabaja en nuestros clientes pero no está en el equipo. Si le toca, inclúyela en Configuración → Agentes.",
      },
      {
        caso: "Al generar, te pregunta qué hacer con el borrador que ya hay.",
        haz: "«Respetar mis cambios» guarda lo que cambiaste a mano y recalcula lo demás. «Empezar de cero» lo calcula todo de nuevo.",
      },
    ],
  },
  {
    id: "tablero",
    etiqueta: "El tablero",
    titulo: "El tablero del mes",
    intro: "Es el plan del mes: quién trabaja, en qué cliente y a qué horas.",
    captura: "tablero",
    queVeo: [
      "Arriba: el mes, si es borrador o publicada, y las horas planificadas.",
      "Las vistas: «Agente» (una fila por persona), «Cliente» (cuánta gente hay en cada cliente a cada hora) y «Día» (un día en grande).",
      "Las barras: las horas de cada cliente en el mes frente a las que tiene que cubrir.",
      "El mapa de GH: en rojo, las horas en que falta gente para las llamadas; en verde, las que van bien.",
      "Cada fila es una persona. Cada recuadro de color son unas horas en un cliente.",
    ],
    queHacer: [
      "Elige la semana con las flechas.",
      "Pasa el ratón por un recuadro para ver por qué está ahí.",
      "Mira las barras y el mapa: lo rojo es lo que hay que revisar.",
      "Al final de la página están las incidencias y avisos. «Ver» te lleva al sitio.",
    ],
    siPasa: [
      {
        caso: "Una hora sale en rojo en el mapa de GH.",
        haz: "Falta gente en GH a esa hora. Pasa a GH a alguien que esté en otro cliente.",
      },
      {
        caso: "Hay un icono rojo o amarillo junto a un nombre.",
        haz: "Esa persona tiene un problema esa semana. Míralo en «Incidencias y avisos», al final.",
      },
      {
        caso: "Un recuadro está rayado.",
        haz: "Es una ausencia (vacaciones, libranza, médico…).",
      },
      {
        caso: "Un recuadro tiene una chincheta.",
        haz: "Está fijado: no cambia aunque se vuelva a generar el plan.",
      },
      {
        caso: "Junto a un nombre pone «saldo −2,00 h».",
        haz: "Esa semana le faltan 2 horas para su contrato. En azul, le sobran.",
      },
      {
        caso: "No me deja cambiar nada.",
        haz: "Solo se cambia el borrador, y con usuario de supervisión. Si el mes ya está publicado, pulsa «Nuevo borrador desde la vN».",
      },
    ],
  },
  {
    id: "editar",
    etiqueta: "Cambiar el plan",
    titulo: "Cambiar el plan",
    intro: "En un borrador puedes mover, alargar, cambiar de cliente o quitar horas. Nada cuenta hasta que pulsas «Guardar cambios».",
    queVeo: [
      "Arrastrar un recuadro: lo llevas a otra hora, a otro día o a otra persona.",
      "Estirar desde un borde: alarga o acorta las horas.",
      "Pulsar un recuadro: sale un menú para cambiar de cliente, devolver a GH, dividir, unir, mover, fijar o eliminar.",
      "Doble clic en un hueco: crea un recuadro nuevo.",
      "La barra de abajo: cuántos cambios llevas, «Deshacer», «Descartar» y «Guardar cambios».",
    ],
    queHacer: [
      "Haz los cambios.",
      "Si te equivocas, pulsa «Deshacer» (o las teclas Ctrl y Z).",
      "Cuando acabes, pulsa «Guardar cambios».",
    ],
    siPasa: [
      {
        caso: "Al soltar sale un aviso en rojo y no se mueve.",
        haz: "No se puede: por ejemplo, esa persona no tiene usuario de ese cliente o tiene una ausencia. Lee el aviso debajo del recuadro.",
      },
      {
        caso: "Lo que había debajo ha desaparecido.",
        haz: "Es normal: al soltar encima, lo de debajo se recorta. Nunca quedan dos cosas a la vez.",
      },
      {
        caso: "Muevo un recuadro de UGR y su hueco se pone en GH.",
        haz: "Es normal: las horas que se quedan libres dentro del turno vuelven a GH.",
      },
      {
        caso: "Sale que otra persona ha guardado este borrador.",
        haz: "Otra supervisora guardó antes. Recarga la página (lo que no guardaste se pierde) y repite tus cambios.",
      },
      {
        caso: "Quiero dejarlo como estaba.",
        haz: "«Descartar» vuelve a lo último que se guardó.",
      },
    ],
    extra: "teclas",
  },
  {
    id: "incidencias",
    etiqueta: "Avisos rojos y amarillos",
    titulo: "Avisos rojos y amarillos",
    intro: "El programa revisa el plan y avisa de los problemas. Los rojos impiden publicar; los amarillos se pueden aceptar explicando por qué.",
    queVeo: [
      "Rojo (incidencia dura): un error que hay que arreglar antes de publicar.",
      "Amarillo (aviso blando): algo raro que puede estar bien. Si lo está, se publica explicando el motivo.",
      "Cada aviso dice quién, qué día y a qué hora. «Ver» te lleva al sitio en el tablero.",
    ],
    queHacer: [
      "Empieza por los rojos: pulsa «Ver» y arréglalo en el tablero.",
      "Revisa los amarillos y arregla los que no estén bien.",
      "Los que sí estén bien se quedan. Al publicar escribirás por qué.",
    ],
    siPasa: [
      {
        caso: "Rojo: «no tiene usuario de ese cliente».",
        haz: "Esa persona no podría conectarse a ese cliente. Ponle otro cliente o pide a TI que le creen el usuario.",
      },
      {
        caso: "Rojo: horas encima de una ausencia.",
        haz: "Tiene horas un día que no viene. Pulsa «Quitar lo que pisa ausencias».",
      },
      {
        caso: "Rojo: GH fuera de su horario.",
        haz: "A esa hora no entran llamadas de GH. Pasa esas horas a otro cliente.",
      },
      {
        caso: "Rojo: dos cosas a la vez.",
        haz: "La misma persona está en dos sitios a la misma hora. Quita uno.",
      },
      {
        caso: "Amarillo: GH por debajo del mínimo.",
        haz: "Falta gente en GH a esa hora. Si no hay nadie más, se acepta al publicar.",
      },
      {
        caso: "Amarillo: fuera de turno.",
        haz: "Trabaja fuera de su horario. Comprueba que lo sabe.",
      },
      {
        caso: "Amarillo: trabaja en festivo.",
        haz: "Dale después una libranza FEST.",
      },
      {
        caso: "Amarillo: semana por encima del contrato.",
        haz: "Hace más horas de las de su contrato esa semana.",
      },
      {
        caso: "Amarillo: muchas horas seguidas.",
        haz: "Demasiadas horas seguidas en el mismo cliente. Repártelas si puedes.",
      },
    ],
  },
  {
    id: "publicar",
    etiqueta: "Publicar y versiones",
    titulo: "Publicar y versiones",
    intro: "Publicar es dar el plan por bueno: es el que vale para todo el equipo. «Versiones» guarda cada plan y qué cambió.",
    captura: "versiones",
    queVeo: [
      "Las versiones del mes: borrador (en preparación), publicada (la que vale), sustituida (una publicada anterior) y descartada (un borrador que se rehízo).",
      "Quién la hizo y cuándo. Si se publicó con avisos, el motivo.",
      "«Cambios»: qué cambió entre dos versiones, persona a persona.",
      "«Historial»: quién generó, guardó o publicó, y quién cambió ausencias, bolsas o saldos.",
    ],
    queHacer: [
      "En el tablero, guarda los cambios.",
      "Pulsa «Publicar…».",
      "Si hay avisos amarillos, escribe por qué se aceptan y marca «Publicar con N avisos».",
      "Pulsa «Publicar».",
    ],
    siPasa: [
      {
        caso: "El botón «Publicar» no se activa.",
        haz: "Falta algo: guardar los cambios, arreglar los rojos o, si hay amarillos, escribir el motivo (10 letras o más) y marcar la casilla.",
      },
      {
        caso: "Tengo que cambiar un mes ya publicado.",
        haz: "Pulsa «Nuevo borrador desde la vN»: copia el publicado. Lo cambias y lo vuelves a publicar.",
      },
      {
        caso: "Quiero saber qué se cambió.",
        haz: "En «Versiones», el apartado «Cambios» compara dos versiones.",
      },
    ],
  },
  {
    id: "ausencias",
    etiqueta: "Ausencias",
    titulo: "Ausencias",
    intro: "Aquí se apuntan las vacaciones, libranzas, RTO y otras faltas. Cuentan al momento en el plan y en el saldo.",
    captura: "ausencias",
    queVeo: [
      "El formulario «Nueva ausencia» (solo supervisión).",
      "La lista de ausencias del mes y quién las apuntó.",
      "«Borrar», para quitar una que esté mal.",
    ],
    queHacer: [
      "Elige la persona y el tipo (VAC, FEST, RTO o AUS).",
      "Pon desde qué día hasta qué día (cuentan los dos).",
      "Si no es el día entero, marca «Solo unas horas» y pon de qué hora a qué hora.",
      "Deja marcada la casilla «Quitar del borrador…» para que se borren las horas que tenía esos días.",
      "Pulsa «Dar de alta».",
    ],
    siPasa: [
      {
        caso: "No sé qué tipo poner.",
        haz: "VAC: vacaciones. FEST: libranza por un festivo trabajado. RTO: retribución de tiempo por objetivos. AUS: otras (médico, asuntos propios…). VAC, FEST y RTO cuentan como horas trabajadas en el saldo; AUS no.",
      },
      {
        caso: "Sale «Se solapa con…».",
        haz: "Esa persona ya tiene una ausencia esos días. Bórrala o cambia las fechas.",
      },
      {
        caso: "Borré una ausencia y no vuelven sus horas.",
        haz: "Es normal: añádelas en el tablero o vuelve a generar el borrador con «Respetar mis cambios».",
      },
      {
        caso: "El mes ya está publicado.",
        haz: "La ausencia no cambia el plan publicado: sale un aviso rojo hasta que hagas un borrador nuevo.",
      },
    ],
  },
  {
    id: "bolsas",
    etiqueta: "Bolsas y objetivos",
    titulo: "Bolsas, objetivos y fin de campaña",
    intro: "Aquí se dice cuántas horas tiene cada cliente al mes y cuántas hay que hacer cada semana en las campañas de llamadas.",
    captura: "bolsas",
    queVeo: [
      "«Bolsas de horas»: las horas del mes de cada cliente. La de GH es para GH, BD y LX juntas.",
      "«Confirmar»: guarda la bolsa del mes.",
      "Los objetivos de cada semana de cada campaña (UGR, BD, Caja Rural…).",
      "«Fin estimado»: cuándo se calcula que acabará la campaña.",
    ],
    queHacer: [
      "Al empezar a preparar el mes, confirma la bolsa de GH.",
      "Revisa los objetivos de cada semana. Si quieres otro, escríbelo y guarda.",
      "Vuelve a generar el borrador para que los cambios entren en el plan.",
    ],
    siPasa: [
      {
        caso: "No sé cuál es la bolsa de este mes.",
        haz: "Mientras no la confirmes, se usa la del último mes confirmado, ajustada a los días laborables.",
      },
      {
        caso: "Un objetivo me parece mal.",
        haz: "Escribe el que quieras (queda «Fijado a mano»). Déjalo vacío para volver al calculado.",
      },
      {
        caso: "El fin estimado sale distinto en cada línea.",
        haz: "Son cálculos con datos distintos. Fíjate sobre todo en el del ritmo de los últimos días.",
      },
    ],
  },
  {
    id: "hoy",
    etiqueta: "Hoy y alertas",
    titulo: "Hoy y alertas",
    intro: "Lo que está pasando ahora mismo: quién está conectada, con qué usuario y si algo va mal. Se actualiza sola cada minuto.",
    captura: "hoy",
    queVeo: [
      "Las alertas: lo que hay que mirar ya (las rojas primero).",
      "Cobertura de GH: cuánta gente hay en GH a cada hora frente a la que hace falta.",
      "Cada persona: arriba, lo que tenía que hacer; abajo, lo que está haciendo, del color del cliente con el que se conectó.",
      "La línea roja: la hora actual.",
    ],
    queHacer: [
      "Ten esta pantalla abierta, o la de Supervisión, que enseña las mismas alertas.",
      "Si sale una alerta, haz lo que dice.",
      "Si hay que cambiar el plan de hoy, hazlo en el tablero.",
    ],
    siPasa: [
      {
        caso: "Alerta: Ávolo con entrantes sin atender.",
        haz: "Hay llamadas de Ávolo sin coger y nadie con usuario Av_. Que alguien con ese usuario se conecte.",
      },
      {
        caso: "Alerta: GH por debajo del mínimo.",
        haz: "Falta gente en GH. Pasa a GH a alguien de otra campaña o llama a quien falte.",
      },
      {
        caso: "Alerta: planificada y sin conectar.",
        haz: "Lleva más de 15 minutos sin conectarse. Comprueba si está o si falta apuntar una ausencia.",
      },
      {
        caso: "Alerta: campaña retrasada.",
        haz: "Esa campaña lleva menos del 80 % de las horas de la semana. Mira quién está en ella.",
      },
      {
        caso: "La barra de abajo sale gris.",
        haz: "Está conectada con un usuario que no es de nuestros clientes.",
      },
    ],
  },
  {
    id: "adherencia",
    etiqueta: "Adherencia",
    titulo: "Adherencia: ¿se cumplió el plan?",
    intro: "Compara el plan con lo que pasó: si cada persona estuvo conectada cuando le tocaba y en el cliente que le tocaba.",
    captura: "adherencia",
    queVeo: [
      "Las cifras del mes: horas planificadas y los dos porcentajes.",
      "«Por turno»: de cada 100 horas planificadas, cuántas estuvo conectada.",
      "«Por cliente»: además, en el cliente que le tocaba.",
      "La tabla por persona. Más abajo, por cliente, por semana y las desviaciones más grandes.",
    ],
    queHacer: [
      "Mira los porcentajes del mes.",
      "En la tabla por persona, busca quién tiene muchas horas «Sin conectar» u «Otro cliente».",
      "Abajo, «Desviaciones» dice qué día y en qué cliente.",
    ],
    siPasa: [
      {
        caso: "Alguien tiene muchas horas en «Otro cliente».",
        haz: "Estuvo conectada, pero en otro cliente. Si fue a propósito, el cambio no se pasó al plan: conviene hacerlo la próxima vez.",
      },
      {
        caso: "Alguien tiene muchas horas «Sin conectar».",
        haz: "No estaba conectada cuando le tocaba. Puede que falte apuntar una ausencia.",
      },
      {
        caso: "Hay horas «Fuera del plan».",
        haz: "Horas conectada sin estar planificada: horas extra o cambios que no se pasaron al plan.",
      },
      {
        caso: "Atendió Ávolo durante su turno de GH.",
        haz: "No es un fallo: sale como «A demanda».",
      },
    ],
  },
  {
    id: "saldos",
    etiqueta: "Saldos",
    titulo: "Saldos: horas que sobran o faltan",
    intro: "Cuántas horas le sobran (+) o le faltan (−) a cada persona según su contrato.",
    captura: "saldos",
    queVeo: [
      "La tabla: el saldo de cada semana. En cursiva, lo que aún no ha pasado (sale del plan).",
      "«Arrastre»: lo que traía de los meses anteriores.",
      "«Previsto a fin de mes»: cómo acabará el mes si se cumple el plan.",
      "«Detalle por día»: de dónde sale cada número.",
      "«Ajustes manuales»: para apuntar horas que no salen en el sistema.",
    ],
    queHacer: [
      "Mira la última columna: en rojo, a quién le faltan horas; en verde, a quién le sobran.",
      "Para compensar, dale o quítale horas en el plan de los próximos días.",
      "Si hay horas que el sistema no ve (por ejemplo, una formación fuera de Altitude), apúntalas en «Ajustes manuales».",
    ],
    siPasa: [
      {
        caso: "¿Cómo se calcula?",
        haz: "Cada día: horas trabajadas + horas de ausencias que cuentan (vacaciones, libranzas, RTO) − horas de contrato de ese día.",
      },
      {
        caso: "Una persona no sale en la lista.",
        haz: "No tiene contrato apuntado o no está activa. El contrato se pone en Configuración → Agentes.",
      },
      {
        caso: "Apunté mal un ajuste.",
        haz: "Bórralo con «Borrar» y apúntalo otra vez. Todo queda en el historial.",
      },
    ],
  },
  {
    id: "cierre",
    etiqueta: "Cierre de mes",
    titulo: "Cierre de mes",
    intro: "El resumen del mes por cliente: las horas que tenía, las que se planificaron y las que se hicieron.",
    captura: "cierre",
    queVeo: [
      "La tabla por cliente: bolsa, planificado y real.",
      "«Real»: horas conectadas con los usuarios de ese cliente. Es lo mismo que se factura.",
      "La fila «Grupo GH + BD + LX»: comparten la bolsa de GH; mira ahí si sobran o faltan horas.",
      "«XLSX»: descarga el cierre en Excel.",
      "«Por usuario»: las horas de cada usuario, para cuadrar con el Excel de operaciones.",
    ],
    queHacer: [
      "Al acabar el mes, abre el cierre.",
      "Mira las diferencias: en rojo faltan horas; en verde sobran.",
      "Descarga el Excel si lo necesitas.",
    ],
    siPasa: [
      {
        caso: "Ávolo sale con muy pocas horas reales.",
        haz: "Es normal: solo cuenta el rato conectada con Av_. La espera en GH cuenta para GH.",
      },
      {
        caso: "El mes aún no ha acabado.",
        haz: "Lo real llega hasta ayer; lo planificado es el mes entero.",
      },
    ],
  },
  {
    id: "configuracion",
    etiqueta: "Configuración",
    titulo: "Configuración",
    intro: "Aquí se cambia lo que usa el plan: clientes, agentes, turnos y otros datos. Solo supervisión. Cada cambio queda apuntado.",
    captura: "configuracion",
    queVeo: [
      "Los apartados: Clientes, Agentes, Patrones (turnos), Parámetros y Tipos de ausencia.",
      "Cada persona: su contrato semanal, si está en el equipo y «Forzar activo».",
      "Su turno de la semana A y de la semana B.",
    ],
    queHacer: [
      "Entra en el apartado que necesites, cambia el dato y guarda.",
      "El color, el nombre, el contrato y las ausencias se ven al recargar el tablero. Lo demás, al volver a generar el borrador.",
    ],
    siPasa: [
      {
        caso: "Ha cambiado el horario de una persona.",
        haz: "En Patrones, ponle el turno nuevo desde la fecha en que empieza.",
      },
      {
        caso: "Ha cambiado su contrato.",
        haz: "En Agentes, cambia sus horas semanales.",
      },
      {
        caso: "Entra una persona nueva.",
        haz: "Llega sola de Altitude al día siguiente de crearle el usuario. En Agentes, inclúyela en el equipo y ponle contrato; en Patrones, su turno.",
      },
      {
        caso: "Las alertas avisan demasiado (o muy tarde).",
        haz: "En Parámetros, grupo «Seguimiento», cambia los minutos o el porcentaje.",
      },
    ],
  },
];

/** «Cómo hago…»: las dudas de cada día, paso a paso. */
export const TAREAS_AYUDA: TareaAyuda[] = [
  {
    id: "mes",
    pregunta: "Preparar el plan de un mes",
    tema: "inicio",
    palabras: "mes nuevo generar planificar empezar pasos",
    pasos: [
      "En Planificación, mira que «Estado de los datos» esté en verde.",
      "Apunta las ausencias del mes (vacaciones, libranzas, RTO…).",
      "En «Bolsas y objetivos», confirma la bolsa de GH y revisa los objetivos.",
      "Vuelve a Planificación y pulsa «Generar borrador» en la fila del mes.",
      "Revisa el tablero y cambia lo que haga falta. Pulsa «Guardar cambios».",
      "Pulsa «Publicar…».",
    ],
  },
  {
    id: "vacaciones",
    pregunta: "Apuntar unas vacaciones (o cualquier ausencia)",
    tema: "ausencias",
    palabras: "ausencia libranza festivo rto medico baja permiso falta",
    pasos: [
      "Abre el mes y entra en la pestaña «Ausencias».",
      "Elige la persona y el tipo: VAC (vacaciones), FEST (libranza por festivo), RTO o AUS (otras).",
      "Pon desde qué día hasta qué día. Si son solo unas horas, márcalo y pon las horas.",
      "Deja marcada «Quitar del borrador…» y pulsa «Dar de alta».",
    ],
  },
  {
    id: "borrar-ausencia",
    pregunta: "Quitar una ausencia que apunté mal",
    tema: "ausencias",
    palabras: "borrar eliminar error vacaciones",
    pasos: [
      "En la pestaña «Ausencias» del mes, busca la ausencia en la lista.",
      "Pulsa «Borrar».",
      "Sus horas no vuelven solas: añádelas en el tablero si hace falta.",
    ],
  },
  {
    id: "mover",
    pregunta: "Mover a alguien a otra hora o a otro día",
    tema: "editar",
    palabras: "cambiar arrastrar hora dia persona turno",
    pasos: [
      "Abre el tablero del mes (tiene que ser un borrador).",
      "Arrastra el recuadro a la nueva hora, día o persona y suéltalo.",
      "Si hace falta, estíralo desde un borde.",
      "Pulsa «Guardar cambios».",
    ],
  },
  {
    id: "cliente",
    pregunta: "Poner a alguien en otro cliente unas horas",
    tema: "editar",
    palabras: "cambiar cliente ugr caja rural ceff bd gh pasar",
    pasos: [
      "En el tablero del borrador, pulsa el recuadro.",
      "Elige «Cambiar de cliente» y el cliente nuevo.",
      "Si solo son unas horas, primero usa «Dividir» para partir el recuadro.",
      "Pulsa «Guardar cambios».",
    ],
  },
  {
    id: "deshacer",
    pregunta: "Deshacer un cambio",
    tema: "editar",
    palabras: "error equivocado volver atras descartar",
    pasos: [
      "Pulsa «Deshacer» en la barra de abajo (o las teclas Ctrl y Z).",
      "Para quitar todos los cambios sin guardar, pulsa «Descartar».",
    ],
  },
  {
    id: "guardar",
    pregunta: "Guardar los cambios del tablero",
    tema: "editar",
    palabras: "grabar salvar",
    pasos: ["Pulsa «Guardar cambios» en la barra de abajo.", "Si sale un aviso de que otra persona guardó antes, recarga y repite tus cambios."],
  },
  {
    id: "publicar",
    pregunta: "Publicar el mes",
    tema: "publicar",
    palabras: "dar por bueno definitivo enviar",
    pasos: [
      "Guarda los cambios del tablero.",
      "Arregla los avisos rojos (no deja publicar con ellos).",
      "Pulsa «Publicar…» y luego «Publicar».",
    ],
  },
  {
    id: "publicar-avisos",
    pregunta: "Publicar si hay avisos amarillos",
    tema: "publicar",
    palabras: "aviso blando motivo casilla no deja",
    pasos: [
      "Pulsa «Publicar…».",
      "Escribe por qué se aceptan los avisos (10 letras o más).",
      "Marca «Publicar con N avisos» y pulsa «Publicar».",
    ],
  },
  {
    id: "cambiar-publicado",
    pregunta: "Cambiar un mes que ya está publicado",
    tema: "publicar",
    palabras: "modificar publicada nuevo borrador copia",
    pasos: [
      "En el tablero del mes, pulsa «Nuevo borrador desde la vN».",
      "Haz los cambios y pulsa «Guardar cambios».",
      "Publícalo otra vez. El anterior queda como «sustituida».",
    ],
  },
  {
    id: "comparar",
    pregunta: "Ver qué cambió entre dos versiones",
    tema: "publicar",
    palabras: "diferencias cambios historial quien",
    pasos: ["Abre el mes y entra en «Versiones y cambios».", "En «Cambios», elige las dos versiones que quieres comparar."],
  },
  {
    id: "bolsa",
    pregunta: "Confirmar la bolsa de horas del mes",
    tema: "bolsas",
    palabras: "horas mes cliente gh contrato",
    pasos: [
      "Abre el mes y entra en «Bolsas y objetivos».",
      "Escribe las horas del cliente (o deja las que propone) y pulsa «Confirmar».",
      "Vuelve a generar el borrador para que cuenten.",
    ],
  },
  {
    id: "conectados",
    pregunta: "Ver quién está conectada ahora",
    tema: "hoy",
    palabras: "ahora conectado logado tiempo real hoy",
    pasos: ["En Planificación, pulsa «Hoy».", "Cada fila enseña lo planificado (arriba) y con qué usuario está conectada (abajo)."],
  },
  {
    id: "alerta",
    pregunta: "Qué hacer cuando sale una alerta",
    tema: "hoy",
    palabras: "alerta roja aviso avolo minimo retrasada sin conectar",
    pasos: [
      "Lee la alerta: dice qué pasa y qué hacer.",
      "Ávolo: que alguien con usuario Av_ se conecte. GH bajo el mínimo: pasa a alguien a GH.",
      "Sin conectar: comprueba si está o si falta apuntar una ausencia.",
    ],
  },
  {
    id: "saldo",
    pregunta: "Saber a quién le faltan o le sobran horas",
    tema: "saldos",
    palabras: "saldo horas contrato debe sobran faltan",
    pasos: ["Abre el mes y entra en «Saldos».", "Mira la última columna: en rojo faltan horas; en verde sobran."],
  },
  {
    id: "ajuste",
    pregunta: "Apuntar horas que no salen en el sistema",
    tema: "saldos",
    palabras: "ajuste formacion manual corregir saldo",
    pasos: [
      "En «Saldos», baja hasta «Ajustes manuales».",
      "Elige persona y día, escribe las horas (1,5 suma; −2 resta) y el motivo.",
      "Pulsa «Añadir».",
    ],
  },
  {
    id: "cumplido",
    pregunta: "Saber si se cumplió el plan",
    tema: "adherencia",
    palabras: "adherencia cumplimiento conectada cuando tocaba",
    pasos: ["Abre el mes y entra en «Adherencia».", "Mira los porcentajes y, en la tabla, quién tiene más horas sin conectar o en otro cliente."],
  },
  {
    id: "excel",
    pregunta: "Sacar el cierre del mes en Excel",
    tema: "cierre",
    palabras: "excel xlsx descargar cierre facturacion",
    pasos: ["Abre el mes y entra en «Cierre».", "Pulsa «XLSX»."],
  },
  {
    id: "turno",
    pregunta: "Cambiar el turno de una persona",
    tema: "configuracion",
    palabras: "horario turno patron semana a b",
    pasos: [
      "En Planificación, pulsa «Configuración» y entra en «Patrones».",
      "Elige el turno nuevo para la semana A y la B, y la fecha desde la que vale.",
      "Vuelve a generar el borrador.",
    ],
  },
  {
    id: "contrato",
    pregunta: "Cambiar el contrato de una persona",
    tema: "configuracion",
    palabras: "contrato horas semanales jornada",
    pasos: ["En Configuración, entra en «Agentes».", "Cambia sus horas semanales y guarda."],
  },
];

/** Palabras del módulo, explicadas. */
export const GLOSARIO_AYUDA: [string, string][] = [
  ["Borrador", "El plan mientras se prepara. Se puede cambiar."],
  ["Publicada", "El plan que vale. No se cambia: se hace un borrador nuevo."],
  ["Versión", "Cada plan guardado de un mes (v1, v2…)."],
  ["Recuadro (bloque)", "Unas horas de una persona en un cliente, por ejemplo «UGR 11-14»."],
  ["Franja", "Cada hora del día en el plan."],
  ["Turno", "El horario de trabajo de cada persona."],
  ["Semana A / B", "Los turnos se alternan: una semana uno y la siguiente otro."],
  ["Cliente base", "GH: se queda las horas del turno que no van a otro cliente."],
  ["Cuenta como", "BD y LX cuentan como GH: comparten su bolsa y cubren sus llamadas."],
  ["Mínimo", "Cuánta gente hace falta en GH a cada hora para atender las llamadas."],
  ["Bolsa", "Las horas del mes de un cliente."],
  ["Objetivo", "Las horas de la semana de una campaña de llamadas salientes."],
  ["Ritmo", "Contactos cerrados por cada hora de trabajo."],
  ["A demanda", "Ávolo: se entra con su usuario solo cuando hay una llamada."],
  ["Fijado", "Un recuadro que no cambia aunque se vuelva a generar el plan."],
  ["Incidencia (roja)", "Un error: no deja publicar hasta arreglarlo."],
  ["Aviso (amarillo)", "Algo raro que puede estar bien: se publica explicando el motivo."],
  ["Conectada (logada)", "Con la sesión abierta en Altitude."],
  ["Saldo", "Horas que le sobran (+) o le faltan (−) a una persona para su contrato."],
  ["Arrastre", "El saldo que trae de los meses anteriores."],
  ["Adherencia", "Si se cumplió el plan: conectada cuando y donde tocaba."],
  ["Real", "Horas conectadas de verdad, las mismas que se facturan."],
];

/** Explicaciones cortas de los «?» que hay junto a cada parte de las pantallas. */
export const PUNTOS_AYUDA = {
  "estado-datos": {
    titulo: "Estado de los datos",
    texto: "Si todo sale en verde, el plan se calculará con datos al día. Si algo sale en amarillo, léelo: dice qué hacer.",
  },
  "mapa-cobertura": {
    titulo: "Mapa de GH",
    texto: "Cada casilla es una hora. Rojo: falta gente en GH para las llamadas. Ámbar: justo. Verde: sobra alguien. Gris: a esa hora no hace falta nadie.",
  },
  "barras-horas": {
    titulo: "Horas del mes",
    texto: "Cada barra son las horas planificadas de un cliente frente a las que tiene (su bolsa o su objetivo). La raya es la meta.",
  },
  incidencias: {
    titulo: "Incidencias y avisos",
    texto: "Rojo: hay que arreglarlo para poder publicar. Amarillo: puede estar bien; si lo está, se publica explicando el motivo. «Ver» te lleva al sitio.",
  },
  "publicar-avisos": {
    titulo: "Publicar con avisos",
    texto: "Los avisos amarillos se pueden aceptar. Escribe por qué (por ejemplo, «esos jueves no hay más gente») y marca la casilla.",
  },
  bolsa: {
    titulo: "Bolsa de horas",
    texto: "Las horas que tiene el cliente este mes. Mientras no se confirme, se usa la del último mes confirmado, ajustada a los días laborables.",
  },
  objetivos: {
    titulo: "Objetivo de la semana",
    texto: "Las horas que hay que hacer cada semana para trabajar la lista de la campaña. Si escribes otro, vale el tuyo.",
  },
  "hoy-alertas": {
    titulo: "Alertas",
    texto: "Lo que hay que mirar ahora. Rojas: urgente. Amarillas: revisar. Se actualizan solas cada minuto.",
  },
  "hoy-cobertura": {
    titulo: "Cobertura de GH",
    texto: "Gente conectada en GH (o en BD y LX) a cada hora, frente a la que hace falta. Rojo: falta gente. En las horas que aún no han llegado, lo planificado.",
  },
  "hoy-filas": {
    titulo: "Cómo leer cada fila",
    texto: "Arriba, lo que tenía planificado. Abajo, con qué usuario está conectada, del color de su cliente (gris: un usuario de otro servicio). La línea roja es la hora actual.",
  },
  "adh-turno": {
    titulo: "Por turno",
    texto: "De cada 100 horas planificadas, cuántas estuvo conectada (con cualquier usuario).",
  },
  "adh-cliente": {
    titulo: "Por cliente",
    texto: "De cada 100 horas planificadas, cuántas estuvo conectada en el cliente que le tocaba.",
  },
  "adh-columnas": {
    titulo: "Columnas de la tabla",
    texto: "Correcto: conectada donde tocaba. A demanda: atendiendo Ávolo (no es fallo). Otro cliente: conectada, pero en otro. Sin conectar: no estaba.",
  },
  "adh-fuera": {
    titulo: "Fuera del plan",
    texto: "Horas conectada sin estar planificada: horas extra o cambios que no se pasaron al plan.",
  },
  "saldo-arrastre": {
    titulo: "Arrastre",
    texto: "Las horas que le sobraban (+) o le faltaban (−) de los meses anteriores.",
  },
  "saldo-previsto": {
    titulo: "Previsto a fin de mes",
    texto: "Cómo acabará el mes: lo que ya ha hecho, más lo que tiene planificado hasta el final, más el arrastre.",
  },
  "saldo-ajustes": {
    titulo: "Ajustes manuales",
    texto: "Para apuntar horas que el sistema no ve, como una formación fuera de Altitude. Con signo: 1,5 suma y −2 resta.",
  },
  "cierre-real": {
    titulo: "Real",
    texto: "Horas conectadas con los usuarios de ese cliente: lo mismo que se factura.",
  },
  "cierre-grupo": {
    titulo: "Grupo GH + BD + LX",
    texto: "Los tres comparten la bolsa de GH: mira en esta fila si sobran o faltan horas.",
  },
} satisfies Record<string, { titulo: string; texto: string }>;

export type IdPuntoAyuda = keyof typeof PUNTOS_AYUDA;

/** Tema que abre cada pantalla. */
export const TEMA_DE: Record<PantallaAyuda, string> = {
  inicio: "inicio",
  tablero: "tablero",
  ausencias: "ausencias",
  bolsas: "bolsas",
  versiones: "publicar",
  configuracion: "configuracion",
  hoy: "hoy",
  adherencia: "adherencia",
  saldos: "saldos",
  cierre: "cierre",
};

// ---------- Buscador ----------

/** Minúsculas y sin tildes, para buscar «vacaciones» o «Vacaciónes» igual. */
export function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

export interface ResultadosAyuda {
  tareas: TareaAyuda[];
  casos: (CasoAyuda & { tema: string; etiqueta: string })[];
  palabras: [string, string][];
}

/**
 * Busca en «Cómo hago…», en los «Si pasa esto» de cada pantalla y en el
 * glosario. Todas las palabras escritas tienen que aparecer (da igual el
 * orden, las mayúsculas y las tildes); las de menos de 3 letras se ignoran.
 */
export function buscarAyuda(consulta: string): ResultadosAyuda {
  const palabras = normalizar(consulta)
    .split(/[^a-z0-9ñ]+/)
    .filter((p) => p.length >= 3);
  if (palabras.length === 0) return { tareas: [], casos: [], palabras: [] };
  const casa = (...textos: (string | undefined)[]) => {
    const t = normalizar(textos.filter(Boolean).join(" "));
    return palabras.every((p) => t.includes(p));
  };
  // Primero las tareas que llevan las palabras en la propia pregunta
  const enPregunta = (t: TareaAyuda) => (casa(t.pregunta) ? 0 : 1);
  return {
    tareas: TAREAS_AYUDA.filter((t) => casa(t.pregunta, t.palabras, ...t.pasos)).sort((a, b) => enPregunta(a) - enPregunta(b)),
    casos: TEMAS_AYUDA.flatMap((t) =>
      t.siPasa.filter((c) => casa(c.caso, c.haz, t.etiqueta)).map((c) => ({ ...c, tema: t.id, etiqueta: t.etiqueta })),
    ),
    palabras: GLOSARIO_AYUDA.filter(([termino, texto]) => casa(termino, texto)),
  };
}
