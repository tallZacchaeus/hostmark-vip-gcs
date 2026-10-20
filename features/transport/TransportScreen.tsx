'use client'
// Transport (03-App-Flow.md /transport, Figma "Transport"): the driver decisions waiting for a
// coordinator, then the day's timeline per driver. Nothing about drivers changes without a tap on
// Approve (PRD principle P1); "Suggest a driver" asks the matcher for a new proposal.
import { useState } from 'react'
import { Icon } from '@/components/ui/Icon'
import { Skeleton } from '@/components/ui/Status'
import { useToast } from '@/components/ui/Toast'
import { useTimeZone } from '@/components/shell/SessionContext'
import { useNow } from '@/components/shell/useNow'
import { Button } from '@/components/ui/Button'
import { apiSend, errorMessage, withQuery } from '@/lib/client/api'
import { dateKey, formatIsoDate, plural } from '@/lib/client/format'
import { decideProposal } from '@/lib/client/proposals'
import { refreshApi, useApi } from '@/lib/client/use-api'
import { DecisionCard } from './DecisionCard'
import { DriverDrawer } from './DriverDrawer'
import type { BoardDecision, BoardDriver, BoardTrip, TransportBoard as Board } from './model'
import { TransportBoard } from './TransportBoard'

const REFRESH_MS = 60_000

type SuggestResult = { readonly proposal_id: string } | { readonly reason: 'no_driver_free' | 'already_covered' }

function DayTabs({ board, today, onSelect }: { readonly board: Board; readonly today: string | null; readonly onSelect: (day: string) => void }) {
  if (board.days.length <= 1) return null
  return (
    <div className="transport-tabs" role="tablist" aria-label="Day">
      {board.days.map((day) => (
        <button type="button" role="tab" aria-selected={day === board.day} key={day} className={day === board.day ? 'is-active' : ''} onClick={() => onSelect(day)}>
          {day === today ? 'Today' : formatIsoDate(day)}
        </button>
      ))}
    </div>
  )
}

function useTransportActions() {
  const toast = useToast()
  const [busyId, setBusyId] = useState<string | null>(null)
  const refresh = () => refreshApi('/api/transport', '/api/arrivals', '/api/decisions', '/api/dashboard')

  const decide = async (decision: BoardDecision, approve: boolean) => {
    setBusyId(decision.proposal_id)
    try {
      const outcome = await decideProposal(decision.proposal_id, decision.title, approve)
      toast.show({ message: outcome.message, tone: outcome.ok ? undefined : 'error' })
    } catch (caught: unknown) {
      toast.show({ message: errorMessage(caught), tone: 'error' })
    } finally {
      setBusyId(null)
      await refresh()
    }
  }

  const suggest = async (trip: BoardTrip) => {
    setBusyId(trip.pickup_id)
    try {
      const result = await apiSend<SuggestResult>(`/api/pickups/${trip.pickup_id}/suggest`, 'POST', {})
      const message = 'proposal_id' in result ? `Suggestion ready for ${trip.label}.` : result.reason === 'no_driver_free' ? `No driver is free for ${trip.label} at that time.` : `${trip.label} is already covered.`
      toast.show({ message, tone: 'proposal_id' in result ? undefined : 'info' })
    } catch (caught: unknown) {
      toast.show({ message: errorMessage(caught), tone: 'error' })
    } finally {
      setBusyId(null)
      await refresh()
    }
  }
  return { busyId, decide, suggest }
}

function Loading() {
  return (
    <div className="transport-loading">
      {[0, 1, 2, 3].map((index) => (
        <Skeleton key={index} />
      ))}
    </div>
  )
}

export function TransportScreen() {
  const timeZone = useTimeZone()
  const now = useNow()
  const [day, setDay] = useState<string | undefined>()
  const [hovered, setHovered] = useState<string | null>(null)
  const [driverId, setDriverId] = useState<string | null>(null)
  const { data: board, error, isLoading, mutate } = useApi<Board>(withQuery('/api/transport', { day }), { refreshInterval: REFRESH_MS })
  const { busyId, decide, suggest } = useTransportActions()
  const today = now ? dateKey(now, timeZone) : null
  const driver = board?.drivers.find((item) => item.id === driverId)
  const needing = board?.needs_driver.length ?? 0

  return (
    <main className="transport-page">
      <header className="transport-header">
        <div>
          <h1>Transport</h1>
          <p>{board ? `${plural(board.pickup_count, 'pickup')} · ${needing === 0 ? 'all assigned' : `${needing} ${needing === 1 ? 'needs' : 'need'} a driver`}` : 'Loading…'}</p>
        </div>
      </header>
      {board ? <DayTabs board={board} today={today} onSelect={setDay} /> : null}
      {error ? (
        <div className="transport-error" role="alert">
          <Icon name="alert" />
          <span>We couldn&apos;t load the driver schedule.</span>
          <Button onClick={() => void mutate()}>Retry</Button>
        </div>
      ) : null}
      {isLoading && !board ? <Loading /> : null}
      {board && board.decisions.length > 0 ? (
        <div className="transport-decisions">
          {board.decisions.map((decision) => (
            <DecisionCard key={decision.proposal_id} decision={decision} busy={busyId === decision.proposal_id} hovered={hovered === decision.proposal_id} onHover={setHovered} onDecide={(item, approve) => void decide(item, approve)} />
          ))}
        </div>
      ) : null}
      {board && board.pickup_count === 0 && board.drivers.length === 0 ? (
        <div className="transport-future">
          <span>
            <Icon name="calendar" size={25} />
          </span>
          <h2>No pickups or drivers yet.</h2>
          <p>Add drivers in Settings; pickups appear once flights are known.</p>
        </div>
      ) : board ? (
        <TransportBoard board={board} timeZone={timeZone} now={board.day === today ? now : null} hoveredProposal={hovered} suggestingId={busyId} onSuggest={(trip) => void suggest(trip)} onOpenDriver={(item: BoardDriver) => setDriverId(item.id)} />
      ) : null}
      {driver ? <DriverDrawer driver={driver} timeZone={timeZone} onClose={() => setDriverId(null)} /> : null}
    </main>
  )
}
