import fs from 'node:fs/promises'
import path from 'node:path'
import type { UserDoc } from './types'

/**
 * SafeChat's whole server-side database: a JSON file of user documents. It only
 * ever holds ciphertext and masked titles, which is the point of the demo:
 * an admin who opens it learns nothing.
 */
export function createStore(file: string) {
  const read = async (): Promise<Record<string, UserDoc>> => {
    try {
      return JSON.parse(await fs.readFile(file, 'utf8'))
    } catch {
      return {}
    }
  }
  const write = async (docs: Record<string, UserDoc>) => {
    await fs.mkdir(path.dirname(file), { recursive: true })
    await fs.writeFile(file, JSON.stringify(docs, null, 2))
  }

  return {
    async getUserDoc(vuid: string): Promise<UserDoc | null> {
      return (await read())[vuid] ?? null
    },
    async putUserDoc(doc: UserDoc): Promise<void> {
      const docs = await read()
      docs[doc.vuid] = doc
      await write(docs)
    },
    async allDocs(): Promise<UserDoc[]> {
      return Object.values(await read())
    },
  }
}

export const store = createStore(path.join(process.cwd(), '.data', 'store.json'))
