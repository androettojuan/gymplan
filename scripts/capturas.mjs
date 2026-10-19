// Screenshots for the README: npm run capturas
// Runs inside `firebase emulators:exec` (Auth + Firestore), loads a sample gym and photographs
// each screen at phone size. Writes docs/capturas/*.png. Never touches the real project data.
import { mkdir, readFile } from "node:fs/promises";
import { createServer } from "vite";
import { chromium } from "playwright";
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import firebase from "firebase/compat/app";
import "firebase/compat/firestore";

const PROJECT = "gymplan-ar";
const AUTH = "http://127.0.0.1:9299";
const PORT = 5199;
const APP = `http://localhost:${PORT}`;
const OUT = "docs/capturas";
const SHOTS = "docs/capturas/pantallas";
const PUBLIC_URL = "https://gymplan-ar.web.app";

// ---------- sample data ----------
const pad = n => String(n).padStart(2, "0");
const ago = n => { const d = new Date(); d.setDate(d.getDate() - n); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const msAgo = n => Date.now() - n * 864e5;
const slug = s => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const video = name => `https://www.youtube.com/results?search_query=${encodeURIComponent(name + " técnica")}`;
const ex = (name, sets, reps, rest = "", obs = "", withVideo = true) =>
  ({ exKey: slug(name), name, sets, reps, rest, obs, video: withVideo ? video(name) : "" });

const HIPERTROFIA = {
  name: "Hipertrofia 4 días",
  notes: [
    "Calentar 10 minutos en cinta o bici antes de empezar",
    "Descansar 1 a 2 minutos entre series, salvo que diga otra cosa",
    "Si completás todas las reps con buena técnica, subí el peso la próxima vez",
  ],
  days: [
    { title: "Entrenamiento 1", exercises: [
      ex("Sentadilla con barra", "4", "8-10", "2 min", "Bajar hasta paralelo"),
      ex("Prensa 45°", "4", "12", "90 seg"),
      ex("Estocadas con mancuernas", "3", "10 c/pierna"),
      ex("Camilla de cuádriceps", "3", "15", "", "Última serie al fallo"),
      ex("Gemelos en máquina", "4", "15", "", "", false),
      ex("Plancha", "3", "40 seg", "", "", false),
    ] },
    { title: "Entrenamiento 2", exercises: [
      ex("Press de banca plano", "4", "8", "2 min"),
      ex("Press inclinado con mancuernas", "3", "10"),
      ex("Aperturas en polea", "3", "12"),
      ex("Press militar con mancuernas", "4", "10"),
      ex("Elevaciones laterales", "3", "15"),
      ex("Tríceps en polea con soga", "3", "12"),
    ] },
    { title: "Entrenamiento 3", exercises: [
      ex("Peso muerto rumano", "4", "10", "2 min", "Espalda neutra"),
      ex("Camilla femoral", "3", "12"),
      ex("Hip thrust", "4", "10"),
      ex("Abductores en máquina", "3", "15", "", "", false),
      ex("Gemelos en máquina", "4", "15", "", "", false),
      ex("Crunch abdominal", "3", "20", "", "", false),
    ] },
    { title: "Entrenamiento 4", exercises: [
      ex("Jalón al pecho", "4", "10"),
      ex("Remo con barra", "4", "10", "2 min"),
      ex("Remo en polea baja", "3", "12"),
      ex("Face pull", "3", "15"),
      ex("Curl con barra", "3", "10"),
      ex("Curl martillo", "3", "12"),
    ] },
  ],
};
const PRINCIPIANTE = {
  name: "Principiante 3 días",
  notes: ["Priorizar la técnica: pedile al profe que te corrija las primeras semanas"],
  days: [1, 2, 3].map(n => ({ title: `Entrenamiento ${n}`, exercises: [
    ex("Sentadilla goblet", "3", "12"), ex("Press de banca plano", "3", "12"), ex("Jalón al pecho", "3", "12"),
    ex("Peso muerto rumano", "3", "12"), ex("Plancha", "3", "30 seg", "", "", false),
  ] })),
};
const FUERZA = {
  name: "Fuerza 3 días",
  notes: ["Series de 5: subir 2,5 kg por semana mientras salgan todas"],
  days: [1, 2, 3].map(n => ({ title: `Entrenamiento ${n}`, exercises: [
    ex("Sentadilla con barra", "5", "5", "3 min"), ex(n === 2 ? "Press militar con barra" : "Press de banca plano", "5", "5", "3 min"),
    ex(n === 3 ? "Peso muerto convencional" : "Remo con barra", n === 3 ? "1" : "5", "5", "3 min"),
  ] })),
};

// Martina trains Monday, Tuesday, Thursday and Friday; today she did the first two exercises of day 1.
// [start kg, kg added per week]; null: no weight (time or bodyweight).
const PROGRESS = {
  "sentadilla-con-barra": [40, 2.5], "prensa-45": [80, 5], "estocadas-con-mancuernas": [8, 0.6],
  "camilla-de-cuadriceps": [25, 1.5], "gemelos-en-maquina": [40, 2.5], "plancha": null,
  "press-de-banca-plano": [25, 1.2], "press-inclinado-con-mancuernas": [8, 0.6], "aperturas-en-polea": [7.5, 0.4],
  "press-militar-con-mancuernas": [7, 0.5], "elevaciones-laterales": [4, 0.3], "triceps-en-polea-con-soga": [12.5, 0.8],
  "peso-muerto-rumano": [35, 2.5], "camilla-femoral": [20, 1.2], "hip-thrust": [50, 5], "abductores-en-maquina": [35, 2],
  "crunch-abdominal": null,
  "jalon-al-pecho": [30, 1.5], "remo-con-barra": [25, 1.5], "remo-en-polea-baja": [27.5, 1.2], "face-pull": [10, 0.5],
  "curl-con-barra": [12.5, 0.6], "curl-martillo": [6, 0.4],
};
const DAY_OFFSET = [0, 6, 4, 3]; // days ago of each training day this week (today is day 1)
const WEEKS = 8;
const round25 = w => Math.round(w / 1.25) * 1.25;

function martinaLogs() {
  const logs = {};
  HIPERTROFIA.days.forEach((day, di) => day.exercises.forEach((e, ei) => {
    for (let wk = WEEKS - 1; wk >= 0; wk--) {
      if (di === 0 && ei >= 2 && wk === 0) continue;
      const d = ago(DAY_OFFSET[di] + wk * 7);
      const p = PROGRESS[e.exKey];
      // Every third week stalls, like a real log.
      const weeks = WEEKS - 1 - wk - Math.floor((WEEKS - 1 - wk) / 3);
      const w = p ? round25(p[0] + p[1] * weeks) : null;
      const r = e.reps.replace(/ c\/pierna| seg/, "").split("-").pop();
      const n = di === 0 && ei === 0 && wk === 0 ? "La última serie costó, mantener" : "";
      (logs[e.exKey] ||= { name: e.name, entries: [] }).entries.push({ d, w, r, n });
    }
  }));
  for (const l of Object.values(logs)) l.entries.sort((a, b) => a.d.localeCompare(b.d));
  return logs;
}
const BODY = [64.8, 64.5, 64.6, 64.1, 63.8, 63.9, 63.4, 63.1, 62.9].map((w, i, a) => ({ d: ago((a.length - 1 - i) * 7 + 1), w }));

const PEOPLE = {
  super: { sub: "super", email: "juan.androetto36@gmail.com", name: "Juan Manuel" },
  owner: { sub: "marcelo", email: "marcelo.sosa@ejemplo.com", name: "Marcelo Sosa" },
  staff: { sub: "ignacio", email: "ignacio.perez@ejemplo.com", name: "Ignacio Pérez" },
  martina: { sub: "martina", email: "martina.lopez@ejemplo.com", name: "Martina López" },
  franco: { sub: "franco", email: "franco.medina@ejemplo.com", name: "Franco Medina" },
  nuevo: { sub: "nuevo", email: "agustina.rios@ejemplo.com", name: "Agustina Ríos" },
};
const MEMBERS = [
  ["Lucas Fernández", "hipertrofia"], ["Sofía Gómez", "principiante"], ["Tomás Ruiz", null],
  ["Valentina Díaz", "hipertrofia"], ["Agustín Romero", "fuerza"], ["Camila Herrera", "principiante"],
  ["Julieta Torres", "principiante"], ["Bruno Acosta", "fuerza"], ["Micaela Benítez", "hipertrofia"],
];
const FRANCO_INVITE = "k7Qm2xPa9RtLw4Nc8VhE";

// The Auth emulator accepts an unsigned Google token; the same `sub` signs in as the same user later.
async function authUser(p) {
  const res = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=demo`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      requestUri: "http://localhost", returnSecureToken: true,
      postBody: `id_token=${encodeURIComponent(JSON.stringify({ sub: p.sub, email: p.email, name: p.name, email_verified: true }))}&providerId=google.com`,
    }),
  });
  if (!res.ok) throw new Error(`Auth emulator: ${res.status} ${await res.text()}`);
  return (await res.json()).localId;
}

async function seed() {
  await fetch(`${AUTH}/emulator/v1/projects/${PROJECT}/accounts`, { method: "DELETE" });
  const uid = {};
  for (const [k, p] of Object.entries(PEOPLE)) uid[k] = await authUser(p);

  const env = await initializeTestEnvironment({ projectId: PROJECT, firestore: { host: "127.0.0.1", port: 8180 } });
  await env.clearFirestore();
  const ts = ms => firebase.firestore.Timestamp.fromMillis(ms);
  const NEVER = Date.UTC(2100, 0, 1);
  await env.withSecurityRulesDisabled(async ctx => {
    const f = ctx.firestore();
    const member = (gym, id, role, p, joinedDays, templateId = null) => Promise.all([
      f.doc(`gyms/${gym}/members/${id}`).set({ role, name: p.name, email: p.email, photoURL: "", joinedAt: msAgo(joinedDays), inviteId: null, templateId }),
      f.doc(`users/${id}/gyms/${gym}`).set({ role, gymName: { roma: "Roma Gym", titan: "Titán Fitness", norte: "Club Atlético Norte" }[gym], joinedAt: msAgo(joinedDays) }),
    ]);
    const invite = (token, data) => f.doc(`invites/${token}`).set({
      gymName: "Roma Gym", gymId: "roma", templateId: null, single: true, label: "", usedBy: null,
      createdBy: uid.owner, active: true, ...data,
    });

    // Roma Gym: the gym in every screenshot.
    await f.doc("gyms/roma").set({ name: "Roma Gym", createdAt: msAgo(70), createdBy: uid.super });
    for (const [id, p, days] of [["hipertrofia", HIPERTROFIA, 9], ["principiante", PRINCIPIANTE, 21], ["fuerza", FUERZA, 34]]) {
      const data = { ...p, updatedAt: msAgo(days), updatedBy: uid.owner };
      await f.doc(`gyms/roma/templates/${id}`).set(data);
      await f.doc(`gyms/roma/templates/${id}/versions/v1`).set(data);
    }
    await member("roma", uid.owner, "owner", PEOPLE.owner, 69);
    await member("roma", uid.staff, "staff", PEOPLE.staff, 60);
    await member("roma", uid.martina, "member", PEOPLE.martina, 58, "hipertrofia");
    for (const [i, [name, tpl]] of MEMBERS.entries()) {
      const p = { name, email: `${slug(name).replace("-", ".")}@ejemplo.com` };
      await member("roma", `socio${i}`, "member", p, 50 - i * 4, tpl);
    }
    for (const [k, l] of Object.entries(martinaLogs())) await f.doc(`gyms/roma/members/${uid.martina}/logs/${k}`).set(l);
    await f.doc(`gyms/roma/members/${uid.martina}/body/main`).set({ entries: BODY });

    await invite(FRANCO_INVITE, { role: "member", templateId: "hipertrofia", label: "Franco Medina", createdAt: msAgo(1), expiresAt: ts(Date.now() + 29 * 864e5) });
    await invite("generalRomaGym000001", { role: "member", single: false, label: "", createdAt: msAgo(20), expiresAt: ts(Date.now() + 70 * 864e5) });
    await invite("julietaTorres0000001", { role: "member", templateId: "principiante", label: "Julieta Torres", createdAt: msAgo(28), expiresAt: ts(Date.now() + 2 * 864e5), usedBy: "socio6" });
    await invite("profeTardeRomaGym001", { role: "staff", label: "Profe de la tarde", createdAt: msAgo(3), expiresAt: ts(NEVER) });

    // Two more gyms, for the super admin screen.
    await f.doc("gyms/titan").set({ name: "Titán Fitness", createdAt: msAgo(40), createdBy: uid.super, active: false });
    await member("titan", "carolina", "owner", { name: "Carolina Vega", email: "carolina@ejemplo.com" }, 39);
    for (let i = 0; i < 4; i++) await member("titan", `titan${i}`, "member", { name: `Socio ${i}`, email: "" }, 30);
    await f.doc("gyms/norte").set({ name: "Club Atlético Norte", createdAt: msAgo(2), createdBy: uid.super });
    await invite("ownerNorte0000000001", { gymId: "norte", gymName: "Club Atlético Norte", role: "owner", label: "Gustavo", createdBy: uid.super, createdAt: msAgo(2), expiresAt: ts(Date.now() + 28 * 864e5) });
  });
  await env.cleanup();
  return uid;
}

// ---------- screenshots ----------
const PHONE = {
  viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
  locale: "es-AR", timezoneId: "America/Argentina/Buenos_Aires",
};

async function session(browser, who, { dark = false } = {}) {
  const ctx = await browser.newContext({ ...PHONE, colorScheme: dark ? "dark" : "light" });
  const page = await ctx.newPage();
  await page.goto(APP);
  if (who) {
    await page.waitForFunction(() => "gpSignIn" in window);
    await page.evaluate(p => window.gpSignIn(p.sub, p.email, p.name), PEOPLE[who]);
  }
  return page;
}

async function settle(page) {
  await page.waitForSelector(".loading", { state: "detached" }).catch(() => {});
  await page.evaluate(() => document.fonts.ready);
  // Hide toasts and point shared links at the real site instead of the local server.
  await page.evaluate(([local, pub]) => {
    document.querySelectorAll(".toast").forEach(t => { t.hidden = true; });
    document.querySelectorAll(".link-box").forEach(b => { b.textContent = b.textContent.replace(local, pub); });
  }, [APP, PUBLIC_URL]);
  await page.waitForTimeout(300);
}

async function shot(page, name) {
  await settle(page);
  await page.screenshot({ path: `${SHOTS}/${name}.png` });
  console.log("  ", name);
}

// Scrolls so `selector` sits just below the sticky bars.
const scrollTo = (page, selector, offset = 70) =>
  page.evaluate(([s, o]) => { const el = document.querySelector(s); window.scrollTo(0, el.getBoundingClientRect().top + scrollY - o); }, [selector, offset]);

async function memberShots(browser, dark) {
  const sfx = dark ? "-oscuro" : "";
  const page = await session(browser, "martina", { dark });
  await page.waitForSelector(".days");
  await shot(page, `socio-entrenar${sfx}`);
  if (!dark) {
    await page.locator(".ex-head", { hasText: "Sentadilla con barra" }).click();
    await page.waitForSelector(".hist svg");
    await scrollTo(page, ".ex.open", 64);
    await shot(page, "socio-ejercicio");
    await page.locator(".ex-head", { hasText: "Sentadilla con barra" }).click();
  }
  await page.getByRole("button", { name: "Progreso" }).click();
  await page.waitForSelector(".card svg");
  await shot(page, `socio-progreso${sfx}`);
  if (!dark) {
    await page.locator(".ex-head.lift", { hasText: "Hip thrust" }).click();
    await page.waitForSelector(".lifts .ex.open svg");
    await scrollTo(page, ".lifts", 150);
    await shot(page, "socio-levantamientos");
  }
  await page.context().close();
}

async function staffShots(browser, uid) {
  const page = await session(browser, "owner");
  await page.waitForSelector(".rows .row-link");
  await shot(page, "profe-socios");
  await page.getByRole("button", { name: "Planes" }).click();
  await page.waitForSelector(".rows .row-link");
  await shot(page, "profe-planes");

  await page.goto(`${APP}/g/roma/plan/hipertrofia`);
  await page.waitForSelector(".day-edit");
  await shot(page, "profe-editor");

  await page.goto(`${APP}/g/roma/socio/${uid.martina}`);
  await page.waitForSelector(".plan-summary");
  await shot(page, "profe-socio");

  await page.goto(`${APP}/g/roma`);
  await page.getByRole("button", { name: "Invitar" }).click();
  await page.fill("#inv-label", "Rocío Morales");
  await page.selectOption("#inv-plan", { label: "Principiante 3 días" });
  await page.getByRole("button", { name: "Crear link" }).click();
  await page.waitForSelector(".share");
  await shot(page, "profe-invitar");
  await scrollTo(page, ".card + .card", 16);
  await shot(page, "profe-links");

  await page.goto(`${APP}/g/roma`);
  await page.getByRole("button", { name: "Equipo" }).click();
  await page.waitForSelector("#emp-label");
  await shot(page, "profe-equipo");
  await page.context().close();
}

async function otherShots(browser) {
  let page = await session(browser, null);
  await page.waitForSelector(".hero-card");
  await shot(page, "inicio-login");
  await page.context().close();

  page = await session(browser, "franco");
  await page.goto(`${APP}/join/${FRANCO_INVITE}`);
  await page.waitForSelector(".hero-card .big-btn");
  await shot(page, "inicio-invitacion");
  await page.context().close();

  page = await session(browser, "nuevo");
  await page.waitForSelector(".invite-needed");
  await shot(page, "inicio-sin-invitacion");
  await page.context().close();

  page = await session(browser, "super");
  await page.goto(`${APP}/admin`);
  await page.waitForFunction(() => ["Marcelo Sosa", "Carolina Vega", "Esperando"].every(t => document.body.innerText.includes(t)));
  await shot(page, "admin");
  await page.context().close();
}

// Phones side by side with a caption under each: the images the README shows.
const COMPOSITES = {
  portada: [["socio-entrenar", "El socio ve su plan"], ["socio-ejercicio", "Anota sus pesos"], ["socio-progreso", "Y ve su progreso"], ["profe-socios", "El gimnasio sigue a cada socio"]],
  socio: [["socio-entrenar", "Entrenar: el día y sus ejercicios"], ["socio-ejercicio", "Anotar el peso y ver el historial"], ["socio-progreso", "Peso corporal"], ["socio-levantamientos", "Cada levantamiento en el tiempo"]],
  planes: [["profe-planes", "Los planes del gimnasio"], ["profe-editor", "Editor, o importar el PDF"], ["profe-socio", "Ficha de cada socio"]],
  invitaciones: [["profe-invitar", "Crear el link y mandarlo"], ["inicio-invitacion", "El socio lo abre"], ["profe-links", "Links creados"], ["profe-equipo", "El dueño suma empleados"]],
  oscuro: [["socio-entrenar-oscuro", "Tema oscuro: entrenar"], ["socio-progreso-oscuro", "Tema oscuro: progreso"]],
  admin: [["admin", "Súper admin: gimnasios"], ["inicio-login", "Entrar con Google"], ["inicio-sin-invitacion", "Sin invitación"]],
};

async function composites(browser) {
  const page = await browser.newPage({ deviceScaleFactor: 1.5 });
  for (const [name, items] of Object.entries(COMPOSITES)) {
    const imgs = await Promise.all(items.map(async ([f]) => (await readFile(`${SHOTS}/${f}.png`)).toString("base64")));
    await page.setContent(`<!doctype html><html><head>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600&display=swap">
      <style>
        body { margin: 0; background: #e8e1df; font-family: "Barlow Condensed", sans-serif; }
        .row { display: inline-flex; gap: 36px; padding: 40px 44px 30px; }
        figure { margin: 0; text-align: center; }
        img { display: block; width: 300px; border-radius: 22px; box-shadow: 0 1px 2px #0002, 0 12px 32px #4a1d1f33; }
        figcaption { margin-top: 14px; font-size: 21px; color: #3b2c2d; letter-spacing: .01em; min-height: 26px; }
      </style></head><body><div class="row">
      ${items.map(([, cap], i) => `<figure><img src="data:image/png;base64,${imgs[i]}"><figcaption>${cap}</figcaption></figure>`).join("")}
      </div></body></html>`);
    await page.evaluate(() => document.fonts.ready);
    await page.locator(".row").screenshot({ path: `${OUT}/${name}.png` });
    console.log("  ", `${name}.png`);
  }
  await page.close();
}

// ---------- run ----------
await mkdir(SHOTS, { recursive: true });
console.log("Cargando datos de ejemplo…");
const uid = await seed();
process.env.VITE_USE_EMULATOR = "true";
const server = await createServer({ server: { port: PORT, strictPort: true }, logLevel: "warn" });
await server.listen();
// Date inputs follow the browser language, not the page locale: dd/mm/aaaa needs es-AR here.
const browser = await chromium.launch({ args: ["--lang=es-AR"], env: { ...process.env, LANG: "es_AR.UTF-8" } });
try {
  console.log("Pantallas:");
  await memberShots(browser, false);
  await memberShots(browser, true);
  await staffShots(browser, uid);
  await otherShots(browser);
  console.log("Composiciones:");
  await composites(browser);
} finally {
  await browser.close();
  await server.close();
}
