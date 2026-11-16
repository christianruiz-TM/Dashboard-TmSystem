# Sesión 12-13/11/2026 (Opus 5.5): paneles en pestañas, animación de carga y vista mensual

Petición de Christian del 12/11/2026: «hay mucho scroll y es difícil perderse
entre secciones» en Supervisión, Dirección y Operaciones. Primero propuestas,
luego cada paso con su visto bueno. El detalle técnico está en CLAUDE.md
(«Arquitectura» → Supervisión, «Animación de carga» y «Vista mensual»).

Commits `75bc18b` y `b6acfd3` (más `b14d44c` y `2edfc33`, histórico de
despliegues). En producción el 13/11/2026 a las 13:10 y a las 13:37
(`despliegue-linux.md` §9).

## 1. Decisiones de Christian

| Pregunta | Decisión |
| --- | --- |
| ¿Una página con índice o pestañas? | **Pestañas por sección** (opción B): cada sección es una URL y consulta solo lo suyo |
| Orden del estado de agentes | Alfabético por código de agente, sin excepción |
| Las 7 cajas de «Rendimiento por éxitos» en Dirección | Ocultas, como en Supervisión: repetían o se confundían con las 12. «Las propias las haremos en otro panel» (sin definir) |
| Supervisión | «OK» (13/11) |
| Dirección | Mismo patrón: seguía con mucho scroll |
| Pantallas que parecían colgadas | Animación de carga global: pantalla borrosa con «Cargando datos…» |
| Vista mensual | Arreglar `metricasIvr` y guardar los rangos cerrados con precalentado nocturno; el mes en curso, en vivo (opción a) |
| Operaciones | También en pestañas. Sus cajas se llaman como en el resto: «Llamadas gestionadas» y «Contactos cerrados» |

## 2. Qué se hizo

### Pestañas por sección

- **Supervisión** (Tiempo real e Histórico): `?seccion=resumen|agentes|campanias|exitos|salientes|entrantes`.
  - Cada sección pide solo sus datos (`lib/supervision-secciones.ts`, puro con tests). La carga es común a la página y a la API de refresco (`lib/supervision-servidor.ts`).
  - El IVR (~42 s el mes de GH antes del arreglo) solo lo pide «Entrantes e IVR».
  - En Tiempo real, la franja «Ahora» (plantilla y entrantes de hoy) sale en todas las pestañas. Las alertas de planificación salen solo si hay alguna.
- **Dirección**: `?seccion=resumen|tendencias|campanias|exitos|salientes|callback` (`lib/direccion-secciones.ts`).
  - Cada consulta es perezosa y compartida (`direccion/datos.ts`).
  - Cada bloque va en su `<Suspense>`, así que la página no espera a nada.
  - **El Resumen mide 1.313 px de alto; antes, la página entera medía 13.736 px** (unas 15 pantallas).
- **Operaciones**: sigue en `?vista=` para que los enlaces de antes sigan valiendo.
  - Seis secciones: Factura (cifras, factura por campaña, cierre y cargos), Horas logadas, Unidades por campaña, Meses cerrados, Listas outbound y Pausas.
  - Factura, Horas y Unidades salen de la misma `facturacionCompleta`.
  - Los maestros (Artículos, DDIs, Códigos GS, Reparto) van en un menú «Maestros».
  - Las cajas «Atendidas» y «Leads finalizados» pasan a «Llamadas gestionadas» y «Contactos cerrados», con su globo de ayuda.
- **Barra fija** (`BarraPanel`), en las tres: pestañas, filtros y secciones siguen arriba al bajar.
- **Glosario por sección**: solo lleva los términos que salen en ella. Un test comprueba que todas las claves existen.

### Animación de carga

- `components/cargando.tsx`: rueda amarilla, `AvisoCargando` y `SeccionCargando` (el hueco de cada `<Suspense>`).
- `components/layout/carga-navegacion.tsx`, montada en el layout:
  - Al pulsar un enlace interno o cambiar un selector, el contenido se emborrona hasta que cambia la URL.
  - 200 ms de espera para no parpadear y 130 s como mucho.
  - Nunca en descargas, `/api/` ni pestañas nuevas.
- Los selectores que navegan con `router.push` avisan antes con `avisarNavegacion` (cliente, fechas, IVR, dato del contacto, filtros de Mi servicio y campana). **Todo `router.push` nuevo tiene que llamarlo.**

### Vista mensual

Medido el 13/11 en frío, con un mes entero: casi todo tardaba entre 1 y 7 s. El cuello era `metricasIvr`:

