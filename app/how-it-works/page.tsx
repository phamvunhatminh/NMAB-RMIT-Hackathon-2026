import type { Metadata } from 'next'
import Link from 'next/link'
import s from './page.module.css'

export const metadata: Metadata = {
  title: 'How SafeChat AI works',
  description: 'Real values stay in the employee’s browser, the AI sees tokens, and TideCloak decides who can unseal.',
}

const T = ({ children }: { children: string }) => <span className="token">{children}</span>
const Role = ({ children }: { children: string }) => <span className="role-pill">{children}</span>

export default function HowItWorksPage() {
  return (
    <div className="landing">
      <div className="landing-inner">
        <header className={s.top}>
          <Link href="/" className={`brand ${s.brandLink}`}>
            <span className="brand-mark">S</span>SafeChat AI
          </Link>
          <Link href="/" className="btn">Back to the demo</Link>
        </header>

        <section className={s.intro}>
          <h1>How SafeChat AI works</h1>
          <p>
            Real values never leave Lan&apos;s browser. The AI works on tokens, the server stores ciphertext, and the Tide network decides
            who can unseal what.
          </p>
        </section>
      </div>

      <figure className={s.figure}>
        <a href="/architecture.svg" target="_blank" rel="noreferrer" className={s.zoom}>
        <img
          src="/architecture.svg"
          width={1600}
          height={900}
          alt="Lan's browser masks and seals data. The AI provider receives masked text only, the SafeChat server stores ciphertext only, and the Tide network signs tokens, checks roles on every seal and unseal, and applies role changes after 2 of 3 admins approve."
        />
        </a>
        <figcaption>
          Today the Tide network is simulated with the same rules, as Tide advised on 22 October. Live mode runs the same code against
          TideCloak and its ORKs.
        </figcaption>
      </figure>

      <div className="landing-inner">
        <ol className={s.story}>
          <li>
            <h2><span className={s.num}>1</span>The problem</h2>
            <p>
              Company AI is a super-account. The AI vendor sees every document, IT can export every prompt, and one poisoned email can make
              the AI leak everything it can reach. So staff avoid it and paste work documents into personal AI instead.
            </p>
          </li>
          <li>
            <h2><span className={s.num}>2</span>What Lan&apos;s browser does</h2>
            <p>
              Before anything leaves, the browser swaps company and person names, citizen IDs, tax IDs, bank accounts, amounts,
              phones and emails for tokens such as <T>[COMPANY_1]</T> and <span className={s.nowrap}><T>[AMOUNT_1]</T>.</span> It calls the AI provider directly with
              Lan&apos;s own key. Then it seals the token map, the chat and the key with TideCloak, one tag per data type.
            </p>
          </li>
          <li>
            <h2><span className={s.num}>3</span>What TideCloak enforces</h2>
            <p>
              Sealing and unsealing go through the Tide network, which checks the roles in Lan&apos;s signed token, bundled as{' '}
              <Role>safechat-staff</Role>. No key sits on the server or with any admin. Granting or revoking <Role>safechat-staff</Role> is a change
              request: two of three admins must approve, and nobody can approve twice.
            </p>
          </li>
          <li>
            <h2><span className={s.num}>4</span>What changes for Lan and her company</h2>
            <p>
              Lan pastes the real contract and gets an answer with the real names back. The vendor only sees tokens, IT only sees
              ciphertext, and a prompt injection can only leak tokens. When Lan leaves, two admins revoke her, and her old chats seal shut,
              for her too.
            </p>
          </li>
        </ol>

        <div className={s.foot}>
          <Link href="/" className="btn btn-primary">Try it as Lan</Link>
          <span className="hint">Or read the full story in the README and docs/tidecloak-integration-plan.md.</span>
        </div>
      </div>
    </div>
  )
}
