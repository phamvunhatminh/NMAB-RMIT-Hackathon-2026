'use client'

import { useState } from 'react'
import { PROVIDER_IDS, PROVIDERS, type ProviderId } from '@/lib/providers'

export interface Keys {
  provider: ProviderId
  apiKey: string
  model: string
  /** Extra words to always mask, such as project or client code names. */
  terms: string[]
}

const DEFAULT_MODELS: Record<ProviderId, string> = {
  openrouter: 'openrouter/auto',
  openai: 'gpt-4.1-mini',
  anthropic: 'claude-sonnet-5-5',
  google: 'gemini-2.5-flash',
}

/** BYOK settings. Saving seals them under `safechat_apikey`: the server stores a blob it cannot open. */
export function KeyDialog({ initial, onSave, onClose }: { initial: Keys | null; onSave: (k: Keys) => Promise<void>; onClose: () => void }) {
  const [provider, setProvider] = useState<ProviderId>(initial?.provider ?? 'openrouter')
  const [apiKey, setApiKey] = useState(initial?.apiKey ?? '')
  const [model, setModel] = useState(initial?.model ?? DEFAULT_MODELS.openrouter)
  const [terms, setTerms] = useState((initial?.terms ?? []).join(', '))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const save = async () => {
    setBusy(true)
    setError('')
    try {
      await onSave({ provider, apiKey: apiKey.trim(), model: model.trim(), terms: terms.split(',').map((t) => t.trim()).filter(Boolean) })
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <h3>Your AI key</h3>
        <p className="hint">SafeChat seals this key with TideCloak before it leaves your browser. The server and admins only ever hold ciphertext.</p>
        <label>
          Provider
          <select
            value={provider}
            onChange={(e) => {
              const p = e.target.value as ProviderId
              setProvider(p)
              setModel(DEFAULT_MODELS[p])
            }}
          >
            {PROVIDER_IDS.map((p) => (
              <option key={p} value={p}>{PROVIDERS[p].name}</option>
            ))}
          </select>
        </label>
        <label>
          API key
          <input type="password" value={apiKey} placeholder={PROVIDERS[provider].keyPlaceholder} onChange={(e) => setApiKey(e.target.value)} />
        </label>
        <label>
          Model
          <input value={model} onChange={(e) => setModel(e.target.value)} />
        </label>
        <label>
          Always mask these words (comma separated)
          <input value={terms} placeholder="Project Sao Mai, VIP client list" onChange={(e) => setTerms(e.target.value)} />
        </label>
        {error && <p className="badge warn">{error}</p>}
        <div className="actions">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={busy || !apiKey.trim() || !model.trim()} onClick={save}>
            {busy ? 'Sealing…' : 'Seal & save'}
          </button>
        </div>
      </div>
    </div>
  )
}
