# E2E 022 — Recuperar la contraseña

Guion de comportamiento (Constitución IX). Automatizado completo en
`scripts/e2e-recuperar-contrasena.mjs` (`pnpm test:e2e:recuperar`), con la app
viva, `WA_MOCK_ENABLED=true` y `RESEND_BASE_URL` apuntando al mock
(`/api/dev/mail-mock`). Se corre **dos veces**:

```bash
# 1) todo encendido (el .env de desarrollo trae CORREO=on y RECOVERY_KEY)
pnpm dev
pnpm test:e2e:recuperar

# 2) todo apagado: reinicia la app sin las dos variables
CORREO= RECOVERY_KEY= pnpm dev
CORREO= RECOVERY_KEY= pnpm test:e2e:recuperar
```

El propietario es `e2e@vocero.test`, el de los demás guiones; su contraseña no
se toca. Se recupera la de cuentas del equipo creadas en cada corrida.

## Mapeo a los criterios de la spec

| Criterio ([spec](../../specs/022-recuperar-contrasena/spec.md)) | Check |
|---|---|
| 1 — la llave cambia la contraseña y cierra sesiones | «UI: vuelve al login» · «la contraseña vieja ya no entra» · «la nueva sí» · «la sesión del otro dispositivo se cerró» |
| 2 — llave o correo malos → el mismo 401 | «llave equivocada → 401» · «correo inexistente → el mismo 401» · «las dos respuestas no se distinguen» |
| 3 — sin `RECOVERY_KEY`: instrucciones y 404 | «sin RECOVERY_KEY la ruta no existe (404)» · «sin RECOVERY_KEY la página explica cómo ponerla» |
| 4 — el propietario restablece la de su equipo; un miembro no | «UI: la muestra una vez para compartirla» · «la nueva temporal sí» · «un miembro no puede restablecer contraseñas (403)» |
| 5 — el enlace por correo funciona una vez | «el correo con el enlace llegó» · «la del correo sí» · «el mismo enlace no sirve dos veces» |
| 6 — llave del proveedor inválida no se guarda | «una llave que el proveedor rechaza no se guarda (422)» · «y sigue sin conexión» |
| 7 — proveedor fallando: misma respuesta, sin colgarse | «proveedor down/bad: el formulario responde 200» · «sin colgarse» · «Ajustes marca la conexión con error» |
| 8 — sin `CORREO`, todo 404 | «sin CORREO, /api/settings/email da 404» · «pedir el enlace da 404» · «la pantalla de Ajustes no existe» |

## Notas del arnés

- Cada contexto usa su propia `x-forwarded-for`: el login va limitado a 10
  intentos por IP y la prueba entra más veces. Un 429 hace tronar la prueba
  en vez de contar como «la contraseña no entra».
- El arnés manda `origin`, como un navegador: con cookies de por medio Better
  Auth rechaza (CSRF) las peticiones sin él.
- `POST /api/dev/mail-mock/_fail` con `{ "mode": "down" | "bad" }` simula que
  el proveedor falla con una llave ya guardada.
