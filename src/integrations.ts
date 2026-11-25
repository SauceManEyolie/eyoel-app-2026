/**
 * Integration Billing Config
 *
 * Configure who pays for each integration's API calls.
 *
 * - 'developer': The app owner pays (default).
 * - 'user': The calling user pays.
 *
 * Every integration requires a signed-in caller. Set `anonymous: true` on a
 * 'developer' integration to let signed-out visitors call it too — the owner
 * then pays for anyone who can reach the app.
 *
 * Integrations not listed here default to 'developer' with sign-in required.
 *
 * IMPORTANT: any integration backed by per-user connected accounts (Google,
 * Composio) must be 'user' — the api-worker resolves the account from the
 * JWT subject. With 'developer' the app owner's JWT is forwarded, so every
 * signed-in user connects and acts on the app owner's account. Server code
 * that acts for a user in the background (e.g. a cron job) uses
 * `callComposio(env, ..., { asUser })` from 'deepspace/worker' instead.
 */

export interface IntegrationConfig {
  billing: 'developer' | 'user'
  anonymous?: boolean
}

export const integrations: Record<string, IntegrationConfig> = {
  google: { billing: 'user' },
  composio: { billing: 'user' },
  // Claude for "Break it down": owner pays; reached only via the breakItDown action.
  anthropic: { billing: 'developer' },
  // openai: { billing: 'developer', anonymous: true },
}

/**
 * Crunch Board: the ONLY paths a browser may call through the integration
 * proxy, written "name/endpoint" (e.g. 'openweathermap/geocoding'). Everything
 * else under /api/integrations/ gets 403 (src/server/integration-guard.ts).
 * Empty on purpose: the app calls integrations only from server actions,
 * which don't use this route. Adding an entry lets ANY signed-in user call
 * that endpoint at the owner's expense with no per-user limit, so don't add
 * paid endpoints here.
 */
export const BROWSER_INTEGRATION_ALLOWLIST: readonly string[] = []
