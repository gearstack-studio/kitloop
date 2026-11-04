import { useEffect, useState } from 'react'

const primaryOrbit = 'M 27.02 9.11 C 28.93 12.16 25.53 17.71 19.44 21.51 C 13.36 25.32 6.88 25.93 4.98 22.89 C 3.07 19.84 6.47 14.29 12.56 10.49 C 18.64 6.68 25.12 6.07 27.02 9.11 Z'
const secondaryOrbit = 'M 27.02 22.89 C 25.12 25.93 18.64 25.32 12.56 21.51 C 6.47 17.71 3.07 12.16 4.98 9.11 C 6.88 6.07 13.36 6.68 19.44 10.49 C 25.53 14.29 28.93 19.84 27.02 22.89 Z'
const dotMotion = 'M 0 0 C 1.91 3.05 -1.49 8.60 -7.58 12.40 C -13.66 16.21 -20.14 16.82 -22.04 13.78 C -23.95 10.73 -20.55 5.18 -14.46 1.38 C -8.38 -2.43 -1.90 -3.04 0 0 Z'

type KitLoopLogoProps = {
  size?: number
  className?: string
  label?: string
}

function useReducedMotion() {
  const [reducedMotion, setReducedMotion] = useState(
    () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  )

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)')
    const updatePreference = () => setReducedMotion(preference.matches)
    preference.addEventListener('change', updatePreference)
    return () => preference.removeEventListener('change', updatePreference)
  }, [])

  return reducedMotion
}

export default function KitLoopLogo({ size, className = '', label }: KitLoopLogoProps) {
  const reducedMotion = useReducedMotion()

  return (
    <svg
      className={`kitloop-logo ${className}`.trim()}
      viewBox="0 0 32 32"
      fill="none"
      style={size ? { width: size, height: size } : undefined}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      <path d={primaryOrbit} stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d={secondaryOrbit} stroke="currentColor" strokeWidth="1.4" strokeOpacity="0.65" strokeLinecap="round" />
      <circle cx="27.02" cy="9.11" r="2.15" fill="#38BDF8">
        {!reducedMotion && <animateMotion path={dotMotion} dur="14s" calcMode="paced" repeatCount="indefinite" />}
      </circle>
    </svg>
  )
}
