import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MIN_RECOVERY_KEY_LENGTH,
  recoveryKeyMatches,
  recoveryKeyState,
} from "@/server/auth/recovery";
import { checkRecoveryKey } from "@/server/doctor/checks";
import { parseCorreoFlag } from "@/server/mail/flag";
import { resetPasswordMessage, testMessage, RESET_LINK_MINUTES } from "@/server/mail/messages";
import { isValidFromAddress, resendTransport } from "@/server/mail/transport";
import { mockKeyOutcome } from "@/server/dev/mail-mock-state";

/**
 * 022 — Recuperar la contraseña. Lo que se prueba aquí sin base ni red: la
 * llave de recuperación (que una llave corta NO cuente y que la comparación no
 * dependa del largo), la bandera del correo (apagada por defecto), los textos
 * del correo y el transporte contra un `fetch` falso, incluidos sus fallos.
 * El recorrido completo, con la app viva, lo conduce
 * scripts/e2e-recuperar-contrasena.mjs.
 */

const KEY = "k".repeat(MIN_RECOVERY_KEY_LENGTH);

describe("llave de recuperación", () => {
  it("sin variable no existe; corta tampoco cuenta", () => {
    expect(recoveryKeyState(undefined)).toBe("missing");
    expect(recoveryKeyState("   ")).toBe("missing");
    expect(recoveryKeyState("corta")).toBe("too_short");
    expect(recoveryKeyState("x".repeat(MIN_RECOVERY_KEY_LENGTH - 1))).toBe("too_short");
    expect(recoveryKeyState(KEY)).toBe("ok");
  });

  it("solo la llave exacta pasa (los espacios de las orillas no cuentan)", () => {
    expect(recoveryKeyMatches(KEY, KEY)).toBe(true);
    expect(recoveryKeyMatches(`  ${KEY}\n`, KEY)).toBe(true);
    expect(recoveryKeyMatches(`${KEY}x`, KEY)).toBe(false);
    expect(recoveryKeyMatches("", KEY)).toBe(false);
    expect(recoveryKeyMatches(KEY.toUpperCase(), KEY)).toBe(false);
  });

  it("con la llave apagada no pasa nada, ni siquiera la misma cadena", () => {
    expect(recoveryKeyMatches("corta", "corta")).toBe(false);
    expect(recoveryKeyMatches("", undefined)).toBe(false);
  });

  it("pnpm doctor avisa de una llave corta y nunca la imprime", () => {
    const corta = checkRecoveryKey({ RECOVERY_KEY: "secreto-corto" });
    expect(corta.status).toBe("warn");
    expect(JSON.stringify(corta)).not.toContain("secreto-corto");
    expect(checkRecoveryKey({}).status).toBe("skip");
    const buena = checkRecoveryKey({ RECOVERY_KEY: KEY });
    expect(buena.status).toBe("ok");
    expect(JSON.stringify(buena)).not.toContain(KEY);
  });
});

describe("bandera CORREO", () => {
  it("apagada por defecto y con cualquier valor raro", () => {
    for (const v of [undefined, "", "off", "false", "0", "correo", "onn"]) {
      expect(parseCorreoFlag(v)).toBe(false);
    }
  });

  it("encendida con las formas de decir que sí", () => {
    for (const v of ["on", " ON ", "1", "true", "si", "sí", "yes"]) {
      expect(parseCorreoFlag(v)).toBe(true);
    }
  });
});

describe("textos del correo", () => {
  it("el de restablecer lleva el enlace, la vigencia y el negocio", () => {
    const m = resetPasswordMessage({
      to: "dueno@ejemplo.com",
      url: "https://crm.ejemplo.com/api/auth/reset-password/abc?callbackURL=%2Freset-password",
      businessName: "Tacos Don Pepe",
    });
    expect(m.to).toBe("dueno@ejemplo.com");
    expect(m.subject).toContain("Tacos Don Pepe");
    expect(m.text).toContain("https://crm.ejemplo.com/api/auth/reset-password/abc");
    expect(m.text).toContain(`${RESET_LINK_MINUTES} minutos`);
    expect(m.html).toContain("href=\"https://crm.ejemplo.com/api/auth/reset-password/abc?callbackURL=%2Freset-password\"");
  });

  it("escapa el nombre del negocio en el HTML", () => {
    const m = resetPasswordMessage({
      to: "a@b.co",
      url: "https://x.co/r",
      businessName: "<script>alert(1)</script>",
    });
    expect(m.html).not.toContain("<script>");
    expect(m.html).toContain("&lt;script&gt;");
  });

  it("sin nombre de negocio usa Vocero", () => {
    expect(testMessage({ to: "a@b.co", businessName: "  " }).subject).toContain("Vocero");
  });
});

describe("remitente", () => {
  it("acepta dirección sola o con nombre", () => {
    expect(isValidFromAddress("no-reply@tudominio.com")).toBe(true);
    expect(isValidFromAddress("Mi negocio <no-reply@tudominio.com>")).toBe(true);
  });

  it("rechaza lo que el proveedor rechazaría de todos modos", () => {
    expect(isValidFromAddress("")).toBe(false);
    expect(isValidFromAddress("no-reply")).toBe(false);
    expect(isValidFromAddress("Mi negocio <no-reply>")).toBe(false);
    expect(isValidFromAddress("a b@c.com")).toBe(false);
  });
});

describe("transporte Resend", () => {
  const creds = { apiKey: "re_test_1234", fromAddress: "Negocio <no-reply@n.com>" };
  const message = { to: "x@y.com", subject: "s", text: "t", html: "<p>h</p>" };

  beforeEach(() => {
    vi.stubEnv("APP_BASE_URL", "http://localhost:3000");
    vi.stubEnv("DATABASE_URL", "postgresql://t:t@localhost:5432/t");
    vi.stubEnv("BETTER_AUTH_SECRET", "secret-de-test-suficiente");
    vi.stubEnv("ENCRYPTION_KEY", Buffer.alloc(32, 3).toString("base64"));
    vi.stubEnv("META_WEBHOOK_VERIFY_TOKEN", "verify-test");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("manda lo que espera la API y con la llave en el header", async () => {
    const fetchMock = vi.fn(async () => Response.json({ id: "1" }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await resendTransport.send(creds, message);
    expect(result).toEqual({ ok: true });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/emails$/);
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer re_test_1234");
    expect(JSON.parse(init.body as string)).toMatchObject({
      from: creds.fromAddress,
      to: ["x@y.com"],
      subject: "s",
    });
  });

  it("una llave rechazada es un error de credenciales, sin la llave en el mensaje", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ message: "API key is invalid" }, { status: 401 }))
    );
    const result = await resendTransport.send(creds, message);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.auth).toBe(true);
      expect(result.error).toContain("401");
      expect(result.error).not.toContain(creds.apiKey);
    }
  });

  it("el proveedor caído no es culpa de la llave", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>", { status: 503 })));
    const result = await resendTransport.send(creds, message);
    expect(result).toMatchObject({ ok: false, auth: false });
  });

  it("sin red tampoco lanza", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed");
      })
    );
    const result = await resendTransport.send(creds, message);
    expect(result).toMatchObject({ ok: false, auth: false });
  });
});

describe("mock del proveedor", () => {
  it("decide el resultado por la llave, de forma determinista", () => {
    expect(mockKeyOutcome("Bearer re_bien")).toBe("ok");
    expect(mockKeyOutcome("Bearer re_bad_x")).toBe("bad");
    expect(mockKeyOutcome("Bearer re_down_x")).toBe("down");
    expect(mockKeyOutcome(null)).toBe("bad");
  });
});
