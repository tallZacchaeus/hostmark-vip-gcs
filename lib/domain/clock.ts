// Injected clock (02-TRD.md section 2.1, decision 4). Domain logic takes a Clock instead of
// calling Date.now(), so simulated mode can run a scripted day at up to 3600x speed.

export interface Clock {
  now(): Date
}

export const systemClock: Clock = {
  now: () => new Date(),
}

export interface SimulationClockConfig {
  /** Virtual time at the moment the simulation started. */
  readonly virtualStart: Date
  /** Real time at the moment the simulation started. */
  readonly realStart: Date
  /** Virtual seconds per real second, e.g. 60 = one virtual hour per real minute. */
  readonly speed: number
}

export const MAX_SIMULATION_SPEED = 3600

export function virtualNow(config: SimulationClockConfig, realNow: Date): Date {
  if (!(config.speed > 0) || config.speed > MAX_SIMULATION_SPEED) {
    throw new RangeError(`Simulation speed must be between 0 and ${MAX_SIMULATION_SPEED}`)
  }
  const elapsedRealMs = realNow.getTime() - config.realStart.getTime()
  return new Date(config.virtualStart.getTime() + elapsedRealMs * config.speed)
}

export function simulationClock(config: SimulationClockConfig, base: Clock = systemClock): Clock {
  return { now: () => virtualNow(config, base.now()) }
}
