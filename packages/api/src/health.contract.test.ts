import assert from "node:assert/strict";
import { test } from "node:test";
import type { HealthResponse } from "@mac/shared";

test("HealthResponse shape is usable as a terminal contract", () => {
  const sample: HealthResponse = {
    status: "ok",
    service: "mac-api",
    version: "0.0.1",
    store: "memory",
    timestamp: new Date().toISOString(),
  };
  assert.equal(sample.service, "mac-api");
  assert.ok(sample.timestamp.length > 0);
});
