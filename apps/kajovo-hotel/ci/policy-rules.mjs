const webRuntimePrefixes = [
  'apps/kajovo-hotel-web/src/',
  'apps/kajovo-hotel-web/index.html',
  'apps/kajovo-hotel-web/public/downloads/',
  'packages/ui/src/',
];

const androidRuntimePrefixes = [
  'android/app/src/',
  'android/core/',
  'android/feature/',
];

const bannedPatterns = [
  { label: 'Device endpoint (/device/*)', regex: /(["'`])\/device(?:\/|\b)/i },
  { label: 'Entity ID', regex: /\bentity\s+id\b|\bentity_id\b|\bentityId\b|\bentityid\b/i },
];

const webPageViewCrossImport = /from\s+["'][^"']*(admin|portal)\/(pages|views)\/[^"']*["']/g;
const crossAppPageViewImport = /from\s+["'][^"']*apps\/(kajovo-hotel-admin|kajovo-hotel-web)\/src\/[^"']*(pages|views)\/[^"']*["']/g;

const touchesRuntimePrefix = (file, prefixes) =>
  prefixes.some((prefix) => file === prefix || file.startsWith(prefix));

const isAppLocalImportViolation = (filePath, statement) => {
  const normalized = filePath.replaceAll('\\', '/');
  const isPortalFile = normalized.includes('/portal/');
  const isAdminFile = normalized.includes('/admin/');

  if (isAdminFile && /portal\/(pages|views)\//.test(statement)) return true;
  if (isPortalFile && /admin\/(pages|views)\//.test(statement)) return true;
  return false;
};

const isCrossAppViolation = (filePath, statement) => {
  const normalized = filePath.replaceAll('\\', '/');
  if (normalized.startsWith('apps/kajovo-hotel-admin/')) {
    return statement.includes('apps/kajovo-hotel-web') && /(pages|views)\//.test(statement);
  }
  if (normalized.startsWith('apps/kajovo-hotel-web/')) {
    return statement.includes('apps/kajovo-hotel-admin') && /(pages|views)\//.test(statement);
  }
  return false;
};

export const collectPolicyErrors = ({ allChangedFiles, filesToScan, readSource }) => {
  const errors = [];
  const touchesWebRuntime = allChangedFiles.some((file) => touchesRuntimePrefix(file, webRuntimePrefixes));
  const touchesAndroidRuntime = allChangedFiles.some((file) => touchesRuntimePrefix(file, androidRuntimePrefixes));

  if (touchesWebRuntime && !touchesAndroidRuntime) {
    errors.push('Runtime zmena webu bez adekvatni runtime zmeny Android appky je zakazana.');
  }

  if (touchesAndroidRuntime && !touchesWebRuntime) {
    errors.push('Runtime zmena Android appky bez adekvatni runtime zmeny webu je zakazana.');
  }

  for (const rel of filesToScan) {
    if (rel === 'apps/kajovo-hotel/ci/policy-sentinel.mjs' || rel === 'apps/kajovo-hotel/ci/policy-rules.mjs') {
      continue;
    }

    const source = readSource(rel);

    for (const pattern of bannedPatterns) {
      if (pattern.regex.test(source)) {
        errors.push(`${pattern.label} detected in ${rel}`);
      }
    }

    const normalized = rel.replaceAll('\\', '/');
    const imports = source.match(webPageViewCrossImport) ?? [];
    for (const statement of imports) {
      if (isAppLocalImportViolation(normalized, statement)) {
        errors.push(`Page/view sharing is forbidden between Admin and Portal: ${rel}`);
        break;
      }
    }

    const crossAppImports = source.match(crossAppPageViewImport) ?? [];
    for (const statement of crossAppImports) {
      if (isCrossAppViolation(normalized, statement)) {
        errors.push(`Cross-app page/view import is forbidden (admin <-> portal): ${rel}`);
        break;
      }
    }
  }

  return errors;
};
