// @ts-expect-error Node builtin is available in Playwright/Vite test runtime.
import { existsSync, readFileSync } from 'fs';
// @ts-expect-error Node builtin is available in Playwright/Vite test runtime.
import { dirname, join, resolve } from 'path';

type EnvMap = Record<string, string | undefined>;

const readEnv = (key: string): string | undefined =>
  (globalThis as { process?: { env?: EnvMap } }).process?.env?.[key];

const isCi = (): boolean => readEnv('CI') === 'true' || readEnv('GITHUB_ACTIONS') === 'true';

const getCwd = (): string | undefined =>
  (globalThis as { process?: { cwd?: () => string } }).process?.cwd?.();

function findAgentsFile(): string | undefined {
  let current = resolve(getCwd() ?? '.');
  while (true) {
    const candidate = join(current, 'AGENTS.md');
    if (existsSync(candidate)) {
      return candidate;
    }
    const parent = dirname(current);
    if (parent === current) {
      return undefined;
    }
    current = parent;
  }
}

function parseAccessSection(content: string, target: 'admin' | 'portal'): { user: string; password: string } | undefined {
  const lines = content.split(/\r?\n/);
  const headerIndex = lines.findIndex((line) => {
    const url = line.match(/https?:\/\/\S+/i)?.[0] ?? '';
    if (!url) {
      return false;
    }
    return target === 'admin' ? /\/admin\b/i.test(url) : !/\/admin\b/i.test(url);
  });

  if (headerIndex === -1) {
    return undefined;
  }

  let user: string | undefined;
  let password: string | undefined;
  for (const line of lines.slice(headerIndex + 1, headerIndex + 8)) {
    user ??= line.match(/-\s*User:\s*(.+)/i)?.[1]?.trim();
    password ??= line.match(/-\s*Password:\s*(.+)/i)?.[1]?.trim();
  }

  return user && password ? { user, password } : undefined;
}

function readAdminCredentialsFromAgents(): { email: string; password: string } | undefined {
  const agentsFile = findAgentsFile();
  if (!agentsFile) {
    return undefined;
  }
  const section = parseAccessSection(readFileSync(agentsFile, 'utf8'), 'admin');
  if (!section) {
    return undefined;
  }
  return { email: section.user, password: section.password };
}

export function getAdminCredentials(): { email: string; password: string } {
  const email = readEnv('KAJOVO_API_ADMIN_EMAIL') ?? readEnv('HOTEL_ADMIN_EMAIL');
  const password = readEnv('KAJOVO_API_ADMIN_PASSWORD') ?? readEnv('HOTEL_ADMIN_PASSWORD');

  if (email && password) {
    return { email, password };
  }

  const agentsCredentials = readAdminCredentialsFromAgents();
  if (agentsCredentials) {
    return agentsCredentials;
  }

  if (isCi()) {
    throw new Error(
      'Admin test credentials are missing. Set HOTEL_ADMIN_EMAIL/HOTEL_ADMIN_PASSWORD or KAJOVO_API_ADMIN_EMAIL/KAJOVO_API_ADMIN_PASSWORD.',
    );
  }

  return {
    email: 'admin@kajovohotel.local',
    password: 'admin123',
  };
}
