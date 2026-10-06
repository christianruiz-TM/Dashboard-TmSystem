import { NextResponse, type NextRequest } from "next/server";
import { ipPeticion, registrarAuditoria } from "@/lib/auth/audit";
import { ROLES_PLAN_LECTURA } from "@/lib/auth/rbac";
import { obtenerSesion } from "@/lib/auth/session";
import { FORMATO_2_DECIMALES, generarXlsxHojas, respuestaXlsx } from "@/lib/export/xlsx";
import { cierreMes } from "@/lib/planificacion/seguimiento";

/**
 * XLSX del cierre de mes de planificación: una hoja por cliente (y grupos
 * que comparten bolsa) y otra por usuario. Valores EXACTOS con formato de 2
 * decimales: la suma de las filas en Excel cuadra con el total.
 */
export async function GET(peticion: NextRequest) {
  const usuario = await obtenerSesion();
  if (!usuario || (usuario.rol !== "admin" && !ROLES_PLAN_LECTURA.includes(usuario.rol))) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const mes = peticion.nextUrl.searchParams.get("mes") ?? "";
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) {
    return NextResponse.json({ error: "Mes no válido (YYYY-MM)" }, { status: 400 });
  }
  try {
    const d = await cierreMes(mes);
    registrarAuditoria({
      accion: "export",
      userId: usuario.id,
      username: usuario.username,
      detalle: `planificacion cierre xlsx ${mes}`,
      ip: await ipPeticion(),
    });
    const h = { formato: FORMATO_2_DECIMALES };
    const contenido = await generarXlsxHojas([
      {
        nombre: "Clientes",
        columnas: [
          { cabecera: "Cliente", clave: "cliente", ancho: 12 },
          { cabecera: "Nombre", clave: "nombre", ancho: 32 },
          { cabecera: "Bolsa (h)", clave: "bolsa", ...h },
          { cabecera: "Planificado (h)", clave: "planificado", ...h },
          { cabecera: "Real logado (h)", clave: "real", ...h },
          { cabecera: "Real − bolsa (h)", clave: "difBolsa", ...h },
          { cabecera: "Real − planificado (h)", clave: "difPlan", ...h },
        ],
        filas: [
          ...d.filas.map((f) => {
            const conGrupo = d.grupos.some((g) => g.cabeza === f.cliente);
            return {
              cliente: f.cliente,
              nombre: f.cuentaComo ? `${f.nombre} (bolsa de ${f.cuentaComo})` : f.nombre,
              bolsa: f.bolsaH,
              planificado: f.planificadoH,
              real: f.realH,
              difBolsa: f.bolsaH != null && !conGrupo ? f.realH - f.bolsaH : null,
              difPlan: f.realH - f.planificadoH,
            };
          }),
          ...d.grupos.map((g) => ({
            cliente: `Grupo ${g.cabeza}`,
            nombre: g.miembros.join(" + "),
            bolsa: g.bolsaH,
            planificado: g.planificadoH,
            real: g.realH,
            difBolsa: g.bolsaH != null ? g.realH - g.bolsaH : null,
            difPlan: g.realH - g.planificadoH,
          })),
        ],
      },
      {
        nombre: "Usuarios",
        columnas: [
          { cabecera: "Usuario", clave: "usrName", ancho: 22 },
          { cabecera: "Cliente", clave: "cliente", ancho: 12 },
          { cabecera: "Agente", clave: "agenteNumero", ancho: 10 },
          { cabecera: "Horas logadas", clave: "realH", ...h },
        ],
        filas: d.usuarios,
      },
    ]);
    return respuestaXlsx(`cierre_planificacion_${mes}${d.cerrado ? "" : `_hasta_${d.hasta}`}.xlsx`, contenido);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Error preparando el cierre" }, { status: 502 });
  }
}
