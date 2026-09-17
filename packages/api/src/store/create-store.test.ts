import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveRedisUrl } from "./create-store.js";

test("resolveRedisUrl honors MAC_REDIS_PORT when URL is absent", () => {
  const oldUrl = process.env.REDIS_URL;
  const oldPort = process.env.MAC_REDIS_PORT;
  delete process.env.REDIS_URL;
  process.env.MAC_REDIS_PORT = "6412";
  try {
    assert.equal(resolveRedisUrl(), "redis://127.0.0.1:6412");
  } finally {
    if (oldUrl === undefined) delete process.env.REDIS_URL;
    else process.env.REDIS_URL = oldUrl;
    if (oldPort === undefined) delete process.env.MAC_REDIS_PORT;
    else process.env.MAC_REDIS_PORT = oldPort;
  }
});

test("resolveRedisUrl rejects an invalid project Redis port", () => {
  const oldUrl = process.env.REDIS_URL;
  const oldPort = process.env.MAC_REDIS_PORT;
  delete process.env.REDIS_URL;
  process.env.MAC_REDIS_PORT = "70000";
  try {
    assert.throws(() => resolveRedisUrl(), /1 to 65535/);
  } finally {
    if (oldUrl === undefined) delete process.env.REDIS_URL;
    else process.env.REDIS_URL = oldUrl;
    if (oldPort === undefined) delete process.env.MAC_REDIS_PORT;
    else process.env.MAC_REDIS_PORT = oldPort;
  }
});
