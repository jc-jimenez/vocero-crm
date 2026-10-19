import { z } from "zod";
import { apiError, parseBody } from "@/lib/api";
import { AUTH_RATE_LIMIT, checkRateLimit, clientIp } from "@/lib/rate-limit";
import {
  findUserIdByEmail,
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  setUserPassword,
} from "@/server/auth/password";
import { recoveryKeyConfigured, recoveryKeyMatches } from "@/server/auth/recovery";

export const dynamic = "force-dynamic";

/**
 * 022 — Recuperar la contraseña con la llave de recuperación (D1). Pública:
 * quien llega aquí no tiene sesión. Sin `RECOVERY_KEY` la ruta no existe
 * (404); con ella, la tasa va limitada igual que el login (D10).
 */

const bodySchema = z.object({
  email: z.string().trim().email(),
  recoveryKey: z.string().min(1).max(512),
  newPassword: z.string().min(MIN_PASSWORD_LENGTH).max(MAX_PASSWORD_LENGTH),
});

export async function POST(req: Request) {
  if (!recoveryKeyConfigured()) return new Response(null, { status: 404 });

  const limit = checkRateLimit(`recovery:${clientIp(req.headers)}`, AUTH_RATE_LIMIT);
  if (!limit.allowed) {
    return apiError(429, "rate_limited", "Demasiados intentos; espera unos minutos");
  }

  const body = await parseBody(req, bodySchema);
  if (!body.ok) return body.response;

  // El mismo 401 si falla la llave o si no existe el correo (D9): con la llave
  // equivocada no se aprende nada de qué cuentas hay.
  const denied = () =>
    apiError(401, "invalid_recovery", "La llave o el correo no coinciden");
  if (!recoveryKeyMatches(body.data.recoveryKey)) return denied();
  const userId = await findUserIdByEmail(body.data.email);
  if (!userId) return denied();

  try {
    await setUserPassword(userId, body.data.newPassword);
  } catch (err) {
    console.error("[recovery] no se pudo cambiar la contraseña:", err);
    return apiError(500, "internal", "Error interno");
  }
  // Sin correo ni llave en el log: solo quién y que pasó.
  console.info(`[recovery] contraseña restablecida con la llave para ${userId}`);
  return Response.json({ ok: true });
}
