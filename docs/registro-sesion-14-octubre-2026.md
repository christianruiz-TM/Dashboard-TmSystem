# Registro de la sesión del 14/10/2026 (Opus 5.5): tarificación desde Operaciones

Christian pasó el Excel con el que operaciones factura a GrupoHuertas
(«Interacciones GH_cs v4 CAMBIOS DESDE 01.05.2026 NFS V1 PW.xlsx») y preguntó
qué haría con él para que puedan tarificar desde el panel de Operaciones. Pidió
la recomendación antes de tocar nada; después se trabajó en modo plan y,
aprobado el plan, se implementó. Detalle técnico y cifras en
`docs/facturacion-tarificacion.md` (regla 19 y regla 16 de CLAUDE.md).

## Decisiones de Christian

| Tema | Decisión |
| --- | --- |
| Reparto de horas logadas por campaña | El del Excel: proporcional al tiempo de agente sin cola, del mes entero. Sustituye al del 09/10 |
| Bbdd | Ya corregido en producción a contactos finalizados (2 €, Lexus 3 €) |
| DDIs | Cuota del mes entero, sin prorrata |
| Números especiales | Se presupuestan desde comercial; hace años que no se llaman. No se tarifican |
| Números sin coste | No se cobran |
| Encuesta NFS | Se aplica también a otros clientes |
| Cierre de mes | Sí, con el histórico del Excel |
| Maestros (DDIs, códigos GS) y cierre | Operaciones (y admin); reabrir, solo admin |
| Fichero de albaranes GS | Mismo formato que los ficheros de septiembre que pasó (15/10) |

## Cifras

- **Reparto**: septiembre 2026, 70,6 h (≈1.976 €) cambian de campaña entre el
  método del 09/10 y el del Excel. Con el del Excel, 14/38 campañas al céntimo
  frente a «facturacion cerrada» y todas a ±0,3 h.
- **Comparación mes a mes** (`npm run facturacion:comparar`): septiembre
  35.120,10 € en los dos; agosto −0,11 €; julio −0,14 €; junio −1,04 €; mayo
  −3,79 €. Total de horas y DDIs exactos todos los meses.
- **En pantalla** (build de producción, copia de la SQLite y RDBv2 real):
  septiembre recalculado 35.120,11 € frente a 35.120,10 € cerrados.
- **Importación** (en la copia): 878 asignaciones de DDI (365 activas en
  septiembre, igual que el Excel), 42 códigos de GS y 21 meses (ene-2025 →
  sep-2026) que suman lo mismo que «Totalidad».
- Consulta de minutos de línea: 1,5 s al mes (GH); comparación completa de un
  mes, ~5 s de RDBv2.

## Hallazgos por el camino

- El Excel guarda en claro el usuario SQL `tms` y su contraseña (conexión
  «Consulta desde Altitudev811»). Avisado: quitarla y cambiarla. El dashboard
  usa `DashTmsystem`.
- El usuario del dashboard puede leer las vistas `v_GH_*` pero no su
  definición: todo se dedujo de los datos.
- Los números de DDI se reasignan (354 de 482 con varias filas): `numero` no
  es único y la cuota se cobra una vez por número y mes.
- Tres fechas de baja del Excel son números sin formato de fecha; el lector los
  acepta como número de serie.
- Otros clientes llevan el account code de 2 dígitos (to_address de 11): por
  eso el número son los 9 últimos dígitos y no «desde la posición 5».

## Incidencias

- Otra sesión (`dashboard-tmsystem-c0`) trabajaba a la vez en el mismo árbol
  (tipos de campaña de Resultados). Se coordinó por mensajes: cada una
  commitea solo lo suyo, la migración 0008 es de esta sesión.
- Su `next dev` del puerto 3000 recoge este código por HMR y, hasta que se
  reinicie, falla en /operaciones con «no such table: ddis». Reiniciarlo
  aplica la 0008 a `data/dashboard.db`: `npm run backup` antes. No se tocó.
- Para probar sin tocar la SQLite de desarrollo: copia con la API de backup,
  `next build` (escribe en `.next/`, no en `.next/dev`) y `next start -p 3100`
  con `SQLITE_PATH` a la copia.
- vitest reescribió el snapshot del motor con LF (sin cambios de contenido);
  se restauró.

