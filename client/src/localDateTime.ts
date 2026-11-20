export function browserTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone
}

export function formatLocalTimestamp(timestamp: string) {
  const timeZone = browserTimeZone()
  const time = new Date(timestamp).toLocaleString(undefined, { timeZone, timeZoneName: 'shortOffset' })
  return `${time} (${timeZone})`
}

export function nextLocalMinute() {
  const minute = 60_000
  const nextMinute = (Math.floor(Date.now() / minute) + 1) * minute
  const offset = new Date(nextMinute).getTimezoneOffset()
  // datetime-local expects a wall time without an offset or a UTC suffix.
  return new Date(nextMinute - offset * minute).toISOString().slice(0, 16)
}
