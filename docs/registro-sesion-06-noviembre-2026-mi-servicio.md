# Sesión 06/11/2026 (Opus 5.5): «Mi servicio» y accesos de Planificación

Dos encargos de Christian. Todas las dudas se le preguntaron antes de tocar
nada (pidió expresamente no deducir); abajo, lo que decidió.

## 1. Accesos directos de Planificación

Petición: llegar a «Horas» sin entrar en el tablero de un mes, y qué otros
botones conviene tener más a mano. Aceptadas todas las propuestas:

- Botones «Horas» (el mes en curso, en la semana de hoy, que es lo que abre la
  pestaña por defecto) y «Ausencias» (el mes en curso) arriba en
  `/planificacion`, junto a «Hoy».
- «Horas» en la fila de cada mes de la tabla «Meses».
- Los ven los mismos que ya ven esas pestañas: supervisión, operaciones y
  dirección.
- Ayuda (`ayuda-contenido.ts`): el punto 1 de la pantalla de inicio nombra los
  botones nuevos (no se añadió un punto: la captura numerada tiene 4) y los
  pasos de «Apuntar unas vacaciones» y «Ver las horas…» empiezan por ellos.
- **Pendiente**: rehacer la captura `inicio` en modo demo (no enseña los
  botones nuevos), la guía de Claude Docs y la guía HTML.

## 2. «Mi servicio»: panel del cliente e informe descargable

Petición: primera pantalla de «Mi servicio», de momento para supervisión,
operaciones y dirección, con total de llamadas, finalizados, no válidos,
éxitos y horas logadas; muy visual («panel de control para los clientes en el
futuro»); botón para descargar un informe visual, de la marca, listo para
mandar al cliente, en un solo HTML portable e interactivo.

### Decisiones de Christian

| Duda | Decisión |
| --- | --- |
| Página anterior (interacciones, atendidas, AHT, listas, CSV) | No se conserva nada: la sustituye el panel nuevo. |
| Rol cliente | Mantiene el acceso: cada cliente verá lo suyo con su usuario. Supervisión, operaciones y dirección eligen cliente. |
| Nombre en el menú | «Mi servicio» para todos («así hablamos el mismo idioma que el cliente»). |
| ¿Más pantallas? | Seguro; tiene que ser escalable. |
| Cliente = | Servicio de Altitude. El usuario cliente se liga a su servicio con un campo nuevo del cliente en Administración → Clientes. |
| Qué clientes salen en el selector | Los que tengan un cliente dado de alta con su servicio. Bolsas, Socios y TMSYSTEM son campañas internas (usuarios `Bol_`, `Soc_`, `TM_`): no tendrán cliente. |
| «Todos los clientes» | No: siempre uno. |
| IVR | Siempre fuera. |
| Filtros | Tipo de campaña y una campaña concreta. |
| Llamadas | Todas (la caja «Llamadas»), con las gestionadas debajo. |
| Finalizados | Los de Resultados (caja 3). Para los roles internos, el globo lo especifica y da la cifra descartada (los de facturación, con cierres administrativos y sin tocar). |
| No válidos | Los de `/admin/resultados`; sin configurar, «Sin configurar». Con su %, aprovechamiento bruto y neto. |
| Éxitos | La caja «Éxitos» (sesiones de éxito por el día de la llamada). |
| Embudo y % | Con los «finalizados con éxito» (contactos cerrados en éxito), con ese nombre, para no tener dos cifras distintas llamadas «éxitos». |
| Horas | Caja 1. Todos los clientes deben tener su prefijo; «no cambies nada» (el prefijo sigue saliendo de la línea de facturación «horas logadas»). |
| Horas con un tipo o una campaña | Las de la ficha abierta en esas campañas (opción b). El globo interno lo explica junto con las descartadas: horas logadas enteras de quien trabajó en ellas, u ocultarlas. |
| Ratios | Llamadas por hora, éxitos por hora y finalizados por éxito. |
| Periodo | Mes en curso por defecto, con los atajos de siempre y «Hoy». |
| Comparación con el periodo anterior | No. |
| Refresco | Cada 60 s. |
| Gráficas | Evolución por día (semanas pasados 62 días), embudo, reparto de resultados y motivos de no válido, horas por día y por campaña. |
| Por agente | Nada, ni en pantalla ni en el informe. |
| Nombres de campaña | Los de Altitude, tal cual. |
| Informe | Sin nada de internet; filtrar por campaña dentro; tiene que imprimirse bien o guardarse en PDF. Logo en PNG (lo pasó Christian). Pie con los datos generales de contacto de la web, glosario al final y recuadro de comentarios. Avisar de que se descarga lo que hay en pantalla. |
| Comentarios | Se escriben en el panel antes de descargar y quedan en la auditoría. |
| Pie de contacto | Dirección, 958 53 57 70, info@tmsystem.es y tmsystem.es (de tmsystem.es, «Contacta con nosotros»). |
| Quién descarga | Los tres roles; cada descarga, en la auditoría. |

