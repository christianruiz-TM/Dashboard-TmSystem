/**
 * Capturas numeradas de la ayuda de planificación (public/ayuda/*.webp y
 * src/components/planificacion/ayuda-capturas.json), hechas en MODO DEMO para
 * que no salga ningún nombre real.
 *
 * Uso (con el servidor en modo demo sobre una SQLite de demo, nunca la real):
 *   RDB_MOCK=1 SQLITE_PATH=./data/demo.db npx next start -p 3200
 *   node scripts/ayuda-capturas.mjs --base http://localhost:3200 --sqlite ./data/demo.db [--mes 2026-10] [--solo hoy,saldos]
 *
 * Abre Chrome sin ventana (CDP), entra como un usuario de supervisión (crea y
 * borra una sesión en esa SQLite), recorre cada pantalla y apunta dónde cae
 * cada número del «¿Qué veo aquí?» de ayuda-contenido.ts. Si una pantalla
 * cambia, se vuelve a lanzar: el test de la ayuda comprueba que los números
 * coinciden con los textos.
 */
import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import Database from "better-sqlite3";

const argumento = (n, def) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 ? process.argv[i + 1] : def;
};
const BASE = argumento("base", "http://localhost:3200");
const SQLITE = argumento("sqlite");
const MES = argumento("mes", "2026-10");
const SOLO = argumento("solo")?.split(",");
const CHROME = argumento(
  "chrome",
  ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].find(existsSync),
);
const ANCHO = 1280;
const RAIZ = resolve(import.meta.dirname, "..");
const SALIDA_IMG = join(RAIZ, "public", "ayuda");
const SALIDA_JSON = join(RAIZ, "src", "components", "planificacion", "ayuda-capturas.json");

if (!SQLITE || basename(SQLITE) === "dashboard.db") {
  console.error("Hace falta --sqlite con la SQLite del MODO DEMO (nunca data/dashboard.db, que tiene nombres reales).");
  process.exit(1);
}
if (!CHROME) {
  console.error("No encuentro Chrome ni Edge: pásalo con --chrome <ruta>.");
  process.exit(1);
}

/**
 * Cada pantalla: dirección, hasta dónde se recorta (px desde arriba del
 * contenido) y qué señala cada número, en el orden de su «¿Qué veo aquí?».
 * `t` = texto con el que EMPIEZA el elemento (el más interior), `sel` = en qué
 * etiquetas buscar, `css` = selector directo, `n` = cuál de ellos; `arriba`
 * pone el número encima (en las cabeceras de tabla, a la izquierda taparía la
 * columna de al lado) y `centro`, en el centro.
 */
/** Títulos de las tarjetas (para no confundirlos con un texto que empiece igual). */
const TITULO = "[data-slot=card-title]";

const PANTALLAS = [
  {
    id: "inicio",
    ruta: "/planificacion",
    alto: 1150,
    puntos: [{ t: "Hoy", sel: "a,button", arriba: true }, { t: "Estado de los datos", sel: TITULO }, { t: "Meses", sel: TITULO }, { t: "Ver tablero", sel: "a,button", arriba: true }],
  },
  {
    id: "tablero",
    ruta: `/planificacion/${MES}?vista=agente`,
    espera: `document.querySelectorAll("[data-bloque-id]").length > 10`,
    alto: 1250,
    puntos: [
      { css: "h1" },
      { t: "Agente", sel: "button,a,[role=tab],[role=radio]" },
      { t: "Horas del mes frente a bolsas" },
      { t: "Agentes en" },
      { css: "[data-bloque-id]" },
    ],
  },
  {
    id: "versiones",
    ruta: `/planificacion/${MES}/versiones`,
    alto: 1100,
    puntos: [{ css: "main table" }, { t: "Creada", sel: "th", arriba: true }, { t: "Cambios", sel: TITULO }, { t: "Historial", sel: TITULO }],
  },
  {
    id: "ausencias",
    ruta: `/planificacion/${MES}/ausencias`,
    alto: 1150,
    puntos: [{ t: "Nueva ausencia", sel: TITULO }, { t: "Ausencias de", sel: TITULO }, { t: "Borrar", sel: "button", arriba: true }],
  },
  {
    id: "bolsas",
    ruta: `/planificacion/${MES}/bolsas`,
    alto: 1350,
    puntos: [{ t: "Bolsas de horas", sel: TITULO }, { t: "Confirmar", sel: "button", arriba: true }, { t: "Objetivos semanales de", sel: TITULO }, { t: "Fin estimado" }],
  },
  {
    id: "hoy",
    ruta: "/planificacion/hoy",
    alto: 1250,
    puntos: [
      { t: "Alertas", sel: TITULO },
      { t: "Cobertura de", sel: TITULO },
      { css: "main .relative.h-9" },
      { css: "[title^='Ahora']", centro: true },
    ],
  },
  {
    id: "adherencia",
    ruta: `/planificacion/${MES}/adherencia`,
    alto: 950,
    puntos: [{ t: "Planificado" }, { t: "Adherencia por turno" }, { t: "Adherencia por cliente" }, { t: "Por agente", sel: TITULO }],
  },
  {
    id: "saldos",
    ruta: `/planificacion/${MES}/saldos`,
    // más ancha: con 1.280 px la tabla no cabe y la última columna sale cortada
    ancho: 1560,
    alto: 2200,
    puntos: [
      { t: "Saldo por agente y semana", sel: TITULO },
      { t: "Arrastre", sel: "th", arriba: true },
      { t: "Previsto a fin de mes", sel: "th", arriba: true },
      { t: "Detalle por día", sel: TITULO },
      { t: "Ajustes manuales", sel: TITULO },
    ],
  },
  {
    id: "cierre",
    ruta: `/planificacion/${MES}/cierre`,
    alto: 1300,
    puntos: [
      { t: "Por cliente", sel: TITULO },
      { t: "Real (logado)", sel: "th", arriba: true },
      { t: "Grupo GH", sel: "td" },
      { t: "XLSX", sel: "a,button", arriba: true },
      { t: "Por usuario", sel: TITULO },
    ],
  },
  {
    id: "configuracion",
    ruta: "/planificacion/configuracion/agentes",
    alto: 900,
    puntos: [{ t: "Clientes", sel: "a" }, { t: "Contrato", sel: "th", arriba: true }, { t: "Turno", sel: "th", arriba: true }],
  },
];

