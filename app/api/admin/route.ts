import { NextRequest, NextResponse } from 'next/server'
import { verifyCaller } from '@/lib/auth'
import { store } from '@/lib/store'

/** Everything SafeChat stores, exactly as stored: what an admin (or an attacker with the database) would see. */
export async function GET(request: NextRequest) {
  const caller = await verifyCaller(request, ['safechat-auditor'])
  if (caller === 'unauthenticated') return NextResponse.json({ error: caller }, { status: 401 })
  if (caller === 'forbidden') return NextResponse.json({ error: caller }, { status: 403 })
  return NextResponse.json(await store.allDocs())
}
