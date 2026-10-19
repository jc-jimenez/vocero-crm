"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * 022 — «¿Olvidaste tu contraseña?». Hasta tres caminos, del más cómodo al de
 * siempre: el enlace por correo (si la instancia tiene el conector), la llave
 * de recuperación (si está puesta en el hosting) y pedírselo al propietario.
 */
export function ForgotPasswordClient({
  mail,
  recoveryKey,
}: {
  mail: boolean;
  recoveryKey: boolean;
}) {
  return (
    <Card className="shadow-md">
      <CardHeader>
        <CardTitle>Recuperar tu contraseña</CardTitle>
        <CardDescription>
          {mail
            ? "Te mandamos un enlace a tu correo para elegir una nueva."
            : "Elige una contraseña nueva con la llave de recuperación de esta instancia."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {mail && <MailForm />}
        {mail ? (
          <details className="group rounded-md border px-3 py-2">
            <summary className="cursor-pointer text-sm font-medium">
              ¿No te llega el correo? Usa la llave de recuperación
            </summary>
            <div className="pt-3">
              {recoveryKey ? <RecoveryKeyForm /> : <RecoveryKeyHelp />}
            </div>
          </details>
        ) : recoveryKey ? (
          <RecoveryKeyForm />
        ) : (
          <RecoveryKeyHelp />
        )}
        <p className="text-sm text-muted-foreground">
          ¿Eres del equipo? Pídele al propietario que te restablezca la
          contraseña desde Ajustes → Equipo.
        </p>
        <p className="text-center text-sm">
          <Link href="/login" className="text-primary hover:underline">
            Volver a iniciar sesión
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}

function MailForm() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error: err } = await authClient.requestPasswordReset({
      email,
      redirectTo: "/reset-password",
    });
    setLoading(false);
    if (err) {
      setError(
        err.status === 429
          ? "Demasiados intentos. Espera unos minutos."
          : "No se pudo mandar el enlace. Intenta de nuevo."
      );
      return;
    }
    setSent(true);
  }

  if (sent) {
    // La misma respuesta exista o no la cuenta (D9).
    return (
      <p className="rounded-md border border-success-soft bg-success-tint p-3 text-sm text-success-text" role="status">
        Si <strong>{email}</strong> tiene cuenta aquí, te llegó un enlace. Vale
        30 minutos y sirve una sola vez. Revisa también el spam.
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="forgot-email">Correo</Label>
        <Input
          id="forgot-email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? "Mandando…" : "Mandarme el enlace"}
      </Button>
    </form>
  );
}

function RecoveryKeyForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [recoveryKey, setRecoveryKey] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await fetch("/api/recovery/password", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, recoveryKey, newPassword }),
    }).catch(() => null);
    setLoading(false);
    if (!res?.ok) {
      setError(
        res?.status === 429
          ? "Demasiados intentos. Espera unos minutos."
          : res?.status === 401
            ? "La llave o el correo no coinciden."
            : "No se pudo cambiar la contraseña. Intenta de nuevo."
      );
      return;
    }
    router.push("/login?restablecida=1");
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="recovery-email">Correo de tu cuenta</Label>
        <Input
          id="recovery-email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="recovery-key">Llave de recuperación</Label>
        <Input
          id="recovery-key"
          type="password"
          autoComplete="off"
          required
          value={recoveryKey}
          onChange={(e) => setRecoveryKey(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          Es la variable <code>RECOVERY_KEY</code> de tu hosting.
        </p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="recovery-password">Contraseña nueva</Label>
        <Input
          id="recovery-password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
        />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? "Cambiando…" : "Cambiar contraseña"}
      </Button>
    </form>
  );
}

/** Sin llave puesta: cómo ponerla. Lo hace quien controla el hosting. */
function RecoveryKeyHelp() {
  return (
    <div className="space-y-2 text-sm text-muted-foreground">
      <p>
        Esta instancia todavía no tiene llave de recuperación. Si eres el
        propietario:
      </p>
      <ol className="list-decimal space-y-1 pl-5">
        <li>
          Genera una llave larga, por ejemplo con{" "}
          <code>openssl rand -base64 32</code>.
        </li>
        <li>
          Agrégala como variable <code>RECOVERY_KEY</code> en tu hosting
          (Railway, Coolify…) y vuelve a desplegar.
        </li>
        <li>Regresa a esta página: aparecerá el formulario.</li>
      </ol>
    </div>
  );
}
