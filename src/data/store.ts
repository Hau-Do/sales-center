/**
 * The seeded store.
 *
 * Sits between the MSW handlers and the `Db` seam. Handlers describe HTTP;
 * this describes what the dealership knows. Keeping them apart is what lets
 * the same store back both the browser (localStorage, so a logged activity
 * survives a reload) and Vitest (memory, so tests are isolated).
 */

import type { Instant } from '@/domain/instant'
import type { Activity, Lead, SalesExecutive, Site } from '@/domain/types'
import type { Db } from './db'
import { DEMO_NOW, type ScenarioName, buildScenario } from '@/mocks/seed/generate'

const LEADS = 'leads'
const ACTIVITIES = 'activities'
const SITES = 'sites'
const EXECUTIVES = 'executives'
const META = 'meta'

export interface StoreMeta {
  readonly scenario: ScenarioName
  /** The frozen "now" this dataset was built against. */
  readonly now: Instant
  readonly rngSeed: number
  /** Artificial latency added to every mock response, in ms. */
  readonly latencyMs: number
  /** Fraction of write requests that should fail, for the reliability demo. */
  readonly errorRate: number
}

export interface ResetOptions {
  readonly scenario?: ScenarioName
  readonly now?: Instant
  readonly rngSeed?: number
  readonly latencyMs?: number
  readonly errorRate?: number
}

export interface Store {
  reset(options?: ResetOptions): StoreMeta
  meta(): StoreMeta
  setMeta(patch: Partial<StoreMeta>): StoreMeta
  isSeeded(): boolean

  leads(): Lead[]
  lead(id: string): Lead | undefined
  putLead(lead: Lead): void

  activities(leadId?: string): Activity[]
  addActivity(activity: Activity): void

  sites(): Site[]
  executives(): SalesExecutive[]
  nextId(prefix: string): string
}

const DEFAULT_META: StoreMeta = {
  scenario: 'default',
  now: DEMO_NOW,
  rngSeed: 20260919,
  latencyMs: 0,
  errorRate: 0,
}

export function createStore(db: Db): Store {
  const readMeta = (): StoreMeta => {
    const rows = db.get<StoreMeta>(META)
    return rows[0] ?? DEFAULT_META
  }

  const writeMeta = (meta: StoreMeta): StoreMeta => {
    db.set(META, [meta])
    return meta
  }

  const store: Store = {
    reset(options: ResetOptions = {}): StoreMeta {
      const current = readMeta()
      const meta: StoreMeta = {
        scenario: options.scenario ?? DEFAULT_META.scenario,
        now: options.now ?? DEFAULT_META.now,
        rngSeed: options.rngSeed ?? DEFAULT_META.rngSeed,
        latencyMs: options.latencyMs ?? current.latencyMs,
        errorRate: options.errorRate ?? current.errorRate,
      }

      const data = buildScenario(meta.scenario, { now: meta.now, rngSeed: meta.rngSeed })
      db.clear()
      db.set(LEADS, data.leads)
      db.set(ACTIVITIES, data.activities)
      db.set(SITES, data.sites)
      db.set(EXECUTIVES, data.executives)
      return writeMeta(meta)
    },

    meta: readMeta,

    setMeta(patch: Partial<StoreMeta>): StoreMeta {
      return writeMeta({ ...readMeta(), ...patch })
    },

    isSeeded(): boolean {
      return db.collections().includes(META)
    },

    leads(): Lead[] {
      return db.get<Lead>(LEADS)
    },

    lead(id: string): Lead | undefined {
      return db.get<Lead>(LEADS).find((l) => l.id === id)
    },

    putLead(lead: Lead): void {
      const rows = db.get<Lead>(LEADS)
      const index = rows.findIndex((l) => l.id === lead.id)
      if (index === -1) rows.push(lead)
      else rows[index] = lead
      db.set(LEADS, rows)
    },

    activities(leadId?: string): Activity[] {
      const rows = db.get<Activity>(ACTIVITIES)
      return leadId === undefined ? rows : rows.filter((a) => a.leadId === leadId)
    },

    addActivity(activity: Activity): void {
      db.set(ACTIVITIES, [...db.get<Activity>(ACTIVITIES), activity])
    },

    sites(): Site[] {
      return db.get<Site>(SITES)
    },

    executives(): SalesExecutive[] {
      return db.get<SalesExecutive>(EXECUTIVES)
    },

    /**
     * Ids continue the seeded sequence rather than restarting, so an activity
     * logged by hand cannot collide with a seeded one. Derived from what is
     * already stored, so it survives a page reload.
     */
    nextId(prefix: string): string {
      const existing = [
        ...db.get<Lead>(LEADS).map((l) => l.id),
        ...db.get<Activity>(ACTIVITIES).map((a) => a.id),
      ]
      const highest = existing
        .filter((id) => id.startsWith(`${prefix}_`))
        .map((id) => Number.parseInt(id.slice(prefix.length + 1), 10))
        .filter((n) => Number.isFinite(n))
        .reduce((max, n) => Math.max(max, n), 0)
      return `${prefix}_${String(highest + 1).padStart(4, '0')}`
    },
  }

  return store
}
