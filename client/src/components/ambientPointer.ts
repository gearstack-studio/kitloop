import type { PointerEvent } from 'react'

/** Writes the pointer position into --mx/--my so .btn can paint its ambient highlight. */
function track(event: PointerEvent<HTMLElement>) {
  const box = event.currentTarget.getBoundingClientRect()
  event.currentTarget.style.setProperty('--mx', `${event.clientX - box.left}px`)
  event.currentTarget.style.setProperty('--my', `${event.clientY - box.top}px`)
}

export const ambientHandlers = { onPointerMove: track, onPointerDown: track }

export function buttonClass(variant: 'primary' | 'secondary', extra = '') {
  return `btn btn--${variant} ${extra}`.trim()
}
