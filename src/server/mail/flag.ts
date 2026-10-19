/**
 * 022 — Si esta instancia tiene conector de correo o no.
 *
 * Misma decisión que la agenda y los canales (ADR-001, ADR-002): el código
 * viaja siempre en main y una variable de despliegue decide si EXISTE. Sin
 * `CORREO`, nadie ve «Correo» en Ajustes, la página de recuperación no ofrece
 * el enlace por correo y sus rutas responden 404. La llave de recuperación
 * (server/auth/recovery.ts) no depende de esto: es el camino sin terceros.
 */

/** Valores que cuentan como "encendida". Cualquier otra cosa, apagada. */
const ON_VALUES = new Set(["on", "1", "true", "si", "sí", "yes"]);

export function parseCorreoFlag(raw: string | undefined): boolean {
  return ON_VALUES.has((raw ?? "").trim().toLowerCase());
}

/** De `process.env` directo, por lo mismo que `agendaEnabled()`. */
export function correoEnabled(): boolean {
  return parseCorreoFlag(process.env.CORREO);
}

/** 404 y no 403: apagado, ese endpoint no existe en esta instancia. */
export function correoDisabledResponse(): Response {
  return new Response(null, { status: 404 });
}
