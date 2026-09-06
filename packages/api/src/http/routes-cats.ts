import type { FastifyInstance } from "fastify";
import type { AppDeps } from "./deps.js";

/**
 * Register cat registry read routes (identity-session cell).
 * @param app - Fastify instance
 * @param deps - optional CatRegistry; empty list when unset
 */
export function registerCatRoutes(app: FastifyInstance, deps: AppDeps): void {
  const { cats } = deps;

  app.get("/api/cats", async () => {
    return { cats: cats?.list() ?? [] };
  });
}