## Continuación (15/10/2026)

- Christian vio en su `next dev` local (el de la otra sesión, puerto 3000)
  «no such table: ddis» en /operaciones. Se hizo `npm run backup`
  (`backups/dashboard_20261014_1456.db`) y se cargó el Excel en la SQLite de
  desarrollo con `facturacion:importar-excel --guardar`, que al abrirla aplica
  la 0008. Sin reiniciar el servidor, la cadena de la página funciona (≈5 s
  por mes). En desarrollo faltan las tarifas de minutos y DDIs: sin ellas,
  septiembre da 33.764,64 € (horas y contactos).
- Christian pasó los dos ficheros de albaranes de GS de septiembre (ventas y
  promociones). Hecho el export con el mismo formato
  (`docs/facturacion-tarificacion.md`, apartado 4).

### Decisiones del 15/10

- **Prefijos excluidos**: replicarlos («no sé el motivo, pero se quitan»).
  Hecho: lista por cliente en `/operaciones/reparto`. Con la del Excel,
  septiembre pasa de 14 a 19 campañas exactas de 38.
- **DDIs**: según el cliente se cobran o no en los meses sin llamadas, y
  depende del presupuesto de comercial/dirección. Hecho: opción «solo los
  meses con llamadas» en la línea de DDIs de `/admin/facturacion` (migración
  0009, aplicada a la SQLite de desarrollo con backup
  `dashboard_20261015_1222.db`).
- Los contactos de agosto de las bbdd no se facturaron por decisión de
  dirección.
- GS: no hacen falta las campañas a cero.
- Hallazgo: el Excel SÍ facturó las bbdd en julio, con precios a mano (92
  contactos a ~1,63 € y cada DDI a 31,32 €). En agosto hubo 3 llamadas sueltas
  el día 3: la opción de los DDIs no basta para no cobrar agosto.
- **Ajustes manuales al cerrar** (elegido por Christian). Hecho:
  - Con el mes cerrado se quita una línea o una campaña entera, o se cambia
    su precio, con motivo; se puede deshacer.
  - Migración 0010, aplicada en desarrollo con backup
    `dashboard_20261015_1250.db`.
  - Probado sobre la copia: quitar lexus −152,50 €, contactos de dimovil a
    1,6315 € −469,10 €, el fichero de GS sin lexus y deshacer vuelve a
    35.120,11 €.
- Christian prefiere revisarlo en local antes del commit.

### Operaciones más rápida (15/10)

- Petición de Christian: que abra más rápido y que no cargue «Todos» de entrada.
- Medido antes, en frío y en paralelo como lo hacía la página:
  - 1,9 s GH octubre, 2,6 s GH septiembre y 3,4 s todos los clientes en
    septiembre.
  - Lo más pesado: pausas (Not Ready deduplicado, 1,1-1,3 s) y unidades.
  - Los ~12 s que se veían en `next dev` eran sobre todo la compilación de la
    página.
- Hecho:
  - Sin cliente por defecto (y sin consultas). «Todos los clientes» como opción
    explícita.
  - Pestañas como enlaces (`?vista=`): cada una consulta lo suyo.
  - Secciones en `<Suspense>`.
- Después, en build de producción:
  - Primer contenido < 0,1 s.
  - Completa: GH 1,7-2,0 s, todos 2,2 s, pausas 1,3 s, listas 0,16 s,
    cerrados 0,13 s.
  - El primer acceso tras arrancar el servidor, ~5 s (arranque de Next).
- Consulta de Christian: aclasse septiembre 34,46 en su Excel y 34,47 en el
  dashboard.
  - 34,47 es lo facturado (en «facturacion cerrada» y en el fichero de GS del
    02/10).
  - Para que el Excel dé 34,46 a aclasse le faltan unos 15 s de agente.
    Probablemente el segmentador cambió después del 02/10.
  - Le di las cifras para comparar (I72 61.672,92, I78 33.106,61, aclasse
    1.110,32 min).

### Commit y despliegue (15/10)

- Commit `87f7b63` (53 ficheros) y push.
- Desplegado con el §3 de `despliegue-linux.md`:
  - Backup `dashboard_20261015_1435.db`; `anterior` = `0bfbd62204fe`.
  - `verificar` de la imagen nueva sin errores.
  - `up -d` a las 14:38 (imagen `ed31b337d485`); migraciones 0008-0010
    aplicadas (11 en total).
