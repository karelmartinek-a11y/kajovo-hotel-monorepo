// Validate native remote MCP semantics; unused response transports may be null.
export function isCanonicalMcpSession(session) {
  if (!Array.isArray(session?.tools) || session.tools.length !== 1) return false;
  const tool = session.tools[0];
  if (!tool || tool.type !== 'mcp' ||
      tool.server_url !== 'https://hotel.hcasc.cz/mcp/home-assistant' ||
      tool.server_label !== 'home_assistant' ||
      tool.connector_id != null || tool.tunnel_id != null) return false;
  const exactNames = (value, names) => Array.isArray(value) &&
    value.length === names.length && names.every(name => value.includes(name));
  if (!exactNames(tool.allowed_tools, ['search_devices', 'get_device_state', 'execute_device_action'])) return false;
  const approval = tool.require_approval;
  return approval != null && typeof approval === 'object' && !Array.isArray(approval) &&
    approval.always == null &&
    exactNames(approval.never?.tool_names, ['search_devices', 'get_device_state']);
}
