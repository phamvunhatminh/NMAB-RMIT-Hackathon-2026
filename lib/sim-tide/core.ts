import crypto from 'node:crypto'

/**
 * A stand-in for the Tide network (the ORKs) while the real one is overloaded.
 * Tide's guidance on 22/10/2026: "build your prototype as though TideCloak protects it
 * and simulate those protections for now". It enforces the same rules SafeChat relies on:
 * self-encryption bound to one user and gated by `_tide_<tag>.self*` roles, and role
 * changes that only take effect after a quorum of admins approves them.
 * It runs apart from SafeChat's own server store: SafeChat's server and admin view never see these keys.
 */

const CATEGORIES = ['parties', 'finance', 'identity', 'chat', 'apikey'] as const
const STAFF_ROLES = CATEGORIES.flatMap((c) => [`_tide_safechat_${c}.selfencrypt`, `_tide_safechat_${c}.selfdecrypt`])
const COMPOSITES: Record<string, string[]> = { 'safechat-staff': STAFF_ROLES }
const ADMIN_ROLE = 'tide-realm-admin'

export interface Persona {
  username: string
  name: string
  title: string
  roles: string[]
}

export interface ChangeRequest {
  id: string
  action: 'grant' | 'revoke'
  role: string
  user: string
  proposedBy: string
  approvals: string[]
  status: 'pending' | 'committed'
  createdAt: number
}

export type TideOp = 'sign-in' | 'seal' | 'unseal' | 'propose' | 'approve' | 'apply'

/** One check the network made, in plain English, so the demo can show TideCloak deciding. */
export interface TideEvent {
  id: string
  at: number
  /** Who asked. */
  actor: string
  op: TideOp
  tag?: string
  /** Whose access a change touches. */
  target?: string
  allowed: boolean
  detail: string
}

export interface SimState {
  /** Per-tag master secrets. Only the simulated network holds them. */
  tagKeys: Record<string, string>
  users: Record<string, Persona & { vuid: string }>
  changeRequests: ChangeRequest[]
  /** The network's most recent checks, newest first. */
  log: TideEvent[]
}

export const LOG_LIMIT = 60

export const PERSONAS: Persona[] = [
  { username: 'lan', name: 'Lan Nguyen', title: 'Accountant', roles: ['safechat-staff'] },
  { username: 'an', name: 'An Tran', title: 'IT admin', roles: [ADMIN_ROLE, 'safechat-auditor'] },
  { username: 'binh', name: 'Binh Le', title: 'HR admin', roles: [ADMIN_ROLE] },
  { username: 'chi', name: 'Chi Pham', title: 'Legal admin', roles: [ADMIN_ROLE] },
]

export function createState(): SimState {
  const tagKeys = Object.fromEntries(CATEGORIES.map((c) => [`safechat_${c}`, crypto.randomBytes(32).toString('base64')]))
  const users = Object.fromEntries(PERSONAS.map((p) => [p.username, { ...p, roles: [...p.roles], vuid: crypto.randomUUID() }]))
  return { tagKeys, users, changeRequests: [], log: [] }
}

/** The user's effective roles, composites expanded, as the network sees them right now. */
export function rolesOf(s: SimState, username: string): string[] {
  const direct = s.users[username]?.roles ?? []
  return [...new Set(direct.flatMap((r) => [r, ...(COMPOSITES[r] ?? [])]))]
}

const isAdmin = (s: SimState, username: string) => rolesOf(s, username).includes(ADMIN_ROLE)

function record(s: SimState, event: Omit<TideEvent, 'id' | 'at'>): TideEvent {
  const full: TideEvent = { id: crypto.randomUUID(), at: Date.now(), ...event }
  s.log = [full, ...(s.log ?? [])].slice(0, LOG_LIMIT)
  return full
}

/** Records the refusal, then refuses: the caller's handler persists the state even when this throws. */
function refuse(s: SimState, event: Omit<TideEvent, 'id' | 'at' | 'allowed'>, message: string): never {
  record(s, { ...event, allowed: false })
  throw new Error(message)
}

/** Admins see every check; anyone else sees the checks they made or that touch their access. */
export function logFor(s: SimState, username: string): TideEvent[] {
  const log = s.log ?? []
  return isAdmin(s, username) ? log : log.filter((e) => e.actor === username || e.target === username)
}

export function signIn(s: SimState, username: string, renewed = false): void {
  const verb = renewed ? 'Renew session' : 'Sign in'
  if (!s.users[username]) refuse(s, { actor: username, op: 'sign-in', detail: `${verb} ${username}: refused, unknown user` }, 'Unknown user')
  const roles = s.users[username].roles.join(', ') || 'none'
  record(s, { actor: username, target: username, op: 'sign-in', allowed: true, detail: `${verb} ${username}: allowed (roles: ${roles})` })
}

const describeChange = (c: Pick<ChangeRequest, 'action' | 'role' | 'user'>) =>
  `${c.action} ${c.role} ${c.action === 'revoke' ? 'from' : 'to'} ${c.user}`

/** Tide's IGA quorum: max(1, floor(admins × 0.7)). */
export function quorumOf(s: SimState): number {
  const admins = Object.keys(s.users).filter((u) => isAdmin(s, u)).length
  return Math.max(1, Math.floor(admins * 0.7))
}

