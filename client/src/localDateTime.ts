export function browserTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone
}

export function formatLocalTimestamp(timestamp: string) {
  const timeZone = browserTimeZone()
  const time = new Date(timestamp).toLocaleString(undefined, { timeZone, timeZoneName: 'shortOffset' })
  return `${time} (${timeZone})`
}

const MINUTE = 60_000
const DAY = 86_400_000

// datetime-local expects a wall time without an offset or a UTC suffix.
function localWallMinute(instant: number) {
  const offset = new Date(instant).getTimezoneOffset()
  return new Date(instant - offset * MINUTE).toISOString().slice(0, 16)
}

export function nextLocalMinute() {
  return localWallMinute((Math.floor(Date.now() / MINUTE) + 1) * MINUTE)
}

/** Latest due instant allowed for a checkout at `now`: now + days x 24 hours (UAT-E02 #62). */
export function latestDueInstant(days: number, now = Date.now()) {
  return now + days * DAY
}

/** The latest whole browser-local minute not after latestDueInstant(days), for the picker's max attribute. */
export function latestLocalMinute(days: number) {
  return localWallMinute(Math.floor(latestDueInstant(days) / MINUTE) * MINUTE)
}
