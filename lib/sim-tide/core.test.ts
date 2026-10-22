import { describe, expect, it } from 'vitest'
import { approve, createState, decryptFor, encryptFor, LOG_LIMIT, logFor, propose, quorumOf, rolesOf, signIn } from './core'

describe('simulated Tide network', () => {
  it('gives Lan the SafeChat data roles and the admins none of them', () => {
    const s = createState()
    expect(rolesOf(s, 'lan')).toContain('_tide_safechat_parties.selfdecrypt')
    expect(rolesOf(s, 'an')).not.toContain('_tide_safechat_parties.selfdecrypt')
  })

  it('uses Tide’s quorum of 70% of admins, so 2 of 3', () => {
    expect(quorumOf(createState())).toBe(2)
  })

  it('round-trips data only for the user who sealed it, with the role for that tag', () => {
    const s = createState()
    const ct = encryptFor(s, 'lan', 'safechat_parties', 'Minh Phat Trading Co., Ltd.')
    expect(ct).not.toContain('Minh Phat')
    expect(decryptFor(s, 'lan', 'safechat_parties', ct)).toBe('Minh Phat Trading Co., Ltd.')
    expect(() => decryptFor(s, 'an', 'safechat_parties', ct)).toThrow(/access/)
  })

  it('refuses to seal or open a tag the caller has no role for', () => {
    const s = createState()
    expect(() => encryptFor(s, 'an', 'safechat_parties', 'x')).toThrow(/access/)
  })

  it('does not let one admin push a change through alone, even by approving twice', () => {
    const s = createState()
    const cr = propose(s, 'an', { action: 'grant', role: 'safechat-staff', user: 'an' })
    expect(cr.approvals).toEqual(['an'])
    expect(() => approve(s, 'an', cr.id)).toThrow(/already approved/)
    expect(cr.status).toBe('pending')
    expect(rolesOf(s, 'an')).not.toContain('safechat-staff')
  })

  it('applies a change once a second admin approves, and revocation locks the data at once', () => {
    const s = createState()
    const ct = encryptFor(s, 'lan', 'safechat_chat', 'transcript')
    const cr = propose(s, 'an', { action: 'revoke', role: 'safechat-staff', user: 'lan' })
    approve(s, 'binh', cr.id)
    expect(cr.status).toBe('committed')
    expect(rolesOf(s, 'lan')).not.toContain('safechat-staff')
    expect(() => decryptFor(s, 'lan', 'safechat_chat', ct)).toThrow(/access/)
  })

  it('does not let a non-admin propose or approve changes', () => {
    const s = createState()
    expect(() => propose(s, 'lan', { action: 'grant', role: 'safechat-auditor', user: 'lan' })).toThrow(/admin/)
  })
})

