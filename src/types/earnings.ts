export type IncomeUnit = 'annual' | 'monthly' | 'weekly' | 'daily' | 'hourly'

export type SalarySpreadMode = 'working_hours_only' | 'spread_24_7'

export type Weekday =
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday'
  | 'sunday'

export interface WorkSchedule {
  startTime: string
  endTime: string
  activeWeekdays: Weekday[]
}

export interface SalariedConfig {
  amount: number
  unit: IncomeUnit
  spreadMode: SalarySpreadMode
  workSchedule: WorkSchedule
}

export interface HourlySessionConfig {
  hourlyRate: number
}

export interface HourlySessionState {
  running: boolean
  startTimestampMs: number | null
  accumulatedSeconds: number
}

export interface EarningsSnapshot {
  earnedToday: number
  earningPerSecond: number
  statusText: string
  secondsWorkedToday: number
}
