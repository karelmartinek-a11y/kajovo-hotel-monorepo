import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";
import { getAdminCredentials } from "../test-admin-credentials";

test("memory and structured notes CRUD persists via real authenticated API", async ({
  page,
  request,
}, info) => {
  const credentials = getAdminCredentials();
  await page.goto("/admin/login");
  await page.getByLabel(/e-mail administrátora/i).fill(credentials.email);
  await page.getByLabel(/heslo administrátora/i).fill(credentials.password);
  await page.getByRole("button", { name: /přihlásit/i }).click();
  await expect(page).toHaveURL(/\/admin\/?$/);
  await page.goto("/admin/hlasovy-chat");
  await expect(
    page.getByRole("heading", { name: "Hlasový chat", exact: true }),
  ).toBeVisible();
  const panel = page.getByRole("region", { name: "Správa hlasové paměti" });
  const subject = `CI odpovědi ${info.project.name}`;
  await panel.getByLabel("Předmět nové paměti").fill(subject);
  await panel
    .getByLabel("Nový obsah paměti")
    .fill("Preferuji krátké odpovědi.");
  await panel.getByRole("button", { name: "Zapamatovat", exact: true }).click();
  await expect(panel.getByRole("status")).toContainText("uložena");
  await page.reload();
  await panel.getByRole("button", { name: new RegExp(subject) }).click();
  await expect(panel.getByLabel("Obsah paměti", { exact: true })).toHaveValue(
    "Preferuji krátké odpovědi.",
  );
  await panel
    .getByLabel("Obsah paměti", { exact: true })
    .fill("Preferuji podrobné odpovědi.");
  await panel.getByLabel("Připnout", { exact: true }).check();
  await panel.getByRole("button", { name: "Uložit paměť" }).click();
  await expect(panel.getByRole("status")).toContainText("uložena");
  const token = (await page.context().cookies()).find(
    (cookie) => cookie.name === "kajovo_csrf",
  )!.value;
  const stored = (
    await (await page.request.get("/api/v1/admin/voice-memory/memories")).json()
  ).memories.find((row: { subject: string }) => row.subject === subject);
  const concurrent = await page.request.post(
    "/api/v1/admin/voice-memory/operations",
    {
      headers: { "x-csrf-token": token },
      data: {
        request: {
          operation: "memory_update",
          id: stored.id,
          revision: stored.revision,
          subject: stored.subject,
          content: "Souběžná oprava.",
          tags: stored.tags,
          status: stored.status,
          pinned: stored.pinned,
          importance: stored.importance,
        },
      },
    },
  );
  expect(concurrent.status()).toBe(200);
  await panel.getByRole("button", { name: "Uložit paměť" }).click();
  await expect(panel.getByRole("status")).toContainText("mezitím změnil");
  await panel.getByRole("button", { name: "Obnovit", exact: true }).click();
  await expect(panel.getByLabel("Obsah paměti", { exact: true })).toHaveValue(
    "Souběžná oprava.",
  );
  await panel.getByRole("button", { name: "Deaktivovat", exact: true }).click();
  await expect(
    panel.getByRole("button", { name: "Aktivovat", exact: true }),
  ).toBeVisible();
  await panel.getByRole("button", { name: "Zapomenout", exact: true }).click();
  await panel.getByRole("button", { name: "Potvrdit zapomenutí" }).click();
  await expect(
    panel.getByRole("button", { name: new RegExp(subject) }),
  ).toHaveCount(0);
  await panel.getByRole("tab", { name: "Lístky", exact: true }).click();
  const title = `CI Nákup ${info.project.name}`;
  await panel.getByLabel("Název nového lístku").fill(title);
  await panel
    .getByLabel("Položky, každá na samostatném řádku")
    .fill("žárovky\nbaterie");
  await panel
    .getByRole("button", { name: "Vytvořit lístek", exact: true })
    .click();
  await expect(panel.getByLabel("Položka 1", { exact: true })).toHaveValue(
    "žárovky",
  );
  await panel
    .getByLabel("Název lístku", { exact: true })
    .fill(title + " hotel");
  await panel.getByRole("button", { name: "Přejmenovat", exact: true }).click();
  await expect(panel.getByRole("status")).toContainText("uložena");
  await panel.getByLabel("Položka 1", { exact: true }).fill("LED žárovky");
  await panel
    .getByRole("button", { name: "Uložit položku 1", exact: true })
    .click();
  await expect(panel.getByRole("status")).toContainText("uložena");
  await panel
    .getByRole("button", { name: "Posunout položku 1 dolů", exact: true })
    .click();
  await expect(panel.getByLabel("Položka 1", { exact: true })).toHaveValue(
    "baterie",
  );
  await panel
    .getByRole("button", { name: "Odstranit položku 1", exact: true })
    .click();
  await expect(panel.getByLabel("Položka 1", { exact: true })).toHaveValue(
    "LED žárovky",
  );
  await panel.getByLabel("Nová položka", { exact: true }).fill("balení kávy");
  await panel
    .getByRole("button", { name: "Přidat položku", exact: true })
    .click();
  await expect(panel.getByLabel("Položka 2", { exact: true })).toHaveValue(
    "balení kávy",
  );
  await page.reload();
  await panel.getByRole("tab", { name: "Lístky", exact: true }).click();
  await panel
    .getByRole("button", { name: new RegExp(title + " hotel") })
    .click();
  await expect(panel.getByLabel("Položka 1", { exact: true })).toHaveValue(
    "LED žárovky",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBeTruthy();
  await expect(
    page.getByRole("heading", { name: "Hlasový chat", exact: true }),
  ).toBeVisible();
  await panel
    .getByRole("button", { name: "Smazat lístek", exact: true })
    .click();
  await panel.getByRole("button", { name: "Potvrdit smazání lístku" }).click();
  await expect(
    panel.getByRole("button", { name: new RegExp(title + " hotel") }),
  ).toHaveCount(0);
  await panel
    .getByRole("tab", { name: "Historie rozhovorů", exact: true })
    .click();
  await expect(
    panel.getByText("Žádné položky.", { exact: true }),
  ).toBeVisible();
  expect(
    (
      await request.post("/api/auth/admin/login", { data: credentials })
    ).status(),
  ).toBe(200);
  const csrf = (await request.storageState()).cookies.find(
    (cookie) => cookie.name === "kajovo_csrf",
  )!.value;
  const result = await request.post("/api/v1/admin/voice-memory/search", {
    headers: { "x-csrf-token": csrf },
    data: {
      operation: "memory_search",
      query: subject,
      scope: "all",
      tags: [],
      date_from: null,
      date_to: null,
      limit: 8,
    },
  });
  expect((await result.json()).memories).toEqual([]);
  await panel.screenshot({ path: info.outputPath("voice-memory-empty.png") });
});

test("curated history is visible and searchable without a full transcript", async ({
  page,
}, info) => {
  const credentials = getAdminCredentials();
  await page.goto("/admin/login");
  await page.getByLabel(/e-mail administrátora/i).fill(credentials.email);
  await page.getByLabel(/heslo administrátora/i).fill(credentials.password);
  await page.getByRole("button", { name: /přihlásit/i }).click();
  await expect(page).toHaveURL(/\/admin\/?$/);
  await page.goto("/admin/hlasovy-chat");
  await expect(
    page.getByLabel("Automaticky vytvářet stručnou paměť a souhrny"),
  ).toBeVisible();
  const database = process.env.VOICE_MEMORY_TEST_DB;
  expect(database).toMatch(/^\/tmp\/kajovo-baseline-/);
  // Test fixture runs the real curator persistence with a deterministic extractor in the isolated API database.
  execFileSync(
    "python3.11",
    [
      "-c",
      `
import asyncio
from sqlalchemy import select
from app.db.session import SessionLocal
from dagmar_server.models import VoiceMemoryPrincipal
from app.services.voice_memory_curator import TurnBuffer,Curated
with SessionLocal() as db:
    from dagmar_server.migrations import SHARED_ID
    pid=SHARED_ID
async def fake(*args):
    return Curated(candidates=[],topics=['Projekt X','parkování'],summary='Projekt X: dohodnut test parkování.',decisions=['Ověřit parkování'],open_points=['Dokončit test'],continuation='Pokračovat testem projektu X.')
async def seed():
    b=TurnBuffer(pid,${JSON.stringify("browser-project-" + info.project.name)},'test-only',factory=SessionLocal,extractor=fake)
    b.add('fixture-turn',0,'user','Synthetic conversation for project X.')
    await b.close()
from app.services.dagmar_adapter import create_dagmar
from dagmar_server.ports import bind
with bind(create_dagmar().ports):
    asyncio.run(seed())
`,
    ],
    {
      cwd: "../kajovo-hotel-api",
      env: {
        ...process.env,
        KAJOVO_API_DATABASE_URL: "sqlite:///" + database,
        KAJOVO_API_ENVIRONMENT: "test",
      },
      stdio: "pipe",
    },
  );
  const panel = page.getByRole("region", { name: "Správa hlasové paměti" });
  await panel.getByRole("tab", { name: "Historie rozhovorů" }).click();
  await panel.getByRole("button", { name: /Projekt X, parkování/ }).click();
  await expect(
    panel.getByText("Projekt X: dohodnut test parkování.", { exact: true }),
  ).toBeVisible();
  await expect(
    panel.getByText("Pokračovat testem projektu X.", { exact: true }),
  ).toBeVisible();
  await panel.getByLabel("Hledat v paměti").fill("parkování");
  await panel.getByRole("button", { name: "Hledat", exact: true }).click();
  await expect(
    panel.getByRole("button", { name: /Projekt X, parkování/ }),
  ).toBeVisible();
  await expect(
    panel.getByText("Synthetic conversation for project X.", { exact: true }),
  ).toHaveCount(0);
});
