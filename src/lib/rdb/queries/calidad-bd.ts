import type { FilaContactos, FilaIntentos } from "@/lib/calidad-bd";
import { hoyISO } from "@/lib/fechas";
import { conCache, TTL, ttlSegunRango } from "../cache";
import { esMock, obtenerPool, sql } from "../pool";
import { claveCampanias, filtroCampanias, limitesRango } from "./util";

// ============================================================
// Calidad de la base de datos (21/10/2026): intentos SALIENTES por resultado
// (termination_state), por campaña y día, y contactos distintos llamados por
// campaña. El cálculo (porcentajes, grupos, evolución) está en
// lib/calidad-bd.ts. Fuera, ya en el SQL, lo que no es un intento de la base
// de datos: sin resultado (NULL o -1), abandonadas (6), redirigidas (11),
// canceladas (17) y reencoladas (18).
// ============================================================

export interface DatosCalidadBd {
  filas: FilaIntentos[];
  contactos: FilaContactos[];
}

async function calidadCore(desdeISO: string, hastaISO: string, campanias?: string[]): Promise<DatosCalidadBd> {
  const pool = await obtenerPool();
  const { desde, hastaExcl } = limitesRango(desdeISO, hastaISO);

  const reqFilas = pool.request();
  reqFilas.input("desde", sql.DateTime, desde);
  reqFilas.input("hastaExcl", sql.DateTime, hastaExcl);
  const filtroFilas = filtroCampanias(reqFilas, campanias, "c.shortname");
  const reqContactos = pool.request();
  reqContactos.input("desde", sql.DateTime, desde);
  reqContactos.input("hastaExcl", sql.DateTime, hastaExcl);
  const filtroContactos = filtroCampanias(reqContactos, campanias, "c.shortname");

  const condicion = `t.start_time >= @desde AND t.start_time < @hastaExcl
        AND t.origin = 2
        AND t.termination_state IS NOT NULL AND t.termination_state >= 0
        AND t.termination_state NOT IN (6, 11, 17, 18)`;

  const [rFilas, rContactos] = await Promise.all([
    reqFilas.query(`
      -- Intentos salientes por campaña, día y resultado
      SELECT RTRIM(c.shortname)                     AS campania,
             CONVERT(varchar(10), t.start_time, 23) AS dia,
             t.termination_state                    AS estado,
             COUNT(*)                               AS intentos
      FROM itr_thread t
      INNER JOIN ph_campaign c ON t.campaign = c.code
      WHERE ${condicion}${filtroFilas}
      GROUP BY RTRIM(c.shortname), CONVERT(varchar(10), t.start_time, 23), t.termination_state;
    `),
    reqContactos.query(`
      -- Contactos distintos llamados por campaña (itr_thread.contact = activity)
      SELECT RTRIM(c.shortname) AS campania, COUNT(DISTINCT t.contact) AS contactos
      FROM itr_thread t
      INNER JOIN ph_campaign c ON t.campaign = c.code
      WHERE ${condicion} AND t.contact IS NOT NULL${filtroContactos}
      GROUP BY RTRIM(c.shortname);
    `),
  ]);
  return {
    filas: rFilas.recordset as FilaIntentos[],
    contactos: rContactos.recordset as FilaContactos[],
  };
}

/** Datos inventados del modo demo: reparto parecido al de Socios. */
function mockCalidad(desdeISO: string, hastaISO: string, campanias?: string[]): DatosCalidadBd {
  const nombres = campanias && campanias.length > 0 ? campanias.slice(0, 6) : ["Demo_Saliente_1", "Demo_Saliente_2", "Demo_BBDD_1"];
  const reparto: [number, number][] = [
    [1, 80],
    [4, 6],
    [2, 6],
    [3, 2],
    [8, 4],
    [7, 3],
    [10, 0.4],
  ];
  const filas: FilaIntentos[] = [];
  const contactos: FilaContactos[] = [];
  for (let d = new Date(`${desdeISO}T00:00:00`); d <= new Date(`${hastaISO}T00:00:00`); d.setDate(d.getDate() + 1)) {
    if (d.getDay() === 0 || d.getDay() === 6) continue;
    const dia = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    nombres.forEach((campania, i) => {
      const base = 200 + i * 90 + (d.getDate() % 5) * 15;
      for (const [estado, p] of reparto) {
        const peso = estado === 8 ? p * (1 + i) : p;
        filas.push({ campania, dia, estado, intentos: Math.max(0, Math.round((base * peso) / 100)) });
      }
    });
  }
  nombres.forEach((campania) => {
    const total = filas.filter((f) => f.campania === campania).reduce((a, f) => a + f.intentos, 0);
    contactos.push({ campania, contactos: Math.round(total / 2.4) });
  });
  return { filas, contactos };
}

/** Intentos salientes por resultado en un rango (hoy: caché de 60 s, como Supervisión). */
export async function calidadBaseDatosRango(desdeISO: string, hastaISO: string, campanias?: string[]): Promise<DatosCalidadBd> {
  if (esMock()) return mockCalidad(desdeISO, hastaISO, campanias);
  const ttl = hastaISO >= hoyISO() ? TTL.supervision : ttlSegunRango(hastaISO);
  return conCache(`rdb:calidadBd:${desdeISO}:${hastaISO}:${claveCampanias(campanias)}`, ttl, () =>
    calidadCore(desdeISO, hastaISO, campanias),
  );
}
