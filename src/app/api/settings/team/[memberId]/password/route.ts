import { eq } from "drizzle-orm";
import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import {
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  setUserPassword,
} from "@/server/auth/password";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  password: z.string().min(MIN_PASSWORD_LENGTH).max(MAX_PASSWORD_LENGTH),
});

type Ctx = { params: Promise<{ memberId: string }> };

/**
 * 022 — El propietario restablece la contraseña de alguien de su equipo (D2)
 * con una temporal que comparte él mismo, igual que en el alta. La suya no:
 * cerrarle todas las sesiones al propietario desde su propia pantalla lo
 * sacaría a media acción; para eso está la llave de recuperación.
 */
export const POST = withAuth(async (session, req: Request, ctx: Ctx) => {
  if (session.role !== "owner") {
    return apiError(403, "forbidden", "Solo el propietario puede restablecer contraseñas");
  }
  const body = await parseBody(req, bodySchema);
  if (!body.ok) return body.response;
  const { memberId } = await ctx.params;

  const db = getDb();
  const rows = await db
    .select({ userId: schema.member.userId })
    .from(schema.member)
    .where(
      scoped(
        schema.member.organizationId,
        session.organizationId,
        eq(schema.member.id, memberId)
      )
    )
    .limit(1);
  const target = rows[0];
  if (!target) return apiError(404, "not_found", "Ese miembro no existe");
  if (target.userId === session.userId) {
    return apiError(
      422,
      "self",
      "Tu propia contraseña no se cambia desde aquí: usa «¿Olvidaste tu contraseña?» en el login"
    );
  }

  await setUserPassword(target.userId, body.data.password);
  return Response.json({ ok: true });
});
