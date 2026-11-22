import type { ReactNode } from 'react'

/**
 * UAT-E03 (#63): technical identifiers are secondary metadata. They stay in the DOM for support and testing but are
 * collapsed behind a native, keyboard-accessible disclosure instead of being the primary labels.
 */
export default function RecordIds({ children }: { children: ReactNode }) {
  return <details className="record-ids"><summary>Record IDs</summary>{children}</details>
}