| Alcance | Antes | Después |
| --- | --- | --- |
| Octubre, todos los clientes | > 120 s (cancelada) | 0,5 s |
| Octubre, GH | 84 s | 0,6 s |
| 1-12/11 | 25 s | (no medido aparte) |

- **Causa**: por cada llamada no atendida, el `EXISTS` de «¿había un agente logado?» recorría todas las sesiones desde el inicio del rango, así que el coste crecía con el cuadrado del mes.
- **Arreglo** (`sqlMetricasIvr`): las sesiones se funden en tramos (unión de intervalos) en tablas temporales y cada llamada se mira contra los tramos.
- **Comprobación**: mismas cifras que la versión anterior en GH (12/11 y 01-07/10), Ávolo (octubre), todos (10-12/11) y hoy.
- **Caché persistente** (migración 0014, `cache_consultas`): los rangos cerrados se guardan también en la SQLite.
  - Duración (`ttlSegunRango`): hoy, 5 min; un rango acabado en los 3 últimos días, 12 h; uno anterior, 30 días en memoria.
  - En la SQLite nada dura más de 23 h, porque la tarea de la noche lo rehace. Una pasada son 121 consultas y 11,2 MB; guardándolo 30 días crecía ~100 MB, y cada backup con ello.
  - La versión es la compilación (`.next/BUILD_ID`): tras un despliegue no se lee nada de antes.
  - Comprobado con octubre, para todos y para GH: las 7 consultas que más pesan (ratios, resultados, volumen, unidades, horas reales, horas por cliente y KPIs de campaña) vuelven idénticas de la SQLite (Map, Set y fechas).
- **`npm run precalentar`** (02:45 en `docker/crontab`):
  - Prepara el mes anterior, los periodos con los que compara Dirección y el «Ayer» de Supervisión, para todos y para cada cliente activo.
  - Usa las mismas claves que las páginas.
  - Tarda ~100 s; una segunda pasada, 1 s.

## 3. Despliegues

| Hora | Commit | Imagen | Backup | Vuelta atrás |
| --- | --- | --- | --- | --- |
| 13/11 13:10 | `75bc18b` (migración 0014) | `b4c77c2dd900` | `dashboard_20261113_1305.db` | `bf9026cc735b` (la de `2bcd6d7`) |
| 13/11 13:37 | `b6acfd3` | `5333214e48a3` | `dashboard_20261113_1334.db` | `b4c77c2dd900` |

- El de las 13:10 fue justo después del de otra sesión (`2bcd6d7`, llamadas en la campaña del último tramo), que va dentro. Antes se comprobó que los dos no tocaban los mismos ficheros. Solo se commitearon ficheros de esta sesión.
- Los dos builds salieron a la primera. En los dos: `verificar` sin errores y el mismo `BUILD_ID` en `app` y `tareas`.
- Precalentado lanzado a mano tras cada despliegue:
  - 13:10: 121 consultas en 101 s, sin fallos.
  - 13:37: 121 consultas en 96 s, sin fallos; se podaron las 125 filas de la compilación anterior.
- 379 tests, `typecheck` y ESLint en verde. Probado en el `next dev` de Christian (puerto 3000) con capturas de Chrome sin ventana y una sesión temporal, borrada al acabar.

## 4. Incidencias

- **Panel de prueba**: un `next dev` aparte (puerto 3123) se probó en una copia del proyecto con enlace a `node_modules`.
  - Turbopack no sigue ese enlace; hubo que usar `--webpack` con más memoria.
  - Cuando Christian quiso abrirlo, la copia ya estaba borrada. Para mirar los cambios basta el `npm run dev` de siempre.
- **Ficheros de otra sesión**: `docs/registro-sesion-10-noviembre-2026.md` y el apartado 29 de `docs/registro-sesiones.md` estaban preparados para commit por otra sesión. No se tocaron.

## 5. Pendientes

- **Tras cada despliegue** hay que relanzar `docker compose exec tareas npm run precalentar` (~100 s). Si no, el mes anterior va en frío hasta las 02:45.
- **Recargar las pestañas** del panel que estuvieran abiertas antes del despliegue.
- Sin pedir, por si se quieren:
  - Las 12 cajas en 3 filas de 4.
  - Tablas largas con alto máximo y cabecera fija.
  - Un panel propio de rendimiento para Dirección («las propias»).
  - Una barra más compacta en Histórico.
- Las alertas de SLA bajo, abandono alto y Not Ready largo (mejora 4) siguen sin hacer.