describe('Tide network activity log', () => {
  const latest = (s: ReturnType<typeof createState>) => s.log[0]

  it('records an allowed seal and unseal, naming the role that allowed it', () => {
    const s = createState()
    const ct = encryptFor(s, 'lan', 'safechat_parties', 'Minh Phat')
    expect(latest(s)).toMatchObject({ actor: 'lan', op: 'seal', tag: 'safechat_parties', allowed: true })
    expect(latest(s).detail).toBe('Seal safechat_parties for lan: allowed (holds _tide_safechat_parties.selfencrypt)')
    decryptFor(s, 'lan', 'safechat_parties', ct)
    expect(latest(s)).toMatchObject({ op: 'unseal', allowed: true })
    expect(latest(s).detail).toBe('Unseal safechat_parties for lan: allowed (holds _tide_safechat_parties.selfdecrypt)')
    expect(latest(s).id).toBeTruthy()
    expect(typeof latest(s).at).toBe('number')
  })

  it('records a refusal before throwing', () => {
    const s = createState()
    const ct = encryptFor(s, 'lan', 'safechat_chat', 'transcript')
    expect(() => decryptFor(s, 'an', 'safechat_chat', ct)).toThrow(/access/)
    expect(latest(s)).toMatchObject({ actor: 'an', op: 'unseal', tag: 'safechat_chat', allowed: false })
    expect(latest(s).detail).toBe('Unseal safechat_chat for an: refused, lacks _tide_safechat_chat.selfdecrypt')
    expect(() => encryptFor(s, 'an', 'safechat_parties', 'x')).toThrow()
    expect(latest(s).detail).toBe('Seal safechat_parties for an: refused, lacks _tide_safechat_parties.selfencrypt')
  })

  it('records a refused unseal of data sealed under another user’s key', () => {
    const s = createState()
    s.users.binh.roles.push('safechat-staff')
    const ct = encryptFor(s, 'lan', 'safechat_chat', 'transcript')
    expect(() => decryptFor(s, 'binh', 'safechat_chat', ct)).toThrow(/access/)
    expect(latest(s)).toMatchObject({ allowed: false })
    expect(latest(s).detail).toMatch(/^Unseal safechat_chat for binh: refused, sealed under another user/)
  })

  it('records proposals, approvals, refused double approvals and the applied change', () => {
    const s = createState()
    const cr = propose(s, 'an', { action: 'revoke', role: 'safechat-staff', user: 'lan' })
    expect(latest(s)).toMatchObject({ actor: 'an', op: 'propose', target: 'lan', allowed: true })
    expect(latest(s).detail).toBe('Propose revoke safechat-staff from lan by an: allowed (1 of 2 approvals)')
    expect(() => approve(s, 'an', cr.id)).toThrow(/already approved/)
    expect(latest(s)).toMatchObject({ op: 'approve', allowed: false, target: 'lan' })
    expect(latest(s).detail).toBe('Approve revoke safechat-staff from lan by an: refused, an already approved')
    approve(s, 'binh', cr.id)
    const [applied, approved] = s.log
    expect(approved.detail).toBe('Approve revoke safechat-staff from lan by binh: allowed (2 of 2 approvals)')
    expect(applied).toMatchObject({ op: 'apply', target: 'lan', allowed: true })
    expect(applied.detail).toBe('Change applied: revoke safechat-staff from lan (quorum of 2 admins reached)')
  })

  it('records refused proposals from non-admins', () => {
    const s = createState()
    expect(() => propose(s, 'lan', { action: 'grant', role: 'safechat-auditor', user: 'lan' })).toThrow(/admin/)
    expect(latest(s)).toMatchObject({ actor: 'lan', op: 'propose', allowed: false })
    expect(latest(s).detail).toBe('Propose grant safechat-auditor to lan by lan: refused, lan is not a realm admin')
  })

  it('records sign-ins, refusing unknown users', () => {
    const s = createState()
    signIn(s, 'lan')
    expect(latest(s)).toMatchObject({ actor: 'lan', op: 'sign-in', allowed: true })
    expect(latest(s).detail).toBe('Sign in lan: allowed (roles: safechat-staff)')
    expect(() => signIn(s, 'mallory')).toThrow(/Unknown user/)
    expect(latest(s)).toMatchObject({ actor: 'mallory', op: 'sign-in', allowed: false })
  })

  it('keeps only the most recent events', () => {
    const s = createState()
    for (let i = 0; i < LOG_LIMIT + 15; i++) encryptFor(s, 'lan', 'safechat_chat', String(i))
    expect(s.log).toHaveLength(LOG_LIMIT)
  })

  it('shows admins every event and everyone else only their own', () => {
    const s = createState()
    encryptFor(s, 'lan', 'safechat_chat', 'x')
    expect(() => encryptFor(s, 'binh', 'safechat_chat', 'x')).toThrow()
    propose(s, 'an', { action: 'revoke', role: 'safechat-staff', user: 'lan' })
    propose(s, 'an', { action: 'grant', role: 'safechat-staff', user: 'chi' })
    expect(logFor(s, 'an')).toHaveLength(4)
    const lan = logFor(s, 'lan')
    expect(lan.map((e) => e.op)).toEqual(['propose', 'seal'])
    expect(lan.every((e) => e.actor === 'lan' || e.target === 'lan')).toBe(true)
  })

  it('works on state saved before the log existed', () => {
    const s = createState() as Partial<ReturnType<typeof createState>>
    delete s.log
    encryptFor(s as ReturnType<typeof createState>, 'lan', 'safechat_chat', 'x')
    expect(s.log).toHaveLength(1)
  })
})
