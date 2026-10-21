import { Alert, AlertDescription } from "@/components/ui/alert";

const MENSAJES: Record<string, { texto: string; error: boolean }> = {
  creado: { texto: "Creado correctamente.", error: false },
  guardado: { texto: "Cambios guardados.", error: false },
  borrado: { texto: "Elemento eliminado.", error: false },
  password_reseteada: {
    texto: "Contraseña restablecida: el usuario deberá cambiarla al entrar.",
    error: false,
  },
  error_datos: { texto: "Revisa los datos del formulario.", error: true },
  error_password: {
    texto: "Contraseña inválida: mínimo 10 caracteres con letras y números.",
    error: true,
  },
  error_existe: { texto: "Ya existe un registro con ese nombre.", error: true },
  error_cliente: { texto: "Los usuarios con rol cliente necesitan un cliente asignado.", error: true },
  error_propio: { texto: "No puedes desactivar tu propio usuario.", error: true },
  error_resultados: {
    texto:
      "Esa tabla o columna ya no existe en la centralita, o falta elegir al menos el primer nivel.",
    error: true,
  },
  error_tipos: {
    texto:
      "Revisa los tipos de campaña: una línea por tipo, «Nombre: patrón, patrón» (p. ej. «BBDD: gh_bbdd_%»), sin nombres repetidos.",
    error: true,
  },
  error_campo: {
    texto:
      "Ese campo ya no está en el directorio de contactos del servicio, o falta el nombre que se enseña en pantalla.",
    error: true,
  },
  error_objetivo: {
    texto: "El objetivo necesita al menos un umbral (aprovechamiento, neto o % no válidos) y fechas válidas.",
    error: true,
  },
  error_horas_logadas: {
    texto:
      "Las horas logadas van por servicio (cliente) y necesitan el prefijo de sus usuarios (p. ej. GH).",
    error: true,
  },
};

/**
 * Banner de resultado de las acciones de admin (?msg=...). `detalle` (p. ej.
 * ?detalle=... de la configuración de planificación) precisa qué falló; React
 * lo escapa como texto.
 */
export function AvisoMsg({ msg, detalle }: { msg?: string; detalle?: string }) {
  if (!msg) return null;
  const info = MENSAJES[msg];
  if (!info) return null;
  return (
    <Alert variant={info.error ? "destructive" : "default"}>
      <AlertDescription>
        {info.texto}
        {detalle ? ` ${detalle.slice(0, 300)}` : null}
      </AlertDescription>
    </Alert>
  );
}
