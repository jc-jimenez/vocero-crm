# Tasks — 022 Recuperar la contraseña

Estado al 2026-10-18. Todas hechas y verificadas con el gate técnico y el
self-test E2E en las dos configuraciones (encendido y apagado).

## Camino sin correo

- [x] T01 `RECOVERY_KEY` opcional en `lib/env.ts`; estado y comparación en
  tiempo constante en `server/auth/recovery.ts`.
- [x] T02 `server/auth/password.ts`: cambiar la contraseña con el hash de Better
  Auth y cerrar todas las sesiones (D3).
- [x] T03 `POST /api/recovery/password`: 404 sin llave, tasa limitada, el mismo
  401 si falla la llave o el correo (D9, D10).
- [x] T04 `POST /api/settings/team/{memberId}/password` (solo propietario, no la
  propia) + `isYou` en el listado + botón «Restablecer» en Equipo (D2).
- [x] T05 `pnpm doctor`: aviso de `RECOVERY_KEY` corta.

## Conector de correo (bandera `CORREO`)

- [x] T06 Bandera en `server/mail/flag.ts`; 404 de sus superficies apagada (D4).
- [x] T07 Tabla `mail_credentials` (migración `0017`), llave cifrada (D6).
- [x] T08 Contrato `MailTransport` + transporte Resend por `fetch`, con tiempo
  límite y errores sin secretos (D5).
- [x] T09 `sendResetPassword` de Better Auth sin `await` (D8, D9), vigencia de
  30 min, `revokeSessionsOnPasswordReset`, tasa en los endpoints del enlace.
- [x] T10 `/api/settings/email` (GET/PUT/DELETE; guardar valida con un correo
  de prueba) y Ajustes → Correo.
- [x] T11 Mock `/api/dev/mail-mock` (`emails`, `_state`, `_reset`, `_fail`).

## Pantallas

- [x] T12 Enlace «¿Olvidaste tu contraseña?» en el login y aviso de
  «Contraseña cambiada» al volver.
- [x] T13 `/forgot-password` (correo, llave o instrucciones, nota al equipo).
- [x] T14 `/reset-password` (token de un solo uso, enlace vencido).

## Pruebas

- [x] T15 Unitarias: `tests/unit/recuperar-contrasena.test.ts`, `nav.test.ts`.
- [x] T16 E2E: `scripts/e2e-recuperar-contrasena.mjs` + guion
  `tests/e2e/us-recuperar-contrasena.md`.
