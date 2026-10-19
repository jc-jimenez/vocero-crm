import { mockGuard } from "@/lib/dev-guard";
import {
  mailMockState,
  mockKeyOutcome,
  resetMailMock,
  type MockEmail,
} from "@/server/dev/mail-mock-state";

export const dynamic = "force-dynamic";

/**
 * 022 — Resend de mentira para el self-test. Tras `mockGuard()`: 404
 * incondicional en producción, indistinguible de una ruta inexistente.
 *
 * Imita lo único que usa el conector (`POST /emails`) y expone `_state`,
 * `_reset` y `_fail` para que el arnés afirme sobre lo que recibió.
 */

type Ctx = { params: Promise<{ path: string[] }> };

export async function POST(req: Request, ctx: Ctx) {
  const denied = mockGuard();
  if (denied) return denied;
  const route = (await ctx.params).path.join("/");

  if (route === "_reset") {
    resetMailMock();
    return Response.json({ ok: true });
  }

  if (route === "_fail") {
    const body = (await req.json().catch(() => ({}))) as { mode?: unknown };
    mailMockState().forced = body.mode === "bad" || body.mode === "down" ? body.mode : null;
    return Response.json({ forced: mailMockState().forced });
  }

  if (route === "emails") {
    const outcome = mockKeyOutcome(req.headers.get("authorization"));
    if (outcome === "bad") {
      return Response.json(
        { statusCode: 401, name: "validation_error", message: "API key is invalid" },
        { status: 401 }
      );
    }
    if (outcome === "down") {
      return Response.json(
        { statusCode: 503, name: "internal_server_error", message: "Service unavailable" },
        { status: 503 }
      );
    }
    const body = (await req.json().catch(() => ({}))) as Partial<MockEmail> & {
      to?: string[] | string;
    };
    const email: MockEmail = {
      from: body.from ?? "",
      to: Array.isArray(body.to) ? body.to : body.to ? [body.to] : [],
      subject: body.subject ?? "",
      text: body.text ?? "",
      html: body.html ?? "",
    };
    mailMockState().sent.push(email);
    return Response.json({ id: `mock_${mailMockState().sent.length}` });
  }

  return new Response(null, { status: 404 });
}

export async function GET(_req: Request, ctx: Ctx) {
  const denied = mockGuard();
  if (denied) return denied;
  const route = (await ctx.params).path.join("/");
  if (route === "_state") return Response.json({ sent: mailMockState().sent });
  return new Response(null, { status: 404 });
}
