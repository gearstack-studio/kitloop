import { describe, expect, it } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import { Drops } from '../src/components/Backdrop'

// UAT-E05 (#65): falling equipment icons. A running CSS animation whose duration changes jumps to a different point
// of its cycle, so each icon's fall duration must stay fixed when it re-rolls its look at the start of a loop.
const icons = (container: HTMLElement) => [...container.querySelectorAll<SVGElement>('.landing-drop')]
/** End of one fall. jsdom has no AnimationEvent, so React listens for the prefixed event name there. */
const endLoop = (icon: Element) => fireEvent(icon, new Event('AnimationEvent' in window ? 'animationiteration' : 'webkitAnimationIteration', { bubbles: true }))

describe('UAT-E05 falling equipment icons', () => {
  it('keep their fall duration and delay when they re-roll at the end of each loop', () => {
    const { container } = render(<Drops />)
    const timing = () => icons(container).map(icon => [icon.style.animationDuration, icon.style.animationDelay])
    const look = () => icons(container).map(icon => `${icon.style.getPropertyValue('--fall-x')} ${icon.style.width}`).join()
    const before = timing(), lookBefore = look()
    expect(before).toHaveLength(6)
    for (let loop = 0; loop < 5; loop++) icons(container).forEach(endLoop)
    expect(look()).not.toBe(lookBefore)   // the re-roll really ran: position and size changed
    expect(timing()).toEqual(before)
  })

  it('have fixed, distinct resting places for the reduced-motion scene', () => {
    const first = icons(render(<Drops />).container).map(icon => [icon.style.getPropertyValue('--rest-x'), icon.style.getPropertyValue('--rest-y')])
    const second = icons(render(<Drops />).container).map(icon => [icon.style.getPropertyValue('--rest-x'), icon.style.getPropertyValue('--rest-y')])
    expect(first).toEqual(second)   // the same on every load and every device
    expect(new Set(first.map(place => place.join())).size).toBe(6)
    for (const [x, y] of first) {
      expect(parseFloat(x)).toBeGreaterThanOrEqual(0); expect(parseFloat(x)).toBeLessThanOrEqual(100)
      expect(parseFloat(y)).toBeGreaterThanOrEqual(0); expect(parseFloat(y)).toBeLessThanOrEqual(100)
    }
  })

  it('stay decorative: hidden from assistive technology', () => {
    const { container } = render(<Drops />)
    expect(container.querySelector('.landing-beams')?.getAttribute('aria-hidden')).toBe('true')
  })
})
