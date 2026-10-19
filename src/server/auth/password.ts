import { getAuth } from "@/lib/auth";

/**
 * 022 — Cambiar la contraseña de un usuario desde el servidor: lo usan la
 * llave de recuperación y el propietario restableciendo la de su equipo.
 *
 * Va por el contexto interno de Better Auth y no reimplementa el hash: es la
 * MISMA función con la que el login verifica (ver scripts/reset-password.mjs
 * para por qué eso importa). El enlace por correo no pasa por aquí: lo
 * resuelve el endpoint `/reset-password` de la propia librería.
 */

/** El mismo mínimo que el registro (`minPasswordLength` en lib/auth). */
export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 128;

/**
 * Pone `newPassword` y cierra TODAS las sesiones del usuario (D3): quien
 * cambia la contraseña porque alguien más la sabía no puede dejarle la sesión
 * abierta.
 */
export async function setUserPassword(
  userId: string,
  newPassword: string
): Promise<void> {
  const ctx = await getAuth().$context;
  const hash = await ctx.password.hash(newPassword);
  const accounts = await ctx.internalAdapter.findAccounts(userId);
  if (accounts.some((a) => a.providerId === "credential")) {
    await ctx.internalAdapter.updatePassword(userId, hash);
  } else {
    await ctx.internalAdapter.createAccount({
      userId,
      providerId: "credential",
      accountId: userId,
      password: hash,
    });
  }
  await ctx.internalAdapter.deleteUserSessions(userId);
}

/** El id del usuario con ese correo (sin distinguir mayúsculas), o null. */
export async function findUserIdByEmail(email: string): Promise<string | null> {
  const ctx = await getAuth().$context;
  const found = await ctx.internalAdapter.findUserByEmail(
    email.trim().toLowerCase()
  );
  return found?.user.id ?? null;
}
