import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
  getScheduleSecondsPerWorkday,
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
const MILESTONES = [0.01, 0.1, 0.5, 1, 2, 5, 10, 25, 50, 100, 250, 500, 1000]

function App() {
  const [mode, setMode] = useState<'salaried' | 'hourly'>('salaried')
  const [isTrackingView, setIsTrackingView] = useState<boolean>(false)
  const [salariedConfig, setSalariedConfig] = useState<SalariedConfig>(DEFAULT_SALARIED_CONFIG)
  const [hourlyRate, setHourlyRate] = useState<number>(20)
  const [currency, setCurrency] = useState<string>('USD')
  const [hourlySession, setHourlySession] = useState<HourlySessionState>(DEFAULT_HOURLY_SESSION)
  const [nowMs, setNowMs] = useState<number>(Date.now())
  const [hasHydratedFromStorage, setHasHydratedFromStorage] = useState<boolean>(false)
  const [copied, setCopied] = useState(false)
  const [milestoneFlash, setMilestoneFlash] = useState(false)
  const [milestoneAmount, setMilestoneAmount] = useState<string>('')
  const [showMilestoneToast, setShowMilestoneToast] = useState(false)

  const lastMilestoneRef = useRef(0)
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const milestoneFlashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const currencySymbol = CURRENCY_SYMBOLS[currency] ?? currency

  // Hydrate from localStorage
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
        if (parsed.mode === 'salaried' || parsed.mode === 'hourly') setMode(parsed.mode)
        if (parsed.salariedConfig) setSalariedConfig(parsed.salariedConfig)
        if (typeof parsed.hourlyRate === 'number') setHourlyRate(parsed.hourlyRate)
        if (typeof parsed.currency === 'string') setCurrency(parsed.currency)
        if (parsed.hourlySession) setHourlySession(parsed.hourlySession)
      } catch {
        // Invalid local data should not block app startup.
      }
    }
    setHasHydratedFromStorage(true)
  }, [])

  // Persist to localStorage
  useEffect(() => {
    if (!hasHydratedFromStorage) return
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ mode, salariedConfig, hourlyRate, currency, hourlySession }),
    )
  }, [hasHydratedFromStorage, mode, salariedConfig, hourlyRate, currency, hourlySession])

  // 100ms ticker for smooth sub-second display
  useEffect(() => {
    const ticker = window.setInterval(() => setNowMs(Date.now()), 100)
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
    [
      hourlyRate,
      hourlySession.running,
      hourlySession.startTimestampMs,
      hourlySession.accumulatedSeconds,
      nowMs,
    ],
  )

  // Sub-second interpolation for smooth live counter
  const subSecondFraction = (nowMs % 1000) / 1000
  const sessionFraction =
    hourlySession.startTimestampMs !== null
      ? ((nowMs - hourlySession.startTimestampMs) % 1000) / 1000
      : 0

  const displaySalariedEarned =
    salariedSnapshot.earnedToday + salariedSnapshot.earningPerSecond * subSecondFraction
  const displayHourlyEarned =
    hourlySnapshot.earned +
    (hourlySession.running ? hourlySnapshot.earningPerSecond * sessionFraction : 0)

  const displayEarned = mode === 'salaried' ? displaySalariedEarned : displayHourlyEarned
  const earningPerSecond =
    mode === 'salaried' ? salariedSnapshot.earningPerSecond : hourlySnapshot.earningPerSecond

  // Workday progress
  const scheduleSecsPerDay = useMemo(
    () => getScheduleSecondsPerWorkday(salariedConfig.workSchedule),
    [salariedConfig.workSchedule],
  )

  const workdayProgressPct = useMemo(() => {
    if (salariedConfig.spreadMode === 'spread_24_7') {
      return Math.min(100, (salariedSnapshot.secondsWorkedToday / 86400) * 100)
    }
    if (scheduleSecsPerDay <= 0) return 0
    return Math.min(100, (salariedSnapshot.secondsWorkedToday / scheduleSecsPerDay) * 100)
  }, [salariedSnapshot.secondsWorkedToday, scheduleSecsPerDay, salariedConfig.spreadMode])

  // Milestone celebration
  useEffect(() => {
    if (!isTrackingView) {
      lastMilestoneRef.current = 0
      return
    }
    const earned = mode === 'salaried' ? salariedSnapshot.earnedToday : hourlySnapshot.earned
    const nextMilestone = MILESTONES.find((m) => m > lastMilestoneRef.current && m <= earned)
    if (nextMilestone !== undefined) {
      lastMilestoneRef.current = nextMilestone
      setMilestoneAmount(formatCurrency(nextMilestone, currency))

      if (milestoneFlashTimeoutRef.current) clearTimeout(milestoneFlashTimeoutRef.current)
      setMilestoneFlash(true)
      milestoneFlashTimeoutRef.current = setTimeout(() => setMilestoneFlash(false), 1400)

      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current)
      setShowMilestoneToast(true)
      toastTimeoutRef.current = setTimeout(() => setShowMilestoneToast(false), 1700)
    }
  }, [salariedSnapshot.earnedToday, hourlySnapshot.earned, isTrackingView, mode, currency])

  // Copy earned amount to clipboard
  const handleCopy = useCallback(() => {
    const text = formatCurrency(displayEarned, currency)
    navigator.clipboard
      .writeText(text)
      .then(() => {
        if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current)
        setCopied(true)
        copyTimeoutRef.current = setTimeout(() => setCopied(false), 1600)
      })
      .catch(() => {})
  }, [displayEarned, currency])

  function toggleWeekday(weekday: Weekday) {
    setSalariedConfig((prev) => {
      const exists = prev.workSchedule.activeWeekdays.includes(weekday)
      return {
        ...prev,
        workSchedule: {
          ...prev.workSchedule,
          activeWeekdays: exists
            ? prev.workSchedule.activeWeekdays.filter((d) => d !== weekday)
            : [...prev.workSchedule.activeWeekdays, weekday],
        },
      }
    })
  }

  function startHourlySession() {
    setHourlySession((prev) => {
      if (prev.running) return prev
      return { ...prev, running: true, startTimestampMs: Date.now() }
    })
  }

  function stopHourlySession() {
    setHourlySession((prev) => {
      if (!prev.running || prev.startTimestampMs === null) return prev
      const liveSeconds = Math.max(0, Math.floor((Date.now() - prev.startTimestampMs) / 1000))
      return { running: false, startTimestampMs: null, accumulatedSeconds: prev.accumulatedSeconds + liveSeconds }
    })
  }

  function resetHourlySession() {
    setHourlySession(DEFAULT_HOURLY_SESSION)
    lastMilestoneRef.current = 0
  }

  function startTracking() {
    if (mode === 'hourly') startHourlySession()
    setIsTrackingView(true)
  }

  function backToSettings() {
    setIsTrackingView(false)
  }

  const clockString = new Date(nowMs).toLocaleTimeString()

  return (
    <>
      {/* Animated ambient background orbs */}
      <div className="ambient-orb ambient-orb-1" aria-hidden="true" />
      <div className="ambient-orb ambient-orb-2" aria-hidden="true" />
      <div className="ambient-orb ambient-orb-3" aria-hidden="true" />

      <main className="app">
        {/* ── SETUP VIEW ── */}
        {!isTrackingView && (
          <div className="setup-view">
            <header className="app-header">
              <div className="app-logo">
                <div className="app-logo-icon" aria-hidden="true">💰</div>
                <h1>Track My Income</h1>
              </div>
              <p>Watch your earnings grow in real time — by the second.</p>
            </header>

            {/* Mode + Currency card */}
            <section className="card">
              <div className="tab-switcher">
                <button
                  className={`tab-btn${mode === 'salaried' ? ' active' : ''}`}
                  type="button"
                  onClick={() => setMode('salaried')}
                >
                  Salaried
                </button>
                <button
                  className={`tab-btn${mode === 'hourly' ? ' active' : ''}`}
                  type="button"
                  onClick={() => setMode('hourly')}
                >
                  Hourly Session
                </button>
              </div>
              <div className="currency-row">
                <label>
                  Currency
                  <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
                    {CURRENCIES.map((opt) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                </label>
              </div>
            </section>

            {/* ── Salaried setup ── */}
            {mode === 'salaried' && (
              <section className="card">
                <div className="card-title">
                  <span className="card-title-icon">📊</span>
                  Salary Setup
                </div>
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
                        onChange={(e) =>
                          setSalariedConfig((prev) => ({ ...prev, amount: Number(e.target.value) }))
                        }
                      />
                    </div>
                  </label>
                  <label>
                    Income Unit
                    <select
                      value={salariedConfig.unit}
                      onChange={(e) =>
                        setSalariedConfig((prev) => ({
                          ...prev,
                          unit: e.target.value as IncomeUnit,
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
                      onChange={(e) =>
                        setSalariedConfig((prev) => ({
                          ...prev,
                          spreadMode: e.target.value as SalarySpreadMode,
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
                    <h3>Working Schedule</h3>
                    <div className="grid">
                      <label>
                        Shift Start
                        <input
                          type="time"
                          value={salariedConfig.workSchedule.startTime}
                          onChange={(e) =>
                            setSalariedConfig((prev) => ({
                              ...prev,
                              workSchedule: { ...prev.workSchedule, startTime: e.target.value },
                            }))
                          }
                        />
                      </label>
                      <label>
                        Shift End
                        <input
                          type="time"
                          value={salariedConfig.workSchedule.endTime}
                          onChange={(e) =>
                            setSalariedConfig((prev) => ({
                              ...prev,
                              workSchedule: { ...prev.workSchedule, endTime: e.target.value },
                            }))
                          }
                        />
                      </label>
                    </div>
                    <h3>Active Days</h3>
                    <div className="weekday-row">
                      {WEEKDAYS.map((weekday) => (
                        <button
                          key={weekday}
                          type="button"
                          className={`weekday-btn${salariedConfig.workSchedule.activeWeekdays.includes(weekday) ? ' active' : ''}`}
                          onClick={() => toggleWeekday(weekday)}
                          aria-label={weekday}
                          aria-pressed={salariedConfig.workSchedule.activeWeekdays.includes(weekday)}
                        >
                          {weekday.slice(0, 3).toUpperCase()}
                        </button>
                      ))}
                    </div>
                  </>
                )}

                <div className="stats-preview">
                  <div className="stat-row">
                    <span className="stat-row-label">Per second</span>
                    <span className="stat-row-value">
                      {formatCurrency(salariedSnapshot.earningPerSecond, currency, 4)}
                    </span>
                  </div>
                  <div className="stat-row">
                    <span className="stat-row-label">Per minute</span>
                    <span className="stat-row-value">
                      {formatCurrency(salariedSnapshot.earningPerSecond * 60, currency, 2)}
                    </span>
                  </div>
                  <div className="stat-row">
                    <span className="stat-row-label">Earned today</span>
                    <span className="stat-row-value">
                      {formatCurrency(salariedSnapshot.earnedToday, currency)}
                    </span>
                  </div>
                  <div className="stat-divider" />
                  <p className="stat-status">{salariedSnapshot.statusText}</p>
                </div>

                <div className="start-btn-wrap">
                  <button type="button" className="start-btn" onClick={startTracking}>
                    Start Tracking →
                  </button>
                </div>
              </section>
            )}

            {/* ── Hourly setup ── */}
            {mode === 'hourly' && (
              <section className="card">
                <div className="card-title">
                  <span className="card-title-icon">⏱</span>
                  Hourly Session
                </div>
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
                        onChange={(e) => setHourlyRate(Number(e.target.value))}
                      />
                    </div>
                  </label>
                </div>

                <div className="stats-preview" style={{ marginTop: 16 }}>
                  <div className="stat-row">
                    <span className="stat-row-label">Status</span>
                    <span>
                      <span className={`session-status-badge ${hourlySession.running ? 'running' : 'stopped'}`}>
                        <span className="session-status-dot" />
                        {hourlySession.running ? 'Running' : 'Stopped'}
                      </span>
                    </span>
                  </div>
                  <div className="stat-row">
                    <span className="stat-row-label">Elapsed</span>
                    <span className="stat-row-value">{formatDuration(hourlySnapshot.elapsedSeconds)}</span>
                  </div>
                  <div className="stat-row">
                    <span className="stat-row-label">Earned this session</span>
                    <span className="stat-row-value">{formatCurrency(hourlySnapshot.earned, currency)}</span>
                  </div>
                  <div className="stat-row">
                    <span className="stat-row-label">Per minute</span>
                    <span className="stat-row-value">
                      {formatCurrency(hourlySnapshot.earningPerSecond * 60, currency, 2)}
                    </span>
                  </div>
                </div>

                <div className="control-row">
                  <button type="button" className="start-btn" style={{ flex: 1 }} onClick={startTracking}>
                    {hourlySession.running ? 'Open Tracker →' : 'Start →'}
                  </button>
                  <button type="button" onClick={stopHourlySession} disabled={!hourlySession.running}>
                    Stop
                  </button>
                  <button type="button" onClick={resetHourlySession}>
                    Reset
                  </button>
                </div>
              </section>
            )}
          </div>
        )}

        {/* ── TRACKER VIEW ── */}
        {isTrackingView && (
          <div className="tracker-view">
            {/* Nav */}
            <nav className="tracker-nav">
              <div className="tracker-nav-left">
                <div className="tracker-nav-brand">
                  <div className="tracker-nav-logo" aria-hidden="true">💰</div>
                  <span className="tracker-nav-name">Track My Income</span>
                </div>
                <div className="live-indicator" aria-label="Live tracking active">
                  <span className="live-dot" />
                  Live
                </div>
              </div>
              <span className="tracker-clock" aria-live="off">{clockString}</span>
              <button type="button" className="tracker-back-btn" onClick={backToSettings}>
                ← Settings
              </button>
            </nav>

            {/* Milestone toast */}
            {showMilestoneToast && (
              <div className="milestone-toast" role="status" aria-live="polite">
                🎉 Milestone: {milestoneAmount}
              </div>
            )}

            {/* Hero */}
            <div className="tracker-hero">
              <div className="tracker-hero-glow" aria-hidden="true" />

              <p className="tracker-label">
                {mode === 'salaried' ? 'Earned today' : 'Earned this session'}
              </p>

              <div className="tracker-amount-row">
                <p
                  className={`tracker-amount${milestoneFlash ? ' milestone-glow' : ''}`}
                  aria-live="polite"
                  aria-label={`${formatCurrency(displayEarned, currency)} earned`}
                >
                  {formatCurrency(displayEarned, currency)}
                </p>
                <button
                  type="button"
                  className={`copy-btn${copied ? ' copied' : ''}`}
                  onClick={handleCopy}
                  title={copied ? 'Copied!' : 'Copy amount'}
                  aria-label={copied ? 'Copied to clipboard' : 'Copy earned amount'}
                >
                  {copied ? '✓' : '⎘'}
                </button>
              </div>

              <p className="tracker-per-second">
                <em>{formatCurrency(earningPerSecond, currency, 4)}</em> per second
              </p>

              {/* Stats: per minute / per hour / (elapsed for hourly) */}
              <div className="tracker-stats-row">
                <div className="tracker-stat-block">
                  <span className="tracker-stat-val">
                    {formatCurrency(earningPerSecond * 60, currency, 2)}
                  </span>
                  <span className="tracker-stat-lbl">Per Minute</span>
                </div>
                <div className="tracker-stat-block">
                  <span className="tracker-stat-val">
                    {formatCurrency(earningPerSecond * 3600, currency, 2)}
                  </span>
                  <span className="tracker-stat-lbl">Per Hour</span>
                </div>
                <div className="tracker-stat-block">
                  {mode === 'hourly' ? (
                    <>
                      <span className="tracker-stat-val">{formatDuration(hourlySnapshot.elapsedSeconds)}</span>
                      <span className="tracker-stat-lbl">Elapsed</span>
                    </>
                  ) : (
                    <>
                      <span className="tracker-stat-val">
                        {formatCurrency(earningPerSecond * 86400, currency, 2)}
                      </span>
                      <span className="tracker-stat-lbl">Daily Rate</span>
                    </>
                  )}
                </div>
              </div>

              {/* Workday progress (salaried only) */}
              {mode === 'salaried' && (
                <div className="progress-section">
                  <div className="progress-header">
                    <span className="progress-header-label">
                      {salariedConfig.spreadMode === 'spread_24_7' ? 'Day Progress' : 'Shift Progress'}
                    </span>
                    <span className="progress-header-pct">{workdayProgressPct.toFixed(1)}%</span>
                  </div>
                  <div className="progress-track">
                    <div
                      className="progress-fill"
                      style={{ width: `${workdayProgressPct}%` }}
                      role="progressbar"
                      aria-valuenow={workdayProgressPct}
                      aria-valuemin={0}
                      aria-valuemax={100}
                    />
                  </div>
                </div>
              )}

              <p className="tracker-status">
                {mode === 'salaried' ? salariedSnapshot.statusText : null}
              </p>
            </div>

            {/* Controls */}
            <div className="tracker-controls">
              {mode === 'hourly' && (
                <button type="button" onClick={stopHourlySession} disabled={!hourlySession.running}>
                  Stop Session
                </button>
              )}
              <button type="button" onClick={backToSettings}>
                ← Back to Settings
              </button>
            </div>
          </div>
        )}
      </main>
    </>
  )
}

export default App