- En producción:
  - Las bbdd ya estaban en contactos a 2 € (Lexus 3 €).
  - Excel copiado (SHA-256 comprobado), importado (878 DDIs, 42 códigos GS,
    21 meses, 2.832 líneas) y borrado del servidor.
  - `facturacion:comparar` de septiembre con la lista de prefijos y la opción
    de DDIs: 35.120,10 € = Excel.
- Limpieza: una imagen vieja del dashboard sin etiqueta (filtro por label;
  las de tickets no se tocan). Disco: 3,2 GB libres.

## Continuación (16/10/2026): totales por cliente

Pedido de Christian: «totaliza la tarificación en los servicios que tienen
más de una campaña, una fila de total con la sumatoria de cada campo».

- **Pantalla** (Operaciones → Facturación):
  - «Factura por campaña» y «Unidades por campaña»: cada cliente con más de
    una campaña lleva su fila de total con la suma de cada columna. Con una
    sola campaña no hay total (repetiría la fila).
  - Con «Todos los clientes»: subtotal por cliente, «Total general» al final
    y, en «Unidades por campaña», la columna «Cliente» (la otra tabla ya la
    tenía). Las filas se agrupan por cliente sin cambiar su orden.
- **XLSX**: la hoja «Factura por campaña» lleva los mismos subtotales y el
  total final. «Detalle» se queda sin ellos: mezcla la fila de horas logadas
  del cliente, su reparto y las campañas, y al sumar se contaría dos veces.
- **Arreglo de paso**: el export con `servicio=todos` buscaba un servicio
  llamado «todos» y salía sin horas logadas. El botón de la página no lo
  manda, pero ahora significa lo mismo que en la página (sin cliente).
- Código: `agruparPorServicio` y `totalesUnidades` en
  `lib/facturacion-campania.ts` (puros, 2 tests nuevos); `FacturacionCampania`
  lleva ahora su `servicio`.
- Verificado en build de producción contra RDBv2 real y una copia de la
  SQLite, septiembre de 2026:
  - Total GrupoHuertas: 1.027,88 h · 4.984 € · fijo 0,79 € · móvil 442,18 €
    · DDIs 912,50 € → 35.120,11 € (el céntimo frente al Excel es el de
    siempre: horas −0,06, móvil +0,06, fijo +0,01).
  - «Unidades por campaña» de GH: 848,28 h productivas, 20.788 atendidas,
    365 DDIs y 6.339,47 € sin las horas logadas.
  - «Todos»: Total general 37.498,61 €; pantalla y XLSX iguales, con
    `servicio=todos` y sin él.
  - `tsc`, lint y 214 tests sin errores.
- Commit `2d564d0` y push. Desplegado con el §3 de `despliegue-linux.md` el
  16/10/2026 a las 14:03:
  - Backup `dashboard_20261016_1401.db`; `anterior` = `ed31b337d485`.
  - `verificar` de la imagen nueva sin errores; imagen `b2e6ba1933dc`. Sin
    migraciones.
  - Desde `tareas`, la misma cadena que la pantalla con septiembre en vivo
    (solo lectura): Total GrupoHuertas 33.764,64 € (42 campañas), Ávolo
    2.004 € (10), Total general 41.082,34 €.
  - GH da 1.355,47 € menos que en desarrollo porque en producción aún no
    están las tarifas de minutos y DDIs (912,50 + 442,18 + 0,79): es el
    pendiente de abajo. Con «Todos» se enseña lo calculado en vivo; con GH
    solo, el mes cerrado (35.120,10 €, importado del Excel).
  - Imagen vieja del dashboard sin etiqueta borrada con el filtro por label;
    las de tickets no se tocan. Disco: 3,2 GB libres.

## Pendiente

- Christian, en producción:
  - Tarifas en `/admin/facturacion`: GrupoHuertas minutos fijo 0,02, móvil
    0,05 y DDI 2,50; DDI 2,50 en cada bbdd con «solo los meses con
    llamadas».
  - Lista de prefijos de GH en `/operaciones/reparto`.
- Quitar del Excel la contraseña guardada del usuario `tms` y cambiarla.
