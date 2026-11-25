import type { ActionHandler } from 'deepspace/worker'
import type { Env } from '../../worker'
import { breakItDown } from './break-down'
import { createCrew, joinCrew } from './crews'
import { addItem, updateItem } from './items'

export const actions: Record<string, ActionHandler<Env>> = {
  createCrew,
  joinCrew,
  addItem,
  updateItem,
  breakItDown,
}
