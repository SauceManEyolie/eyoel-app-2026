/**
 * Deny-by-default guard for the browser integration proxy.
 *
 * The scaffold forwards /api/integrations/<name>/<endpoint> from any
 * signed-in browser to DeepSpace's integration service with the APP OWNER's
 * token, so every paid endpoint (AI, search, image generation, email/send…)
 * would be billed to the owner with no per-user limit. This guard runs first
 * and refuses every path under /api/integrations/ unless it's on the
 * allowlist in src/integrations.ts (empty today).
 *
 * Server actions are not affected: they reach integrations through
 * `tools.integration`, which never goes through this route.
 *
 * The bare catalog GET /api/integrations (a free, read-only list of
 * endpoints, used by the scaffold's /api-status debug page) is not "under"
 * /api/integrations/ and is left alone.
 */

import type { MiddlewareHandler } from 'hono'

const PREFIX = '/api/integrations/'

/**
 * Turn a request path into the allowlist form: "name/endpoint", lowercase,
 * percent-decoded. Returns null if the path can't be decoded.
 */
export function integrationKey(path: string): string | null {
  if (!path.toLowerCase().startsWith(PREFIX)) return null
  let rest: string
  try {
    rest = decodeURIComponent(path.slice(PREFIX.length))
  } catch {
    return null
  }
  return rest.toLowerCase().replace(/\/+$/, '')
}

/** May a browser use this path? Only exact allowlist matches pass. */
export function isBrowserAllowed(path: string, allowlist: readonly string[]): boolean {
  const key = integrationKey(path)
  if (key === null || key === '') return false
  return allowlist.some((allowed) => allowed.toLowerCase() === key)
}

/** Hono middleware: 403 for anything under /api/integrations/ not allowlisted. */
export function integrationBrowserGuard(allowlist: readonly string[]): MiddlewareHandler {
  return async (c, next) => {
    const path = new URL(c.req.url).pathname
    // Only guard paths strictly under the prefix; the bare catalog passes.
    if (path.toLowerCase().startsWith(PREFIX) && !isBrowserAllowed(path, allowlist)) {
      return c.json({ error: 'This integration is not available from the browser.' }, 403)
    }
    await next()
  }
}
