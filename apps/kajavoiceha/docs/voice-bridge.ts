/** Backend-only example. Never bundle this module or the MCP token into the frontend. */
import { createHash, randomUUID } from "node:crypto";

type SmartArguments = {
  operation: "catalog" | "read" | "control" | "operation_status" | "camera_view";
  catalog_revision?: string;
  rows?: number[];
  controls?: Array<{ row: number; function: string; parameters?: Record<string, unknown> }>;
  request_id?: string;
};
type McpBlock = { type: "text"; text: string } | { type: "image"; mimeType: string; data: string };
type McpResult = { content: McpBlock[]; isError?: boolean };
export type McpClientPort = {
  callTool(input: { name: string; arguments: Record<string, unknown> }): Promise<McpResult>;
  close(): Promise<void>;
};
/** Resolve only after provider acceptance; reject on provider errors, including unsupported input_image. */
type RealtimeWriter = (event: Record<string, unknown>) => Promise<void>;
type FunctionCall = { name: string; call_id: string; arguments: string };

export const SMART_TECHNOLOGIE_TOOL = {
  type: "function",
  name: "smart_technologie",
  description: "Načti schválený katalog technologií, zjisti aktuální stav nebo proveď výslovně povolenou funkci vybraných řádků.",
  parameters: {
    type: "object",
    additionalProperties: false,
    properties: {
      operation: { type: "string", enum: ["catalog", "read", "control", "operation_status", "camera_view"] },
      catalog_revision: { type: "string" },
      rows: { type: "array", items: { type: "integer", minimum: 1 } },
      controls: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            row: { type: "integer", minimum: 1 },
            function: { type: "string" },
            parameters: { type: "object" },
          },
          required: ["row", "function"],
        },
      },
      request_id: { type: "string", description: "Pro operation_status použij identifikátor vrácený původním řízením. U control jej doplní backend." },
    },
    required: ["operation"],
  },
} as const;

export const SMART_TECHNOLOGIE_INSTRUCTIONS = [
  "Katalog smart_technologie je jediný zdroj zařízení a jejich schopností. Platí jen jeho nejnovější revize.",
  "Pořadí funkcí v polích E, F, G popisuje item_fields. Schéma parametrů ovládání najdeš podle parameters_ref v parameter_definitions téhož pole.",
  "Prohledej celý katalog podle názvů, umístění i konkrétních funkcí; při více shodách vyjmenuj všechny požadované názvy.",
  "Řádky jsou číslované od jedné a platí pouze s katalogovou revizí. Typ zařízení neznamená, že všechny jeho funkce existují.",
  "Do control patří jen funkce explicitně uvedené u konkrétního řádku. Při nejasném jednotlivém cíli požádej o upřesnění.",
  "Explicitní skupinový pokyn platí pro všechny shody. Nedostupné nebo nezpůsobilé řádky se přeskočí a výsledek uživateli oznámíš.",
  "Při nejasném výsledku nepouštěj nový povel. Zjisti operation_status původního request_id.",
  "Ve výsledku popisuj pouze veřejné názvy, umístění, schválené možnosti a aktuální stav.",
].join("\n");

export class SmartVoiceBridge {
  private readonly voiceSessionId: string;
  private readonly sendToRealtime: RealtimeWriter;
  private client: McpClientPort | undefined;
  private catalogItemId: string | undefined;
  private catalogWriteTail: Promise<void> = Promise.resolve();

  constructor(
    voiceSessionId: string,
    sendToRealtime: RealtimeWriter,
    testClient?: McpClientPort,
  ) {
    this.voiceSessionId = voiceSessionId;
    this.sendToRealtime = sendToRealtime;
    this.client = testClient;
  }

  private async connect(): Promise<McpClientPort> {
    if (this.client) return this.client;
    const token = process.env.KAJAVOICEHA_MCP_TOKEN;
    const address = process.env.KAJAVOICEHA_MCP_URL;
    if (!token || !address) throw new Error("Chybí backendová konfigurace technologií.");
    const url = new URL(address);
    if (url.protocol !== "https:" || url.hostname !== "apimcpkajavoiceha.hcasc.cz" || url.pathname !== "/mcp" || url.search || url.hash || url.username || url.password) {
      throw new Error("Neplatná veřejná adresa technologií.");
    }
    const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
    const { StreamableHTTPClientTransport } = await import("@modelcontextprotocol/sdk/client/streamableHttp.js");
    const client = new Client({ name: "kaja-voice-chat", version: "1.0.0" });
    await client.connect(new StreamableHTTPClientTransport(url, { requestInit: { headers: { Authorization: `Bearer ${token}` } } }));
    this.client = client as unknown as McpClientPort;
    return this.client;
  }

