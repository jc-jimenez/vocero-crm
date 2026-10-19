import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { scoped } from "@/lib/db/tenant";

/**
 * 022 — La llave del proveedor de correo del propio negocio (D6). Mismo
 * cifrado que el token de WhatsApp y las credenciales de Zoom; hacia fuera
 * solo salen sus últimos 4.
 */

export type StoredMailCreds = {
  apiKey: string;
  fromAddress: string;
  status: "connected" | "error";
};

export async function getMailCredentials(
  organizationId: string
): Promise<StoredMailCreds | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.mailCredentials)
    .where(scoped(schema.mailCredentials.organizationId, organizationId))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return {
    apiKey: decryptSecret({ cipher: row.keyCipher, iv: row.keyIv, tag: row.keyTag }),
    fromAddress: row.fromAddress,
    status: row.status,
  };
}

export async function saveMailCredentials(input: {
  organizationId: string;
  apiKey: string;
  fromAddress: string;
}): Promise<void> {
  const db = getDb();
  const enc = encryptSecret(input.apiKey);
  const values = {
    fromAddress: input.fromAddress,
    keyCipher: enc.cipher,
    keyIv: enc.iv,
    keyTag: enc.tag,
    status: "connected" as const,
  };
  await db
    .insert(schema.mailCredentials)
    .values({
      id: newId("mailCredentials"),
      organizationId: input.organizationId,
      ...values,
    })
    .onConflictDoUpdate({
      target: [schema.mailCredentials.organizationId],
      set: { ...values, updatedAt: new Date() },
    });
}

export async function deleteMailCredentials(organizationId: string): Promise<void> {
  const db = getDb();
  await db
    .delete(schema.mailCredentials)
    .where(scoped(schema.mailCredentials.organizationId, organizationId));
}

/**
 * Se escribe cuando el proveedor rechaza un envío REAL (D8): si no, el dueño
 * se enteraría por alguien de su equipo que nunca recibió el enlace.
 */
export async function markMailError(organizationId: string): Promise<void> {
  const db = getDb();
  await db
    .update(schema.mailCredentials)
    .set({ status: "error", updatedAt: new Date() })
    .where(scoped(schema.mailCredentials.organizationId, organizationId));
}

/** Últimos 4 de la llave, para la UI. Jamás la llave. */
export function keyLast4(key: string): string {
  return key.slice(-4);
}
