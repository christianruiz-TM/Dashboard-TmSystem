# Sesión 18/11/2026, tarde (Opus 5.5): GH sin las llamadas con la ficha a medias

Petición de Christian: «en GH, si no hay `contact` pero sí `contact_profile`,
no se tienen en cuenta, ni en las llamadas ni en el recuento; lo dejamos fuera,
como si no existiera. Antes de hacer nada, dame la tarificación de GH de
octubre que saldría». Se simuló sin tocar nada. Después Christian dijo que los
minutos a móvil no cuadraban con la comprobación de operaciones y se buscó por
qué. Por último pidió «aplica todas las reglas que tiene operaciones para que
en el futuro cuadre, solo para GH» y luego commit y despliegue («sí, hazlo»).

- Commits: `6ef75b3` (la regla) y `718270a` (histórico y registro).
- Despliegue: 13:14 (`despliegue-linux.md` §9), con la opción de GH marcada a
  las 13:15.
- Reglas: CLAUDE.md, regla 19 («Llamadas con la ficha a medias») y regla 16.
- Detalle técnico: `facturacion-tarificacion.md` §2, «Llamadas con la ficha a
  medias».

## 1. Qué hilos son

En octubre 2026, en las campañas de GrupoHuertas (`itr_thread` por campaña del
servicio):

| Caso | Entrantes | Salientes | Notas |
| ---- | --------: | --------: | ----- |
| Perfil sin contacto (`contact` NULL, `contact_profile` relleno) | 42 | 34 | Todos de usuarios `GH_nnnn` y en campañas que no son BBDD |
| Contacto sin perfil | 0 | 41 (3 atendidas) | De las atendidas, 2 de BBDD (`gh_bbdd_dimovil`, 1,97 min a móvil; `gh_bbdd_autoclasse`, sin número) y 1 de `gh_gra_pre_mer` (GH_1045, 14/10, 50 décimas = 0,08 min) |
| Sin ninguno de los dos | 2.281 (898 del IVR, 1.330 sin usuario, 53 de agente) | 0 | Entrantes que no llegaron a ligarse a una ficha y encuestas del IVR |

En la factura de GH esto solo toca dos cosas: los **minutos de línea** y el
**reparto por campaña de las horas logadas**. El total de horas sale de
`user_log` y no cambia. Las BBDD se facturan por contactos, así que tampoco
cambian.

## 2. Primera simulación (equivocada en dos puntos)

Se pidió antes de tocar nada. Se hizo con la misma SQL y las mismas funciones
puras que la factura, en un script fuera del repo. Se quitaban solo los hilos
con perfil y sin contacto.

| Octubre GH sin BBDD | Hoy | Simulación |
| ------------------- | --: | ---------: |
| Horas logadas | 1.206,16 h | 1.206,16 h (se mueven unas 3 h entre campañas) |
| Minutos a móvil | 14.868,91 | 14.810,31 (−58,60) |
| Minutos a fijo | 36,25 | 36,25 |

Christian respondió que los minutos a móvil no cuadraban y pasó la
«COMPROBACION FACTURACION MES DE OCTUBRE 26 version 1 03_11_26» de
operaciones. Sus cifras de GH: móvil 14.814,92, fijo 36,25, horas 1.206,159,
361 DDIs, total 35.416,42 €.

La diferencia, 4,61 min, se explicaba campaña a campaña:

1. **La simulación quitaba también la encuesta.** Al quitar el hilo del
   agente, el hilo del IVR que va detrás se quedaba sin campaña. Operaciones
   la sigue cobrando: 2,85 min en `gh_aclasse_mer`, 1,24 en `gh_dimovil_mer` y
   0,60 en `gh_mur_seat`. Coincide al céntimo con la suma de las encuestas de
   esas llamadas.
2. **Faltaba el caso contrario.** Operaciones tampoco cobra la llamada con
   contacto y sin perfil: los 0,08 min de `gh_gra_pre_mer`.

Antes de dar las primeras cifras no se miró ninguna de las dos cosas. Queda
como lección para la próxima simulación.

## 3. La regla de operaciones

