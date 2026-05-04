import { useEffect, useMemo, useState } from 'react'
import './App.css'
import type {
  HourlySessionState,
  IncomeUnit,
  SalariedConfig,
  SalarySpreadMode,
  Weekday,
} from './types/earnings'
import {
  getHourlySessionEarnings,
  getSalariedSnapshot,
  incomeToAnnualAmount,
} from './utils/earnings'
import { formatCurrency, formatDuration } from './utils/format'

const DEFAULT_SALARIED_CONFIG: SalariedConfig = {
  amount: 2000,
  unit: 'monthly',
  spreadMode: 'working_hours_only',
  workSchedule: {
    startTime: '09:00',
    endTime: '17:00',
    activeWeekdays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
  },
}

const DEFAULT_HOURLY_SESSION: HourlySessionState = {
  running: false,
  startTimestampMs: null,
  accumulatedSeconds: 0,
}

const STORAGE_KEY = 'trackmyincome.settings.v1'
const CURRENCIES = ['USD', 'GBP', 'EUR', 'CAD', 'AUD', 'INR'] as const
const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$',
  GBP: '£',
  EUR: '€',
  CAD: 'C$',
  AUD: 'A$',
  INR: '₹',
}
const WEEKDAYS: Weekday[] = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
]

function App() {
  const [mode, setMode] = useState<'salaried' | 'hourly'>('salaried')
  const [isTrackingView, setIsTrackingView] = useState<boolean>(false)
  const [salariedConfig, setSalariedConfig] = useState<SalariedConfig>(DEFAULT_SALARIED_CONFIG)
  const [hourlyRate, setHourlyRate] = useState<number>(20)
  const [currency, setCurrency] = useState<string>('USD')
  const [hourlySession, setHourlySession] = useState<HourlySessionState>(
    DEFAULT_HOURLY_SESSION,
  )
  const [nowMs, setNowMs] = useState<number>(Date.now())
  const [hasHydratedFromStorage, setHasHydratedFromStorage] = useState<boolean>(false)
  const currencySymbol = CURRENCY_SYMBOLS[currency] ?? currency

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as {
          mode?: 'salaried' | 'hourly'
          salariedConfig?: SalariedConfig
          hourlyRate?: number
          currency?: string
          hourlySession?: HourlySessionState
        }
        if (parsed.mode === 'salaried' || parsed.mode === 'hourly') {
          setMode(parsed.mode)
        }
        if (parsed.salariedConfig) {
          setSalariedConfig(parsed.salariedConfig)
        }
        if (typeof parsed.hourlyRate === 'number') {
          setHourlyRate(parsed.hourlyRate)
        }
        if (typeof parsed.currency === 'string') {
          setCurrency(parsed.currency)
        }
        if (parsed.hourlySession) {
          setHourlySession(parsed.hourlySession)
        }
      } catch {
        // Invalid local data should not block app startup.
      }
    }

    setHasHydratedFromStorage(true)
  }, [])

  useEffect(() => {
    if (!hasHydratedFromStorage) {
      return
    }
    const payload = JSON.stringify({
      mode,
      salariedConfig,
      hourlyRate,
      currency,
      hourlySession,
    })
    localStorage.setItem(STORAGE_KEY, payload)
  }, [hasHydratedFromStorage, mode, salariedConfig, hourlyRate, currency, hourlySession])

  useEffect(() => {
    const ticker = window.setInterval(() => {
      setNowMs(Date.now())
    }, 1000)
    return () => window.clearInterval(ticker)
  }, [])

  const salariedAnnualAmount = useMemo(
    () => incomeToAnnualAmount(salariedConfig.amount, salariedConfig.unit),
    [salariedConfig.amount, salariedConfig.unit],
  )

  const salariedSnapshot = useMemo(
    () =>
      getSalariedSnapshot(
        salariedAnnualAmount,
        new Date(nowMs),
        salariedConfig.spreadMode,
        salariedConfig.workSchedule,
      ),
    [nowMs, salariedAnnualAmount, salariedConfig.spreadMode, salariedConfig.workSchedule],
  )

  const hourlySnapshot = useMemo(
    () =>
      getHourlySessionEarnings(
        hourlyRate,
        hourlySession.running ? hourlySession.startTimestampMs : null,
        hourlySession.accumulatedSeconds,
        nowMs,
      ),
    [hourlyRate, hourlySession.running, hourlySession.startTimestampMs, hourlySession.accumulatedSeconds, nowMs],
  )

  function toggleWeekday(weekday: Weekday) {
    setSalariedConfig((prev) => {
      const exists = prev.workSchedule.activeWeekdays.includes(weekday)
      return {
        ...prev,
        workSchedule: {
          ...prev.workSchedule,
          activeWeekdays: exists
            ? prev.workSchedule.activeWeekdays.filter((day) => day !== weekday)
            : [...prev.workSchedule.activeWeekdays, weekday],
        },
      }
    })
  }

  function startHourlySession() {
    setHourlySession((prev) => {
      if (prev.running) {
        return prev
      }
      return {
        ...prev,
        running: true,
        startTimestampMs: Date.now(),
      }
    })
  }

  function stopHourlySession() {
    setHourlySession((prev) => {
      if (!prev.running || prev.startTimestampMs === null) {
        return prev
      }
      const liveSeconds = Math.max(0, Math.floor((Date.now() - prev.startTimestampMs) / 1000))
      return {
        running: false,
        startTimestampMs: null,
        accumulatedSeconds: prev.accumulatedSeconds + liveSeconds,
      }
    })
  }

  function resetHourlySession() {
    setHourlySession(DEFAULT_HOURLY_SESSION)
  }

  function startTracking() {
    if (mode === 'hourly') {
      startHourlySession()
    }
    setIsTrackingView(true)
  }

  function backToSettings() {
    setIsTrackingView(false)
  }

  return (
    <main className="app">
      {!isTrackingView && (
        <>
          <header className="app-header">
            <h1>Track My Income</h1>
            <p>Live earnings by the second for salaried and hourly workers.</p>
          </header>

          <section className="card">
            <div className="mode-row">
              <button
                className={mode === 'salaried' ? 'active' : ''}
                type="button"
                onClick={() => setMode('salaried')}
              >
                Salaried
              </button>
              <button
                className={mode === 'hourly' ? 'active' : ''}
                type="button"
                onClick={() => setMode('hourly')}
              >
                Hourly Session
              </button>
            </div>
            <div className="currency-row">
              <label>
                Currency
                <select value={currency} onChange={(event) => setCurrency(event.target.value)}>
                  {CURRENCIES.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </section>
        </>
      )}

      {mode === 'salaried' && !isTrackingView ? (
        <section className="card">
          <h2>Salary Setup</h2>
          <div className="grid">
            <label>
              Amount
              <div className="input-with-symbol">
                <span className="currency-prefix">{currencySymbol}</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={salariedConfig.amount}
                  onChange={(event) =>
                    setSalariedConfig((prev) => ({
                      ...prev,
                      amount: Number(event.target.value),
                    }))
                  }
                />
              </div>
            </label>
            <label>
              Income Unit
              <select
                value={salariedConfig.unit}
                onChange={(event) =>
                  setSalariedConfig((prev) => ({
                    ...prev,
                    unit: event.target.value as IncomeUnit,
                  }))
                }
              >
                <option value="annual">Annual</option>
                <option value="monthly">Monthly</option>
                <option value="weekly">Weekly</option>
                <option value="daily">Daily</option>
                <option value="hourly">Hourly</option>
              </select>
            </label>
            <label>
              Spread Mode
              <select
                value={salariedConfig.spreadMode}
                onChange={(event) =>
                  setSalariedConfig((prev) => ({
                    ...prev,
                    spreadMode: event.target.value as SalarySpreadMode,
                  }))
                }
              >
                <option value="working_hours_only">Working hours only</option>
                <option value="spread_24_7">24/7 spread</option>
              </select>
            </label>
          </div>

          {salariedConfig.spreadMode === 'working_hours_only' && (
            <>
              <h3>Working Hours</h3>
              <div className="grid">
                <label>
                  Shift Start
                  <input
                    type="time"
                    value={salariedConfig.workSchedule.startTime}
                    onChange={(event) =>
                      setSalariedConfig((prev) => ({
                        ...prev,
                        workSchedule: {
                          ...prev.workSchedule,
                          startTime: event.target.value,
                        },
                      }))
                    }
                  />
                </label>
                <label>
                  Shift End
                  <input
                    type="time"
                    value={salariedConfig.workSchedule.endTime}
                    onChange={(event) =>
                      setSalariedConfig((prev) => ({
                        ...prev,
                        workSchedule: {
                          ...prev.workSchedule,
                          endTime: event.target.value,
                        },
                      }))
                    }
                  />
                </label>
              </div>
              <div className="weekday-row">
                {WEEKDAYS.map((weekday) => (
                  <button
                    key={weekday}
                    type="button"
                    className={
                      salariedConfig.workSchedule.activeWeekdays.includes(weekday) ? 'active' : ''
                    }
                    onClick={() => toggleWeekday(weekday)}
                  >
                    {weekday.slice(0, 3).toUpperCase()}
                  </button>
                ))}
              </div>
            </>
          )}

          <div className="stats">
            <p>
              <strong>Earnings per second:</strong>{' '}
              {formatCurrency(salariedSnapshot.earningPerSecond, currency, 4)}
            </p>
            <p>
              <strong>Earned today:</strong> {formatCurrency(salariedSnapshot.earnedToday, currency)}
            </p>
            <p className="status">{salariedSnapshot.statusText}</p>
          </div>
          <div className="mode-row">
            <button type="button" onClick={startTracking}>
              Start Tracking
            </button>
          </div>
        </section>
      ) : null}

      {mode === 'hourly' && !isTrackingView ? (
        <section className="card">
          <h2>Hourly Session</h2>
          <div className="grid">
            <label>
              Hourly Rate
              <div className="input-with-symbol">
                <span className="currency-prefix">{currencySymbol}</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={hourlyRate}
                  onChange={(event) => setHourlyRate(Number(event.target.value))}
                />
              </div>
            </label>
          </div>
          <div className="mode-row">
            <button type="button" onClick={startTracking}>
              Start
            </button>
            <button type="button" onClick={stopHourlySession} disabled={!hourlySession.running}>
              Stop
            </button>
            <button type="button" onClick={resetHourlySession}>
              Reset
            </button>
          </div>
          <div className="stats">
            <p>
              <strong>Status:</strong> {hourlySession.running ? 'Running' : 'Stopped'}
            </p>
            <p>
              <strong>Elapsed:</strong> {formatDuration(hourlySnapshot.elapsedSeconds)}
            </p>
            <p>
              <strong>Earnings per second:</strong>{' '}
              {formatCurrency(hourlySnapshot.earningPerSecond, currency, 4)}
            </p>
            <p>
              <strong>Earned this session:</strong> {formatCurrency(hourlySnapshot.earned, currency)}
            </p>
          </div>
        </section>
      ) : null}

      {isTrackingView ? (
        <section className="tracker-screen">
          <p className="tracker-label">
            {mode === 'salaried' ? 'Earned today' : 'Earned this session'}
          </p>
          <p className="tracker-amount">
            {mode === 'salaried'
              ? formatCurrency(salariedSnapshot.earnedToday, currency)
              : formatCurrency(hourlySnapshot.earned, currency)}
          </p>
          <p className="tracker-meta">
            {mode === 'salaried'
              ? `${formatCurrency(salariedSnapshot.earningPerSecond, currency, 4)} per second`
              : `${formatCurrency(hourlySnapshot.earningPerSecond, currency, 4)} per second`}
          </p>
          {mode === 'hourly' ? (
            <p className="tracker-meta">Elapsed: {formatDuration(hourlySnapshot.elapsedSeconds)}</p>
          ) : (
            <p className="tracker-meta">{salariedSnapshot.statusText}</p>
          )}
          <div className="mode-row">
            {mode === 'hourly' && (
              <button type="button" onClick={stopHourlySession} disabled={!hourlySession.running}>
                Stop
              </button>
            )}
            <button type="button" onClick={backToSettings}>
              Back to settings
            </button>
          </div>
        </section>
      ) : null}
    </main>
  )
}

export default App
