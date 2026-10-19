import { ForgotPasswordClient } from "@/components/auth/forgot-password-client";
import { recoveryKeyConfigured } from "@/server/auth/recovery";
import { correoEnabled } from "@/server/mail/flag";

// Las banderas se leen en cada petición: resueltas al construir, la imagen
// quedaría con el correo apagado para siempre.
export const dynamic = "force-dynamic";

/**
 * 022 — Recuperar la contraseña. Qué caminos existen lo decide el servidor:
 * el correo solo con `CORREO` (conector opcional) y la llave de recuperación
 * siempre, con instrucciones si todavía no está puesta.
 */
export default function ForgotPasswordPage() {
  return (
    <ForgotPasswordClient
      mail={correoEnabled()}
      recoveryKey={recoveryKeyConfigured()}
    />
  );
}