// ---------- Chrome (CDP mínimo, sin dependencias) ----------

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

async function lanzarChrome(puerto, perfil) {
  const proc = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${puerto}`, `--user-data-dir=${perfil}`, "--no-first-run", "--disable-gpu", "about:blank"], {
    stdio: "ignore",
  });
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(`http://127.0.0.1:${puerto}/json/version`)).ok) return proc;
    } catch {
      /* aún no */
    }
    await dormir(200);
  }
  throw new Error("Chrome no arranca");
}

async function pestana(puerto) {
  const info = await (await fetch(`http://127.0.0.1:${puerto}/json/new?about:blank`, { method: "PUT" })).json();
  const ws = new WebSocket(info.webSocketDebuggerUrl);
  await new Promise((ok, mal) => {
    ws.onopen = ok;
    ws.onerror = mal;
  });
  let id = 0;
  const pendientes = new Map();
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (!m.id || !pendientes.has(m.id)) return;
    const { ok, mal } = pendientes.get(m.id);
    pendientes.delete(m.id);
    if (m.error) mal(new Error(m.error.message));
    else ok(m.result);
  };
  const enviar = (method, params = {}) =>
    new Promise((ok, mal) => {
      pendientes.set(++id, { ok, mal });
      ws.send(JSON.stringify({ id, method, params }));
    });
  const evaluar = async (expr) => {
    const r = await enviar("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result.value;
  };
  const esperar = async (expr, ms = 20000) => {
    for (const t0 = Date.now(); Date.now() - t0 < ms; await dormir(150)) {
      try {
        if (await evaluar(expr)) return;
      } catch {
        /* navegando */
      }
    }
    throw new Error(`Tiempo agotado esperando: ${expr}`);
  };
  return { enviar, evaluar, esperar, cerrar: () => ws.close() };
}

// ---------- Sesión de supervisión en la SQLite de demo ----------

const db = new Database(SQLITE);
const usuario = db.prepare("SELECT id, username FROM users WHERE rol = 'supervision' AND activo = 1 ORDER BY id LIMIT 1").get();
if (!usuario) {
  console.error("La SQLite de demo no tiene ningún usuario de supervisión activo.");
  process.exit(1);
}
const token = randomBytes(32).toString("base64url");
const hash = createHash("sha256").update(token).digest("hex");
const ahora = Math.floor(Date.now() / 1000);
db.prepare("INSERT INTO sessions (token_hash, user_id, expires_at, ip, user_agent, created_at) VALUES (?, ?, ?, NULL, 'capturas de la ayuda', ?)").run(
  hash,
  usuario.id,
  ahora + 3600,
  ahora,
);

// ---------- Capturas ----------

