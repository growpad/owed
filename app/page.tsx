import Link from "next/link";
import { Logo } from "@/components/Logo";

// Public landing page. The product lives at /app behind sign-in.
// Deliberately does not show Owed's inbox address: a public address invites strangers to CC it.
export default function Landing() {
  return (
    <div className="landing">
      <header className="land-top">
        <Link href="/" className="land-home" aria-label="Owed home">
          <Logo />
        </Link>
        <Link href="/app" className="land-signin">
          Sign in
        </Link>
      </header>

      <main>
        <section className="hero">
          <div className="hero-copy">
            <h1>Remembers what people owe you, and gets it back.</h1>
            <p>
              Asked for a deposit, a refund or an answer and heard nothing? Add Owed in CC. If they go quiet, it writes the
              follow-up, sends it when you click, and tells you the moment they reply.
            </p>
            <div className="hero-actions">
              <Link href="/app" className="cta">
                Open Owed
              </Link>
              <a href="#how" className="cta-quiet">
                How it works
              </a>
            </div>
          </div>

          <div className="hero-slips" aria-hidden="true">
            <article className="slip overdue">
              <div className="figure">
                <span className="amount">$1,800</span>
                <span className="status">Quiet for 5 days</span>
              </div>
              <div className="detail">
                <h3>Security deposit</h3>
                <p className="who">
                  from <strong>Sam Patel</strong>
                </p>
                <div className="actions">
                  <span className="fake-btn">Draft follow-up</span>
                </div>
              </div>
            </article>
            <article className="slip settled">
              <div className="figure">
                <span className="amount">$240</span>
                <span className="status">They replied</span>
              </div>
              <div className="detail">
                <h3>Refund for order 4471</h3>
                <p className="who">
                  from <strong>Northwind Support</strong>
                </p>
                <blockquote className="reply">
                  <span>Northwind Support replied</span>Refund issued today, sorry for the wait.
                </blockquote>
              </div>
              <span className="stamp">Settled</span>
            </article>
          </div>
        </section>

        <section id="how" className="how">
          <h2>How it works</h2>
          <ol className="steps">
            <li>
              <h3>Add Owed in CC</h3>
              <p>Ask the way you always do, from any email account. Owed only sees the threads you copy it on.</p>
            </li>
            <li>
              <h3>It notices the silence</h3>
              <p>No answer after five days? The ask moves up your list, biggest amounts first.</p>
            </li>
            <li>
              <h3>One click to follow up</h3>
              <p>Owed drafts a short, specific nudge in the same thread. Edit it, send it, and see it settled when they answer.</p>
            </li>
          </ol>
        </section>

        <section className="promises">
          <h2>You stay in charge</h2>
          <ul>
            <li>
              <h3>It never reads your inbox</h3>
              <p>Owed sees only the emails you CC it on. Nothing else in your mailbox is touched.</p>
            </li>
            <li>
              <h3>Nothing goes out without you</h3>
              <p>Every follow-up waits for your click, goes out once, and copies you in.</p>
            </li>
            <li>
              <h3>A record of every step</h3>
              <p>When it spotted the ask, when it went quiet, when you nudged, when they answered.</p>
            </li>
          </ul>
        </section>

        <section className="closing">
          <h2>Stop keeping score in your head.</h2>
          <Link href="/app" className="cta">
            Open Owed
          </Link>
        </section>
      </main>

      <footer className="land-foot">
        <p>
          Built on Neon Postgres and AI Gateway, assistant-ui and AgentMail.{" "}
          <a href="https://github.com/growpad/owed">Source on GitHub</a>
        </p>
      </footer>
    </div>
  );
}
