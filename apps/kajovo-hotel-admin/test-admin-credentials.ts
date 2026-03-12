type EnvMap = Record<string, string | undefined>;

const readEnv = (key: string): string | undefined =>
  (globalThis as { process?: { env?: EnvMap } }).process?.env?.[key];

const isCi = (): boolean => readEnv('CI') === 'true' || readEnv('GITHUB_ACTIONS') === 'true';

export function getAdminCredentials(): { email: string; password: string } {
  const email = readEnv('KAJOVO_API_ADMIN_EMAIL') ?? readEnv('HOTEL_ADMIN_EMAIL');
  const password = readEnv('KAJOVO_API_ADMIN_PASSWORD') ?? readEnv('HOTEL_ADMIN_PASSWORD');

  if (email && password) {
    return { email, password };
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