const perfil = join(tmpdir(), `ayuda-capturas-${process.pid}`);
const chrome = await lanzarChrome(9420, perfil);
const t = await pestana(9420);
const salida = existsSync(SALIDA_JSON) ? JSON.parse(readFileSync(SALIDA_JSON, "utf8")) : {};
mkdirSync(SALIDA_IMG, { recursive: true });

// Busca el elemento visible más interior cuyo texto empieza por `t` (o el selector `css`)
const BUSCAR = `(p) => {
  const visibles = (l) => [...l].filter((e) => e.getClientRects().length > 0);
  if (p.css) return visibles(document.querySelectorAll(p.css))[p.n ?? 0] ?? null;
  const c = visibles(document.querySelectorAll(p.sel ?? "*")).filter((e) => (e.textContent ?? "").trim().startsWith(p.t));
  const hojas = c.filter((e) => !c.some((o) => o !== e && e.contains(o)));
  return hojas[p.n ?? 0] ?? null;
}`;

let fallos = 0;
try {
  await t.enviar("Page.enable");
  await t.enviar("Network.setCookie", { name: "tm_sesion", value: token, url: BASE, httpOnly: true });
  for (const p of PANTALLAS.filter((x) => !SOLO || SOLO.includes(x.id))) {
    const ancho = p.ancho ?? ANCHO;
    await t.enviar("Emulation.setDeviceMetricsOverride", { width: ancho, height: 1000, deviceScaleFactor: 1, mobile: false });
    await t.enviar("Page.navigate", { url: `${BASE}${p.ruta}` });
    await dormir(500);
    await t.esperar(`document.readyState === "complete"`);
    if ((await t.evaluar("location.pathname")) === "/login") throw new Error("La sesión no vale: ¿es la SQLite del servidor?");
    await t.esperar(`!!document.querySelector("main h1")`);
    if (p.espera) await t.esperar(p.espera);
    // Página entera a la vista (hasta 2.400 px) para recortar sin desplazar
    const altoPagina = await t.evaluar(`Math.min(document.documentElement.scrollHeight, 2400)`);
    await t.enviar("Emulation.setDeviceMetricsOverride", { width: ancho, height: altoPagina, deviceScaleFactor: 1, mobile: false });
    await dormir(700);
    const datos = await t.evaluar(`(() => {
      const buscar = ${BUSCAR};
      const main = document.querySelector("main").getBoundingClientRect();
      const clip = { x: Math.round(main.left), y: Math.round(main.top), ancho: Math.round(main.width), alto: Math.round(Math.min(main.height, ${p.alto})) };
      const puntos = ${JSON.stringify(p.puntos)}.map((q, i) => {
        const e = buscar(q);
        if (!e) return { n: i + 1, falta: q.t ?? q.css };
        const r = e.getBoundingClientRect();
        // a la izquierda del elemento, sin taparle la primera letra (o encima, o en el centro)
        const x = q.centro || q.arriba ? r.left + r.width / 2 : r.left - 16;
        const y = q.arriba ? r.top - 6 : q.centro ? r.top + 12 : r.top + Math.min(r.height / 2, 14);
        return { n: i + 1, x: Math.round(Math.max(14, Math.min(clip.ancho - 14, x - clip.x))), y: Math.round(Math.max(14, Math.min(clip.alto - 14, y - clip.y))) };
      });
      return { clip, puntos };
    })()`);
    const faltan = datos.puntos.filter((q) => q.falta);
    if (faltan.length > 0) {
      fallos++;
      console.error(`✗ ${p.id}: no encuentro ${faltan.map((q) => `${q.n} («${q.falta}»)`).join(", ")}`);
      continue;
    }
    const { clip } = datos;
    const img = await t.enviar("Page.captureScreenshot", {
      format: "webp",
      quality: 82,
      clip: { x: clip.x, y: clip.y, width: clip.ancho, height: clip.alto, scale: 1 },
    });
    writeFileSync(join(SALIDA_IMG, `${p.id}.webp`), Buffer.from(img.data, "base64"));
    salida[p.id] = { src: `/ayuda/${p.id}.webp`, ancho: clip.ancho, alto: clip.alto, puntos: datos.puntos };
    console.log(`✓ ${p.id}: ${clip.ancho}×${clip.alto}, ${datos.puntos.length} puntos`);
  }
  writeFileSync(SALIDA_JSON, `${JSON.stringify(salida, null, 2)}\n`);
} finally {
  t.cerrar();
  chrome.kill();
  db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(hash);
  db.close();
  await dormir(500);
  try {
    rmSync(perfil, { recursive: true, force: true });
  } catch {
    /* Chrome aún lo tiene abierto: es una carpeta temporal */
  }
}
if (fallos > 0) process.exit(1);
