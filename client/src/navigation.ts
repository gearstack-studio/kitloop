import { useSyncExternalStore, type MouseEvent } from 'react'

const NAVIGATE_EVENT = 'kitloop:navigate'

function subscribe(listener: () => void) {
  window.addEventListener('popstate', listener)
  window.addEventListener(NAVIGATE_EVENT, listener)
  return () => {
    window.removeEventListener('popstate', listener)
    window.removeEventListener(NAVIGATE_EVENT, listener)
  }
}

export function usePath() {
  return useSyncExternalStore(subscribe, () => window.location.pathname.replace(/\/+$/, '') || '/', () => '/')
}

export function navigate(to: string, { replace = false } = {}) {
  if (window.location.pathname === to) return
  window.history[replace ? 'replaceState' : 'pushState'](null, '', to)
  window.dispatchEvent(new Event(NAVIGATE_EVENT))
  window.scrollTo(0, 0)
}

/** Click handler for in-app anchors: keeps modified clicks (new tab etc.) native. */
export function linkClick(to: string) {
  return (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    navigate(to)
  }
}
