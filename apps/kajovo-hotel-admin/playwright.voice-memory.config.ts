import { defineConfig } from "@playwright/test";
import baseline from "./playwright.baseline.config";
// Share the baseline's isolated database identity with test-only fixture subprocesses.
const servers = Array.isArray(baseline.webServer)
  ? baseline.webServer
  : [baseline.webServer];
const command =
  servers.find((server) => server?.command?.includes("init_smoke_db.py"))
    ?.command ?? "";
const match = command.match(
  /init_smoke_db\.py (\/tmp\/kajovo-baseline-[^ ]+\.db)/,
);
if (match && !process.env.VOICE_MEMORY_TEST_DB)
  process.env.VOICE_MEMORY_TEST_DB = match[1];
export default defineConfig({
  ...baseline,
  testMatch: "voice-memory.spec.ts",
  use: { ...baseline.use, trace: "off", screenshot: "off", video: "off" },
});
