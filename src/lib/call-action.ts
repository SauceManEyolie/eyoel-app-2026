/**
 * Browser helper: call one of our server actions by name.
 *
 * Follows /guides/server-actions → "Call from the client": POST to
 * /api/actions/<name> with the signed-in user's token.
 */

import { getAuthToken } from 'deepspace'

export type ActionResponse<T> = { success: true; data: T } | { success: false; error: string }

export async function callAction<T>(
  name: string,
  params: Record<string, unknown>,
): Promise<ActionResponse<T>> {
  const token = await getAuthToken()
  if (!token) return { success: false, error: 'Please sign in first.' }
  try {
    const res = await fetch(`/api/actions/${name}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(params),
    })
    const body = (await res.json()) as Partial<{ success: boolean; data: T; error: string }>
    if (res.ok && body.success) return { success: true, data: body.data as T }
    return { success: false, error: body.error ?? `Request failed (${res.status})` }
  } catch {
    return { success: false, error: 'Network error. Check your connection and try again.' }
  }
}
