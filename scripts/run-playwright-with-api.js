#!/usr/bin/env node
"use strict";

const { spawn } = require("child_process");
const { once } = require("events");
const fs = require("fs");
const http = require("http");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const API_DIR = path.join(ROOT, "apps", "kajovo-hotel-api");
const TMP_DIR = path.join(ROOT, ".tmp");

const pnpmCmd = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

function parseArgs() {
  const args = process.argv.slice(2);
  const result = { app: null, tests: [] };
  let i = 0;
  while (i < args.length) {
    const token = args[i];
    if (token === "--app" && i + 1 < args.length) {
      result.app = args[i + 1];
      i += 2;
      continue;
    }
    result.tests.push(token);
    i += 1;
  }
  if (!result.app) {
    throw new Error("--app argument is required");
  }
  if (result.tests.length === 0) {
    throw new Error("At least one Playwright spec must be provided");
  }
  return result;
}

function ensureTmp() {
  if (!fs.existsSync(TMP_DIR)) {
    fs.mkdirSync(TMP_DIR, { recursive: true });
  }
}

async function waitForHealthy(url, timeoutMs = 30000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const req = http.get(url, (res) => {
        if (res.statusCode === 200) {
          res.resume();
          resolve();
          return;
        }
        res.resume();
        retry();
      });
      req.on("error", retry);

      function retry() {
        if (Date.now() - start >= timeoutMs) {
          reject(new Error(`Health check timed out after ${timeoutMs}ms`));
          return;
        }
        setTimeout(attempt, 500);
      }
    };
    attempt();
  });
}

function startBackend(envOverrides = {}) {
  const dbPath = path.join(TMP_DIR, "playwright-api.db");
  try {
    if (fs.existsSync(dbPath)) {
      fs.unlinkSync(dbPath);
    }
  } catch {
    /* ignore */
  }
  const mediaRoot = path.join(TMP_DIR, "media");
  fs.mkdirSync(mediaRoot, { recursive: true });

  const env = {
    ...process.env,
    KAJOVO_API_DATABASE_URL: `sqlite:///${dbPath}`,
    KAJOVO_API_MEDIA_ROOT: mediaRoot,
    KAJOVO_API_SESSION_SECRET: "kajovo-playwright-secret",
    KAJOVO_API_ADMIN_PASSWORD: process.env.KAJOVO_API_ADMIN_PASSWORD || process.env.HOTEL_ADMIN_PASSWORD || "admin123",
    KAJOVO_API_ADMIN_EMAIL: process.env.KAJOVO_API_ADMIN_EMAIL || process.env.HOTEL_ADMIN_EMAIL || "admin@kajovohotel.local",
    KAJOVO_API_ENVIRONMENT: "test",
    ...envOverrides,
  };

  const pythonCmd = process.platform === "win32" ? "python.exe" : "python";
  const backend = spawn(
    pythonCmd,
    ["-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8000", "--no-access-log"],
    {
      cwd: API_DIR,
      env,
      stdio: "inherit",
    }
  );

  backend.on("exit", (code) => {
    if (code !== null && code !== 0) {
      console.error(`Backend exited with code ${code}`);
    }
  });

  return backend;
}

async function runPlaywright(appDir, tests) {
  const binName = "playwright";
  const playwrightPathRaw = path.join(appDir, "node_modules", ".bin", binName);
  const isWindows = process.platform === "win32";
  const runnerCmd = isWindows ? "cmd.exe" : playwrightPathRaw;
  const runnerArgs = isWindows
    ? ["/c", `${playwrightPathRaw}.cmd`, "test", ...tests]
    : ["test", ...tests];
  return new Promise((resolve, reject) => {
    const runner = spawn(runnerCmd, runnerArgs, {
      cwd: appDir,
      stdio: "inherit",
    });
    runner.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        const error = new Error(`Playwright exited with code ${code}`);
        error.code = code;
        reject(error);
      }
    });
    runner.on("error", (err) => {
      reject(err);
    });
  });
}

async function main() {
  const { app, tests } = parseArgs();
  const appDir = path.resolve(ROOT, app);
  if (!fs.existsSync(appDir)) {
    throw new Error(`Application folder not found: ${appDir}`);
  }
  ensureTmp();
  const backend = startBackend();
  const exitHandler = async () => {
    if (!backend.killed) {
      backend.kill("SIGTERM");
      await once(backend, "exit").catch(() => {});
    }
  };

  process.on("SIGINT", () => {
    exitHandler().then(() => process.exit(1));
  });
  process.on("SIGTERM", () => {
    exitHandler().then(() => process.exit(1));
  });

  try {
    await waitForHealthy("http://127.0.0.1:8000/health", 30000);
    await runPlaywright(appDir, tests);
  } finally {
    await exitHandler();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
