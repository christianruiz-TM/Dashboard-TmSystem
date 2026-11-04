# Avisos de Windows de la campana de alertas

La campana de alertas de la barra de arriba (desde el 04/11/2026) puede sacar
una notificación de Windows cuando aparece una alerta nueva, aunque estés en
otra aplicación. Para eso el navegador exige un **contexto seguro** (HTTPS), y
el panel va por **HTTP** en la red interna (`http://192.168.151.38:8081`).

Mientras no haya HTTPS, hay que decirle al navegador de cada PC que trate esa
dirección como segura. Es **un paso de una vez por equipo**, igual que en la
herramienta de tickets (`docs/deployment/NOTIFICACIONES-ESCRITORIO.md` de
Tickets-TmSystem).

> Sin este paso funcionan igual el **sonido**, el **número en el título** de la
> pestaña y el **punto rojo en su icono**. Todo necesita el panel abierto en
> alguna pestaña, aunque esté minimizada. Y el navegador no deja sonar nada
> hasta el **primer clic** en la página después de abrirla.

## Chrome y Edge

### Opción A: directiva del navegador (todo el PC; recomendada)

Para todos los usuarios del PC. Requiere permisos de administrador. Abrir
**Símbolo del sistema como administrador** y ejecutar las líneas del navegador
que se use. Ponen las dos direcciones (tickets en la `1` y el panel en la `2`),
así sirven para las dos herramientas:

```bat
reg add "HKLM\SOFTWARE\Policies\Google\Chrome\OverrideSecurityRestrictionsOnInsecureOrigin" /v 1 /t REG_SZ /d "http://192.168.151.38:8080" /f
reg add "HKLM\SOFTWARE\Policies\Google\Chrome\OverrideSecurityRestrictionsOnInsecureOrigin" /v 2 /t REG_SZ /d "http://192.168.151.38:8081" /f
reg add "HKLM\SOFTWARE\Policies\Microsoft\Edge\OverrideSecurityRestrictionsOnInsecureOrigin" /v 1 /t REG_SZ /d "http://192.168.151.38:8080" /f
reg add "HKLM\SOFTWARE\Policies\Microsoft\Edge\OverrideSecurityRestrictionsOnInsecureOrigin" /v 2 /t REG_SZ /d "http://192.168.151.38:8081" /f
```

Si el PC ya tenía la de tickets en la `1`, la primera línea de cada navegador
no cambia nada. Cerrar el navegador del todo y volver a abrirlo. Comprobación:
`chrome://policy` (o `edge://policy`) muestra
`OverrideSecurityRestrictionsOnInsecureOrigin` con las dos direcciones.

Para quitar solo la del panel:

```bat
reg delete "HKLM\SOFTWARE\Policies\Google\Chrome\OverrideSecurityRestrictionsOnInsecureOrigin" /v 2 /f
reg delete "HKLM\SOFTWARE\Policies\Microsoft\Edge\OverrideSecurityRestrictionsOnInsecureOrigin" /v 2 /f
```

### Opción B: ajuste experimental (solo tu usuario, sin administrador)

1. Abrir `chrome://flags/#unsafely-treat-insecure-origin-as-secure` (en Edge,
   `edge://flags/#unsafely-treat-insecure-origin-as-secure`).
2. En el cuadro de texto, escribir
   `http://192.168.151.38:8080,http://192.168.151.38:8081`.
3. Cambiar el desplegable a **Enabled** y pulsar **Relaunch**.

Los *flags* pueden desaparecer con una actualización del navegador: la opción A
es más estable.

## Firefox

`dom.securecontext.allowlist` lleva **solo la dirección, sin `http://` ni
puerto**: `192.168.151.38` (vale para tickets y para el panel). Los pasos son
los de la guía de tickets.

## Activarlos en el panel

1. Entrar en el panel y pulsar la **campana** de la barra de arriba.
2. Abajo debe poner **«Activar los avisos de Windows en este navegador»** (si
   pone «hay que activarlos una vez en este PC», el paso anterior no ha surtido
   efecto: cerrar el navegador del todo y volver a abrirlo).
3. Pulsarlo y aceptar el permiso que pide el navegador. Debe quedar «Avisos de
   Windows activados en este navegador».

Si Windows no los enseña: *Configuración → Sistema → Notificaciones*, que el
navegador tenga permiso y que «No molestar» esté desactivado.

## Por qué es razonable

Marcar la dirección como segura solo habilita, para esa dirección, funciones
que el navegador reserva a HTTPS (notificaciones, entre otras). No cambia lo que
viaja por la red. **El día que el panel tenga HTTPS (mejora 10 de CLAUDE.md),
quitar la directiva.**
