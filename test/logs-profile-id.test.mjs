import assert from "node:assert/strict";
import test from "node:test";
import { z } from "zod";
import { registerLogTools } from "../dist/tools/logs.js";

function setup() {
  const tools = new Map();
  const requests = [];
  registerLogTools({
    tool(name, _description, schema, handler) {
      tools.set(name, { schema: z.object(schema), handler });
    },
  }, {
    async get(path, params) {
      requests.push({ path, params });
      return { data: [{ event_name: "example_event" }] };
    },
  });
  const { schema, handler } = tools.get("export_events");
  return { schema, handler, requests };
}

const base = { app_id: 123, date_from: "2026-01-01", date_to: "2026-01-02" };

test("passes exact profile ID and event name to the Logs API", async () => {
  const { schema, handler, requests } = setup();
  const result = await handler(schema.parse({
    ...base, profile_id: "000123+user", event_name: "example_event",
    fields: "profile_id,event_name", limit: 25,
  }));
  assert.equal(result.isError, undefined);
  assert.deepEqual(requests, [{
    path: "/logs/v1/export/events.json",
    params: {
      application_id: 123,
      date_since: "2026-01-01 00:00:00",
      date_until: "2026-01-02 23:59:59",
      fields: "profile_id,event_name", limit: 25,
      event_name: "example_event", profile_id: "000123+user",
    },
  }]);
  assert.deepEqual(JSON.parse(result.content[0].text), {
    count: 1, events: [{ event_name: "example_event" }],
  });
});

test("omitting profile ID preserves existing unfiltered behavior", async () => {
  const { schema, handler, requests } = setup();
  await handler(schema.parse(base));
  assert.equal(Object.hasOwn(requests[0].params, "profile_id"), false);
  assert.equal(requests[0].params.limit, 1000);
});

test("rejects empty and numeric profile IDs", () => {
  const { schema } = setup();
  assert.equal(schema.safeParse({ ...base, profile_id: "" }).success, false);
  assert.equal(schema.safeParse({ ...base, profile_id: 123 }).success, false);
});
