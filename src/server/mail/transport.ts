import { getEnv } from "@/lib/env";

/**
 * 022 — Contrato del conector de correo (D5). Hoy hay un transporte, la API
 * HTTP de Resend: es un `fetch`, sin dependencias nuevas. Otro proveedor (SMTP
 * u otra API) entra implementando `MailTransport`, sin tocar a quien envía.
 */

export type MailMessage = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

export type MailCreds = {
  apiKey: string;
  /** `Nombre <no-reply@dominio.com>` o solo la dirección. */
  fromAddress: string;
};

export type SendResult =
  | { ok: true }
  /** `auth`: el proveedor rechazó la llave o el remitente; reintentar no sirve. */
  | { ok: false; auth: boolean; error: string };

export interface MailTransport {
  send(creds: MailCreds, message: MailMessage): Promise<SendResult>;
}

/** Un proveedor lento no puede colgar el formulario de «olvidé mi contraseña». */
const SEND_TIMEOUT_MS = 10_000;

export const resendTransport: MailTransport = {
  async send(creds, message) {
    // Fuera del try: un entorno inválido es un error de configuración, no
    // «sin red», y no se debe disfrazar de uno.
    const url = `${getEnv().RESEND_BASE_URL}/emails`;
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: {
          authorization: `Bearer ${creds.apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          from: creds.fromAddress,
          to: [message.to],
          subject: message.subject,
          text: message.text,
          html: message.html,
        }),
        signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
      });
    } catch (err) {
      const timedOut = err instanceof Error && err.name === "TimeoutError";
      return {
        ok: false,
        auth: false,
        error: timedOut
          ? "El proveedor de correo no respondió a tiempo"
          : "No se pudo contactar al proveedor de correo",
      };
    }
    if (res.ok) return { ok: true };
    // Resend: 401/403 llave inválida o sin permiso, 422 remitente o dominio sin
    // verificar. Los tres los arregla el dueño, no un reintento.
    const auth = res.status === 401 || res.status === 403 || res.status === 422;
    const detail = await readProviderMessage(res);
    return {
      ok: false,
      auth,
      error: detail
        ? `El proveedor rechazó el envío (${res.status}): ${detail}`
        : `El proveedor rechazó el envío (${res.status})`,
    };
  },
};

/**
 * El mensaje del proveedor, recortado. Nunca lleva la llave: Resend no la
 * repite en sus errores, y aun así se corta a 200 caracteres por si un
 * proveedor futuro devuelve una página entera.
 */
async function readProviderMessage(res: Response): Promise<string | null> {
  const body = (await res.json().catch(() => null)) as { message?: unknown } | null;
  return typeof body?.message === "string" ? body.message.slice(0, 200) : null;
}

/** Validación mínima del remitente antes de mandárselo al proveedor. */
export function isValidFromAddress(raw: string): boolean {
  const value = raw.trim();
  const inBrackets = value.match(/<([^<>]+)>\s*$/)?.[1];
  const address = (inBrackets ?? value).trim();
  return /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(address);
}
