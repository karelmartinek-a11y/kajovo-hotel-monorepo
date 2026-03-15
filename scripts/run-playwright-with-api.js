#!/usr/bin/env node
"use strict";

const { spawn, spawnSync } = require("child_process");
const { once } = require("events");
const fs = require("fs");
const http = require("http");
const net = require("net");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const API_DIR = path.join(ROOT, "apps", "kajovo-hotel-api");
const TMP_DIR = path.join(ROOT, ".tmp");

const pnpmCmd = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

function resolveAdminCredentials() {
  const email = process.env.KAJOVO_API_ADMIN_EMAIL || process.env.HOTEL_ADMIN_EMAIL;
  const password = process.env.KAJOVO_API_ADMIN_PASSWORD || process.env.HOTEL_ADMIN_PASSWORD;
  const isCi = process.env.CI === "true" || process.env.GITHUB_ACTIONS === "true";

  if (email && password) {
    return { email, password };
  }
  if (isCi) {
    throw new Error(
      "Admin test credentials are missing. Set HOTEL_ADMIN_EMAIL/HOTEL_ADMIN_PASSWORD or KAJOVO_API_ADMIN_EMAIL/KAJOVO_API_ADMIN_PASSWORD."
    );
  }
  return {
    email: "admin@kajovohotel.local",
    password: "admin123",
  };
}

function parseArgs() {
  const args = process.argv.slice(2);
  const result = { app: null, tests: [], playwrightArgs: [] };
  let i = 0;
  while (i < args.length) {
    const token = args[i];
    if (token === "--") {
      result.playwrightArgs = args.slice(i + 1);
      break;
    }
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

function uniqueTmpPath(name) {
  const suffix = `${process.pid}-${Date.now()}`;
  return path.join(TMP_DIR, `${name}-${suffix}`);
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

async function reservePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() => reject(new Error("Failed to reserve a TCP port.")));
        return;
      }
      const { port } = address;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(port);
      });
    });
  });
}

function startBackend(port, envOverrides = {}) {
  const adminCredentials = resolveAdminCredentials();
  const dbPath = uniqueTmpPath("playwright-api") + ".db";
  const mediaRoot = uniqueTmpPath("media");
  fs.mkdirSync(mediaRoot, { recursive: true });

  const env = {
    ...process.env,
    KAJOVO_API_DATABASE_URL: `sqlite:///${dbPath}`,
    KAJOVO_API_MEDIA_ROOT: mediaRoot,
    KAJOVO_API_SESSION_SECRET: "kajovo-playwright-secret",
    KAJOVO_API_ADMIN_PASSWORD: adminCredentials.password,
    KAJOVO_API_ADMIN_EMAIL: adminCredentials.email,
    KAJOVO_API_ENVIRONMENT: "test",
    PLAYWRIGHT_API_PORT: String(port),
    ...envOverrides,
  };

  const pythonCmd = process.platform === "win32" ? "python.exe" : "python";
  const initScript = `
import hashlib
import os
import sqlite3
from sqlalchemy import create_engine
from app.db.models import Base

db_url = os.environ["KAJOVO_API_DATABASE_URL"]
db_path = db_url.removeprefix("sqlite:///")
engine = create_engine(db_url)
Base.metadata.create_all(bind=engine)

def scrypt_hash(password: str, salt: bytes) -> str:
    digest = hashlib.scrypt(password.encode("utf-8"), salt=salt, n=2**14, r=8, p=1)
    return f"scrypt\${salt.hex()}\${digest.hex()}"

with sqlite3.connect(db_path) as connection:
    connection.execute(
        """
        INSERT INTO portal_users (first_name, last_name, email, password_hash, is_active)
        VALUES (?, ?, ?, ?, 1)
        """,
        (
            "Admin",
            "User",
            os.environ["KAJOVO_API_ADMIN_EMAIL"],
            scrypt_hash(os.environ["KAJOVO_API_ADMIN_PASSWORD"], b"playwright-admin-salt"),
        ),
    )
    connection.execute(
        """
        INSERT INTO portal_user_roles (user_id, role)
        VALUES ((SELECT id FROM portal_users WHERE email = ?), ?)
        """,
        (os.environ["KAJOVO_API_ADMIN_EMAIL"], "admin"),
    )
    connection.commit()
`;
  const initResult = spawnSync(pythonCmd, ["-c", initScript], {
    cwd: API_DIR,
    env,
    stdio: "inherit",
  });
  if (initResult.status !== 0) {
    throw new Error(`API database bootstrap failed with code ${initResult.status ?? "unknown"}`);
  }
  const backend = spawn(
    pythonCmd,
    ["-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", String(port), "--no-access-log"],
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

async function runPlaywright(appDir, tests, playwrightArgs = [], envOverrides = {}) {
  const binName = "playwright";
  const playwrightPathRaw = path.join(appDir, "node_modules", ".bin", binName);
  const isWindows = process.platform === "win32";
  const runnerCmd = isWindows ? "cmd.exe" : playwrightPathRaw;
  const runnerArgs = isWindows
    ? ["/c", `${playwrightPathRaw}.cmd`, "test", ...tests, ...playwrightArgs]
    : ["test", ...tests, ...playwrightArgs];
  return new Promise((resolve, reject) => {
    const runner = spawn(runnerCmd, runnerArgs, {
      cwd: appDir,
      env: {
        ...process.env,
        ...envOverrides,
      },
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
  const { app, tests, playwrightArgs } = parseArgs();
  const appDir = path.resolve(ROOT, app);
  if (!fs.existsSync(appDir)) {
    throw new Error(`Application folder not found: ${appDir}`);
  }
  ensureTmp();
  const apiPort = await reservePort();
  const webPort = await reservePort();
  const backend = startBackend(apiPort);
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
    await waitForHealthy(`http://127.0.0.1:${apiPort}/health`, 30000);
    await runPlaywright(appDir, tests, playwrightArgs, {
      PLAYWRIGHT_API_PORT: String(apiPort),
      PLAYWRIGHT_WEB_PORT: String(webPort),
      PLAYWRIGHT_BASE_URL: `http://127.0.0.1:${webPort}`,
    });
  } finally {
    await exitHandler();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
