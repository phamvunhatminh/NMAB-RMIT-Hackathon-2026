import { NextRequest, NextResponse } from 'next/server'
import { approve, decryptFor, encryptFor, logFor, PERSONAS, propose, quorumOf, rolesOf, signIn } from '@/lib/sim-tide/core'
import { issueToken, readNetwork, resetNetwork, verifyToken, withNetwork } from '@/lib/sim-tide/server'

/**
 * The simulated Tide network (see lib/sim-tide/core.ts). In a live deployment these calls go to
 * TideCloak and the ORKs; SafeChat's own API (/api/me, /api/admin) never touches this state.
 */
const fail = (message: string, status = 403) => NextResponse.json({ error: message }, { status })

const LIVE = process.env.NEXT_PUBLIC_TIDE_MODE === 'live'

function caller(request: NextRequest) {
  const header = request.headers.get('authorization')
  return header?.startsWith('Bearer ') ? verifyToken(header.slice(7)) : null
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ action: string }> }) {
  const { action } = await params
  if (action === 'personas') return NextResponse.json(PERSONAS.map(({ username, name, title }) => ({ username, name, title })))
  if (action === 'log') {
    const who = caller(request)
    if (!who) return fail('unauthenticated', 401)
    return NextResponse.json(readNetwork((s) => logFor(s, who.sub)))
  }
  if (action === 'governance') {
    const who = caller(request)
    if (!who) return fail('unauthenticated', 401)
    return NextResponse.json(
      readNetwork((s) => ({
        quorum: quorumOf(s),
        users: Object.values(s.users).map((u) => ({ username: u.username, name: u.name, title: u.title, roles: u.roles })),
        changeRequests: s.changeRequests,
      })),
    )
  }
  return fail('unknown action', 404)
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ action: string }> }) {
  const { action } = await params
  const body = await request.json().catch(() => ({}))
  try {
    if (action === 'login') {
      const username = String(body.username)
      withNetwork((s) => signIn(s, username))
      return NextResponse.json({ token: issueToken(username) })
    }
    const who = caller(request)
    if (!who) return fail('unauthenticated', 401)
    switch (action) {
      case 'refresh':
        withNetwork((s) => signIn(s, who.sub, true))
        return NextResponse.json({ token: issueToken(who.sub) })
      case 'reset':
        // A demo convenience only: a live TideCloak realm is never wiped from SafeChat.
        if (LIVE) return fail('reset is only available on the simulated network')
        if (!who.realm_access.roles.includes('tide-realm-admin')) return fail('Only a realm admin can reset the demo')
        resetNetwork()
        return NextResponse.json({ ok: true })
      case 'encrypt':
        return NextResponse.json(
          withNetwork((s) => (body.items as { data: string; tags: string[] }[]).map((i) => encryptFor(s, who.sub, i.tags[0], i.data))),
        )
      case 'decrypt':
        return NextResponse.json(
          withNetwork((s) => (body.items as { encrypted: string; tags: string[] }[]).map((i) => decryptFor(s, who.sub, i.tags[0], i.encrypted))),
        )
      case 'propose':
        return NextResponse.json(withNetwork((s) => propose(s, who.sub, { action: body.change, role: body.role, user: body.user })))
      case 'approve':
        return NextResponse.json(withNetwork((s) => approve(s, who.sub, String(body.id))))
      case 'roles':
        return NextResponse.json(withNetwork((s) => rolesOf(s, who.sub)))
      default:
        return fail('unknown action', 404)
    }
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e))
  }
}
