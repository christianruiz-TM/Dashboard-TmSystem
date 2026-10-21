# Registro de la sesión del 20-21/10/2026 (Opus 5.5): guía de supervisión

Christian preguntó si la guía de planificación para supervisión estaba al día
y pidió que fuera «más fácil de leer y dinámica». Después, como las
supervisoras no tienen cuenta de claude.ai, pidió un HTML único para una
carpeta compartida del servidor. Las reglas que quedan están en CLAUDE.md
(«Planificación → Ayuda para supervisión» y «Comandos»).

## ¿Estaba al día?

Casi. Se comparó la guía de Claude Docs con la fuente única,
`components/planificacion/ayuda-contenido.ts`:

- La parte sencilla coincidía con la fuente salvo **la alerta de Ávolo**: seguía
  diciendo «entrantes sin atender», y desde el 19/10/2026 (`1783cb3`,
  sesión 16) la alerta cuenta las «llamadas por devolver».
- La «Guía detallada» tenía el mismo fallo en su tabla de alertas.
- Lo del 09/10 (formulario de clientes en vez de JSON) ya estaba.
- **No cubre el panel de Supervisión** (Tiempo real, Histórico, Resultados,
  grupos por tipo de campaña, comparador). La guía siempre ha sido solo de
  Planificación. Se ofreció añadirlo; está pendiente de que Christian lo pida.

## Guía de Claude Docs reorganizada

Guía: <https://claude.ai/artifact/5P4qk2BKQCUfURPWqRg5U3> (sigue privada).

Antes era una sola pestaña larga («Guía sencilla»): las 22 tareas de «Cómo
hago…» al principio y las 11 pantallas mucho más abajo, lejos de sus tareas.
Ahora va en pestañas por momento del mes:

| Pestaña | Contenido (temas de `TEMAS_AYUDA`) |
| --- | --- |
| Empieza aquí | Dibujo del mes (antes, durante y al acabar), «¿Qué quieres hacer?» con enlace a la pestaña de cada tarea, «Tu rutina» |
| 1 · Preparar el mes | inicio, bolsas, tablero, editar (con las teclas) |
| 2 · Avisos y publicar | incidencias, publicar |
| 3 · Ausencias | ausencias, con una tabla de los tipos y si cuentan en el saldo |
| 4 · Cada día | hoy, con las alertas en una tabla de alerta, qué pasa y qué haces |
| 5 · Fin de mes | adherencia, saldos, cierre |
| 6 · Configuración | configuracion |
| Palabras | el glosario, por orden alfabético |
| Guía detallada | la de antes, sin cambios salvo la alerta de Ávolo |

- Cada tarea de `TAREAS_AYUDA` va en la pestaña de su `tema`, junto a su
  pantalla. Cada pantalla: captura, «Lo que ves», «Lo que haces», «Paso a
  paso» y «Si pasa esto, haz esto».
- Al final de cada pestaña, enlaces a la anterior y a la siguiente.
- Las capturas son las mismas que ya tenía la guía (no se subieron de nuevo).
- La pestaña «Guía sencilla» antigua **se borró** una vez repartido todo su
  contenido. Se puede rehacer con los textos de `ayuda-contenido.ts`.

## HTML único para la carpeta compartida

Las supervisoras no tienen cuenta de claude.ai. Desde «Compartir», un doc de
Claude Docs solo se comparte con gente de la organización (con cuenta); un
enlace público solo existe si «Compartir» lo ofrece. Por eso, además, un HTML.

```
npm run guia:html [-- --salida "\\servidor\carpeta\Guía de planificación.html"]
```

- `scripts/guia-supervision-html.ts` lo genera con los textos de
  `ayuda-contenido.ts` y las capturas de `public/ayuda/` +
  `ayuda-capturas.json` (los números se pintan encima, igual que en la
  ventana «Ayuda»).
- Un solo fichero de 1,2 MB: capturas en base64, sin internet ni
  dependencias. Se abre con doble clic (`file://`).
- Mismas pestañas que en Claude Docs (`GRUPOS` y `RUTINA` del script). **Falla
  si un tema de `TEMAS_AYUDA` no está en ninguna pestaña** o si una tarea
  apunta a un tema que no existe: así no se queda nada fuera sin avisar.
- Qué hace:
  - Buscador arriba (tecla «/»): las mismas reglas que el de la ventana
    «Ayuda» (palabras de 3 letras o más, sin tildes ni mayúsculas) sobre
    tareas, «Si pasa esto» y glosario.
  - Menú por pestañas; cada una se ve sola (por la URL: `#preparar`,
    `#tarea-vacaciones`…). Sin JavaScript se ve todo seguido.
  - «Paso a paso» desplegable; se abre solo al llegar desde un enlace o del
    buscador.
  - Al pasar por «Lo que ves» se agranda su número en la captura; la
    captura se amplía al pulsarla.
  - Dibujo del mes con cajas que enlazan a su explicación.
  - Móvil (menú en fila que se desplaza a la pestaña activa), modo oscuro e
    impresión (todas las pestañas seguidas).
- No incluye la «Guía detallada» (más técnica, solo en Claude Docs) ni las
  dos tablas hechas a mano en Claude Docs (tipos de ausencia y alertas en
  tres columnas): su contenido sí está, en los «Si pasa esto».
- `guia-supervision.html` va en `.gitignore`: se regenera tras cambiar la
  ayuda.
- `TECLAS_AYUDA` pasa de `ayuda.tsx` a `ayuda-contenido.ts` (fuente única)
  para que el script la lea. El panel no cambia.

### Verificación

- Chrome sin ventana (protocolo de depuración, como
  `scripts/ayuda-capturas.mjs`): portada, cada pestaña, enlace a una tarea,
  buscador («vacaciones»), móvil a 390 px, número encendido y captura en
  grande. **Cero errores de JavaScript.**
- `tsc --noEmit`, ESLint de los tres ficheros y los tests de
  `components/planificacion` (4), en verde.

## Cambios en el repositorio

| Fichero | Cambio |
| --- | --- |
| `scripts/guia-supervision-html.ts` | Nuevo: genera el HTML |
| `package.json` | Comando `guia:html` |
| `.gitignore` | `/guia-supervision.html` |
| `src/components/planificacion/ayuda-contenido.ts` | `TECLAS_AYUDA` (antes en `ayuda.tsx`) |
| `src/components/planificacion/ayuda.tsx` | Usa `TECLAS_AYUDA` |
| `CLAUDE.md` | Estructura de la guía, el HTML y el comando |

Sin commit al cerrar el registro. Nada que desplegar: el HTML no forma parte
del dashboard.

## Pendiente

- [ ] Commit de los cambios.
- [ ] Generar el HTML en la carpeta compartida y decir a las supervisoras
      dónde está.
- [ ] Decidir si la guía (Claude Docs y HTML) debe cubrir también el panel de
      Supervisión.
- [ ] Cuando cambie la ayuda: `ayuda-contenido.ts`, capturas
      (`scripts/ayuda-capturas.mjs`), la guía de Claude Docs y
      `npm run guia:html`.
