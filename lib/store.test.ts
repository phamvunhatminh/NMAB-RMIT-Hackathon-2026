import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { createStore } from './store'
import type { UserDoc } from './types'

const tempFile = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'safechat-store-')), 'store.json')

const lan: UserDoc = {
  vuid: 'vuid-lan',
  username: 'lan',
  sealedKeys: 'ct:keys',
  chats: [{ id: 'c1', title: 'ct:title', createdAt: 1, transcript: 'ct:chat', maps: { parties: 'ct:map' } }],
}

describe('createStore', () => {
  it('returns null for a user it has never seen', async () => {
    expect(await createStore(tempFile()).getUserDoc('nobody')).toBeNull()
  })

  it('keeps a user document across store instances', async () => {
    const file = tempFile()
    await createStore(file).putUserDoc(lan)
    expect(await createStore(file).getUserDoc('vuid-lan')).toEqual(lan)
  })

  it('lists every user for the admin view', async () => {
    const store = createStore(tempFile())
    await store.putUserDoc(lan)
    await store.putUserDoc({ vuid: 'vuid-minh', username: 'minh', chats: [] })
    expect((await store.allDocs()).map((d) => d.username).sort()).toEqual(['lan', 'minh'])
  })
})
