# Feature Specification: Recuperar la contraseña

**Feature Branch**: `022-recuperar-contrasena`

**Created**: 2026-10-18

**Status**: Especificada antes de escribir código.

**Input**: petición del dueño el 2026-10-18 («agrega un “olvidé mi
contraseña”»), después de quedarse fuera de su instancia en Railway. Decisión
del dueño: los dos caminos — uno sin correo, siempre disponible, y el correo
como conector opcional encima.

**Carril**: ciclo completo (Principio VI). Añade una tabla (migración `0017`),
una variable de entorno opcional (`RECOVERY_KEY`) y una bandera de módulo
opcional (`CORREO`).

## Contexto

Hasta 1.5 Vocero no tiene «olvidé mi contraseña»: el registro público se cierra
con la primera organización y la única salida es `scripts/reset-password.mjs`,
que imprime un `UPDATE` para pegar en la terminal de Postgres. En plataformas
como Railway o Render esa terminal no siempre está a la mano, y un miembro del
equipo que olvida la suya depende de que el propietario sepa SQL.

La constitución (II) prohíbe meter un servicio de correo en el núcleo. Por eso
el camino de siempre no usa correo, y el correo entra como conector opcional
(patrón ADR-001/ADR-002).

## Decisiones

- **D1 — El camino sin correo es la llave de recuperación.** `RECOVERY_KEY` es
  una variable de entorno opcional (mínimo 32 caracteres). En
  `/forgot-password`, quien escribe correo + llave + contraseña nueva la
  cambia. La barrera es la misma que la del script: quien controla el panel de
  hosting controla la instancia. Sin la variable, la página explica cómo
  ponerla y el endpoint responde 404.
- **D2 — El propietario restablece la de su equipo** desde Ajustes → Equipo,
  con una contraseña temporal que se muestra una sola vez (igual que el alta).
  No puede hacerlo con la suya desde ahí: para eso está D1.
- **D3 — Cambiar la contraseña cierra todas las sesiones** de ese usuario, por
  cualquiera de los tres caminos.
- **D4 — El correo es un conector opcional** tras la bandera `CORREO`
  (apagada por defecto). Apagada: `/api/settings/email` y
  `/api/auth/request-password-reset` responden 404, Ajustes no muestra
  «Correo» y la página de recuperación no ofrece el formulario de correo. La
  migración se aplica igual.
- **D5 — Transporte: la API HTTP de Resend** (`POST /emails`), con
  `RESEND_BASE_URL` para el mock. Sin dependencias nuevas (es un `fetch`). El
  contrato `MailTransport` deja la puerta abierta a SMTP u otro proveedor.
- **D6 — La llave del proveedor se guarda cifrada** (AES-256-GCM, `lib/crypto`)
  en `mail_credentials`, una por organización. Hacia fuera solo salen sus
  últimos 4. Se valida ANTES de guardar mandando un correo de prueba al
  propietario: una llave que no sirve no llega a la base.
- **D7 — El enlace usa el flujo de Better Auth** (`requestPasswordReset` →
  `/reset-password?token=`), con vigencia de 30 minutos y un solo uso.
- **D8 — Degradación**: si el correo falla (llave revocada, proveedor caído,
  sin credenciales), la respuesta de «te mandamos un enlace» es la misma; el
  fallo se registra sin secretos y la conexión queda en `error` en Ajustes.
  La llave de recuperación sigue funcionando.
- **D9 — Sin enumeración de cuentas**: el formulario de correo responde igual
  exista o no la cuenta; la llave de recuperación responde el mismo 401 si la
  llave o el correo no coinciden.
- **D10 — Tasa limitada** igual que el login (10 por IP cada 10 min) en los
  tres endpoints públicos.

## Alcance

**Entra**:

- Enlace «¿Olvidaste tu contraseña?» en el login.
- `/forgot-password` (correo si `CORREO` está encendida; llave de
  recuperación siempre; nota para el equipo) y `/reset-password`.
- `POST /api/recovery/password` (llave de recuperación).
- `POST /api/settings/team/{memberId}/password` y su botón en Equipo.
- Conector de correo: tabla, cifrado, transporte Resend, Ajustes → Correo,
  `sendResetPassword` de Better Auth, mock `/api/dev/mail-mock`.
- `pnpm doctor`: avisa de `RECOVERY_KEY` demasiado corta.
- Self-test E2E con la bandera encendida y apagada.

**Fuera de alcance a propósito**:

| Qué | Por qué no |
|---|---|
| SMTP | Necesita una dependencia nueva; el contrato lo admite después. |
| Verificación de correo al registrarse | Otra feature; el registro ya está cerrado tras el dueño. |
| Invitaciones por correo | Igual: el alta con contraseña temporal sigue siendo el camino. |

## Criterios de aceptación

1. Con `RECOVERY_KEY` puesta, el propietario cambia su contraseña desde
   `/forgot-password`; la vieja deja de servir y sus sesiones se cierran.
2. Con una llave o un correo incorrectos responde 401 sin decir cuál falló.
3. Sin `RECOVERY_KEY`, la página explica cómo ponerla y el endpoint da 404.
4. El propietario restablece la contraseña de un miembro y el miembro entra
   con la temporal; un miembro no puede restablecer la de nadie (403).
5. Con `CORREO=on` y la llave del proveedor guardada, pedir el enlace manda
   un correo; el enlace cambia la contraseña una sola vez.
6. Con una llave del proveedor inválida, Ajustes no la guarda (422).
7. Con el proveedor fallando al enviar, el formulario responde lo mismo y no
   se cuelga.
8. Con `CORREO` apagada, las superficies del correo responden 404.
