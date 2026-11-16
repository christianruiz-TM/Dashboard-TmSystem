# Sesión 16/11/2026 (Opus 5.5): horas restantes, regenerar desde la publicada, editar turnos y semana A↔B

Peticiones de Christian para Planificación. Antes de tocar nada se revisó qué
existía ya y se le preguntó lo dudoso. Commit `a8f0f0b`, desplegado el
16/11/2026 a las 09:10 (imagen `f5d7f79b6730`, sin migraciones, backup
`dashboard_20261116_0909.db`, vuelta atrás `dashboard-app:anterior` =
`5333214e48a3`; `despliegue-linux.md` §9). Las reglas están en CLAUDE.md, en «Planificación de turnos»
(«Generar borrador», «Semana A↔B», «Turnos de cada agente» y «Horas»).

## 1. Lo que se pidió y lo que se decidió

| Petición | Qué había | Decidido con Christian |
| -------- | --------- | ---------------------- |
| Recuadro «Horas restantes» en Horas | Tres recuadros: contrato, planificadas y efectivas | Planificadas del periodo − efectivas hasta ayer (lo que faltó en días pasados se suma); solo el del equipo; en negativo si se hizo de más |
| Regenerar cualquier mes con o sin los cambios a mano | El diálogo solo salía si había borrador; con solo la publicada, «Generar borrador» empezaba de cero | Sí también con solo la publicada; los meses pasados, NO; «cambios a mano» = bloques editados o fijados (y ahora las semanas A↔B) |
| Borrar y editar turnos y patrones | Patrones: editar y desactivar. Asignaciones de turno: solo alta | Patrones, igual. Asignaciones: editar y borrar todas, también las ya empezadas («si cometemos errores no hay vuelta atrás») |
| Alternar turnos y semanas desde el tablero | No existía | A UNA persona, una semana: A↔B. Cambia el turno (contrato, saldo y avisos) y sus bloques de esa semana van todos al cliente base (salvo fijados); se conserva al regenerar respetando los cambios |
| Borrador idéntico a la publicada | Ya existía: «Nuevo borrador desde la vN» | No lo habían visto; no se cambia. El diálogo de generar lo recuerda |

## 2. Cómo quedó

- **Horas restantes**: `resumenHoras().restantes` (`lib/planificacion/horas.ts`,
  con test) y la cuarta tarjeta de `[mes]/horas`.
- **Regenerar desde la publicada**:
  - `generarBorrador` toma como base el borrador o, si no hay, la publicada (`modo = respetar`).
  - Pasa al motor sus bloques conservables y sus semanas cambiadas.
  - El nuevo borrador sale con origen `recalculo` y basado en esa versión.
  - `BotonGenerar` enseña el diálogo con lo que se conservará (`repo.cambiosAMano`).
- **Turnos**:
  - `repo.editarAsignacionTurno` y `repo.borrarAsignacionTurno`.
  - `asignarTurnoPlan` acepta `id` y hay una acción nueva, `borrarTurnoPlan`.
  - En la página, «Editar» en cada fila (`?turno=<id>`), aviso si ya ha empezado y el enlace para ver las ya terminadas.
  - La auditoría guarda el antes y el después con el nombre de los patrones.
- **Semana A↔B**:
  - `EntradaMotor.semanasAlternas` en la foto de la versión, solo si hay alguna, así que el snapshot del motor no cambia.
  - `expandirTurnos(..., alternas)`.
  - Puros con tests (`semana-alterna.test.ts`): `alternarSemanaEnFoto` y `bloquesSemanaAlterna`, en `edicion.ts`.
  - De servidor: `guardar.ts::alternarSemanaVersion`, con revisión optimista y la foto guardada en la misma transacción (`guardarEdicion({ entradas })`).
  - Interfaz: la letra A/B junto al nombre (`fila-agente.tsx`), en amarillo si está cambiada, y `DialogoCambiarSemana`.
  - Se guarda al momento y el tablero se recarga, así que pide no tener cambios sin guardar.
  - El cargador la aplica al regenerar «respetando», y el recálculo de los lunes la conserva.
  - Solo cambian los días de este mes; en una semana partida, los del mes vecino cambian solo para repartir el contrato.

## 3. Comprobado

- 385 tests, `tsc` y ESLint en verde.
- Sobre una copia de la SQLite de desarrollo, con RDBv2 real y las mismas funciones que llaman las acciones:
  - Noviembre, borrador v2, agente 1008, semana del 23/11 (A → B): turno de 30 h a 29 h, 7 tramos cambiados y 6 bloques manuales en GH. El contrato del viernes 27/11 pasa a 6 h (+1 de diferencia con su contrato de 30 h).
  - Con una revisión vieja: conflicto.
  - Regenerar respetando conserva la semana y los 6 bloques.
  - Publicada esa versión, «respetar» desde la publicada: la v4, borrador con la semana y los bloques; la publicada sigue publicada.
  - «Empezar de cero»: turno de 30 h y sin `semanasAlternas`.
- No se probó en el navegador del PC de desarrollo (pide sesión).

## 4. Ayuda en imágenes (16/11, tarde)

- **SQLite de demo nueva** en el scratchpad, con `RDB_MOCK=1`, sobre una copia del proyecto (`git worktree`, `npm ci`). Así no se tocó el `npm run dev` del 3000.
  - `planificacion:semilla` y `planificacion:agregados` del 01/07 al 15/11.
  - Una usuaria `supervision` sin cambio de contraseña pendiente.
  - Octubre generado y publicado (v1) y su borrador v2 «respetando».
  - Al agente 1008 se le cambió la semana del 28/09 (y la del 19/10), para que la captura enseñe la letra en amarillo.
  - `next build` + `next start -p 3200`.
  - Ojo: dos scripts auxiliares en `scripts/` rompieron el `next build` (dos `main` en el mismo ámbito); van fuera de `scripts/` o se borran antes de compilar.
  - En Windows, parar la tarea no para el `next start`: hubo que parar su proceso (el que escuchaba en el 3200).
- **Capturas**: solo «Horas» y «Tablero» (`ayuda-capturas.mjs --mes 2026-10 --solo horas,tablero`). En el JSON solo cambian las coordenadas de «Horas». Las demás pantallas no cambiaron.
- **Guía de Claude Docs** (pública con enlace):
  - Textos: los cuatro recuadros de Horas y «¿Qué son las horas restantes?»; «Al generar, te pregunta…» con la publicada; la letra A/B del tablero y el paso a paso para cambiar la semana; «Corregir o borrar un turno mal puesto» en Configuración; «Semana A / B» en Palabras; y la Guía detallada.
  - Las dos capturas nuevas, con los números pintados con `sharp` (círculo amarillo con borde negro, como en la guía HTML).
- **Guía HTML** regenerada (`npm run guia:html`, 1,4 MB).
- Commit `df93bb8`, desplegado el 16/11/2026 a las 09:42 (imagen `09f3be1560f1`, backup `dashboard_20261116_0941.db`; `despliegue-linux.md` §9).

## 5. Pendiente

- Copiar `guia-supervision.html` a la carpeta compartida de supervisión.
- Probar en producción, con usuario de supervisión, los cuatro cambios.
