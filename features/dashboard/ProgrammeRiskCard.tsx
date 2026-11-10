'use client'
// "Programme at risk" glance card (Figma dashboard "At a glance", FR-PG-03): today's published items
// a late arrival puts at risk, who is late and when they are expected. Each row opens the Programme.
import Link from 'next/link'
import { ErrorBanner } from '@/components/ui/Feedback'
import { Icon } from '@/components/ui/Icon'
import { Skeleton, StatusChip } from '@/components/ui/Status'
import { useTimeZone } from '@/components/shell/SessionContext'
import { errorMessage } from '@/lib/client/api'
import { formatTime } from '@/lib/client/format'
import { useApi } from '@/lib/client/use-api'
import type { DashboardSummary } from './DashboardScreen'

type ProgrammeRisk = DashboardSummary['programme_at_risk'][number]

function lateLine(risk: ProgrammeRisk, timeZone: string): string {
  if (risk.late.length === 0) return 'A participant may arrive late'
  return risk.late
    .map((guest) => (guest.expected_at ? `${guest.name} expected ${formatTime(guest.expected_at, timeZone)}` : `${guest.name}, arrival time unknown`))
    .join('; ')
}

function RiskRow({ risk, timeZone }: { readonly risk: ProgrammeRisk; readonly timeZone: string }) {
  return (
    <Link className="glance-risk" href="/programme">
      <span className="glance-icon glance-icon--amber">
        <Icon name="calendarClock" />
      </span>
      <span className="glance-risk-copy">
        <span className="glance-risk-heading">
          <b>{risk.title}</b>
          <StatusChip tone="warning" icon="alert">
            At risk
          </StatusChip>
        </span>
        <small>
          <time dateTime={risk.starts_at}>{formatTime(risk.starts_at, timeZone)}</time> · {risk.location}
        </small>
        <small>{lateLine(risk, timeZone)}</small>
      </span>
      <Icon name="arrow" size={16} />
    </Link>
  )
}

export function ProgrammeRiskCard() {
  const timeZone = useTimeZone()
  // Shares the summary request (and its cache) with the stat tiles.
  const { data, error, isLoading, mutate } = useApi<DashboardSummary>('/api/dashboard/summary')
  const risks = data?.programme_at_risk ?? []

  return (
    <section className="card-v4 glance-card" aria-labelledby="glance-title">
      <header>
        <h2 id="glance-title">
          Programme at risk {data && <span>{risks.length}</span>}
        </h2>
        <Link href="/programme">View programme</Link>
      </header>
      {error ? <ErrorBanner message={errorMessage(error)} onRetry={() => void mutate()} /> : null}
      {isLoading ? (
        <div className="approval-skeletons">
          <Skeleton className="sk-wide" />
          <Skeleton className="sk-text" />
        </div>
      ) : !data ? null : risks.length === 0 ? (
        <div className="glance-clear">
          <span className="glance-icon glance-icon--green">
            <Icon name="check" />
          </span>
          <div>
            <b>Nothing at risk today</b>
            <p>Everyone on today&apos;s programme is expected in time.</p>
          </div>
        </div>
      ) : (
        risks.map((risk) => <RiskRow key={risk.id} risk={risk} timeZone={timeZone} />)
      )}
    </section>
  )
}
