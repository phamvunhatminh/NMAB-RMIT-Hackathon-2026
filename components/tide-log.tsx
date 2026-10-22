'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/lib/auth-context'
import type { TideEvent } from '@/lib/sim-tide/core'
import styles from './tide-log.module.css'

const POLL_MS = 2000

const clock = (at: number) => new Date(at).toLocaleTimeString('en-GB', { hour12: false })

/** "Unseal safechat_chat for an: refused, lacks …" → the request, and the network's reason. */
function split(detail: string): [string, string] {
  const m = /^(.*?): (?:allowed|refused)[, ]*\(?(.*?)\)?$/.exec(detail)
  return m ? [m[1], m[2]] : [detail, '']
}

/**
 * A live feed of the checks the (simulated) Tide network makes: every sign-in, seal, unseal,
 * proposal and approval, allowed or refused. Admins see all of them; everyone else sees their own.
 */
export function TideLog({ tone = 'dark', limit = 40 }: { tone?: 'dark' | 'light'; limit?: number }) {
  const { token, mode } = useAuth()
  const [events, setEvents] = useState<TideEvent[] | null>(null)

  useEffect(() => {
    if (mode !== 'simulated' || !token) return
    let alive = true
    const tick = async () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
      try {
        const res = await fetch('/api/sim-tide/log', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' })
        if (res.ok && alive) setEvents((await res.json()) as TideEvent[])
      } catch {
        // The feed is a window onto the network, not part of the work: a missed poll is retried in 2 s.
      }
    }
    void tick()
    const timer = setInterval(() => void tick(), POLL_MS)
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [token, mode])

  if (mode !== 'simulated' || !token) return null
  const shown = events?.slice(0, limit) ?? []

  return (
    <section className={`${styles.log} ${tone === 'dark' ? styles.dark : styles.light}`} aria-live="polite" aria-label="Tide network checks">
      <header className={styles.head}>
        <span className={styles.pulse} aria-hidden />
        <h4>Tide network checks</h4>
        <span className={styles.sub}>{tone === 'dark' ? 'live' : 'every sign-in, seal, unseal and approval, as it happens'}</span>
      </header>
      <ol className={styles.rows}>
        {events && shown.length === 0 && <li className={styles.empty}>No checks yet. Sign in, send a message or propose a change.</li>}
        {shown.map((e) => {
          const [what, why] = split(e.detail)
          return (
            <li key={e.id} className={`${styles.row} ${e.allowed ? '' : styles.refused}`} title={e.detail}>
              <time className={styles.time} dateTime={new Date(e.at).toISOString()}>{clock(e.at)}</time>
              <span className={`${styles.mark} ${e.allowed ? styles.ok : styles.no}`}>{e.allowed ? 'allowed' : 'refused'}</span>
              <span className={styles.detail}>
                {what}
                {why && <span className={styles.why}> · {why}</span>}
              </span>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
