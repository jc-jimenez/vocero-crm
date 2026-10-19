"use client";

import { useEffect, useState } from "react";
import { Mail } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * 022 — Ajustes → Correo. La llave se valida CONTRA EL PROVEEDOR antes de
 * guardarse: guardar manda un correo de prueba a tu propio buzón, y si el
 * proveedor lo rechaza no se guarda nada. Hacia el navegador solo vuelven los
 * últimos 4 de la llave.
 */

type Connection = {
  provider: "resend";
  status: "connected" | "error";
  fromAddress: string;
  keyLast4: string;
};

type ApiError = { error?: { message?: string } } | null;

export function EmailClient() {
  const [connection, setConnection] = useState<Connection | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [fromAddress, setFromAddress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/settings/email").catch(() => null);
      if (res?.ok) {
        const data = (await res.json()) as { connection: Connection | null };
        setConnection(data.connection);
        if (data.connection) setFromAddress(data.connection.fromAddress);
      }
      setLoaded(true);
    })();
  }, []);

  async function save() {
    setSaving(true);
    setError(null);
    setNotice(null);
    const res = await fetch("/api/settings/email", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ apiKey, fromAddress }),
    }).catch(() => null);
    setSaving(false);
    if (!res?.ok) {
      const data = (await res?.json().catch(() => null)) as ApiError;
      setError(data?.error?.message ?? "No se pudo conectar el correo");
      return;
    }
    const data = (await res.json()) as { connection: Connection; sentTo: string };
    setConnection(data.connection);
    setApiKey("");
    setNotice(`Conectado. Te mandamos un correo de prueba a ${data.sentTo}.`);
  }

  async function disconnect() {
    setError(null);
    setNotice(null);
    const res = await fetch("/api/settings/email", { method: "DELETE" }).catch(() => null);
    if (!res?.ok) {
      const data = (await res?.json().catch(() => null)) as ApiError;
      setError(data?.error?.message ?? "No se pudo desconectar");
      return;
    }
    setConnection(null);
    setNotice("Correo desconectado. La llave de recuperación sigue funcionando.");
  }

  return (
    <div className="max-w-2xl space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle>Correo</CardTitle>
            {connection && (
              <Badge variant={connection.status === "connected" ? "success" : "destructive"}>
                {connection.status === "connected" ? "Conectado" : "Con error"}
              </Badge>
            )}
          </div>
          <CardDescription>
            Para que «¿Olvidaste tu contraseña?» mande el enlace por correo. Usa
            tu propia cuenta de{" "}
            <a
              href="https://resend.com"
              target="_blank"
              rel="noreferrer"
              className="text-primary hover:underline"
            >
              Resend
            </a>{" "}
            con un dominio verificado. Sin esto, la recuperación sigue funcionando
            con la llave de recuperación.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {connection?.status === "error" && (
            <p className="rounded-md border border-danger-soft bg-danger-tint p-3 text-sm text-danger-text">
              El proveedor rechazó el último envío (llave revocada o dominio sin
              verificar). Pega una llave nueva para volver a conectarlo.
            </p>
          )}
          {connection && (
            <p className="text-sm text-muted-foreground">
              Llave guardada: <code>••••{connection.keyLast4}</code>
            </p>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="mail-from">Remitente</Label>
            <Input
              id="mail-from"
              placeholder="Mi negocio <no-reply@tudominio.com>"
              value={fromAddress}
              onChange={(e) => setFromAddress(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              El dominio tiene que estar verificado en Resend.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mail-key">
              {connection ? "Llave nueva (API key)" : "Llave (API key)"}
            </Label>
            <Input
              id="mail-key"
              type="password"
              autoComplete="off"
              placeholder="re_…"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
          </div>
          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
          {notice && (
            <p className="text-sm text-success-text" role="status">
              {notice}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={!loaded || saving || apiKey.trim().length < 8 || !fromAddress.trim()}
              onClick={() => void save()}
            >
              <Mail className="h-4 w-4" />
              {saving ? "Probando…" : "Guardar y mandar prueba"}
            </Button>
            {connection && (
              <Button variant="outline" onClick={() => void disconnect()}>
                Desconectar
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
