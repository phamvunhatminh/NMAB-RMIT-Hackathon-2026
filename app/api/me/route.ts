import { NextRequest, NextResponse } from 'next/server'
import { verifyCaller } from '@/lib/auth'
import type { UserDoc } from '@/lib/types'
import { store } from '@/lib/store'

const deny = (result: 'unauthenticated' | 'forbidden') =>
  NextResponse.json({ error: result }, { status: result === 'unauthenticated' ? 401 : 403 })

/** The caller's own document: sealed keys and sealed chats. */
export async function GET(request: NextRequest) {
  const caller = await verifyCaller(request)
  if (typeof caller === 'string') return deny(caller)
  const doc = (await store.getUserDoc(caller.vuid)) ?? { vuid: caller.vuid, username: caller.username, chats: [] }
  return NextResponse.json(doc)
}

/** Replaces the caller's document. The server never sees plaintext: the browser sends ciphertext only. */
export async function PUT(request: NextRequest) {
  const caller = await verifyCaller(request)
  if (typeof caller === 'string') return deny(caller)
  const body = (await request.json()) as Partial<UserDoc>
  await store.putUserDoc({
    vuid: caller.vuid,
    username: caller.username,
    sealedKeys: body.sealedKeys,
    chats: Array.isArray(body.chats) ? body.chats : [],
  })
  return NextResponse.json({ ok: true })
}
