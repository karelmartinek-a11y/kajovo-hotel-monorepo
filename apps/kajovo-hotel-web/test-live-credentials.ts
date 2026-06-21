type EnvMap = Record<string, string | undefined>;

const readEnv = (key: string): string | undefined =>
  (globalThis as { process?: { env?: EnvMap } }).process?.env?.[key];

function requireCredential(value: string | undefined, key: string): string {
  if (!value) {
    throw new Error(`Missing required live test credential: ${key}`);
  }
  return value;
}

export function getPortalCredentials(): { email: string; password: string } {
  return {
    email: requireCredential(readEnv('HOTEL_PORTAL_EMAIL'), 'HOTEL_PORTAL_EMAIL'),
    password: requireCredential(readEnv('HOTEL_PORTAL_PASSWORD'), 'HOTEL_PORTAL_PASSWORD'),
  };
}
