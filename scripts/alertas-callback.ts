/**
 * Alerta «callback sin funcionar» (12/11/2026): si un cliente con callback
 * tiene N llamadas rechazadas seguidas en horario sin ninguna ficha de
 * callback, abre un ticket en la herramienta de tickets por su API (si falla,
 * correo de aviso al destinatario de Administración → Callback). Como mucho
 * uno por cliente y día. La campana del panel enseña la misma alerta.
 *
 * Corre cada 10 minutos de 08:00 a 21:50, de lunes a sábado (docker/crontab,
 * servicio `tareas`; hora de Madrid).
 *
 * Uso:
 *   npm run alertas:callback
 *   ... --simular     dice qué enviaría, sin enviar ni apuntar nada
 *
 * Sale con código 1 si falla la consulta o algún envío.
 */
export {};

async function main() {
  try {
    process.loadEnvFile();
  } catch {
    /* sin .env */
  }
  const { enviarTicketsCallback, configCallback } = await import("../src/lib/callback-servidor");
  const simular = process.argv.includes("--simular");
  const config = configCallback();
  if (config.servicios.length === 0) {
    console.log("[callback] ningún cliente con callback configurado (Administración → Callback)");
    return 0;
  }
  const r = await enviarTicketsCallback({ simular });
  const hora = new Date().toLocaleTimeString("es-ES");
  if (r.alertas.length === 0) {
    console.log(`[callback] ${hora} sin alertas (${config.servicios.map((s) => s.servicio).join(", ")})`);
  }
  for (const a of r.alertas) {
    console.log(`[callback] ${hora} ${a.servicio}: ${a.rechazadas} rechazadas desde ${a.desde} sin ficha (última: ${a.ultimaFicha ?? "ninguna hoy"})`);
  }
  for (const e of r.enviados) console.log(`[callback] ${simular ? "haría" : "hecho"}: ${e}`);
  if (r.yaEnviados.length) console.log(`[callback] ya enviado hoy: ${r.yaEnviados.join(", ")}`);
  for (const e of r.errores) console.error(`[callback] ERROR ${e}`);
  return r.errores.length > 0 ? 1 : 0;
}

main()
  .then((codigo) => process.exit(codigo))
  .catch((e) => {
    console.error("[callback] ERROR", e instanceof Error ? e.message : e);
    process.exit(1);
  });
