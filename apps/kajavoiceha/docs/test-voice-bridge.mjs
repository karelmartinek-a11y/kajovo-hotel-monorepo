import test from "node:test";
import assert from "node:assert/strict";
import { SmartVoiceBridge } from "./voice-bridge.ts";

const catalog = () => ({
  catalog_revision: "test-revision",
  observed_at: "2026-10-02T00:00:00Z",
  fields: Array.from({ length: 8 }, (_, i) => ({ key: `field${i}`, label: `Pole ${i}` })),
  devices: [["Světlo", "Recepce", "Zapnout", "Stav", "Vypnuto", "Zapnuto/Vypnuto", "Dostupné", "Světlo"]],
  results: [],
});
function fakeClient(extra = []) {
  return { async callTool() { return { content: [{ type: "text", text: JSON.stringify(catalog()) }, ...extra] }; }, async close() {} };
}

test("one whole catalog is retained and function outputs do not duplicate it", async () => {
  const events = [];
  const bridge = new SmartVoiceBridge("session", async (event) => { events.push(event); }, fakeClient());
  await bridge.connectAndLoadCatalog();
  await bridge.handleFunctionCall({ name: "smart_technologie", call_id: "call1", arguments: '{"operation":"catalog"}' });
  const active = new Map();
  for (const event of events) {
    if (event.type === "conversation.item.delete") active.delete(event.item_id);
    if (event.type === "conversation.item.create" && event.item.id) active.set(event.item.id, event.item);
    assert.ok(active.size <= 1);
  }
  assert.equal(active.size, 1);
  assert.equal(events.filter((event) => event.type === "conversation.item.delete").length, 1);
  const output = events.find((event) => event.item?.type === "function_call_output");
  assert.equal(JSON.parse(output.item.output).devices, undefined);
  assert.equal(JSON.parse(output.item.output).fields, undefined);
});

test("camera image is input_image before response.create and never function text", async () => {
  const events = [];
  const bridge = new SmartVoiceBridge("session", async (event) => { events.push(event); }, fakeClient([{ type: "image", mimeType: "image/jpeg", data: "AQID" }]));
  await bridge.handleFunctionCall({ name: "smart_technologie", call_id: "camera1", arguments: '{"operation":"camera_view","catalog_revision":"test-revision","rows":[1]}' });
  const imageIndex = events.findIndex((event) => event.item?.content?.some((part) => part.type === "input_image"));
  const responseIndex = events.findIndex((event) => event.type === "response.create");
  assert.ok(imageIndex >= 0 && imageIndex < responseIndex);
  const output = events.find((event) => event.item?.type === "function_call_output");
  assert.ok(!output.item.output.includes("AQID"));
});

test("provider image rejection does not duplicate function output", async () => {
  const events = [];
  const bridge = new SmartVoiceBridge("session", async (event) => {
    if (event.item?.content?.some((part) => part.type === "input_image")) throw new Error("unsupported image");
    events.push(event);
  }, fakeClient([{ type: "image", mimeType: "image/jpeg", data: "AQID" }]));
  await bridge.handleFunctionCall({ name: "smart_technologie", call_id: "camera1", arguments: '{"operation":"camera_view"}' });
  assert.equal(events.filter((event) => event.item?.type === "function_call_output").length, 1);
  assert.ok(events.some((event) => event.item?.content?.some((part) => part.text?.includes("nebyl potvrzený"))));
});

test("invalid image is rejected before any catalog replacement", async () => {
  const events = [];
  const bridge = new SmartVoiceBridge("session", async (event) => { events.push(event); }, fakeClient([{ type: "image", mimeType: "text/html", data: "AQID" }]));
  await bridge.handleFunctionCall({ name: "smart_technologie", call_id: "bad1", arguments: '{"operation":"camera_view"}' });
  assert.equal(events.filter((event) => event.item?.id).length, 0);
  assert.equal(events.filter((event) => event.item?.type === "function_call_output").length, 1);
});

test("catalog_changed error replaces the complete catalog instead of trapping the old revision", async () => {
  const events = [];
  let calls = 0;
  const client = {
    async callTool() {
      const value = catalog();
      calls++;
      if (calls > 1) value.catalog_revision = "new-revision";
      return { isError: calls > 1, content: [{ type: "text", text: JSON.stringify({ ...value, error: calls > 1 ? "catalog_changed" : undefined }) }] };
    },
    async close() {},
  };
  const bridge = new SmartVoiceBridge("session", async (event) => { events.push(event); }, client);
  await bridge.connectAndLoadCatalog();
  await bridge.handleFunctionCall({ name: "smart_technologie", call_id: "old-revision-call", arguments: '{"operation":"read"}' });
  assert.equal(events.filter((event) => event.type === "conversation.item.delete").length, 1);
  const tables = events.filter((event) => event.item?.id);
  assert.ok(tables[1].item.content[0].text.includes("new-revision"));
  assert.equal(events.filter((event) => event.item?.type === "function_call_output").length, 1);
});

test("simultaneous catalog refreshes never retain two whole tables", async () => {
  const events = [];
  const bridge = new SmartVoiceBridge("session", async (event) => {
    if (event.item?.id) await new Promise((resolve) => setTimeout(resolve, 2));
    events.push(event);
  }, fakeClient());
  await Promise.all([bridge.connectAndLoadCatalog(), bridge.connectAndLoadCatalog()]);
  const active = new Map();
  for (const event of events) {
    if (event.type === "conversation.item.delete") active.delete(event.item_id);
    if (event.type === "conversation.item.create" && event.item.id) active.set(event.item.id, event.item);
    assert.ok(active.size <= 1);
  }
  assert.equal(active.size, 1);
});
