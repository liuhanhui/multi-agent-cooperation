#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "yaml";

const repoRoot = resolve(process.cwd(), "../..");
const flowPath = resolve(repoRoot, "guides/flows/first-room.yaml");
const manifestPath = resolve(repoRoot, "guides/tag-manifest.yaml");
const registryPath = resolve(repoRoot, "guides/registry.yaml");
const webSourceRoot = resolve(repoRoot, "packages/web/src");
const targetPattern = /^[a-zA-Z0-9._-]+$/;
const advanceModes = new Set(["click", "visible", "input", "confirm"]);

/**
 * Parse a required repository YAML document.
 * @param path - Absolute YAML path
 * @returns Parsed document
 */
function readYaml(path) {
  return parse(readFileSync(path, "utf8"));
}

/**
 * Fail the guide contract check with one actionable message.
 * @param condition - Contract result
 * @param message - Failure detail
 * @returns Nothing
 */
function assertContract(condition, message) {
  if (!condition) throw new Error(message);
}

const flow = readYaml(flowPath);
const manifest = readYaml(manifestPath);
const registry = readYaml(registryPath);
const tags = manifest?.tags ?? {};

assertContract(typeof flow?.id === "string", "flow id required");
assertContract(Array.isArray(flow?.steps) && flow.steps.length > 0, "flow steps required");
assertContract(Array.isArray(registry), "guide registry must be a list");
assertContract(
  registry.some(
    (entry) =>
      entry?.id === flow.id &&
      entry?.flow_file === "guides/flows/first-room.yaml",
  ),
  `flow ${flow.id} is not registered`,
);

const stepIds = new Set();
for (const step of flow.steps) {
  assertContract(typeof step?.id === "string" && step.id, "step id required");
  assertContract(!stepIds.has(step.id), `duplicate step id: ${step.id}`);
  stepIds.add(step.id);
  assertContract(
    typeof step.target === "string" && targetPattern.test(step.target),
    `invalid target: ${String(step.target)}`,
  );
  assertContract(tags[step.target], `target missing from tag manifest: ${step.target}`);
  const componentName = tags[step.target]?.component;
  assertContract(
    typeof componentName === "string" && componentName.endsWith(".tsx"),
    `component missing for target: ${step.target}`,
  );
  const componentPath =
    componentName === "App.tsx"
      ? resolve(webSourceRoot, "app", componentName)
      : resolve(webSourceRoot, "components", componentName);
  assertContract(
    readFileSync(componentPath, "utf8").includes(step.target),
    `target ${step.target} is absent from ${componentName}`,
  );
  assertContract(
    advanceModes.has(step.advance),
    `invalid advance mode for ${step.id}: ${String(step.advance)}`,
  );
  assertContract(typeof step.title === "string" && step.title, `title required: ${step.id}`);
  assertContract(typeof step.tips === "string" && step.tips, `tips required: ${step.id}`);
}

console.log(
  `[guides] OK (${flow.id}, ${flow.steps.length} steps, ${Object.keys(tags).length} tags)`,
);
