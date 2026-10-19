import type { MailMessage } from "./transport";

/**
 * 022 — Los textos de los correos. Funciones puras: se prueban sin red ni
 * base. Lo que viene de fuera (nombre del negocio) se escapa antes de ir al
 * HTML.
 */

/** Vigencia del enlace, en minutos. La misma que `resetPasswordTokenExpiresIn`. */
export const RESET_LINK_MINUTES = 30;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function resetPasswordMessage(input: {
  to: string;
  url: string;
  businessName: string;
}): MailMessage {
  const name = input.businessName.trim() || "Vocero";
  const subject = `Restablece tu contraseña de ${name}`;
  const text = [
    "Hola:",
    "",
    `Alguien pidió restablecer la contraseña de tu cuenta en ${name}.`,
    `Para elegir una nueva, abre este enlace (vale ${RESET_LINK_MINUTES} minutos y sirve una sola vez):`,
    "",
    input.url,
    "",
    "Si no fuiste tú, ignora este correo: tu contraseña no cambia.",
  ].join("\n");
  const url = escapeHtml(input.url);
  const html = `<!doctype html><html><body style="font-family:system-ui,sans-serif;color:#111;line-height:1.5">
<p>Hola:</p>
<p>Alguien pidió restablecer la contraseña de tu cuenta en <strong>${escapeHtml(name)}</strong>.</p>
<p><a href="${url}" style="display:inline-block;background:#0d5bff;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">Elegir una contraseña nueva</a></p>
<p style="font-size:13px;color:#555">El enlace vale ${RESET_LINK_MINUTES} minutos y sirve una sola vez. Si el botón no abre, copia esta dirección:<br>${url}</p>
<p style="font-size:13px;color:#555">Si no fuiste tú, ignora este correo: tu contraseña no cambia.</p>
</body></html>`;
  return { to: input.to, subject, text, html };
}

export function testMessage(input: { to: string; businessName: string }): MailMessage {
  const name = input.businessName.trim() || "Vocero";
  const body = `El correo de ${name} quedó conectado. Desde ahora, «¿Olvidaste tu contraseña?» manda el enlace a este tipo de buzón.`;
  return {
    to: input.to,
    subject: `Prueba de correo de ${name}`,
    text: body,
    html: `<!doctype html><html><body style="font-family:system-ui,sans-serif"><p>${escapeHtml(body)}</p></body></html>`,
  };
}
