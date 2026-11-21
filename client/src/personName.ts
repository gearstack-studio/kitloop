/** Person summary sent by the API: only an ID and username (UAT-E03 #63). */
export type PersonName = { id: string; username: string }

/** A person's readable name, or a neutral placeholder. Never an invented name and never a UUID used as a name. */
export function personName(person?: PersonName | null) {
  return person?.username || 'Name unavailable'
}
