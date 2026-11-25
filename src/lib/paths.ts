/**
 * Links to app pages, built in one place so a test can check each one really
 * matches a page (see routes.test.ts).
 */

export function crewPath(crewId: string): string {
  return `/crews/${encodeURIComponent(crewId)}`
}

export function crunchPath(crewId: string): string {
  return `${crewPath(crewId)}/crunch`
}
