/**
 * Do the links the app builds lead to real pages?
 *
 * This rebuilds the browser's route table the same way
 * @generouted/react-router/lazy does at runtime (same file patterns, same
 * route builder), from the page files that exist right now, then asks
 * react-router what each link matches. It catches a missing or misnamed page
 * file. It can't catch a browser holding a stale copy of the route table:
 * that was the dev-server caching problem fixed in vite.config.ts, which the
 * last test guards.
 */

import { describe, expect, it } from 'vitest'
import { generateRegularRoutes } from '@generouted/react-router/core'
import { matchRoutes, type RouteObject } from 'react-router'
import { crewPath, crunchPath } from './lib/paths'

// The exact patterns from node_modules/@generouted/react-router/dist/index-lazy.js.
// `import.meta.glob` lists matching files without loading them.
const files = import.meta.glob([
  '/src/pages/**/[A-Za-z0-9[-]*.{jsx,tsx,mdx}',
  '/src/pages/**/_layout.{jsx,tsx,mdx}',
  '!/src/pages/404.{jsx,tsx,mdx}',
  '!/src/pages/**/_*/**',
])

const regular = generateRegularRoutes<RouteObject & { id?: string }, unknown>(files, (_module, key) =>
  /\/pages\/.+\/index\.(jsx|tsx|mdx)$/.test(key) ? { index: true } : {},
)
const routes: RouteObject[] = [{ children: [...regular, { path: '*', id: 'generouted-fallback' }] }]

/** The id of the page a URL lands on ("[...all]" is the app's 404 page). */
function pageFor(url: string): string | undefined {
  return matchRoutes(routes, url)?.at(-1)?.route.id
}

const SAMPLE_ID = 'e7691209-8d58-44ef-adac-2bca011b79c2'

describe('app links match real pages', () => {
  it('the crew link on /home opens the crew page, not the 404', () => {
    expect(crewPath(SAMPLE_ID)).toBe(`/crews/${SAMPLE_ID}`)
    expect(pageFor(crewPath(SAMPLE_ID))).toBe('(app)/(protected)/crews/[id]/index')
  })

  it('the "Crunch week" link opens the crunch page', () => {
    expect(pageFor(crunchPath(SAMPLE_ID))).toBe('(app)/(protected)/crews/[id]/crunch')
  })

  it('/home still opens home, and unknown paths still reach the 404 page', () => {
    expect(pageFor('/home')).toBe('(app)/(protected)/home')
    expect(pageFor('/nope')).toBe('[...all]')
    // Known quirk: bare /crews matches the empty "crews" folder route (no
    // page), so it renders blank rather than the 404 page. Nothing links there.
    expect(pageFor('/crews')).toBeUndefined()
  })

  it('there is no stale crews/[id].tsx next to the crews/[id]/ folder', () => {
    expect(Object.keys(files)).not.toContain('/src/pages/(app)/(protected)/crews/[id].tsx')
  })
})

describe('dev server route caching (vite.config.ts)', () => {
  it('excludes generouted from pre-bundling so new pages are picked up', () => {
    // Vite's `?raw` loads the file as plain text.
    const config = Object.values(
      import.meta.glob<string>('/vite.config.ts', { query: '?raw', import: 'default', eager: true }),
    )[0]
    expect(config).toMatch(/exclude:\s*\[[^\]]*'@generouted\/react-router'/)
    expect(config).toMatch(/exclude:\s*\[[^\]]*'@generouted\/react-router\/lazy'/)
  })
})
