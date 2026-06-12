import type { Metadata } from "next";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LogoTm } from "@/components/logo-tm";
import { requireSesion } from "@/lib/auth/rbac";
import { cambiarPassword } from "./actions";

export const metadata: Metadata = { title: "Cambiar contraseña" };

const MENSAJES_ERROR: Record<string, string> = {
  actual: "La contraseña actual no es correcta.",
  distintas: "Las contraseñas nuevas no coinciden.",
  politica: "Mínimo 10 caracteres combinando letras y números.",
  igual: "La nueva contraseña no puede ser igual a la anterior.",
};

export default async function PaginaCambiarPassword({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const usuario = await requireSesion({ permitirCambioPendiente: true });
  const { error } = await searchParams;

  return (
    <div className="flex flex-1 items-center justify-center bg-gradient-to-b from-sidebar to-primary/80 p-4">
      <Card className="w-full max-w-sm shadow-xl">
        <CardHeader className="items-center text-center">
          <LogoTm className="mb-2" />
          <CardTitle className="text-xl">
            {usuario.mustChangePassword ? "Establece tu contraseña" : "Cambiar contraseña"}
          </CardTitle>
          <CardDescription>
            {usuario.mustChangePassword
              ? "Por seguridad debes cambiar la contraseña inicial antes de continuar."
              : "Introduce tu contraseña actual y la nueva."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={cambiarPassword} className="space-y-4">
            {!usuario.mustChangePassword ? (
              <div className="space-y-2">
                <Label htmlFor="actual">Contraseña actual</Label>
                <Input id="actual" name="actual" type="password" required />
              </div>
            ) : null}
            <div className="space-y-2">
              <Label htmlFor="nueva">Nueva contraseña</Label>
              <Input
                id="nueva"
                name="nueva"
                type="password"
                autoComplete="new-password"
                required
                minLength={10}
              />
              <p className="text-xs text-muted-foreground">
                Mínimo 10 caracteres, con letras y números.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="repetida">Repite la nueva contraseña</Label>
              <Input id="repetida" name="repetida" type="password" required minLength={10} />
            </div>
            {error ? (
              <Alert variant="destructive">
                <AlertDescription>
                  {MENSAJES_ERROR[error] ?? "No se pudo cambiar la contraseña."}
                </AlertDescription>
              </Alert>
            ) : null}
            <Button type="submit" className="w-full">
              Guardar contraseña
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
