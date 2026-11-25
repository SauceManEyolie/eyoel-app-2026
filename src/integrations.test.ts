import { describe, expect, it } from 'vitest'
import { BROWSER_INTEGRATION_ALLOWLIST, integrations } from './integrations'

describe('integration config', () => {
  it('bills Claude to the owner (only reachable via the breakItDown action)', () => {
    expect(integrations.anthropic).toEqual({ billing: 'developer' })
  })

  it('opens nothing to anonymous callers', () => {
    expect(Object.values(integrations).some((c) => c.anonymous)).toBe(false)
  })

  it('allowlists nothing for the browser proxy', () => {
    expect(BROWSER_INTEGRATION_ALLOWLIST).toHaveLength(0)
  })
})
