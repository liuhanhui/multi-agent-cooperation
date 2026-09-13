import type { GithubResourceRef, GithubWebhookIngress } from "@mac/shared";

/**
 * Normalize a GitHub webhook JSON body into a Hub ingress record.
 * Supports pull_request and issues events (minimal M22 slice).
 * @param event - X-GitHub-Event header
 * @param deliveryId - X-GitHub-Delivery header
 * @param body - Parsed JSON payload
 * @returns Normalized ingress (ref null when unparseable)
 */
export function normalizeGithubWebhook(
  event: string,
  deliveryId: string,
  body: Record<string, unknown>,
): GithubWebhookIngress {
  const action = typeof body.action === "string" ? body.action : null;
  const ref = extractRef(event, body);
  const summary = buildSummary(event, action, body, ref);
  return {
    deliveryId: deliveryId.trim() || "unknown",
    event: event.trim() || "unknown",
    action,
    ref,
    summary,
  };
}

/**
 * @param event - Event name
 * @param body - Payload
 * @returns Resource ref or null
 */
function extractRef(
  event: string,
  body: Record<string, unknown>,
): GithubResourceRef | null {
  const repoObj = body.repository;
  if (!repoObj || typeof repoObj !== "object") return null;
  const repo = repoObj as Record<string, unknown>;
  const fullName = typeof repo.full_name === "string" ? repo.full_name : "";
  const [ownerPart, repoPart] = fullName.split("/");
  const owner =
    ownerPart ||
    (typeof (repo.owner as { login?: string } | undefined)?.login === "string"
      ? (repo.owner as { login: string }).login
      : "");
  const name = repoPart || (typeof repo.name === "string" ? repo.name : "");
  if (!owner || !name) return null;

  if (event === "pull_request" || event === "pull_request_review") {
    const pr = body.pull_request;
    if (!pr || typeof pr !== "object") return null;
    const number = Number((pr as { number?: unknown }).number);
    if (!Number.isFinite(number) || number < 1) return null;
    return { owner, repo: name, number: Math.floor(number), kind: "pr" };
  }

  if (event === "issues" || event === "issue_comment") {
    const issue = body.issue;
    if (!issue || typeof issue !== "object") return null;
    const number = Number((issue as { number?: unknown }).number);
    if (!Number.isFinite(number) || number < 1) return null;
    // GitHub issues API also represents PRs as issues with pull_request key.
    const isPr = Boolean((issue as { pull_request?: unknown }).pull_request);
    return {
      owner,
      repo: name,
      number: Math.floor(number),
      kind: isPr ? "pr" : "issue",
    };
  }

  return null;
}

/**
 * @param event - Event name
 * @param action - Action or null
 * @param body - Payload
 * @param ref - Extracted ref
 * @returns Short summary for Hub note
 */
function buildSummary(
  event: string,
  action: string | null,
  body: Record<string, unknown>,
  ref: GithubResourceRef | null,
): string {
  if (event === "pull_request" || event === "pull_request_review") {
    const pr = body.pull_request as { title?: string } | undefined;
    const title = pr?.title?.trim() || "pull request";
    return `${action ?? "update"}: ${title}`;
  }
  if (event === "issues" || event === "issue_comment") {
    const issue = body.issue as { title?: string } | undefined;
    const title = issue?.title?.trim() || "issue";
    return `${action ?? "update"}: ${title}`;
  }
  if (ref) return `${event} on #${ref.number}`;
  return `${event} (no resource ref)`;
}
