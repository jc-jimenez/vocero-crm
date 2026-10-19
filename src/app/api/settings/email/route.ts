import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import {
  deleteMailCredentials,
  getMailCredentials,
  keyLast4,
  saveMailCredentials,
} from "@/server/mail/credentials";
import { correoDisabledResponse, correoEnabled } from "@/server/mail/flag";
import { sendTestEmail } from "@/server/mail/service";
import { isValidFromAddress } from "@/server/mail/transport";

export const dynamic = "force-dynamic";

/**
 * 022 — Conexión del correo (D6). La llave entra pero nunca vuelve a salir:
 * hacia el navegador solo van sus últimos 4, el remitente y el estado.
 */

export const GET = withAuth(async (session) => {
  if (!correoEnabled()) return correoDisabledResponse();
  const creds = await getMailCredentials(session.organizationId);
  if (!creds) return Response.json({ connection: null });
  return Response.json({
    connection: {
      provider: "resend",
      status: creds.status,
      fromAddress: creds.fromAddress,
      keyLast4: keyLast4(creds.apiKey),
    },
  });
});

const credsSchema = z.object({
  apiKey: z.string().trim().min(8).max(512),
  fromAddress: z
    .string()
    .trim()
    .max(320)
    .refine(isValidFromAddress, "Escribe un remitente como Mi negocio <no-reply@tudominio.com>"),
});

/**
 * Guarda validando ANTES con un correo de prueba al propio usuario: una llave
 * o un remitente que el proveedor rechaza no llegan a la base.
 */
export const PUT = withAuth(async (session, req: Request) => {
  if (!correoEnabled()) return correoDisabledResponse();
  if (session.role !== "owner") {
    return apiError(403, "forbidden", "Solo el propietario puede conectar el correo");
  }
  const body = await parseBody(req, credsSchema);
  if (!body.ok) return body.response;

  const db = getDb();
  const me = await db
    .select({ email: schema.user.email })
    .from(schema.user)
    .where(eq(schema.user.id, session.userId))
    .limit(1);
  const to = me[0]?.email;
  if (!to) return apiError(500, "internal", "Error interno");

  const check = await sendTestEmail(body.data, {
    to,
    organizationId: session.organizationId,
  });
  if (!check.ok) return apiError(422, "mail_invalid", check.error);

  await saveMailCredentials({ organizationId: session.organizationId, ...body.data });
  return Response.json({
    connection: {
      provider: "resend",
      status: "connected",
      fromAddress: body.data.fromAddress,
      keyLast4: keyLast4(body.data.apiKey),
    },
    sentTo: to,
  });
});

export const DELETE = withAuth(async (session) => {
  if (!correoEnabled()) return correoDisabledResponse();
  if (session.role !== "owner") {
    return apiError(403, "forbidden", "Solo el propietario puede desconectar el correo");
  }
  await deleteMailCredentials(session.organizationId);
  return Response.json({ ok: true });
});
