import { useState } from 'react'

const equipment = [
  <><rect x="4" y="5" width="16" height="11" rx="1.5" /><path d="M2 19h20" /></>,
  <><path d="M4 8h3l2-2h6l2 2h3v11H4z" /><circle cx="12" cy="13.5" r="3.5" /></>,
  <><path d="M4 14v-2a8 8 0 0 1 16 0v2" /><rect x="3" y="14" width="4" height="6" rx="1.5" /><rect x="17" y="14" width="4" height="6" rx="1.5" /></>,
  <><rect x="3" y="4" width="18" height="12" rx="1.5" /><path d="M8 20h8M12 16v4" /></>,
  <><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></>,
]

// Re-rolled at the start of each loop, while the icon is fully transparent above the hero.
const rollDrop = () => ({
  icon: Math.floor(Math.random() * equipment.length),
  left: 4 + Math.random() * 92,
  size: 44 + Math.random() * 32,
  spin: (Math.random() - 0.5) * 50,
})

/**
 * Fixed resting places for the reduced-motion scene (percent of the hero), so it is the same on every device.
 * The first three are the ones shown on phones, in the lower half below the text.
 */
const rest = [[88, 80], [52, 90], [20, 86], [74, 16], [40, 8], [94, 34]]
const delays = [0, 2.5, 5, 7.5, 10, 12.5]

function Drop({ index }: { index: number }) {
  const [drop, setDrop] = useState(rollDrop)
  // UAT-E05 (#65): the fall duration is chosen once. Changing animation-duration on a running animation moves its
  // progress, so the old per-loop re-roll made icons pop in or jump mid-fall.
  const [duration] = useState(() => 8 + Math.random() * 7)
  const [restX, restY] = rest[index]
  return <svg className="landing-drop" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"
    style={{ width: drop.size, height: drop.size, animationDuration: `${duration}s`, animationDelay: `${delays[index]}s`,
      '--spin': `${drop.spin}deg`, '--fall-x': `${drop.left}%`, '--rest-x': `${restX}%`, '--rest-y': `${restY}%` } as React.CSSProperties}
    onAnimationIteration={() => setDrop(rollDrop())}>{equipment[drop.icon]}</svg>
}

/**
 * Equipment outlines falling through the hero; each loop re-rolls its icon, position, size and tilt (not its speed).
 * With prefers-reduced-motion they rest at fixed places instead (Landing.css).
 */
export function Drops() {
  return <div className="landing-beams" aria-hidden="true">
    {delays.map((delay, index) => <Drop key={delay} index={index} />)}
  </div>
}

/** Full-screen page backdrop for the auth pages: ambient light, grid and falling equipment. */
export default function Backdrop() {
  return <div className="backdrop" aria-hidden="true">
    <div className="landing-ambient"><span /><span /><span /></div>
    <div className="backdrop-grid" />
    <Drops />
  </div>
}
