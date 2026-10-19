/**
 * 022 — Estado del mock de Resend (solo entorno de pruebas).
 *
 * Para que el self-test pueda AFIRMAR sobre lo que el CRM mandó: a quién, con
 * qué asunto y con qué enlace — y seguir ese enlace como lo haría la persona.
 */

export type MockEmail = {
  from: string;
  to: string[];
  subject: string;
  text: string;
  html: string;
};

type MockState = {
  sent: MockEmail[];
  /** Forzado por `_fail`: el proveedor falla SIN importar la llave. */
  forced: "bad" | "down" | null;
};

const globalForMock = globalThis as unknown as { __mailMock?: MockState };

export function mailMockState(): MockState {
  if (!globalForMock.__mailMock) globalForMock.__mailMock = { sent: [], forced: null };
  return globalForMock.__mailMock;
}

export function resetMailMock(): void {
  const s = mailMockState();
  s.sent.length = 0;
  s.forced = null;
}

/**
 * Los caminos infelices, deterministas por la llave: `re_bad…` la rechaza
 * (401, como una llave revocada) y `re_down…` simula al proveedor caído
 * (503). Así el self-test prueba que la UI no guarda una llave mala y que un
 * envío fallido no cambia la respuesta del formulario. `_fail` fuerza lo mismo
 * con una llave ya guardada: la llave que se revoca DESPUÉS de conectarla.
 */
export function mockKeyOutcome(authHeader: string | null): "ok" | "bad" | "down" {
  const forced = globalForMock.__mailMock?.forced;
  if (forced) return forced;
  const key = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!key || key.startsWith("re_bad")) return "bad";
  if (key.startsWith("re_down")) return "down";
  return "ok";
}
