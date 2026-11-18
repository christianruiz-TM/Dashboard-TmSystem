# Sesión 18/11/2026 (Opus 5.5): escandallo de precios de Ávolo

Petición de Christian: integrar en Operaciones un escandallo de precios por
cantidad de contactos finalizados. Pidió no hacer nada sin su ok: primero se
propuso dónde y cómo, se resolvieron las dudas y después se hizo, se desplegó
y se dieron de alta los tramos, cada paso con su ok.

- Commits: `92a656f` (escandallo, migración 0017), `25b5cd3` (arreglo de la
  tarjeta), `5142e9c` (ayuda en el panel) y los de documentación.
- Despliegues: 12:10, 12:27 y 12:53 (`despliegue-linux.md` §9).
- Reglas: CLAUDE.md, regla 19, «Escandallo».
- Detalle técnico: `facturacion-tarificacion.md` §6.

## 1. Lo que se pidió y lo que se decidió

El escandallo llegó como texto pegado y luego como captura de su hoja
(«Escalado Coste»: Contactos finalizados → Coste leads; 1500 → 3,00 €,
1200 → 3,49 €, 1000 → 3,60 €, 800 → 3,75 €, 600 → 4,00 €, con la fila de 600
sombreada).

| Pregunta | Opciones | Decidido con Christian |
| -------- | -------- | ---------------------- |
| ¿Cómo se aplica el tramo? | Por volumen (todo al precio del tramo alcanzado) o escalonado (cada tramo a su precio) | **Por volumen** |
| ¿Sobre qué se cuentan los finalizados? | Todas las campañas del cliente con esa tarifa, o cada campaña por separado | **Todas las del cliente**, mes a mes |
| ¿Y por debajo de 600? | Precio propio, mínimo facturable o el de 600 | «Lo tienes en la captura»: la fila de 600 es la base → **4,00 €** |
| ¿Qué cliente lo lleva? | Bbdd de GH (2 € y Lexus 3 €) o Ávolo (4 €, como el tramo base) | **Solo Ávolo**. «En el futuro habrá nuevas que se facturen de diferente forma» |
| ¿Qué finalizados? | Todos los cerrados (`leads`) o solo los de éxito | **Todos** |

- Primera lectura, corregida: en la propuesta inicial se leyó «por debajo de
  600: ¿?». Christian mandó la captura y quedó claro que 4,00 € es la base.
- Diseño: se propuso primero una tabla de escandallos con nombre, para varias
  líneas a la vez. Al saber que es solo Ávolo, con UNA línea de todo el
  cliente, se simplificó a una columna en la propia línea de tarifa. Si algún
  día varias líneas de campaña tienen que sumar volumen juntas, hará falta
  aquella tabla.

## 2. Cómo quedó

- `billing_config.tramos` (migración 0017).
- `lib/escandallo.ts` y `aplicarEscandallos` (`lib/facturacion-campania.ts`),
  puros con tests.
- Volumen por mes desde `metricasDiariasPorCampania` (`medidasPorMes` en
  `facturacionCompleta`), sin consultas nuevas.
- Pantallas:
  - «Precio por tramos» en Artículos y tarifas (acción `guardarTramosTarifa`,
    auditada).
  - Tarjeta del escandallo en la Factura (`resumen-escandallos.tsx`).
  - Globo del importe en `tabla-factura.tsx`.
- Todo explicado en `facturacion-tarificacion.md` §6.
- 440 tests, `tsc` y ESLint en verde.

### Ayuda dentro del panel (pedida después)

- «Escandallo (precio por tramos)» en el glosario único (`lib/glosario.ts`),
  en lenguaje llano y con el de Ávolo; «Artículos de GS» lo menciona.
- `components/punto-glosario.tsx`: un «?» con globo que enseña cualquier
  término del glosario (el mismo texto que el glosario del pie). Va junto a
  «Precio por tramos» en Artículos y tarifas y en la tarjeta de la Factura.
- Glosario al pie de Artículos y tarifas (no tenía) y «Escandallo» en el de
  la Factura (`GLOSARIO_OPERACIONES`).
- Desplegado a las 12:53 (`5142e9c`, backup `dashboard_20261118_1250.db`).

## 3. Comprobaciones

- **En desarrollo**: una copia de la SQLite (la original no se tocó) con la
  migración aplicada por el propio arranque, los tramos puestos y RDBv2 real.
  - Ávolo agosto, septiembre (500), octubre (444) y 1-17/11 (313): siempre a
    4,00 €, el mismo importe que con el precio fijo.
  - El rango del 01/09 al 17/11 (1.257) se calcula mes a mes y también sale a
    4,00 €.
- **En producción**, desde `tareas` y con la cadena de la página
  (`facturacionCompleta`): octubre 444 × 4 = 1.776 €, noviembre (1-17)
  313 × 4 = 1.252 €.

## 4. Operaciones en producción

| Hora | Qué | Backup |
| ---- | --- | ------ |
| 12:07-12:10 | Despliegue de `92a656f`. La migración 0017 entró al arrancar (18 migraciones, columna `tramos`) | `dashboard_20261118_1207.db` |
| 12:12 | Tramos dados de alta en la línea 17 (Ávolo, `leads`, 4 €) con su fila en `audit_log` («Claude (pedido por Christian)»). Antes se comprobó que la línea seguía siendo la de la copia de desarrollo | el de las 12:07 |
| 12:24-12:27 | Despliegue de `25b5cd3` y precalentado relanzado (94 s, 121 consultas, 0 fallos) | `dashboard_20261118_1224.db` |

Los tramos se guardaron directamente en la SQLite (por `docker compose exec
tareas`), no desde la pantalla, porque no había sesión en el panel. Se hizo
lo mismo que la acción de la pantalla: la misma columna y el mismo formato
de auditoría.

## 5. Incidencias

- **«Faltan 156 para bajar a 4,00 €»**: con la primera versión, la tarjeta
  apuntaba al tramo de 600, que vale lo mismo que la base. Se vio al
  comprobarlo en producción, antes de que nadie lo usara. Arreglado en
  `25b5cd3`: apunta al primer tramo que cambia el precio («faltan 356 para
  bajar a 3,75 €»).
- **Lectura de producción denegada**: al hacer la propuesta, el permiso para
  leer la SQLite del servidor se denegó. Se trabajó con la copia de
  desarrollo y se comprobó en producción tras el ok de Christian.
- **La migración choca con la columna añadida a mano**: en la primera prueba
  se añadió `tramos` a la copia antes de arrancar, y la migración falló con
  «duplicate column name». Se rehízo la copia y se dejó que la migración la
  añadiera, como en producción.

## 6. Pendiente

- **Verlo en el navegador**: Artículos y tarifas (desplegable de la línea de
  Ávolo, «?» y glosario) y la Factura de Ávolo (tarjeta, «?» y globo del
  importe).
- **Confirmar con GS** que su tarifa de Ávolo aplica el mismo escandallo: el
  fichero de albaranes solo lleva cantidades.
- **DDIs de Ávolo**: su tarifa tiene la línea de DDIs a 3,30 € y en la factura
  de octubre no suma nada (el total son solo los finalizados). Sin investigar:
  quizá no tiene DDIs dados de alta en Operaciones → DDIs.
- En `registro-sesiones.md` falta la fila de la sesión 37 en la tabla de
  resumen (es de otra sesión; su apartado sí está).