  private publicJson(result: McpResult): Record<string, unknown> {
    const text = result.content.filter((item) => item.type === "text");
    if (text.length !== 1 || text[0].type !== "text") throw new Error("Neplatná odpověď technologií.");
    const parsed: unknown = JSON.parse(text[0].text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Neplatná odpověď technologií.");
    return parsed as Record<string, unknown>;
  }

  private validateCatalog(value: Record<string, unknown>): void {
    if (!Array.isArray(value.fields) || value.fields.length !== 8 || !Array.isArray(value.devices) || value.devices.some((row) => !Array.isArray(row) || row.length !== 8) || typeof value.catalog_revision !== "string") {
      throw new Error("Neplatný katalog technologií.");
    }
  }

  private async replaceCatalog(value: Record<string, unknown>): Promise<void> {
    this.validateCatalog(value);
    const update = this.catalogWriteTail.then(() => this.writeCatalog(value));
    this.catalogWriteTail = update.catch(() => {});
    return update;
  }

  private async writeCatalog(value: Record<string, unknown>): Promise<void> {
    this.validateCatalog(value);
    if (this.catalogItemId) {
      await this.sendToRealtime({ type: "conversation.item.delete", item_id: this.catalogItemId });
      this.catalogItemId = undefined;
    }
    const itemId = "kvha_" + randomUUID().replaceAll("-", "").slice(0, 20);
    const table = { catalog_revision: value.catalog_revision, observed_at: value.observed_at, fields: value.fields, devices: value.devices };
    await this.sendToRealtime({
      type: "conversation.item.create",
      item: { id: itemId, type: "message", role: "system", content: [{ type: "input_text", text: `Schválený katalog smart_technologie:\n${JSON.stringify(table)}` }] },
    });
    this.catalogItemId = itemId;
  }

  async connectAndLoadCatalog(): Promise<void> {
    const client = await this.connect();
    const result = await client.callTool({ name: "smart_technologie", arguments: { operation: "catalog" } });
    if (result.isError) throw new Error("Katalog technologií není dostupný.");
    await this.replaceCatalog(this.publicJson(result));
  }

  /** Invoke for response.function_call_arguments.done only after authenticating the host user/session. */
  async handleFunctionCall(call: FunctionCall): Promise<void> {
    if (call.name !== "smart_technologie") throw new Error("Neznámá hlasová funkce.");
    let controlRequestId: string | undefined;
    let outputSent = false;
    let imagesPending = false;
    try {
      const args = JSON.parse(call.arguments) as SmartArguments;
      if (args.operation === "control") {
        // Stable across transport retries of the same provider call. Preserve voiceSessionId/call_id in the host's durable session store.
        controlRequestId = "voice-" + createHash("sha256").update(`${this.voiceSessionId}:${call.call_id}`).digest("hex");
        args.request_id = controlRequestId;
      }
      const client = await this.connect();
      const result = await client.callTool({ name: "smart_technologie", arguments: args });
      const publicResult = this.publicJson(result);
      const images = result.content.filter((item) => item.type === "image");
      for (const block of images) {
        if (block.type !== "image" || (block.mimeType !== "image/jpeg" && block.mimeType !== "image/png") || !block.data || !/^[A-Za-z0-9+/]*={0,2}$/.test(block.data)) {
          throw new Error("Nepodporovaný typ obrazu.");
        }
      }
      if (publicResult.fields !== undefined || publicResult.devices !== undefined) this.validateCatalog(publicResult);
      if (publicResult.fields !== undefined) await this.replaceCatalog(publicResult);
      const { fields: _fields, devices: _devices, ...metadata } = publicResult;
      await this.sendToRealtime({
        type: "conversation.item.create",
        item: { type: "function_call_output", call_id: call.call_id, output: JSON.stringify(metadata) },
      });
      outputSent = true;
      imagesPending = images.length > 0;
      for (const block of images) {
        if (block.type !== "image") continue;
        await this.sendToRealtime({
          type: "conversation.item.create",
          item: { type: "message", role: "user", content: [{ type: "input_image", image_url: `data:${block.mimeType};base64,${block.data}` }] },
        });
      }
      imagesPending = false;
      await this.sendToRealtime({ type: "response.create" });
    } catch {
      // Do not expose exception text: SDK exceptions can contain internal URLs or authentication details.
      if (!outputSent) {
        await this.sendToRealtime({
          type: "conversation.item.create",
          item: { type: "function_call_output", call_id: call.call_id, output: JSON.stringify({ error: "technologie_docasne_nedostupne", request_id: controlRequestId, message: "Výsledek není potvrzený. Změnový povel znovu nespouštěj; zjisti stav původního požadavku." }) },
        });
      } else if (imagesPending) {
        await this.sendToRealtime({
          type: "conversation.item.create",
          item: { type: "message", role: "system", content: [{ type: "input_text", text: "Obrazový vstup nebyl potvrzený. Netvrď, že jsi obraz prohlédl." }] },
        });
      }
      await this.sendToRealtime({ type: "response.create" });
    }
  }

  async close(): Promise<void> {
    await this.client?.close();
    this.client = undefined;
  }
}
