import type {
  EarningsSnapshot,
  IncomeUnit,
  Weekday,
  WorkSchedule,
} from '../types/earnings'

const SECONDS_PER_DAY = 24 * 60 * 60
const SECONDS_PER_HOUR = 60 * 60
const DAYS_PER_YEAR = 365
const WEEKS_PER_YEAR = 52
const MONTHS_PER_YEAR = 12

const WEEKDAY_ORDER: Weekday[] = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
]

export function incomeToAnnualAmount(amount: number, unit: IncomeUnit): number {
  switch (unit) {
    case 'annual':
      return amount
    case 'monthly':
      return amount * MONTHS_PER_YEAR
    case 'weekly':
      return amount * WEEKS_PER_YEAR
    case 'daily':
      return amount * DAYS_PER_YEAR
    case 'hourly':
      return amount * 8 * 5 * WEEKS_PER_YEAR
    default:
      return amount
  }
}

export function getSecondsFromTimeLabel(timeLabel: string): number | null {
  const [hoursRaw, minutesRaw] = timeLabel.split(':')
  const hours = Number(hoursRaw)
  const minutes = Number(minutesRaw)
  if (
    Number.isNaN(hours) ||
    Number.isNaN(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return null
  }
  return hours * 3600 + minutes * 60
}

export function getScheduleSecondsPerWorkday(schedule: WorkSchedule): number {
  const startSeconds = getSecondsFromTimeLabel(schedule.startTime)
  const endSeconds = getSecondsFromTimeLabel(schedule.endTime)
  if (startSeconds === null || endSeconds === null || endSeconds <= startSeconds) {
    return 0
  }
  return endSeconds - startSeconds
}

function getActiveDaysCount(schedule: WorkSchedule): number {
  return schedule.activeWeekdays.length
}

function getWeekdayFromDate(date: Date): Weekday {
  return WEEKDAY_ORDER[date.getDay()]
}

function getSecondsSinceMidnight(date: Date): number {
  return date.getHours() * 3600 + date.getMinutes() * 60 + date.getSeconds()
}

function getSecondsWorkedTodayFromSchedule(now: Date, schedule: WorkSchedule): number {
  const weekday = getWeekdayFromDate(now)
  const isActiveDay = schedule.activeWeekdays.includes(weekday)
  if (!isActiveDay) {
    return 0
  }

  const startSeconds = getSecondsFromTimeLabel(schedule.startTime)
  const endSeconds = getSecondsFromTimeLabel(schedule.endTime)
  if (startSeconds === null || endSeconds === null || endSeconds <= startSeconds) {
    return 0
  }

  const nowSeconds = getSecondsSinceMidnight(now)
  if (nowSeconds <= startSeconds) {
    return 0
  }
  if (nowSeconds >= endSeconds) {
    return endSeconds - startSeconds
  }
  return nowSeconds - startSeconds
}

export function getSalariedSnapshot(
  annualAmount: number,
  now: Date,
  spreadMode: 'working_hours_only' | 'spread_24_7',
  schedule: WorkSchedule,
): EarningsSnapshot {
  if (!Number.isFinite(annualAmount) || annualAmount <= 0) {
    return {
      earnedToday: 0,
      earningPerSecond: 0,
      statusText: 'Enter a valid income amount.',
      secondsWorkedToday: 0,
    }
  }

  if (spreadMode === 'spread_24_7') {
    const earningPerSecond = annualAmount / (DAYS_PER_YEAR * SECONDS_PER_DAY)
    const secondsToday = getSecondsSinceMidnight(now)
    return {
      earnedToday: earningPerSecond * secondsToday,
      earningPerSecond,
      statusText: 'Counting across the full day (24/7 spread).',
      secondsWorkedToday: secondsToday,
    }
  }

  const activeDaysCount = getActiveDaysCount(schedule)
  const scheduleSecondsPerDay = getScheduleSecondsPerWorkday(schedule)
  const yearlyWorkSeconds = activeDaysCount * WEEKS_PER_YEAR * scheduleSecondsPerDay

  if (activeDaysCount === 0 || scheduleSecondsPerDay === 0 || yearlyWorkSeconds <= 0) {
    return {
      earnedToday: 0,
      earningPerSecond: 0,
      statusText: 'Set valid working days and shift hours.',
      secondsWorkedToday: 0,
    }
  }

  const earningPerSecond = annualAmount / yearlyWorkSeconds
  const secondsWorkedToday = getSecondsWorkedTodayFromSchedule(now, schedule)
  const weekday = getWeekdayFromDate(now)
  const isActiveDay = schedule.activeWeekdays.includes(weekday)

  if (!isActiveDay) {
    return {
      earnedToday: 0,
      earningPerSecond,
      statusText: 'Today is not a configured work day.',
      secondsWorkedToday: 0,
    }
  }

  if (secondsWorkedToday === 0) {
    return {
      earnedToday: 0,
      earningPerSecond,
      statusText: `Waiting for shift start at ${schedule.startTime}.`,
      secondsWorkedToday: 0,
    }
  }

  if (secondsWorkedToday >= scheduleSecondsPerDay) {
    return {
      earnedToday: earningPerSecond * scheduleSecondsPerDay,
      earningPerSecond,
      statusText: 'Shift completed. Daily total is locked for today.',
      secondsWorkedToday: scheduleSecondsPerDay,
    }
  }

  return {
    earnedToday: earningPerSecond * secondsWorkedToday,
    earningPerSecond,
    statusText: 'Within active shift hours.',
    secondsWorkedToday,
  }
}

export function getHourlySessionEarnings(
  hourlyRate: number,
  sessionStartMs: number | null,
  accumulatedSeconds: number,
  nowMs: number,
): { earned: number; elapsedSeconds: number; earningPerSecond: number } {
  const safeHourlyRate = Number.isFinite(hourlyRate) && hourlyRate > 0 ? hourlyRate : 0
  const earningPerSecond = safeHourlyRate / SECONDS_PER_HOUR
  const liveSeconds =
    sessionStartMs !== null ? Math.max(0, Math.floor((nowMs - sessionStartMs) / 1000)) : 0
  const elapsedSeconds = Math.max(0, accumulatedSeconds + liveSeconds)

  return {
    earned: elapsedSeconds * earningPerSecond,
    elapsedSeconds,
    earningPerSecond,
  }
}
