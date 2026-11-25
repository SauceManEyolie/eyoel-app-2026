import type { ActionHandler } from 'deepspace/worker'
import type { Env } from '../../worker'
import { createCrew, joinCrew } from './crews'

export const actions: Record<string, ActionHandler<Env>> = {
  createCrew,
  joinCrew,
}
