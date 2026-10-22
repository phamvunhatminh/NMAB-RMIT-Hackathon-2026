# Where TideCloak fits in SafeChat

Planned with Tide's MCP (`https://mcp.tide.org/mcp`) on 22 October 2026. Following Tide's Plan C, the
protections below are simulated in `lib/sim-tide` while Tide's network is under load; the live path is in
the same code and switches on with `NEXT_PUBLIC_TIDE_MODE=live`.

## What the MCP recommended

`tide_choose_scenario` matched SafeChat to **`iga-admin-governance`** (no built-in Forseti contract needed: SafeChat
only encrypts per user and governs roles; it signs nothing). Its playbook sequence:

`start-tidecloak-dev` → `bootstrap-realm-from-template` → `initialize-admin-and-link-account` →
`add-auth-nextjs-fresh` → `protect-routes-nextjs` → `protect-api-nextjs` → `verify-jwt-server-side` →
`setup-iga-admin-panel` → `add-rbac-nextjs`

SafeChat also follows the MCP's canon on E2EE (`feature-mapping`: self-encryption, `_tide_<tag>.selfencrypt` /
`.selfdecrypt`) and on agents (`agent-authority`: an AI cannot hold a Tide identity; authority must sit in a
human's authenticated browser session).

## Each protection, live and simulated

| SafeChat protection | TideCloak feature (live) | Where in SafeChat | Simulated by |
|---|---|---|---|
| Employee signs in | Tide login through the enclave (`add-auth-nextjs-fresh`) | `lib/auth-context.tsx` `LiveBridge` → `TideCloakProvider` | Persona sign-in, `/api/sim-tide/login` |
| Server trusts no client claim | Threshold-signed JWT checked server-side (`verify-jwt-server-side`, `protect-api-nextjs`) | `lib/auth.ts` → `verifyTideCloakToken` on `/api/me`, `/api/admin` | HMAC-signed token from the simulated network, roles re-read from its current state |
| Only the employee can unmask | Self-encryption, one tag per category: `safechat_parties`, `safechat_finance`, `safechat_identity`, `safechat_chat`, `safechat_apikey` | `lib/seal.ts` via `doEncrypt` / `doDecrypt` | AES-256-GCM keyed per tag **and** per user, gated by the same `_tide_safechat_*` roles (`lib/sim-tide/core.ts`) |
| Role bundles | Composite realm role `safechat-staff`; `safechat-auditor` for the store view | `init/realm.json` | Same role names and composite expansion |
| No admin acts alone | IGA change requests, quorum `max(1, floor(0.7 × admins))`, approvals sealed by the network (`setup-iga-admin-panel`) | `app/admin/page.tsx` | `propose` / `approve` in `lib/sim-tide/core.ts`: 2 of 3, no double approval, change applies only at quorum |
| Revocation locks history | Role removed → Tide refuses threshold decryption | `openEntries` marks categories locked; chat goes read-only | Decrypt re-checks roles against the network's current state |
| AI holds no authority | `agent-authority` canon: no agent identity; decisions need a human session | `lib/turn.ts` masks before the provider; no token or key reaches the model | Same (not Tide-dependent) |

## Live steps already done

- TideCloak dev container, a realm created from `init/realm.json` with the SafeChat roles and IGA enabled
  (`setUpTideRealm -> 200`, `toggle-iga -> 200`), adapter exported to `tidecloak.json`.
- Blocked at `initialize-admin-and-link-account`: Tide account creation failed with
  `Could not reach enough NEW ORKs (got 1 of 20 required)` (support ticket #46038).

## Before going live

- Enrol three admins so the quorum is a real 2 of 3.
- Turn on DPoP (`useDPoP: { mode: 'strict', alg: 'ES256' }` plus the `tide_dpop` page), as the MCP's work
  order requires; SafeChat currently sends plain bearer tokens.
- Replace the simulated admin panel's calls with TideCloak's `/iga/change-requests` API.
