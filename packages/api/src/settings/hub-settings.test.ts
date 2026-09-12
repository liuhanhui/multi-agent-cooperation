import assert from "node:assert/strict";
import { test } from "node:test";
import { createCatRegistry } from "../cats/load-cat-config.js";
import { buildApp } from "../create-app.js";
import { createMemoryStore } from "../store/memory-store.js";
import { HubSettingsStore, probeProviderAccounts } from "./hub-settings-store.js";

test("settings nav includes members accounts skills mcp system rules ops", () => {
  const store = new HubSettingsStore({ version: "0.0.1", storeKind: "memory" });
  const doc = store.getDocument();
  assert.equal(doc.nav.length, 7);
  assert.ok(doc.nav.every((s) => s.active));
  assert.equal(doc.routing.strategy, "serial");
  assert.equal(doc.routing.fallbackToDefaultCat, true);
});

test("routing policy patch takes effect immediately on getter", () => {
  const store = new HubSettingsStore({ version: "0.0.1", storeKind: "memory" });
  const updated = store.updateRoutingPolicy({
    fallbackToDefaultCat: false,
    maxTargets: 2,
  });
  assert.equal(updated.fallbackToDefaultCat, false);
  assert.equal(updated.maxTargets, 2);
  assert.equal(store.getRoutingPolicy().maxTargets, 2);
});

test("accounts checklist covers three CLI providers without leaking secrets", () => {
  const accounts = probeProviderAccounts();
  assert.equal(accounts.length, 3);
  assert.ok(accounts.every((a) => a.secretEnvKey.startsWith("MAC_")));
  assert.ok(accounts.every((a) => a.setupHint.length > 10));
});

test("HTTP: GET settings + PATCH routing applies on next resolve path", async () => {
  const cats = createCatRegistry([
    {
      id: "architect",
      displayName: "Architect",
      role: "architecture",
      provider: "claude-code",
      systemSnippet: "arch",
    },
    {
      id: "reviewer",
      displayName: "Reviewer",
      role: "review",
      provider: "codex",
      systemSnippet: "rev",
    },
  ]);
  const settings = new HubSettingsStore({
    version: "0.0.1",
    storeKind: "memory",
    cats,
  });
  const app = await buildApp({
    store: createMemoryStore(),
    storeKind: "memory",
    cats,
    skipReconcile: true,
    disableSkills: true,
    disableTools: true,
    disableFeatures: true,
    disableEvidence: true,
    disableReceipts: true,
    disableCustody: true,
    disableApprovals: true,
    settings,
  });

  const get = await app.inject({ method: "GET", url: "/api/settings" });
  assert.equal(get.statusCode, 200);
  const body = get.json() as {
    settings: { accounts: unknown[]; routing: { maxTargets: number } };
  };
  assert.equal(body.settings.accounts.length, 3);

  const patch = await app.inject({
    method: "PATCH",
    url: "/api/settings/routing",
    headers: { "content-type": "application/json" },
    payload: { maxTargets: 1, fallbackToDefaultCat: false },
  });
  assert.equal(patch.statusCode, 200);
  assert.equal(
    (patch.json() as { routing: { maxTargets: number } }).routing.maxTargets,
    1,
  );
  assert.equal(settings.getRoutingPolicy().fallbackToDefaultCat, false);

  await app.close();
});
