import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { createState, rolesOf, type SimState } from './core'

/** The simulated network's own state file, kept apart from SafeChat's store (.data/store.json). */
const FILE = path.join(process.cwd(), '.data', 'sim-tide-network.json')

interface Persisted {
  state: SimState
  /** Signs simulated access tokens, standing in for Tide's threshold-signed tokens. */
  signingKey: string
}

function load(): Persisted {
  try {
    return JSON.parse(fs.readFileSync(FILE, 'utf8'))
  } catch {
    const fresh = { state: createState(), signingKey: crypto.randomBytes(32).toString('base64') }
    save(fresh)
    return fresh
  }
}

function save(p: Persisted) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true })
  fs.writeFileSync(FILE, JSON.stringify(p, null, 2))
}

/**
 * Runs `fn` on the current network state and persists whatever it changed, even when `fn`
 * refuses (throws): a refusal is recorded in the network's log before it is thrown.
 */
export function withNetwork<T>(fn: (s: SimState) => T): T {
  const p = load()
  try {
    return fn(p.state)
  } finally {
    save(p)
  }
}

/** Reads the network state without writing it back, for polling. */
export function readNetwork<T>(fn: (s: SimState) => T): T {
  return fn(load().state)
}

/** SafeChat's own store, deleted with the network so a demo reset leaves nothing behind. */
const STORE_FILE = path.join(process.cwd(), '.data', 'store.json')

/** Demo reset: forget every key, persona change, log entry and sealed chat. Tokens signed before it stop working. */
export function resetNetwork(): void {
  for (const file of [FILE, STORE_FILE]) fs.rmSync(file, { force: true })
}

export interface SimClaims {
  sub: string
  preferred_username: string
  vuid: string
  name: string
  realm_access: { roles: string[] }
  exp: number
}

const sign = (key: string, body: string) => crypto.createHmac('sha256', Buffer.from(key, 'base64')).update(body).digest('base64url')

export function issueToken(username: string): string {
  const p = load()
  const user = p.state.users[username]
  if (!user) throw new Error('Unknown user')
  const claims: SimClaims = {
    sub: username,
    preferred_username: username,
    vuid: user.vuid,
    name: user.name,
    realm_access: { roles: rolesOf(p.state, username) },
    exp: Math.floor(Date.now() / 1000) + 3600,
  }
  const body = Buffer.from(JSON.stringify(claims)).toString('base64url')
  return `${body}.${sign(p.signingKey, body)}`
}

/** Verifies a simulated token; roles are then read from the network's current state, so a revocation bites at once. */
export function verifyToken(token: string): SimClaims | null {
  const [body, mac] = token.split('.')
  if (!body || !mac) return null
  const p = load()
  const expected = sign(p.signingKey, body)
  if (expected.length !== mac.length || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(mac))) return null
  const claims = JSON.parse(Buffer.from(body, 'base64url').toString()) as SimClaims
  if (claims.exp < Date.now() / 1000 || !p.state.users[claims.sub]) return null
  return { ...claims, realm_access: { roles: rolesOf(p.state, claims.sub) } }
}
