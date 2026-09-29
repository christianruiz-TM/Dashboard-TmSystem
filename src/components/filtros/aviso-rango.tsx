import { Alert, AlertDescription } from "@/components/ui/alert";

/**
 * Aviso cuando el rango de la URL no es válido (fecha inexistente, invertido o
 * más largo que MAX_DIAS_RANGO) y la vista cae al rango por defecto. Sin él,
 * el cambio de fechas pasaba en silencio y parecía que el panel ignoraba el filtro.
 */
export function AvisoRango({ motivo, alternativa }: { motivo: string | null; alternativa: string }) {
  if (!motivo) return null;
  return (
    <Alert>
      <AlertDescription>
        {motivo}. Se muestra {alternativa}.
      </AlertDescription>
    </Alert>
  );
}
