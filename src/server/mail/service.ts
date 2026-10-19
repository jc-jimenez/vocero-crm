import { getBranding } from "@/server/branding";
import { resolveMembership } from "@/server/auth/on-signup";
import { getMailCredentials, markMailError } from "./credentials";
import { correoEnabled } from "./flag";
import { resetPasswordMessage, testMessage } from "./messages";
import { resendTransport, type MailCreds, type MailTransport, type SendResult } from "./transport";

/**
 * 022 — Quien envía. Elige el transporte, resuelve las credenciales de la
 * organización del usuario y registra los fallos SIN secretos (D8).
 */

/** El único transporte de hoy. Se puede inyectar en pruebas. */
let transport: MailTransport = resendTransport;

export function setMailTransportForTests(next: MailTransport | null): void {
  transport = next ?? resendTransport;
}

/**
 * El `sendResetPassword` de Better Auth. Nunca lanza: lo que falle aquí no
 * puede cambiar la respuesta del formulario (D8, D9) — si cambiara, se
 * sabría qué correos tienen cuenta.
 */
export async function sendResetPasswordEmail(input: {
  userId: string;
  email: string;
  url: string;
}): Promise<void> {
  if (!correoEnabled()) return;
  try {
    const membership = await resolveMembership(input.userId);
    if (!membership) {
      console.warn(`[correo] ${input.userId} no tiene organización; no se manda el enlace`);
      return;
    }
    const creds = await getMailCredentials(membership.organizationId);
    if (!creds) {
      console.warn(
        `[correo] la organización ${membership.organizationId} no tiene correo conectado; no se manda el enlace`
      );
      return;
    }
    const branding = await getBranding(membership.organizationId).catch(() => null);
    const result = await transport.send(
      creds,
      resetPasswordMessage({
        to: input.email,
        url: input.url,
        businessName: branding?.name ?? "Vocero",
      })
    );
    if (!result.ok) {
      console.error(`[correo] no se mandó el enlace a ${input.userId}: ${result.error}`);
      if (result.auth) await markMailError(membership.organizationId);
    }
  } catch (err) {
    console.error(`[correo] error al mandar el enlace a ${input.userId}:`, err);
  }
}

/** El correo de prueba que valida la llave ANTES de guardarla (D6). */
export async function sendTestEmail(
  creds: MailCreds,
  input: { to: string; organizationId: string }
): Promise<SendResult> {
  const branding = await getBranding(input.organizationId).catch(() => null);
  return transport.send(
    creds,
    testMessage({ to: input.to, businessName: branding?.name ?? "Vocero" })
  );
}
