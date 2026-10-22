'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AiSeesPanel } from '@/components/ai-sees-panel'
import { KeyDialog, type Keys } from '@/components/key-dialog'
import { RichText } from '@/components/rich-text'
import { TideLog } from '@/components/tide-log'
import tideLogStyles from '@/components/tide-log.module.css'
import { DEMO_DOCS } from '@/lib/demo-docs'
import { useAuth } from '@/lib/auth-context'
import { fetchMe, saveMe } from '@/lib/api-client'
import type { StoredChat, UserDoc } from '@/lib/types'
import { unmaskText, type MaskCategory, type MaskEntry } from '@/lib/mask'
import { loadProvider, PROVIDERS, textOf, type ChatMessage } from '@/lib/providers'
import { openEntries, openJson, sealEntries, sealJson, type Decrypt, type Encrypt } from '@/lib/seal'
import { prepareTurn } from '@/lib/turn'

interface OpenChat {
  id: string
  createdAt: number
  title: string
  messages: ChatMessage[]
  entries: MaskEntry[]
  /** Categories whose key the user no longer holds; their sealed blobs are kept as they were. */
  locked: MaskCategory[]
  /** The whole transcript could not be opened: the user lost the role for `safechat_chat`. */
  sealedShut?: boolean
}

const CATEGORY_NAMES: Record<MaskCategory, string> = {
  parties: 'names of companies and people',
  finance: 'amounts and bank accounts',
  identity: 'ID numbers, tax codes, phones and emails',
}

/** "Sealed 7 values in 3 data types with TideCloak", from the entries a save just sealed. */
function sealedSummary(entries: MaskEntry[]): { text: string; breakdown: string } {
  const counts = new Map<MaskCategory, number>()
  for (const e of entries) counts.set(e.category, (counts.get(e.category) ?? 0) + 1)
  const n = entries.length
  const k = counts.size
  const text = n
    ? `Sealed ${n} value${n === 1 ? '' : 's'} in ${k} data type${k === 1 ? '' : 's'} and the transcript with TideCloak`
    : 'Sealed the transcript with TideCloak'
  const breakdown = [...counts].map(([c, count]) => `safechat_${c}: ${count} (${CATEGORY_NAMES[c]})`).concat('safechat_chat: title and transcript').join('\n')
  return { text, breakdown }
}

const blankChat = (): OpenChat => ({ id: crypto.randomUUID(), createdAt: Date.now(), title: 'New chat', messages: [], entries: [], locked: [] })

/**
 * `preview` runs without a Tide session: masking, the provider panel and Normal AI work,
 * but nothing is sealed or saved and the key lives only in memory.
 */
