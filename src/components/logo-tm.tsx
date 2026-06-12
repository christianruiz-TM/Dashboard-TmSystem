import { cn } from "@/lib/utils";

/**
 * Logotipo provisional de TmSystem (texto). Cuando Christian facilite el
 * archivo del logo real, colocarlo en /public/logo.svg y sustituir aquí.
 */
export function LogoTm({
  className,
  claro = false,
}: {
  className?: string;
  claro?: boolean;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2 select-none", className)}>
      <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground text-sm font-extrabold tracking-tight">
        TM
      </span>
      <span
        className={cn(
          "text-lg font-semibold tracking-tight",
          claro ? "text-sidebar-foreground" : "text-foreground",
        )}
      >
        System
        <span className="ml-2 align-middle text-[10px] font-medium uppercase tracking-widest opacity-60">
          Dashboard
        </span>
      </span>
    </span>
  );
}