**Fuera la llamada del agente que tiene SOLO UNO de los dos campos**
(contacto sin perfil o perfil sin contacto). **Su encuesta se sigue cobrando**
en la campaña de ese agente. **Los hilos sin ninguno de los dos se quedan.**

Con esa regla, los minutos a móvil y a fijo de octubre son iguales al Excel en
las 43 campañas.

### Las horas por campaña

Con ninguna regla cuadran todas. Se probó contra el Excel con el mismo
reparto (total 1.206,16 h, mayor resto, prefijos excluidos de GH):

| Variante | Campañas al céntimo | Σ\|dif\| | Peor |
| -------- | ------------------: | -------: | ---- |
| Como hoy | 8 de 43 | 5,98 h | `gh_dimovil_mer` +1,36 h |
| Solo perfil sin contacto | 24 de 43 | 0,52 h | `gh_dimovil_mer` −0,16 h |
| Hace falta contacto Y perfil | 20 de 43 | 0,58 h | `gh_dimovil_mer` −0,18 h |
| **Solo uno de los dos (la elegida)** | **21 de 43** | **0,50 h** | `gh_dimovil_mer` −0,15 h |

También se probaron, sin mejora: las 64 combinaciones de origen (entrante o
saliente) y campo que falta; contar la cola, los hilos sin número o el origen
3; todos los usuarios de agente; no excluir los prefijos; solo atendidas; y
`GH_` con sufijo. Las entrantes no cambian de campaña según el número marcado
(ningún hunt group va a dos campañas). Y en GH no hubo minutos en espera
(`state = 7`) en octubre.

Quedan `gh_dimovil_mer` (−0,15 h) y `gh_la_car_toyota` (−0,07 h). Ningún dato
lo explica y encaja con los retoques a mano del Excel, como en septiembre
(±0,3 h), por ejemplo `gh_us_gougo_mark` con 2,979 h.

### Decisiones

| Pregunta | Decidido |
| -------- | -------- |
| ¿Qué regla? | La de operaciones, «para que en el futuro cuadre» (Christian) |
| ¿Para qué clientes? | **Solo GH** (Christian) |
| ¿Qué regla en el reparto de horas? | La misma que en los minutos: «solo uno de los dos». Es la de menor desviación total y deja una sola condición. Elegido por Claude: «solo perfil sin contacto» iguala 3 campañas más, pero se desvía más en total |
| ¿Cómo se limita a GH? | Opción por cliente en Operaciones → Reparto, junto a los prefijos excluidos, en vez de escribir el cliente en el código. Elegido por Claude, siguiendo la convención de no fijar clientes en el código |
| ¿También en los paneles? | **No**: solo la tarificación. Las cifras de llamadas de Supervisión, Dirección y Mi servicio no cambian. Christian lo mencionó al principio («ni en las llamadas, ni en el recuento») y quedó por confirmar |

## 4. Cómo quedó

- `sqlFichaIncompleta` (`queries/util.ts`): la condición, en un solo sitio.
- `minutosLineaPorCampania` y `baseRepartoHorasLogadas` **solo marcan** cada
  fila (`fichaIncompleta`). La encuesta del IVR va siempre con marca 0. Así,
  el SQL y su caché no dependen de la configuración.
- El filtro va en TypeScript, en funciones puras con tests:
  - `sinFichasIncompletas` (`lib/tarificacion.ts`).
  - `repartirHorasLogadas(..., sinFichaIncompleta)` y
    `facturarHorasLogadas(..., serviciosSinFichaIncompleta)`
    (`lib/facturacion-horas-logadas.ts`).
- `facturacionCompleta` y `facturacionHorasLogadas` (`lib/facturacion.ts`)
  aplican el filtro a las campañas de los clientes con la opción.
- Opción: `quitarFichaIncompleta` / `guardarQuitarFichaIncompleta`
  (`lib/db/facturacion.ts`), `app_settings`
  `facturacion.sinFichaIncompleta.<servicio>`, sin migración. Por defecto no.
- Pantalla: casilla «Quitar las llamadas con la ficha a medias» en
  `/operaciones/reparto`. La acción es `guardarFichaIncompleta`, auditada como
  `facturacion_maestros`. La explicación del reparto en la Factura lo menciona
  cuando está marcada.
