import type { MaskCategory } from './mask'

/** One chat as the server keeps it. Every string but `id` is ciphertext the server cannot open. */
export interface StoredChat {
  id: string
  title: string
  createdAt: number
  /** The masked messages, sealed under `safechat_chat`. */
  transcript: string
  /** The chat's token → value entries, one sealed blob per category. */
  maps: Partial<Record<MaskCategory, string>>
}

export interface UserDoc {
  vuid: string
  username: string
  /** The user's BYOK provider keys, sealed under `safechat_apikey`. */
  sealedKeys?: string
  chats: StoredChat[]
}
