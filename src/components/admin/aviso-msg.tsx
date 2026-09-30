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
