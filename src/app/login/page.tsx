import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LogoTm } from "@/components/logo-tm";
import { RUTA_POR_ROL } from "@/lib/auth/rbac";
import { obtenerSesion } from "@/lib/auth/session";
import { iniciarSesion } from "./actions";

export const metadata: Metadata = { title: "Acceso" };

const MENSAJES_ERROR: Record<string, string> = {
  credenciales: "Usuario o contraseña incorrectos.",
  bloqueado: "Demasiados intentos fallidos. Inténtalo de nuevo en unos minutos.",
  datos: "Revisa los datos introducidos.",
};

export default async function PaginaLogin({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; min?: string }>;
}) {
  // Si la sesión es REALMENTE válida (validada contra BBDD), al dashboard.
  // Si la cookie está caducada, obtenerSesion devuelve null → se muestra el
  // formulario (sin bucle de redirección).
  const usuario = await obtenerSesion();
  if (usuario) redirect(RUTA_POR_ROL[usuario.rol]);

  const { error, min } = await searchParams;
  const mensaje =
    error === "bloqueado" && min
      ? `Demasiados intentos fallidos. Vuelve a intentarlo en ${min} min.`
      : error
        ? MENSAJES_ERROR[error]
        : null;

  return (
    <div className="flex flex-1 items-center justify-center bg-primary p-4">
      <Card className="w-full max-w-sm border-none shadow-2xl">
        <CardHeader className="items-center text-center">
          <LogoTm className="mb-2" />
          <CardTitle className="text-xl">Acceso al dashboard</CardTitle>
          <CardDescription>
            El primer Contact Center que te hace sonreír
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={iniciarSesion} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">Usuario</Label>
              <Input
                id="username"
                name="username"
                autoComplete="username"
                autoFocus
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Contraseña</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
              />
            </div>
            {mensaje ? (
              <Alert variant="destructive">
                <AlertDescription>{mensaje}</AlertDescription>
              </Alert>
            ) : null}
            <Button type="submit" className="w-full">
              Entrar
            </Button>
          </form>
          <p className="mt-4 text-center text-xs text-muted-foreground">
            Acceso restringido. Si necesitas una cuenta, contacta con el
            departamento de TI de TmSystem.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