/** Self-encryption: the key is bound to the tag AND the user, so only that user can open it. */
function keyFor(s: SimState, username: string, tag: string): Buffer {
  const master = s.tagKeys[tag]
  if (!master) throw new Error(`Unknown tag ${tag}`)
  return crypto.createHmac('sha256', Buffer.from(master, 'base64')).update(s.users[username].vuid).digest()
}

/** Checks the `_tide_<tag>.self*` role, recording the refusal or returning the allowed event's detail. */
function requireRole(s: SimState, username: string, op: 'seal' | 'unseal', tag: string): string {
  const role = `_tide_${tag}.${op === 'seal' ? 'selfencrypt' : 'selfdecrypt'}`
  const what = `${op === 'seal' ? 'Seal' : 'Unseal'} ${tag} for ${username}`
  if (!rolesOf(s, username).includes(role))
    refuse(s, { actor: username, target: username, op, tag, detail: `${what}: refused, lacks ${role}` }, `User has not been given any access (${role})`)
  return `${what}: allowed (holds ${role})`
}

export function encryptFor(s: SimState, username: string, tag: string, data: string): string {
  const detail = requireRole(s, username, 'seal', tag)
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', keyFor(s, username, tag), iv)
  const body = Buffer.concat([cipher.update(data, 'utf8'), cipher.final(), cipher.getAuthTag()])
  record(s, { actor: username, target: username, op: 'seal', tag, allowed: true, detail })
  return `simtide1.${iv.toString('base64url')}.${body.toString('base64url')}`
}

export function decryptFor(s: SimState, username: string, tag: string, sealed: string): string {
  const detail = requireRole(s, username, 'unseal', tag)
  const [, ivB64, bodyB64] = sealed.split('.')
  const body = Buffer.from(bodyB64 ?? '', 'base64url')
  let plain: string
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', keyFor(s, username, tag), Buffer.from(ivB64 ?? '', 'base64url'))
    decipher.setAuthTag(body.subarray(body.length - 16))
    plain = Buffer.concat([decipher.update(body.subarray(0, body.length - 16)), decipher.final()]).toString('utf8')
  } catch {
    refuse(
      s,
      { actor: username, target: username, op: 'unseal', tag, detail: `Unseal ${tag} for ${username}: refused, sealed under another user's key or altered` },
      'User has not been given any access (sealed by someone else)',
    )
  }
  record(s, { actor: username, target: username, op: 'unseal', tag, allowed: true, detail })
  return plain
}

export function propose(s: SimState, by: string, change: Pick<ChangeRequest, 'action' | 'role' | 'user'>): ChangeRequest {
  const what = `Propose ${describeChange(change)} by ${by}`
  const base = { actor: by, target: change.user, op: 'propose' as const }
  if (!isAdmin(s, by)) refuse(s, { ...base, detail: `${what}: refused, ${by} is not a realm admin` }, 'Only a realm admin can propose a change')
  if (!s.users[change.user]) refuse(s, { ...base, detail: `${what}: refused, unknown user` }, `Unknown user ${change.user}`)
  const cr: ChangeRequest = { ...change, id: crypto.randomUUID(), proposedBy: by, approvals: [by], status: 'pending', createdAt: Date.now() }
  s.changeRequests.unshift(cr)
  record(s, { ...base, allowed: true, detail: `${what}: allowed (1 of ${quorumOf(s)} approvals)` })
  commitIfReady(s, cr, by)
  return cr
}

export function approve(s: SimState, by: string, id: string): ChangeRequest {
  const cr = s.changeRequests.find((c) => c.id === id)
  const what = cr ? `Approve ${describeChange(cr)} by ${by}` : `Approve change ${id} by ${by}`
  const base = { actor: by, target: cr?.user, op: 'approve' as const }
  if (!isAdmin(s, by)) refuse(s, { ...base, detail: `${what}: refused, ${by} is not a realm admin` }, 'Only a realm admin can approve a change')
  if (!cr) return refuse(s, { ...base, detail: `${what}: refused, no such change request` }, 'No such change request')
  if (cr.status !== 'pending') refuse(s, { ...base, detail: `${what}: refused, the change is already in force` }, 'This change is no longer pending')
  if (cr.approvals.includes(by))
    refuse(s, { ...base, detail: `${what}: refused, ${by} already approved` }, 'You already approved this change; another admin must approve it')
  cr.approvals.push(by)
  record(s, { ...base, allowed: true, detail: `${what}: allowed (${cr.approvals.length} of ${quorumOf(s)} approvals)` })
  commitIfReady(s, cr, by)
  return cr
}

function commitIfReady(s: SimState, cr: ChangeRequest, by: string) {
  const quorum = quorumOf(s)
  if (cr.approvals.length < quorum) return
  const user = s.users[cr.user]
  user.roles = cr.action === 'grant' ? [...new Set([...user.roles, cr.role])] : user.roles.filter((r) => r !== cr.role)
  cr.status = 'committed'
  record(s, { actor: by, target: cr.user, op: 'apply', allowed: true, detail: `Change applied: ${describeChange(cr)} (quorum of ${quorum} admins reached)` })
}
