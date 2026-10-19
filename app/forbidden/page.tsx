import type { Metadata } from 'next'
import Link from 'next/link'
import { Icon } from '@/components/ui/Icon'

export const metadata: Metadata = { title: 'Not available' }

/** Only same-site paths: never an absolute URL from the query string (open-redirect safe). */
function safeHome(home: string | undefined): string {
  return home && /^\/[a-z/-]*$/.test(home) && !home.startsWith('//') ? home : '/'
}

interface ForbiddenPageProps {
  readonly searchParams: Promise<{ home?: string }>
}

export default async function ForbiddenPage({ searchParams }: ForbiddenPageProps) {
  const { home } = await searchParams
  return (
    <main className="forbidden-page">
      <section className="coming-soon-card" aria-labelledby="forbidden-title">
        <span className="coming-soon-icon">
          <Icon name="shield" size={26} />
        </span>
        <h1 id="forbidden-title">This screen is not part of your role</h1>
        <p>Your account can use a different part of Hostmark. Ask an admin if you think this is wrong.</p>
        <Link className="hm-button hm-button--primary" href={safeHome(home)}>
          <span>Go to my screen</span>
        </Link>
      </section>
    </main>
  )
}