export function ChatApp({ preview = false }: { preview?: boolean }) {
  const tc = useAuth()
  const { token, authenticated, isInitializing } = tc
  const router = useRouter()
  const enc = useCallback<Encrypt>((items) => tc.doEncrypt(items), [tc])
  const dec = useCallback<Decrypt>((items) => tc.doDecrypt(items), [tc])

  const [doc, setDoc] = useState<UserDoc | null>(null)
  const [keys, setKeys] = useState<Keys | null>(null)
  const [keysLocked, setKeysLocked] = useState(false)
  const [chat, setChat] = useState<OpenChat>(blankChat)
  const [titles, setTitles] = useState<Record<string, string>>({})
  const [protect, setProtect] = useState(true)
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState<string | null>(null)
  /** The entries of the turn being answered, which include this turn's new tokens. */
  const [liveEntries, setLiveEntries] = useState<MaskEntry[]>([])
  const [sent, setSent] = useState<ChatMessage[] | null>(null)
  const [error, setError] = useState('')
  const [showKeys, setShowKeys] = useState(false)
  /** The last successful seal, shown under the composer for the chat it belongs to. */
  const [sealedNote, setSealedNote] = useState<{ chatId: string; at: number; text: string; breakdown: string } | null>(null)
  /** Which demo steps this session has shown, for the guide strip. */
  const [did, setDid] = useState({ masked: false, normal: false, trap: false })
  const abort = useRef<AbortController | null>(null)
  const bottom = useRef<HTMLDivElement>(null)

  const username = tc.displayName || tc.username
  const isAuditor = authenticated && tc.hasRealmRole('safechat-auditor')

  useEffect(() => {
    if (!preview && !isInitializing && !authenticated) router.push('/')
  }, [preview, isInitializing, authenticated, router])

  // Load the user's sealed document, then open what this session's roles allow.
  useEffect(() => {
    if (preview || !token || doc) return
    void (async () => {
      try {
        const me = await fetchMe(token)
        setDoc(me)
        if (me.sealedKeys) {
          try {
            setKeys(await openJson<Keys>('safechat_apikey', me.sealedKeys, dec))
          } catch {
            setKeysLocked(true)
          }
        }
        const opened: Record<string, string> = {}
        for (const c of me.chats) {
          try {
            opened[c.id] = await openJson<string>('safechat_chat', c.title, dec)
          } catch {
            opened[c.id] = '🔒 Sealed chat'
          }
        }
        setTitles(opened)
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      }
    })()
  }, [token, doc, dec])

  // Newer browsers return a Promise from scrollIntoView, and an effect must return nothing.
  useEffect(() => {
    void bottom.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chat.messages.length, streaming])

  const openChat = async (stored: StoredChat) => {
    setError('')
    setSent(null)
    let messages: ChatMessage[] = []
    let sealedShut = false
    try {
      messages = await openJson<ChatMessage[]>('safechat_chat', stored.transcript, dec)
    } catch {
      sealedShut = true
    }
    const { entries, locked } = sealedShut ? { entries: [], locked: [] } : await openEntries(stored.maps, dec)
    setChat({ id: stored.id, createdAt: stored.createdAt, title: titles[stored.id] ?? '', messages, entries, locked, sealedShut })
  }

  const persist = async (next: OpenChat) => {
    if (preview || !token || !doc) return
    const previous = doc.chats.find((c) => c.id === next.id)
    const lockedMaps = Object.fromEntries(next.locked.map((c) => [c, previous?.maps[c]]).filter(([, v]) => v))
    const stored: StoredChat = {
      id: next.id,
      createdAt: next.createdAt,
      title: await sealJson('safechat_chat', next.title, enc),
      transcript: await sealJson('safechat_chat', next.messages, enc),
      // A locked category's blob is kept exactly as it was: this session cannot open or re-create it.
      maps: { ...(await sealEntries(next.entries, enc)), ...lockedMaps },
    }
    const chats = [stored, ...doc.chats.filter((c) => c.id !== next.id)]
    await saveMe(token, { sealedKeys: doc.sealedKeys, chats })
    setDoc({ ...doc, chats })
    setTitles((t) => ({ ...t, [next.id]: next.title }))
    setSealedNote({ chatId: next.id, at: Date.now(), ...sealedSummary(next.entries) })
  }

  const saveKeys = async (k: Keys) => {
    if (preview) return setKeys(k)
    if (!token || !doc) return
    const sealedKeys = await sealJson('safechat_apikey', k, enc)
    await saveMe(token, { sealedKeys, chats: doc.chats })
    setDoc({ ...doc, sealedKeys })
    setKeys(k)
    setKeysLocked(false)
  }

  const send = async () => {
    const text = input.trim()
    if (!text || streaming !== null) return
    if (!keys) return setShowKeys(true)
    setError('')
    const turn = prepareTurn({ history: chat.messages, entries: chat.entries, terms: keys.terms, text, protect })
    setSent(turn.send)
    setLiveEntries(turn.entries)
    setDid((d) => ({
      masked: d.masked || protect,
      normal: d.normal || !protect,
      trap: d.trap || (protect && /ignore all previous instructions/i.test(text)),
    }))
    setInput('')
    setStreaming('')
    abort.current = new AbortController()
    let reply = ''
    try {
      const provider = await loadProvider(keys.provider)
      for await (const ev of provider.streamChat({ apiKey: keys.apiKey, model: keys.model, messages: turn.send, signal: abort.current.signal })) {
        if (ev.type === 'content') {
          reply += ev.text
          setStreaming(reply)
        }
      }
    } catch (e) {
      if (!abort.current.signal.aborted) setError(e instanceof Error ? e.message : String(e))
    }
    setStreaming(null)
    if (!reply) {
      setInput(text) // nothing came back (bad key, network): give the user their text back
      return
    }
    const next: OpenChat = {
      ...chat,
      title: chat.messages.length ? chat.title : textOf(turn.userMessage.content).slice(0, 60),
      messages: [...chat.messages, turn.userMessage, { role: 'assistant', content: reply }],
      entries: turn.entries,
    }
    setChat(next)
    // Normal AI mode is the contrast demo: nothing in it is protected, so nothing is stored.
    if (protect) await persist(next).catch((e) => setError(`Could not seal this chat: ${e instanceof Error ? e.message : e}`))
  }

  /** Each mode gets its own fresh chat, so unmasked Normal-AI turns never reach a SafeChat chat's history or store. */
  const switchMode = (next: boolean) => {
    if (next === protect) return
    setProtect(next)
    setChat(blankChat())
    setSent(null)
    setError('')
  }

  const lockedNote = useMemo(() => chat.locked.map((c) => CATEGORY_NAMES[c]).join(', '), [chat.locked])
  // A chat with anything locked is read-only: new tokens could collide with the ones this session cannot see.
  const readOnly = Boolean(chat.sealedShut) || chat.locked.length > 0

  if (!preview && (isInitializing || !authenticated)) return <div className="landing"><p>Opening SafeChat…</p></div>

  return (
    <div className="shell">
      <nav className="sidebar">
        <div className="brand"><span className="brand-mark">S</span>SafeChat AI</div>
        <button className="btn btn-primary" onClick={() => { setChat(blankChat()); setSent(null); setError('') }}>+ New chat</button>
        <div className="chat-list">
          {Boolean(doc?.chats.length) && <span className="chat-list-label">Your sealed chats</span>}
          {doc?.chats.map((c) => (
            <button key={c.id} className={`chat-item${c.id === chat.id ? ' active' : ''}`} onClick={() => openChat(c)}>
              {titles[c.id] ?? '…'}
            </button>
          ))}
        </div>
        <div className="sidebar-foot">
          {preview ? <span><b>Preview</b>: no Tide session</span> : <span>Signed in as <b>{username}</b></span>}
          {isAuditor && <Link href="/admin">Admin view</Link>}
          {!preview && <button className="btn" onClick={() => { tc.logout(); router.push('/') }}>Log out / switch user</button>}
          {tc.mode === 'simulated' && !preview && <span className="hint">Simulated Tide network (Tide was under heavy load on 22 October)</span>}
        </div>
      </nav>

      <main className="main">
        <div className="topbar">
          <div className="mode" role="group" aria-label="Protection mode">
            <button className={`protected${protect ? ' on' : ''}`} onClick={() => switchMode(true)}>🔒 SafeChat protected</button>
            <button className={`plain${!protect ? ' on' : ''}`} onClick={() => switchMode(false)}>Normal AI</button>
          </div>
          <span className="spacer" />
          {keys ? <span className="badge">🔑 {PROVIDERS[keys.provider].name} key sealed</span> : <span className="badge warn">No AI key yet</span>}
          <button className="btn" onClick={() => setShowKeys(true)}>{keys ? 'Key settings' : 'Add your AI key'}</button>
        </div>

        <div className="guide" aria-label="Demo steps">
          <span className={`step${did.masked ? ' done' : ''}`}><i>1</i>Send a contract</span>
          <span className={`step${did.masked ? ' done' : ''}`}><i>2</i>See what the AI receives</span>
          <span className={`step${did.normal ? ' done' : ''}`}><i>3</i>Compare with Normal AI</span>
          <span className={`step${did.trap ? ' done' : ''}`}><i>4</i>Try the hidden prompt injection</span>
        </div>
        <div className="column-label">What {username || 'you'} sees</div>

        {preview && <div className="banner">Preview without a Tide session: masking and the provider view are live, but nothing is sealed or saved and your key stays in this tab only.</div>}
        {keysLocked && <div className="banner danger">Your saved AI key is sealed and your account no longer holds the role to open it.</div>}
        {!protect && <div className="banner danger">Normal AI mode: what you send leaves your browser unmasked, and this chat is not saved.</div>}
        {chat.sealedShut && <div className="banner">🔒 This chat is sealed. Your access to SafeChat data was revoked, so not even you can open it now, and nor can any admin.</div>}
        {chat.locked.length > 0 && <div className="banner">🔒 Your access to {lockedNote} was revoked. Those values stay hidden as tokens.</div>}
        {error && <div className="banner danger">{error}</div>}

        <div className="messages">
          {chat.messages.length === 0 && streaming === null && !chat.sealedShut && (
            <div className="empty">
              <h3>Paste real work. Nobody else can read it.</h3>
              <p>Pick a sample document below, or paste your own. Names, tax codes, ID numbers, amounts and bank accounts become <span className="token">[TOKENS]</span> before anything leaves your browser; the panel on the right shows exactly what the AI provider gets.</p>
            </div>
          )}
          {chat.messages.map((m, i) => (
            <div key={i} className={`msg ${m.role}`}>
              <span className="who">{m.role === 'user' ? username || 'You' : 'SafeChat'}</span>
              <div className="body">
                <RichText text={unmaskText(textOf(m.content), chat.entries)} entries={chat.entries} lockedTokens={chat.locked.length > 0} />
              </div>
            </div>
          ))}
          {streaming !== null && (
            <div className="msg assistant">
              <span className="who">SafeChat</span>
              <div className="body">{streaming ? <RichText text={unmaskText(streaming, liveEntries)} entries={liveEntries} /> : '…'}</div>
            </div>
          )}
          <div ref={bottom} />
        </div>

        <div className="composer">
          <div className="composer-row">
            {DEMO_DOCS.map((d) => (
              <button key={d.label} className={`chip-btn${/injection/.test(d.label) ? ' trap' : ''}`} onClick={() => setInput(d.text)}>+ {d.label}</button>
            ))}
          </div>
          <textarea
            value={input}
            placeholder="Paste a contract, an email or a payroll sheet, then ask SafeChat for help…"
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void send()
            }}
            disabled={readOnly}
          />
          <div className="composer-row">
            <span className="hint">⌘/Ctrl + Enter to send</span>
            {sealedNote?.chatId === chat.id && (
              <span key={sealedNote.at} className={tideLogStyles.sealed} role="status" title={sealedNote.breakdown}>
                {sealedNote.text}
              </span>
            )}
            <span className="spacer" />
            {streaming !== null ? (
              <button className="btn" onClick={() => abort.current?.abort()}>Stop</button>
            ) : (
              <button className="btn btn-primary" onClick={() => void send()} disabled={!input.trim() || readOnly}>
                Send {protect ? '🔒' : ''}
              </button>
            )}
          </div>
        </div>
      </main>

      <AiSeesPanel sent={sent} exposed={!protect} provider={keys ? PROVIDERS[keys.provider].name : ''}>
        {!preview && <TideLog tone="dark" />}
      </AiSeesPanel>
      {showKeys && <KeyDialog initial={keys} onSave={saveKeys} onClose={() => setShowKeys(false)} />}
    </div>
  )
}
