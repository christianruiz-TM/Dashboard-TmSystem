"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * Check «Incluir IVR en los datos». Por defecto DESACTIVADO: las campañas IVR
 * (automáticas) no se cuentan en los KPIs. Al marcarlo se añaden, vía `?ivr=1`.
 */
export function SelectorIvr({ incluir }: { incluir: boolean }) {
  const router = useRouter();
  const ruta = usePathname();
  const params = useSearchParams();

  function alternar(activo: boolean) {
    const siguientes = new URLSearchParams(params.toString());
    if (activo) siguientes.set("ivr", "1");
    else siguientes.delete("ivr");
    router.push(`${ruta}?${siguientes.toString()}`);
  }

  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm select-none">
      <input
        type="checkbox"
        className="h-4 w-4 accent-primary"
        checked={incluir}
        onChange={(e) => alternar(e.target.checked)}
      />
      <span className="text-muted-foreground">Incluir campañas IVR en los datos</span>
    </label>
  );
}
