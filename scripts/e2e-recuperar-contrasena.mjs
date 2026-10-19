/**
 * Self-test E2E de comportamiento — 022, recuperar la contraseña
 * (guion tests/e2e/us-recuperar-contrasena.md).
 *
 * Conduce la UI real con Playwright y afirma sobre lo observable: que la
 * contraseña vieja deja de servir, que la nueva entra, que las sesiones
 * abiertas se cierran y que el correo que «llega» (mock de Resend) lleva un
 * enlace que funciona una sola vez. Los caminos infelices también: llave mala,
 * llave del proveedor rechazada, proveedor caído después de conectarlo.
 *
 * Lo que se espera depende del entorno de la app, así que se corre dos veces:
 *   - con CORREO=on y RECOVERY_KEY puesta (el .env de desarrollo), y
 *   - con las dos apagadas, para probar que sus superficies dan 404.
 * El script lee las MISMAS variables que la app (--env-file=.env).
 *
 * El propietario es el de los demás guiones (`e2e@vocero.test`): solo el
 * PRIMER registro de la instancia queda como propietario. Su contraseña no se
 * toca; lo que se recupera es la de cuentas del equipo creadas en la corrida.
 *
 * Uso: node --env-file=.env scripts/e2e-recuperar-contrasena.mjs
 * Requiere: app corriendo (pnpm dev) con WA_MOCK_ENABLED=true,
 * RESEND_BASE_URL → /api/dev/mail-mock y BD migrada.
 */
import { chromium } from "playwright";

const BASE = process.env.APP_BASE_URL ?? "http://localhost:3000";
const ON_VALUES = new Set(["on", "1", "true", "si", "sí", "yes"]);
const CORREO = ON_VALUES.has((process.env.CORREO ?? "").trim().toLowerCase());
const RECOVERY_KEY = (process.env.RECOVERY_KEY ?? "").trim();
const HAS_KEY = RECOVERY_KEY.length >= 32;
const S = Math.random().toString(36).slice(2, 7);
// Una IP inventada por contexto: el login va limitado a 10 intentos por IP y
// esta prueba entra más veces que eso. Con una sola IP, el 429 haría pasar en
// falso las verificaciones de «esta contraseña ya no entra».
const RUN = `10.${(Math.random() * 250) | 0}.${(Math.random() * 250) | 0}`;
let ipSeq = 0;
const nextIp = () => `${RUN}.${(ipSeq++ % 250) + 1}`;

let failures = 0;
let checks = 0;
const ok = (name, cond, extra = "") => {
  checks++;
  if (cond) console.log(`  ✓ ${name}`);
  else {
    failures++;
    console.log(`  ✗ ${name}${extra ? ` — ${extra}` : ""}`);
  }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 10000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (await fn()) return true;
    await sleep(150);
  }
  return false;
};

const browser = await chromium.launch();
const newCtx = () =>
  browser.newContext({
    viewport: { width: 1280, height: 900 },
    // `origin` como lo manda un navegador: con cookies de por medio, Better
    // Auth rechaza (CSRF) una petición sin él, y un contexto que ya tuvo
    // sesión las trae.
    extraHTTPHeaders: { "x-forwarded-for": nextIp(), origin: BASE },
  });

async function signIn(ctx, email, password) {
  const r = await ctx.request.post(`${BASE}/api/auth/sign-in/email`, {
    data: { email, password },
  });
  // Un 429 no es «la contraseña no sirve»: que truene la prueba, no que pase.
  if (r.status() === 429) throw new Error("límite de intentos de login alcanzado en el arnés");
  return r.ok();
}
/** ¿La sesión de este contexto sigue viva? */
async function sessionAlive(ctx) {
  const r = await ctx.request.get(`${BASE}/api/settings/team`);
  return r.status() === 200;
}
/** ¿Entra con esta contraseña? En un contexto limpio, sin cookies previas. */
async function canSignIn(email, password) {
  const ctx = await newCtx();
  const result = await signIn(ctx, email, password);
  await ctx.close();
  return result;
}

