import { createHash, timingSafeEqual } from "node:crypto";

/**
 * 022 — La llave de recuperación: el camino para recuperar la contraseña SIN
 * correo (D1). Es una variable de despliegue, así que la barrera es la misma
 * que la de `scripts/reset-password.mjs`: quien controla el panel de hosting
 * controla la instancia.
 *
 * Se lee de `process.env` directo, como las banderas: preguntar si existe no
 * puede depender de que TODO el entorno valide.
 */

/** Más corta que esto se adivina; no cuenta como configurada. */
export const MIN_RECOVERY_KEY_LENGTH = 32;

export type RecoveryKeyState = "missing" | "too_short" | "ok";

export function recoveryKeyState(
  raw: string | undefined = process.env.RECOVERY_KEY
): RecoveryKeyState {
  const key = (raw ?? "").trim();
  if (!key) return "missing";
  if (key.length < MIN_RECOVERY_KEY_LENGTH) return "too_short";
  return "ok";
}

export function recoveryKeyConfigured(): boolean {
  return recoveryKeyState() === "ok";
}

/**
 * Compara en tiempo constante. Se comparan los SHA-256 y no las cadenas:
 * `timingSafeEqual` exige el mismo largo, y cortar antes por largo le diría a
 * quien prueba cuántos caracteres tiene la llave.
 */
export function recoveryKeyMatches(
  candidate: string,
  raw: string | undefined = process.env.RECOVERY_KEY
): boolean {
  if (recoveryKeyState(raw) !== "ok") return false;
  const digest = (v: string) => createHash("sha256").update(v.trim()).digest();
  return timingSafeEqual(digest(candidate), digest(raw ?? ""));
}
