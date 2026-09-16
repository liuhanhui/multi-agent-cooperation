import assert from "node:assert/strict";
import { test } from "node:test";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildApp } from "../create-app.js";
import { createMemoryStore } from "../store/memory-store.js";
import { PluginHost } from "./plugin-host.js";
import { resolvePluginsRoot } from "./load-catalog.js";

const repoPlugins = resolvePluginsRoot(
  join(fileURLToPath(new URL(".", import.meta.url)), "..", "..", "..", "..", "plugins"),
);

test("catalog lists official hello-mac shell", () => {
  const host = new PluginHost({ pluginsRoot: repoPlugins });
  const catalog = host.listCatalog();
  assert.ok(catalog.some((c) => c.id === "hello-mac" && c.official));
  const available = host.getPlugin("hello-mac");
  assert.equal(available?.status, "available");
});

test("install activate; hub.notify works; thread.post_message denied without grant", async () => {
  const store = createMemoryStore();
  const host = new PluginHost({ pluginsRoot: repoPlugins, store });
  host.install("hello-mac");
  host.activate("hello-mac");

  const notify = await host.call("hello-mac", "hub.notify", {
    message: "hi from test",
  });
  assert.equal(notify.status, "ok");
  assert.equal(notify.result?.notified, true);

  const denied = await host.call("hello-mac", "thread.post_message", {
    threadId: "nope",
    content: "secret",
  });
  assert.equal(denied.status, "denied");
  assert.match(denied.detail, /missing grant/);

  const hard = await host.call("hello-mac", "store.flush", {});
  assert.equal(hard.status, "denied");
  assert.match(hard.detail, /Iron Law/);
});

test("grant then post_message settles; uninstall requires deactivate", async () => {
  const store = createMemoryStore();
  const thread = await store.createThread({ title: "plugin-demo" });
  const host = new PluginHost({ pluginsRoot: repoPlugins, store });
  host.install("hello-mac");
  host.activate("hello-mac");
  host.grant("hello-mac", "thread.post_message");

  const ok = await host.call("hello-mac", "thread.post_message", {
    threadId: thread.id,
    content: "posted by hello-mac",
  });
  assert.equal(ok.status, "ok");
  const messages = await store.listMessages(thread.id);
  assert.ok(messages.some((m) => m.authorId === "plugin:hello-mac"));

  assert.throws(() => host.uninstall("hello-mac"), /deactivate/);
  host.deactivate("hello-mac");
  const shell = host.uninstall("hello-mac");
  assert.equal(shell.status, "available");
  assert.deepEqual(shell.grants, []);
});

test("HTTP: install activate grant call deny path", async () => {
  const store = createMemoryStore();
  const thread = await store.createThread({ title: "http-plugin" });
  const app = await buildApp({
    store,
    storeKind: "memory",
    skipReconcile: true,
    disableSkills: true,
    disableTools: true,
    disableFeatures: true,
    disableEvidence: true,
    disableReceipts: true,
    disableCustody: true,
    disableApprovals: true,
    disableSettings: true,
    disableGithub: true,
    pluginsDir: repoPlugins,
  });

  const catalog = await app.inject({ method: "GET", url: "/api/plugins/catalog" });
  assert.equal(catalog.statusCode, 200);
  assert.ok(
    (catalog.json() as { catalog: Array<{ id: string }> }).catalog.some(
      (c) => c.id === "hello-mac",
    ),
  );

  assert.equal(
    (
      await app.inject({ method: "POST", url: "/api/plugins/hello-mac/install" })
    ).statusCode,
    201,
  );
  assert.equal(
    (
      await app.inject({ method: "POST", url: "/api/plugins/hello-mac/activate" })
    ).statusCode,
    200,
  );

  const denied = await app.inject({
    method: "POST",
    url: "/api/plugins/hello-mac/call",
    headers: { "content-type": "application/json" },
    payload: {
      capability: "thread.post_message",
      args: { threadId: thread.id, content: "no grant" },
    },
  });
  assert.equal(denied.statusCode, 200);
  assert.equal(
    (denied.json() as { receipt: { status: string } }).receipt.status,
    "denied",
  );

  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: "/api/plugins/hello-mac/grants",
        headers: { "content-type": "application/json" },
        payload: { capability: "thread.post_message" },
      })
    ).statusCode,
    200,
  );

  const allowed = await app.inject({
    method: "POST",
    url: "/api/plugins/hello-mac/call",
    headers: { "content-type": "application/json" },
    payload: {
      capability: "thread.post_message",
      args: { threadId: thread.id, content: "with grant" },
    },
  });
  assert.equal(allowed.statusCode, 200);
  assert.equal(
    (allowed.json() as { receipt: { status: string } }).receipt.status,
    "ok",
  );

  await app.close();
});