- `npm run facturacion:comparar` admite `--sin-ficha-incompleta`.
- El campo `fichaIncompleta` es opcional en los tipos (ausente = no): las
  filas de los tests y lo guardado antes en la caché siguen valiendo.

## 5. Comprobaciones

- 443 tests (los nuevos: la regla en minutos y en el reparto), `tsc` y ESLint
  en verde.
- **En desarrollo**: copia de la SQLite (la original no se tocó) con la
  opción marcada y la cadena real de la factura contra RDBv2. Con la opción:
  móvil 14.814,92 (43 de 43), fijo 36,25 (43 de 43) y horas al céntimo en 21
  de 43. Sin ella: igual que antes (14.868,91, 8 de 43).
- **En producción**, desde `tareas` con `facturacionCompleta`, GH octubre:
  - Minutos a móvil (sin BBDD): 14.814,92.
  - Minutos a fijo: 36,25.
  - Horas: 1.206,16.
  - Octubre está abierto, así que la factura en vivo ya sale con la regla.

## 6. Operaciones en producción

| Hora | Qué | Backup |
| ---- | --- | ------ |
| 13:13 | Backup y etiqueta `dashboard-app:anterior` (`c9677020a5cd`, la de `5142e9c`) | `dashboard_20261118_1313.db` |
| 13:14 | Despliegue de `6ef75b3`, imagen `98e9e8c3a5a5`. Compilación a la primera, `verificar` sin errores, `app` sano. Sin migraciones | el de las 13:13 |
| 13:15 | Opción marcada para GrupoHuertas, con su fila en `audit_log` («Claude (pedido por Christian)», `facturacion_maestros`) | el de las 13:13 |
| 13:16-13:17 | Precalentado relanzado: 97 s, 121 consultas, 0 fallos. 52 GB libres | — |

La opción se guardó directamente en la SQLite (por `docker compose exec
tareas`), no desde la pantalla, porque no había sesión en el panel. Se hizo lo
mismo que la acción de la pantalla: la misma clave y el mismo formato de
auditoría.

## 7. Incidencias

- **Acceso al servidor denegado durante la simulación**: se quería leer las
  tarifas de producción y el permiso se denegó. Se valoró con la SQLite de
  desarrollo y se avisó de que el precio de los minutos no estaba comprobado.
  El acceso funcionó al desplegar, tras el «sí, hazlo».
- **Consultas vacías desde el script**: en Windows, `npx` corta el argumento
  en el primer salto de línea y llegaba solo el comentario `--`. El script
  pasó a leer el SQL de un fichero.
- **Una consulta de exploración agotó la memoria de Node** (devolvía
  demasiadas filas). Se rehízo acotada.
- **`tsx` en el contenedor no admite `await` fuera de una función** (sale en
  formato CJS). Los scripts de comprobación en producción van dentro de
  `main()`.

## 8. Pendiente

- **Tarifas de minutos y DDIs de GH en producción.** La factura de GH no tiene
  líneas de minutos ni de DDIs porque no están dadas de alta, así que este
  cambio aún no mueve euros. Octubre en vivo: 38.027,48 € (horas 33.772,48 € y
  BBDD 4.255 € por 2.006 contactos). El Excel cobra:

  | Concepto | Precio | Octubre |
  | -------- | -----: | ------: |
  | Minutos a móvil | 0,05 € | 740,75 € |
  | Minutos a fijo | 0,02 € | 0,73 € |
  | DDIs (361) | 2,50 € | 902,50 € |

  Son 1.643,97 € que el panel no factura. Estaba pendiente desde el 14/10;
  Claude se ofreció a darlas de alta y falta la respuesta.
- **Verlo en el navegador**: Operaciones → Reparto (la casilla) y la Factura
  de GH (explicación del reparto).
- **Confirmar con Christian** si la regla debe valer también para las cifras
  de llamadas de los paneles (Supervisión, Dirección, Mi servicio). Hoy solo
  es de la tarificación.
- Las diferencias de horas de `gh_dimovil_mer` y `gh_la_car_toyota` no tienen
  arreglo por regla. Si operaciones las retoca a mano, se pueden dejar igual
  con los ajustes manuales del cierre del mes.
