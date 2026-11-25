/**
 * Proves the browser integration proxy is deny-by-default.
 *
 * The route tests mount the REAL scaffold routes (registerAuthAndIntegrationRoutes)
 * on a fresh Hono app, so they check the guard is actually wired in front of
 * the proxy, not just that the guard function works on its own. Nothing here
 * reaches the network: a refused request never gets past the guard.
 */

import { describe, expect, it } from 'vitest'
import { Hono } from 'hono'
import { registerAuthAndIntegrationRoutes } from './http-routes'
import { integrationKey, isBrowserAllowed } from './integration-guard'
import { BROWSER_INTEGRATION_ALLOWLIST } from '../integrations'
import type { AppContext } from '../../worker'

function app() {
  const a = new Hono<AppContext>()
  registerAuthAndIntegrationRoutes(a)
  return a
}

// A sample of paid and sensitive endpoints across providers, plus the
// scaffold's other routes under /api/integrations/.
const SAMPLE: [method: string, path: string][] = [
  ['POST', '/api/integrations/anthropic/chat-completion'],
  ['POST', '/api/integrations/openai/chat-completion'],
  ['POST', '/api/integrations/openai/generate-image'],
  ['POST', '/api/integrations/gemini/generate-image'],
  ['POST', '/api/integrations/exa/search'],
  ['POST', '/api/integrations/email/send'],
  ['POST', '/api/integrations/livekit/token'],
  ['GET', '/api/integrations/finnhub/stock-price'],
  ['POST', '/api/integrations/openweathermap/geocoding'],
  ['POST', '/api/integrations/Anthropic/Chat-Completion'], // letter case
  ['POST', '/api/integrations/anthropic%2Fchat-completion'], // encoded slash
  ['POST', '/api/integrations/email/send/'], // trailing slash
  ['GET', '/api/integrations/status'],
  ['DELETE', '/api/integrations/oauth/google/disconnect'],
]

describe('browser integration proxy (deny-by-default)', () => {
  it('allowlist is empty', () => {
    expect(BROWSER_INTEGRATION_ALLOWLIST).toEqual([])
  })

  it.each(SAMPLE)('refuses a signed-out %s %s with 403', async (method, path) => {
    const res = await app().request(path, { method, body: method === 'GET' ? undefined : '{}' }, {})
    expect(res.status).toBe(403)
  })

  it.each(SAMPLE)('refuses a signed-in %s %s with 403', async (method, path) => {
    const res = await app().request(
      path,
      {
        method,
        headers: { Authorization: 'Bearer any-signed-in-token', 'Content-Type': 'application/json' },
        body: method === 'GET' ? undefined : '{}',
      },
      {},
    )
    expect(res.status).toBe(403)
  })

  it('does not block the bare free catalog GET /api/integrations', async () => {
    // With no platform env in a unit test the catalog fetch fails (502), but
    // the point is that the guard let it through rather than answering 403.
    const res = await app().request('/api/integrations', { method: 'GET' }, {})
    expect(res.status).not.toBe(403)
  })
})

describe('isBrowserAllowed / integrationKey', () => {
  it('normalizes case, encoding and trailing slashes', () => {
    expect(integrationKey('/api/integrations/Exa/Search/')).toBe('exa/search')
    expect(integrationKey('/api/integrations/exa%2Fsearch')).toBe('exa/search')
    expect(integrationKey('/api/integrations/%E0%A4%A')).toBeNull() // undecodable
  })

  it('allows only exact allowlist matches', () => {
    const allow = ['openweathermap/geocoding']
    expect(isBrowserAllowed('/api/integrations/openweathermap/geocoding', allow)).toBe(true)
    expect(isBrowserAllowed('/api/integrations/OpenWeatherMap/Geocoding', allow)).toBe(true)
    expect(isBrowserAllowed('/api/integrations/openweathermap/forecast', allow)).toBe(false)
    expect(isBrowserAllowed('/api/integrations/openweathermap', allow)).toBe(false)
    expect(isBrowserAllowed('/api/integrations/exa/search', allow)).toBe(false)
  })

  it('allows nothing with an empty allowlist', () => {
    expect(isBrowserAllowed('/api/integrations/openweathermap/geocoding', [])).toBe(false)
  })
})
