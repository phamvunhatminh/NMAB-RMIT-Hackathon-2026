'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import { TideLog } from '@/components/tide-log'
import { useAuth } from '@/lib/auth-context'
import { fetchAll } from '@/lib/api-client'
import type { UserDoc } from '@/lib/types'

interface Governance {
  quorum: number
  users: { username: string; name: string; title: string; roles: string[] }[]
  changeRequests: {
    id: string
    action: 'grant' | 'revoke'
    role: string
    user: string
    proposedBy: string
    approvals: string[]
    status: 'pending' | 'committed'
  }[]
}

/** What an admin, or anyone who steals the database, gets out of SafeChat: ciphertext. And how access changes: by quorum. */
export default function AdminPage() {
  const auth = useAuth()
  const router = useRouter()
  const [docs, setDocs] = useState<UserDoc[] | null>(null)
  const [gov, setGov] = useState<Governance | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const refresh = useCallback(async () => {
    if (!auth.token) return
    // No setError('') here: act() refreshes right after a refusal, and the refusal must stay on screen.
    if (auth.hasRealmRole('safechat-auditor')) fetchAll(auth.token).then(setDocs).catch((e) => setError(`Stored data: ${e instanceof Error ? e.message : e}`))
    if (auth.mode === 'simulated') {
      const res = await fetch('/api/sim-tide/governance', { headers: { Authorization: `Bearer ${auth.token}` } })
      if (res.ok) setGov(await res.json())
    }
  }, [auth.token, auth.mode])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const act = async (action: 'propose' | 'approve', body: Record<string, string>) => {
    setError('')
    setNotice('')
    const res = await fetch(`/api/sim-tide/${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.token}` },
      body: JSON.stringify(body),
    })
    const json = await res.json()
    if (!res.ok) setError(json.error)
    else setNotice(json.status === 'committed' ? 'Quorum reached: the change is now in force.' : `Recorded. ${json.approvals.length} of ${gov?.quorum} approvals.`)
    await refresh()
  }

  /** Demo only: wipes the simulated network and SafeChat's store, so personas, keys and chats start clean. */
  const resetDemo = async () => {
    if (!window.confirm('Reset the demo? This deletes every sealed chat, saved AI key, access change and network log, and signs everyone out.')) return
    setError('')
    const res = await fetch('/api/sim-tide/reset', { method: 'POST', headers: { Authorization: `Bearer ${auth.token}` } })
    if (!res.ok) return setError((await res.json().catch(() => ({}))).error ?? 'Reset failed')
    auth.logout()
    router.push('/')
  }

  if (auth.isInitializing) return <div className="landing"><p>Opening…</p></div>
  if (!auth.authenticated) return <div className="landing"><Link href="/">Sign in first</Link></div>

  const name = (u: string) => gov?.users.find((x) => x.username === u)?.name ?? u

  return (
    <div className="admin">
      <div className="admin-top">
        <div className="brand"><span className="brand-mark">S</span>SafeChat AI</div>
        <span className="spacer" style={{ flex: 1 }} />
        {auth.hasRealmRole('safechat-staff') && <Link href="/chat">Back to chat</Link>}
        <span className="hint">Signed in as <b>{auth.displayName || auth.username}</b></span>
        <button className="btn" onClick={() => { auth.logout(); router.push('/') }}>Switch user</button>
      </div>
      <h1>What an admin can and cannot do</h1>
      <p className="admin-lead">
        Admins run SafeChat but cannot read anyone&apos;s chats, and no admin can change who has access on their own. Every access change waits
        for {gov?.quorum ?? 2} admins to approve it.
      </p>
      {auth.mode === 'simulated' && <p className="badge neutral">Simulated Tide network (Tide was under heavy load on 22 October)</p>}
      {error && <p className="banner danger">{error}</p>}
      {notice && <p className="banner">{notice}</p>}

      {gov && (
        <div className="card">
          <h3>Who can open SafeChat data</h3>
          <p className="hint">Data access is the safechat-staff role. Propose a change here; it takes effect at {gov.quorum} approvals from different admins.</p>
          <table className="people-table">
            <tbody>
              {gov.users.map((u) => (
                <tr key={u.username}>
                  <td><b>{u.name}</b><br /><span className="hint">{u.title}</span></td>
                  <td>{u.roles.map((r) => <span key={r} className="role-pill">{r}</span>)}</td>
                  <td>
                    {u.roles.includes('safechat-staff') ? (
                      <button className="btn btn-danger" onClick={() => act('propose', { change: 'revoke', role: 'safechat-staff', user: u.username })}>Propose revoking access</button>
                    ) : (
                      <button className="btn" onClick={() => act('propose', { change: 'grant', role: 'safechat-staff', user: u.username })}>Propose granting access</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {gov && (
        <div className="card">
          <h3>Access changes waiting for approval</h3>
          {gov.changeRequests.length === 0 && <p className="hint">No changes proposed yet.</p>}
          {gov.changeRequests.map((cr) => (
            <div key={cr.id} className="cr">
              <div className="cr-text">
                <b>{cr.action === 'revoke' ? 'Revoke' : 'Grant'} data access {cr.action === 'revoke' ? 'from' : 'to'} {name(cr.user)}</b>
                <div className="hint">Proposed by {name(cr.proposedBy)}. Approved by {cr.approvals.map(name).join(' and ')}.</div>
              </div>
              <span className="dots" aria-label={`${cr.approvals.length} of ${gov.quorum} approvals`}>
                {Array.from({ length: gov.quorum }, (_, i) => <span key={i} className={i < cr.approvals.length ? 'on' : ''} />)}
              </span>
              <span className={`badge${cr.status === 'pending' ? ' warn' : ''}`}>{cr.status === 'pending' ? `${cr.approvals.length} of ${gov.quorum} approvals` : 'In force'}</span>
              {cr.status === 'pending' && <button className="btn btn-primary" onClick={() => act('approve', { id: cr.id })}>Approve as {auth.displayName || auth.username}</button>}
            </div>
          ))}
        </div>
      )}

      {auth.mode === 'simulated' && (
        <div className="card">
          <TideLog tone="light" limit={60} />
        </div>
      )}

      <div className="card">
        <h3>Everything SafeChat&apos;s server stores</h3>
        <p className="hint">Exactly as stored. An admin can see that chats exist, but not one name, number or word inside them.</p>
        {docs?.map((d) => (
          <div key={d.vuid} style={{ marginTop: '.8rem' }}>
            <b>{d.username}</b> <span className="hint">{d.chats.length} sealed chat(s)</span>
            <div className="raw">{JSON.stringify(d, null, 2)}</div>
          </div>
        ))}
        {docs?.length === 0 && <p className="hint">Nothing stored yet.</p>}
        {!auth.hasRealmRole('safechat-auditor') && <p className="hint">Only admins with the safechat-auditor role can view the store.</p>}
      </div>

      {auth.mode === 'simulated' && auth.hasRealmRole('tide-realm-admin') && (
        <p className="hint" style={{ marginTop: '1.4rem', display: 'flex', gap: '.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="btn" onClick={() => void resetDemo()}>Reset demo data</button>
          Starts the demo over: new personas and keys, no chats, no log. Simulated network only.
        </p>
      )}
    </div>
  )
}
