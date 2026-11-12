# Sesión 12/11/2026 (Opus 5.5): cuadre de llamadas con Altitude, callback y «Mi servicio»

Petición de Christian: las supervisoras pasaron los informes «GH_General» de
Altitude (01-11/11) porque la caja «Llamadas» no cuadraba. Todo con su OK
antes de programar.

## 1. Cuadre de llamadas (caja 2)

- Cruce fila a fila (hoja «Raw Data - LL», una fila por Interacción Global =
  `itr_global.code`): todo lo del dashboard está en Altitude. Diferencia =
  llamadas que acaban en el IVR (rechazadas o desbordadas sin agentes,
  cuelgues en el menú) − transferencias contadas dos veces. La hoja
  «Presentation» de esos Excel es una tabla dinámica sin refrescar.
- Decidido: una llamada por `itr_global`, también las del IVR, en la campaña
  IVR del cliente («las rechazadas no van a ninguna campaña»); la fila del
  IVR solo con el cliente entero en el alcance; «Incluir IVR» no cambia la
  caja; UGR cuenta sus llamadas del IVR. Sin cambios: gestionadas, reparto
  por agente, % de abandono y el volumen de Dirección.
- `sqlLlamadasPorGlobal` + `campaniasLlamadas`. GH 01-11/11: 7.737 frente a
  7.732 del informe; cada día igual o ±2 (el informe es de 8 a 21 h). Por
  campaña no cuadra (Altitude 781 en IVR_GrupoHuertas, dashboard 422).

## 2. Callback (regla 22 de CLAUDE.md)

- Estudio del 01/09 al 11/11: fichas del IVR (usuario tipo 3, AgentCreation)
  en las campañas de agentes; GH 300, Ávolo 971, CEFF 21.
- **El callback de GH no creó ninguna ficha del 03/07/2026 10:43 al
  26/10/2026 09:23** (~3.450 rechazadas). Christian: «no se apagó».
- Respuestas de Christian: devuelto = tocar la ficha (también sin llamar);
  tiempo solo en horario de atención; el cliente no lo ve; clientes y
  campañas en el admin; alerta con ticket por correo a dtecnico@.
- Hecho: sección en Supervisión (Tiempo real e Histórico) y Dirección,
  `/admin/callback`, alerta en la campana y `npm run alertas:callback` cada
  10 min (crontab). Mediana en horario: GH 2,98 min, Ávolo 11,01, CEFF 4,25.
  Simulada, la alerta salta los 38 días laborables del corte de GH y ninguno
  más.
- La alerta de Ávolo usa la misma definición de ficha (mismas 538 de 731
  perdidas del 01/10 al 12/11).
- «Leads recibidos» sin las altas del IVR: GH octubre 7.943 → 7.875,
  IVR_GrupoHuertas 7.539 → 0.
- Correo: nodemailer con el SMTP de la herramienta de tickets (Gmail de
  dtecnico@), que lee la carpeta «Tickets» e ignora su propio remitente
  (soporte@): el dashboard envía como dtecnico@.

## 3. «Mi servicio» (regla 21)

- Sin «Todas» para clientes con tipos (GH empieza en «Sin BBDD»); horas de
  un tipo = las de Resultados con ese tipo (GH octubre 1.206,16 h en los
  dos); sin horas en las campañas que no se facturan por horas
  (`facturaPorHoras`: las bbdd); sin «por hora» ni gestionadas en la caja de
  llamadas.

## 4. Tests

- El `npm audit fix` del 11/11 subió Vitest a la 5.1.0 y no arrancaba ningún
  test. Causa: la terminal abre el proyecto como «c:\…» y Vitest 5.1 carga
  su runtime dos veces («c:/» y «C:/»). `npm test` usa ahora
  `scripts/test.mjs`, que lo arranca con la unidad en mayúscula: 365 tests.

## Pendientes

- Comprobar que el correo de prueba de Administración → Callback abre un
  ticket (la herramienta lee la carpeta «Tickets» de Gmail: hace falta que
  el correo llegue allí).
- Dar de alta GH, Ávolo (calendario GrupoAvolo) y CEFF (solo
  Curso_maquinista) en Administración → Callback de producción.
- Avisar a quien lleva Altitude del corte del callback de GH (03/07 → 26/10).
- Añadir la fila de esta sesión a `docs/registro-sesiones.md` (tenía cambios
  de otra sesión sin commitear).
