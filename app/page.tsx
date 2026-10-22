'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { useAuth } from '@/lib/auth-context'

interface Persona {
  username: string
  name: string
  title: string
}

/** What each persona is there to show in the demo. */
const TRY: Record<string, string> = {
  lan: 'Paste a real contract and see what the AI receives',
  an: 'Open the stored data, then try to give yourself access',
  binh: 'Approve or refuse access changes',
  chi: 'Approve or refuse access changes',
}

const T = ({ children }: { children: string }) => <span className="token">{children}</span>
const Real = ({ children }: { children: string }) => <span className="sealed-value">{children}</span>

export default function LandingPage() {
  const auth = useAuth()
  const router = useRouter()
  const [personas, setPersonas] = useState<Persona[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    if (auth.authenticated) router.push(auth.hasRealmRole('tide-realm-admin') ? '/admin' : '/chat')
  }, [auth, router])

  useEffect(() => {
    if (auth.mode !== 'simulated') return
    fetch('/api/sim-tide/personas')
      .then((r) => r.json())
      .then(setPersonas)
      .catch(() => {})
  }, [auth.mode])

  const signIn = async (username?: string) => {
    setError('')
    try {
      await auth.login(username)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div className="landing">
      <div className="landing-inner">
        <div className="brand"><span className="brand-mark">S</span>SafeChat AI</div>

        <section className="hero">
          <h1>Paste the real contract. Nobody else can read it.</h1>
          <p>
            Company AI is a super-account. To get help with a contract or a payroll sheet, employees have to hand over everything. SafeChat AI
            masks the sensitive parts in your own browser and seals them with TideCloak, so no AI vendor, IT admin or server ever holds the key.
          </p>
          <div className="risks">
            <span className="risk">The AI vendor sees every document</span>
            <span className="risk">IT can export every prompt</span>
            <span className="risk">One poisoned email can leak it all</span>
          </div>
        </section>

        <div className="views" aria-label="The same request, seen by three parties">
          <div className="view">
            <h3>What Lan sees</h3>
            <span className="who">In her own browser, after her Tide session unseals it</span>
            <p className="sample">
              Remind <Real>Minh Phat Trading Co., Ltd.</Real> (tax code <Real>0312345678</Real>) to pay <Real>VND 750,000,000</Real> into account{' '}
              <Real>0071000123456</Real>.
            </p>
          </div>
          <div className="view ai">
            <h3>What the AI provider receives</h3>
            <span className="who">Masked before it leaves the browser</span>
            <p className="sample">
              Remind <T>[COMPANY_1]</T> (tax code <T>[TAX_ID_1]</T>) to pay <T>[AMOUNT_1]</T> into account <T>[ACCOUNT_1]</T>.
            </p>
          </div>
          <div className="view server">
            <h3>What IT and the server store</h3>
            <span className="who">Sealed per data type; no admin holds the key</span>
            <p className="sample cipher">simtide1.P5Zf6f8aaFRXFG9q.XLKaWnHnPWD8EDq0vT3kQmZr9aL2xW7bNcYhE1uJ…</p>
          </div>
        </div>
        <p className="views-caption">When Lan leaves the company, two admins must agree to revoke her. Her chat history then locks for her too.</p>
        <p className="views-caption"><a href="/how-it-works">How SafeChat AI works, in one diagram</a></p>

        <div className="people-head">
          <h2>Try it as</h2>
          {auth.mode === 'simulated' && <span className="badge neutral">Simulated Tide sign-in</span>}
        </div>

        {auth.mode === 'live' ? (
          <button className="btn btn-primary" disabled={auth.isInitializing} onClick={() => signIn()}>
            {auth.isInitializing ? 'Connecting to Tide…' : 'Sign in with Tide'}
          </button>
        ) : (
          <div className="people">
            {personas.map((p) => (
              <button key={p.username} className={`person${p.username === 'lan' ? ' lead' : ''}`} onClick={() => signIn(p.username)}>
                <span className="avatar">{p.name.split(' ').map((w) => w[0]).join('')}</span>
                <span style={{ color: 'inherit' }}>
                  <b>{p.name}, {p.title}</b>
                  <span>{TRY[p.username]}</span>
                </span>
              </button>
            ))}
          </div>
        )}
        {error && <p className="badge warn">{error}</p>}

        {auth.mode === 'simulated' && (
          <p className="sim-note">
            Tide&apos;s network was under heavy load on 22 October. As Tide advised, this prototype runs against a simulated Tide network that
            enforces the same rules: sealed data per user and role, and access changes that need two of three admins.
          </p>
        )}
      </div>
    </div>
  )
}
