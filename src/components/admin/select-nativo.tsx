import { cn } from "@/lib/utils";

/**
 * <select> nativo con el estilo de los inputs de shadcn. Se usa en los
 * formularios de admin (server-rendered, sin JS de cliente).
 */
export function SelectNativo({
  className,
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "h-8 w-full rounded-md border border-input bg-background px-2.5 text-sm",
        "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 outline-none",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}
