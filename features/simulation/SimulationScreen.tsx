'use client'
// Simulation (03-App-Flow.md /simulation): the what-if preview from the design (nothing written),
// and the PRD's scripted scenarios that replay flight and room changes through the live pipeline.
import { ErrorBanner } from '@/components/ui/Feedback'
import { Icon } from '@/components/ui/Icon'
import { Skeleton } from '@/components/ui/Status'
import { errorMessage } from '@/lib/client/api'
import { useApi } from '@/lib/client/use-api'
import { ScriptedRuns } from './ScriptedRuns'
import type { SimulationOptions } from './types'
import { WhatIfPanel } from './WhatIfPanel'

export function SimulationScreen() {
  const { data: options, error, mutate } = useApi<SimulationOptions>('/api/simulation/options')
  return (
    <main className="simulation-page">
      <div className="simulation-banner" role="note">
        <Icon name="flask" />
        <span>What-if previews change nothing. Scripted scenarios run in simulated mode only.</span>
      </div>
      <header className="simulation-header">
        <h1>Simulation</h1>
        <p>Try a change and see what would move.</p>
      </header>
      {error ? <ErrorBanner message={errorMessage(error)} onRetry={() => void mutate()} /> : null}
      {options ? (
        <>
          <WhatIfPanel options={options} />
          <ScriptedRuns options={options} />
        </>
      ) : !error ? (
        <div className="simulation-running">
          {[0, 1, 2].map((index) => (
            <Skeleton key={index} />
          ))}
        </div>
      ) : null}
    </main>
  )
}
