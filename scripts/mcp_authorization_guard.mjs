// OpenAI echoes this exact marker instead of the private MCP credential.
export function hasExposedAuthorization(value) {
  if (!value || typeof value !== 'object') return false;
  return Object.entries(value).some(([key, child]) =>
    (key.toLowerCase() === 'authorization' && typeof child === 'string' &&
      child.length > 0 && child !== '<redacted>') || hasExposedAuthorization(child));
}
