import type { ActionHandler } from 'deepspace/worker'
import type { Env } from '../../worker'
import { createCrew, joinCrew } from './crews'
import { addItem, updateItem } from './items'

export const actions: Record<string, ActionHandler<Env>> = {
  createCrew,
  joinCrew,
  addItem,
  updateItem,
}
