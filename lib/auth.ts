import { verifyTideCloakToken } from '@tidecloak/nextjs/server'
import type { NextRequest } from 'next/server'
import tcConfig from '../tidecloak.json'
import { verifyToken } from './sim-tide/server'

export interface Caller {
  vuid: string
  username: string
}

const SIMULATED = process.env.NEXT_PUBLIC_TIDE_MODE !== 'live'

/**
 * Verifies the caller's access token on the server. Live, the token is signed by the Tide
 * network's threshold key, so neither SafeChat's server nor an admin can mint one with roles the
 * user was never granted. Simulated, the simulated network signs it and SafeChat only verifies.
 */
export async function verifyCaller(request: NextRequest, roles: string[] = []): Promise<Caller | 'unauthenticated' | 'forbidden'> {
  const header = request.headers.get('authorization')
  if (!header?.startsWith('Bearer ')) return 'unauthenticated'
  const token = header.slice(7)
  if (SIMULATED) {
    const claims = verifyToken(token)
    if (!claims) return 'unauthenticated'
    if (!roles.every((r) => claims.realm_access.roles.includes(r))) return 'forbidden'
    return { vuid: claims.vuid, username: claims.preferred_username }
  }
  try {
    const claims = (await verifyTideCloakToken(tcConfig, token, roles)) as Record<string, string> | null
    if (!claims) return 'forbidden'
    return { vuid: claims.vuid, username: claims.preferred_username ?? claims.vuid }
  } catch {
    return 'unauthenticated'
  }
}
