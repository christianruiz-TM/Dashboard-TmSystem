import { cn } from "@/lib/utils";

/**
 * Logotipo TmSystem reproducido en CSS/SVG a partir del banner de marca:
 * "tm" en negrita + "system" fino, sonrisa amarilla bajo "tm" y el
 * subtítulo CONTACT CENTER. `claro` = versión para fondos oscuros (sidebar).
 */
export function LogoTm({
  className,
  claro = false,
}: {
  className?: string;
  claro?: boolean;
}) {
  return (
    <span className={cn("inline-flex select-none flex-col leading-none", className)}>
      <span
        className={cn(
          "flex items-baseline text-xl tracking-tight",
          claro ? "text-sidebar-foreground" : "text-foreground",
        )}
      >
        <span className="relative font-extrabold">
          tm
          {/* Sonrisa amarilla bajo "tm" */}
          <svg
            viewBox="0 0 32 8"
            className="absolute -bottom-1.5 left-0 w-full"
            aria-hidden="true"
          >
            <path
              d="M2 1.5 Q16 9 30 1.5"
              fill="none"
              stroke="var(--primary)"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
          </svg>
        </span>
        <span className="font-light">system</span>
      </span>
      <span
        className={cn(
          "mt-1.5 text-[7px] font-semibold uppercase tracking-[0.28em]",
          claro ? "text-sidebar-foreground/60" : "text-muted-foreground",
        )}
      >
        Contact Center
      </span>
    </span>
  );
}