console.log(`== Entorno: CORREO=${CORREO ? "on" : "off"} · RECOVERY_KEY=${HAS_KEY ? "puesta" : "no"} ==`);

console.log("\n== Setup: propietario y cuentas del equipo ==");
const ownerEmail = "e2e@vocero.test";
const ownerPassword = "password-e2e-123";
const owner = await newCtx();
if (!(await signIn(owner, ownerEmail, ownerPassword))) {
  await owner.request.post(`${BASE}/api/auth/sign-up/email`, {
    data: { email: ownerEmail, password: ownerPassword, name: "Operador E2E" },
  });
}
ok("propietario con sesión", await sessionAlive(owner));

/** Alta de una cuenta del equipo (la API del propietario). */
async function newMember(prefix) {
  const email = `${prefix.toLowerCase()}-${S}@vocero.test`;
  const name = `${prefix} ${S}`;
  const r = await owner.request.post(`${BASE}/api/settings/team`, {
    data: { name, email, password: "temporal-inicial" },
  });
  return { email, name, created: r.status() === 201 };
}
const user = await newMember("Recupera");
ok("alta de la cuenta que va a recuperar", user.created);
let userPassword = "temporal-inicial";

console.log("\n== El login lleva a recuperar ==");
{
  const ctx = await newCtx();
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`);
  await page.getByRole("link", { name: "¿Olvidaste tu contraseña?" }).click();
  await page.waitForURL(/\/forgot-password$/);
  ok("el enlace del login abre /forgot-password", page.url().endsWith("/forgot-password"));
  ok(
    "la página le dice al equipo que pida ayuda al propietario",
    await page.getByText("Pídele al propietario").isVisible()
  );
  ok(
    CORREO ? "con CORREO ofrece el enlace por correo" : "sin CORREO no ofrece el enlace por correo",
    (await page.getByRole("button", { name: "Mandarme el enlace" }).count()) === (CORREO ? 1 : 0)
  );
  await ctx.close();
}

console.log("\n== Llave de recuperación ==");
if (HAS_KEY) {
  // Una sesión abierta ANTES del cambio: tiene que cerrarse.
  const otherDevice = await newCtx();
  ok("sesión abierta en otro dispositivo", await signIn(otherDevice, user.email, userPassword));

  const anon = await newCtx();
  const wrongKey = await anon.request.post(`${BASE}/api/recovery/password`, {
    data: { email: user.email, recoveryKey: "x".repeat(40), newPassword: "nueva-12345" },
  });
  const wrongEmail = await anon.request.post(`${BASE}/api/recovery/password`, {
    data: { email: `nadie-${S}@vocero.test`, recoveryKey: RECOVERY_KEY, newPassword: "nueva-12345" },
  });
  ok("llave equivocada → 401", wrongKey.status() === 401, `HTTP ${wrongKey.status()}`);
  ok("correo inexistente → el mismo 401", wrongEmail.status() === 401, `HTTP ${wrongEmail.status()}`);
  ok(
    "las dos respuestas no se distinguen",
    JSON.stringify(await wrongKey.json()) === JSON.stringify(await wrongEmail.json())
  );
  ok("la contraseña no cambió tras los intentos fallidos", await canSignIn(user.email, userPassword));

  // Por la UI, como la persona.
  const page = await anon.newPage();
  await page.goto(`${BASE}/forgot-password`);
  if (CORREO) await page.getByText("¿No te llega el correo?").click();
  await page.getByLabel("Correo de tu cuenta").fill(user.email);
  await page.getByLabel("Llave de recuperación").fill("y".repeat(40));
  await page.getByLabel("Contraseña nueva").fill("no-deberia-quedar");
  await page.getByRole("button", { name: "Cambiar contraseña" }).click();
  ok(
    "UI: la llave mala muestra el error",
    await until(async () => page.getByText("La llave o el correo no coinciden.").isVisible())
  );
  await page.getByLabel("Llave de recuperación").fill(RECOVERY_KEY);
  const viaKey = "con-la-llave-123";
  await page.getByLabel("Contraseña nueva").fill(viaKey);
  await page.getByRole("button", { name: "Cambiar contraseña" }).click();
  await page.waitForURL(/\/login\?restablecida=1/, { timeout: 15000 }).catch(() => {});
  ok("UI: vuelve al login", page.url().includes("/login?restablecida=1"), page.url());
  ok(
    "UI: el login confirma el cambio",
    await until(async () => page.getByText("Contraseña cambiada").isVisible())
  );
  ok("la contraseña vieja ya no entra", !(await canSignIn(user.email, userPassword)));
  ok("la nueva sí", await canSignIn(user.email, viaKey));
  ok("la sesión del otro dispositivo se cerró", !(await sessionAlive(otherDevice)));
  userPassword = viaKey;
  await Promise.all([otherDevice.close(), anon.close()]);
} else {
  const anon = await newCtx();
  const r = await anon.request.post(`${BASE}/api/recovery/password`, {
    data: { email: user.email, recoveryKey: "x".repeat(40), newPassword: "nueva-12345" },
  });
  ok("sin RECOVERY_KEY la ruta no existe (404)", r.status() === 404, `HTTP ${r.status()}`);
  const page = await anon.newPage();
  await page.goto(`${BASE}/forgot-password`);
  if (CORREO) await page.getByText("¿No te llega el correo?").click();
  ok(
    "sin RECOVERY_KEY la página explica cómo ponerla",
    await page.getByText("todavía no tiene llave de recuperación").isVisible()
  );
  await anon.close();
}

console.log("\n== El propietario restablece la de su equipo ==");
{
  const m = await newMember("Miembro");
  ok("alta del miembro", m.created);
  const member = await newCtx();
  ok("el miembro entra", await signIn(member, m.email, "temporal-inicial"));

  const team = await (await owner.request.get(`${BASE}/api/settings/team`)).json();
  const me = team.members?.find((x) => x.isYou);
  const them = team.members?.find((x) => x.email === m.email);
  ok("el listado marca quién eres", me?.role === "owner" && Boolean(them) && !them.isYou);

  const memberTries = await member.request.post(
    `${BASE}/api/settings/team/${me?.id}/password`,
    { data: { password: "hackeada-123" } }
  );
  ok("un miembro no puede restablecer contraseñas (403)", memberTries.status() === 403, `HTTP ${memberTries.status()}`);
  const self = await owner.request.post(`${BASE}/api/settings/team/${me?.id}/password`, {
    data: { password: "la-mia-desde-aqui" },
  });
  ok("el propietario no cambia la suya desde Equipo (422)", self.status() === 422, `HTTP ${self.status()}`);
  const foreign = await owner.request.post(`${BASE}/api/settings/team/mem_no_existe/password`, {
    data: { password: "lo-que-sea-123" },
  });
  ok("un miembro inexistente o de otra organización → 404", foreign.status() === 404, `HTTP ${foreign.status()}`);

  const page = await owner.newPage();
  await page.goto(`${BASE}/settings/team`);
  await page.getByRole("button", { name: `Restablecer la contraseña de ${m.name}` }).click();
  const temp = await page.getByLabel(`Contraseña temporal para ${m.name}`).inputValue();
  ok("UI: propone una temporal", temp.length >= 8, temp);
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  ok(
    "UI: la muestra una vez para compartirla",
    await until(async () => page.getByText(temp, { exact: true }).isVisible())
  );
  ok("la sesión del miembro se cerró", !(await sessionAlive(member)));
  ok("la temporal vieja ya no entra", !(await canSignIn(m.email, "temporal-inicial")));
  ok("la nueva temporal sí", await canSignIn(m.email, temp));
  await member.close();
  await page.close();
}

console.log("\n== Conector de correo ==");
if (CORREO) {
  await owner.request.post(`${BASE}/api/dev/mail-mock/_reset`);
  await owner.request.delete(`${BASE}/api/settings/email`);
  const sent = async () =>
    (await (await owner.request.get(`${BASE}/api/dev/mail-mock/_state`)).json()).sent;

  const empty = await (await owner.request.get(`${BASE}/api/settings/email`)).json();
  ok("sin conectar todavía", empty.connection === null);

  const bad = await owner.request.put(`${BASE}/api/settings/email`, {
    data: { apiKey: "re_bad_llave_revocada", fromAddress: "Negocio <no-reply@negocio.test>" },
  });
  ok("una llave que el proveedor rechaza no se guarda (422)", bad.status() === 422, `HTTP ${bad.status()}`);
  ok(
    "y sigue sin conexión",
    (await (await owner.request.get(`${BASE}/api/settings/email`)).json()).connection === null
  );
  const memberCtx = await newCtx();
  await signIn(memberCtx, user.email, userPassword);
  const notOwner = await memberCtx.request.put(`${BASE}/api/settings/email`, {
    data: { apiKey: "re_e2e_buena_1234", fromAddress: "Negocio <no-reply@negocio.test>" },
  });
  ok("un miembro no puede conectar el correo (403)", notOwner.status() === 403, `HTTP ${notOwner.status()}`);
  await memberCtx.close();

  // Por la UI.
  const page = await owner.newPage();
  await page.goto(`${BASE}/settings/email`);
  ok("Ajustes muestra «Correo»", await page.getByRole("link", { name: "Correo" }).isVisible());
  await page.getByLabel("Remitente").fill("Negocio E2E <no-reply@negocio.test>");
  await page.getByLabel("Llave (API key)").fill("re_e2e_buena_1234");
  await page.getByRole("button", { name: "Guardar y mandar prueba" }).click();
  ok(
    "UI: conectado, con prueba a tu buzón",
    await until(async () => page.getByText(`Te mandamos un correo de prueba a ${ownerEmail}`).isVisible())
  );
  ok("UI: la llave solo se ve por sus últimos 4", await page.getByText("••••1234").isVisible());
  const conn = await (await owner.request.get(`${BASE}/api/settings/email`)).json();
  ok("la API no devuelve la llave", !JSON.stringify(conn).includes("re_e2e_buena"));
  ok(
    "el correo de prueba llegó al propietario",
    (await sent()).some((x) => x.to.includes(ownerEmail) && x.subject.startsWith("Prueba de correo"))
  );
  await page.close();

  // «¿Olvidaste tu contraseña?» por correo, como la persona.
  await owner.request.post(`${BASE}/api/dev/mail-mock/_reset`);
  const otherDevice = await newCtx();
  ok("sesión abierta en otro dispositivo", await signIn(otherDevice, user.email, userPassword));
  const anon = await newCtx();
  const fp = await anon.newPage();
  await fp.goto(`${BASE}/forgot-password`);
  await fp.getByLabel("Correo", { exact: true }).fill(user.email);
  await fp.getByRole("button", { name: "Mandarme el enlace" }).click();
  ok(
    "UI: confirma sin decir si la cuenta existe",
    await until(async () => fp.getByText("tiene cuenta aquí, te llegó un enlace").isVisible())
  );
  let mail = null;
  await until(async () => {
    mail = (await sent()).find((x) => x.to.includes(user.email));
    return Boolean(mail);
  });
  ok("el correo con el enlace llegó", Boolean(mail));
  const link = mail?.text.match(/https?:\/\/\S+/)?.[0] ?? "";
  ok("el correo lleva el enlace de esta instancia", link.startsWith(BASE), link);

  const viaMail = "desde-el-correo-123";
  await fp.goto(link);
  await fp.waitForURL(/\/reset-password\?token=/, { timeout: 15000 }).catch(() => {});
  ok("el enlace abre la pantalla de contraseña nueva", fp.url().includes("/reset-password?token="), fp.url());
  await fp.getByLabel("Contraseña nueva").fill(viaMail);
  await fp.getByLabel("Repítela").fill("otra-distinta-123");
  await fp.getByRole("button", { name: "Guardar contraseña" }).click();
  ok("UI: avisa si no coinciden", await until(async () => fp.getByText("no coinciden").isVisible()));
  await fp.getByLabel("Repítela").fill(viaMail);
  await fp.getByRole("button", { name: "Guardar contraseña" }).click();
  await fp.waitForURL(/\/login\?restablecida=1/, { timeout: 15000 }).catch(() => {});
  ok("UI: vuelve al login", fp.url().includes("/login?restablecida=1"), fp.url());
  ok("la contraseña de antes ya no entra", !(await canSignIn(user.email, userPassword)));
  ok("la del correo sí", await canSignIn(user.email, viaMail));
  ok("la sesión del otro dispositivo se cerró", !(await sessionAlive(otherDevice)));
  userPassword = viaMail;

  await fp.goto(link);
  await fp.waitForLoadState("networkidle").catch(() => {});
  ok(
    "el mismo enlace no sirve dos veces",
    await until(async () => fp.getByText("Este enlace ya no sirve").isVisible())
  );

  // Sin enumeración: un correo sin cuenta recibe lo mismo y no se manda nada.
  await owner.request.post(`${BASE}/api/dev/mail-mock/_reset`);
  const ghost = await anon.request.post(`${BASE}/api/auth/request-password-reset`, {
    data: { email: `nadie-${S}@vocero.test`, redirectTo: "/reset-password" },
  });
  ok("correo sin cuenta → 200 igual", ghost.status() === 200, `HTTP ${ghost.status()}`);
  await sleep(1500);
  ok("y no se mandó ningún correo", (await sent()).length === 0);

  // El proveedor cae DESPUÉS de conectado: el formulario responde igual y rápido.
  for (const mode of ["down", "bad"]) {
    await owner.request.post(`${BASE}/api/dev/mail-mock/_fail`, { data: { mode } });
    const t0 = Date.now();
    const r = await anon.request.post(`${BASE}/api/auth/request-password-reset`, {
      data: { email: user.email, redirectTo: "/reset-password" },
    });
    const ms = Date.now() - t0;
    ok(`proveedor ${mode}: el formulario responde 200`, r.status() === 200, `HTTP ${r.status()}`);
    ok(`proveedor ${mode}: sin colgarse (${ms} ms)`, ms < 5000);
  }
  ok(
    "llave revocada: Ajustes marca la conexión con error",
    await until(async () => {
      const c = await (await owner.request.get(`${BASE}/api/settings/email`)).json();
      return c.connection?.status === "error";
    })
  );
  const errPage = await owner.newPage();
  await errPage.goto(`${BASE}/settings/email`);
  ok(
    "UI: Ajustes avisa del error",
    await until(async () => errPage.getByText("El proveedor rechazó el último envío").isVisible())
  );
  await errPage.close();
  ok("la contraseña siguió igual", await canSignIn(user.email, userPassword));
  await owner.request.post(`${BASE}/api/dev/mail-mock/_reset`);
  const del = await owner.request.delete(`${BASE}/api/settings/email`);
  ok("desconectar el correo", del.ok());
  await Promise.all([otherDevice.close(), anon.close()]);
} else {
  const r1 = await owner.request.get(`${BASE}/api/settings/email`);
  const r2 = await owner.request.post(`${BASE}/api/auth/request-password-reset`, {
    data: { email: user.email, redirectTo: "/reset-password" },
  });
  const r3 = await owner.request.get(`${BASE}/settings/email`);
  ok("sin CORREO, /api/settings/email da 404", r1.status() === 404, `HTTP ${r1.status()}`);
  ok("sin CORREO, pedir el enlace da 404", r2.status() === 404, `HTTP ${r2.status()}`);
  ok("sin CORREO, la pantalla de Ajustes no existe", r3.status() === 404, `HTTP ${r3.status()}`);
  const page = await owner.newPage();
  await page.goto(`${BASE}/settings/team`);
  ok("sin CORREO, Ajustes no muestra «Correo»", (await page.getByRole("link", { name: "Correo" }).count()) === 0);
  await page.close();
}

await browser.close();
console.log(`\n${checks - failures}/${checks} verificaciones en verde`);
process.exit(failures > 0 ? 1 : 0);
