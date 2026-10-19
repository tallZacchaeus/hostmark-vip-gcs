import Link from 'next/link'

export default function NotFound() {
  return (
    <main className="forbidden-page">
      <section className="coming-soon-card" aria-labelledby="not-found-title">
        <h1 id="not-found-title">Page not found</h1>
        <p>The link may be old or mistyped.</p>
        <Link className="hm-button hm-button--primary" href="/">
          <span>Go to my screen</span>
        </Link>
      </section>
    </main>
  )
}