### Lo hecho

- **Migración 0013** (`clients.service_name`, único): el servicio de Altitude
  de cada cliente. Administración → Clientes lo elige en la propia tabla
  (desaparece la página de marcar campañas, `client_campaigns` se queda sin
  uso y vacía). Solo servicios que existan y uno por cliente.
- **Acceso** (`lib/mi-servicio/acceso.ts`): la página y la descarga deciden el
  cliente en el servidor; el rol cliente ve siempre el suyo, pida lo que pida.
- **Datos** (`lib/mi-servicio/servidor.ts`): cuatro consultas en paralelo con
  las mismas fuentes que las cajas, por día y campaña:
  `llamadasDiaCampania` y `horasLogadasDia` (nuevas, `queries/mi-servicio.ts`),
  `actividadDiariaCampania` (las Q1 y Q2 de la base de los ratios, por día) y
  `baseResultadosRango` (la base de Resultados sin calcular, misma caché que
  la pestaña). Si el rango llega a hoy, caché de 60 s en claves propias (no
  acorta la del resto de paneles).
- **Motor, vista y dibujo** (`lib/mi-servicio/motor.ts`, `vista.ts`,
  `dibujo.ts`): funciones AUTOCONTENIDAS que usan la pantalla (servidor) y el
  informe (navegador, `toString()`): el informe recalcula con el mismo código
  al quitar campañas. Gráficas SVG propias según la skill de visualización
  (paleta validada claro y oscuro, una escala por panel, globo en cada marca,
  tabla accesible).
- **Informe** (`lib/mi-servicio/informe.ts`, `api/export/mi-servicio`): un HTML
  de ~200-300 KB, ya pintado (se lee sin JavaScript), con logo en base64,
  filtro de campañas y de tipo, globos, glosario, pie de contacto e impresión
  en A4. POST con JSON (una web ajena no puede lanzarlo) y una línea
  `informe_mi_servicio` en la auditoría con cliente, periodo, filtros y
  comentarios.
- `__name`: esbuild (tsx, vitest) envuelve las funciones con `__name(...)` al
  compilar; el programa del informe lo define sin hacer nada. El compilado de
  producción de Next (Turbopack) no lo mete.

### Verificación

- 326 tests (19 nuevos en `lib/mi-servicio`), `tsc` y ESLint en verde.
- Contra RDBv2, GrupoHuertas septiembre 2026 (configuración de resultados de
  la SQLite de desarrollo, con 2 códigos de no válido): 21.394 llamadas
  (13.340 gestionadas), 8.415 finalizados, 3.794 no válidos, 2.529 éxitos,
  1.384,22 h, 9,64 llamadas/h, 1,83 éxitos/h, 3,33 finalizados por éxito,
  aprovechamiento 30,02 % y neto 54,66 %. Finalizados, no válidos, bruto y
  neto = la pestaña Resultados actual; éxitos, horas y por hora = las cajas
  verificadas; las horas por día cuadran usuario a usuario (71 de 71) con la
  caja. (Los 8.417 y 2.973 del 13/10 eran con los datos y la configuración
  de entonces.)
- `next build` de producción (Turbopack) y `next start` en una COPIA del
  proyecto y de la SQLite, con Chrome sin ventana:
  - Pantalla de GH, mes en curso: 2,4-2,9 s la primera vez y 0,7 s con
    caché; septiembre, 3 s.
  - Informe descargado por la API: se abre como fichero, filtra campañas (39
    casillas; con 2, de 3.409 a 56 llamadas) sin errores de consola, y
    `printToPDF` lo saca en A4.
  - Petición con `text/plain`: 415.
  - Un usuario cliente que pide UGR ve y descarga GrupoHuertas (el suyo); en
    `/supervision` lo devuelve a `/clientes`.
  - Las descargas quedan en `audit_log`.
- Modo `RDB_MOCK=1`: genera el informe sin errores.

### Pendiente

- **Desplegado** el 06/11/2026 a las 14:33: commits `75ad403` y `815f2ae`, imagen
  `179eea0feb3c`, migración 0013, backup `dashboard_20261106_1431.db`. Desde
  `tareas`, GH septiembre = desarrollo al número. Falta dar de alta en
  Administración → Clientes los clientes externos con su servicio (GH, UGR,
  CEFF, CajaRural, Ávolo…): en producción solo hay «GrupoHuertas», inactivo y
  sin servicio, así que el selector de «Mi servicio» sale vacío.
- Captura `inicio` de la ayuda de Planificación, guía de Claude Docs y guía
  HTML.
- Ávolo no tiene prefijo de usuarios (factura por leads): sus horas logadas
  son las de todos los que trabajaron en sus campañas (hoy, todos `Av_`).
