import lightTrails from './assets/light-trails.svg'
import Brand from './components/Brand'
import { Drops } from './components/Backdrop'
import { AmbientLink } from './components/Ambient'
import { useEffect, useRef, useState, type PointerEvent } from 'react'
import './Landing.css'

function spotlight(event: PointerEvent<HTMLLIElement>) {
  if (event.pointerType !== 'mouse') return
  const box = event.currentTarget.getBoundingClientRect()
  event.currentTarget.style.setProperty('--sx', `${event.clientX - box.left}px`)
  event.currentTarget.style.setProperty('--sy', `${event.clientY - box.top}px`)
}

const steps = [
  { id: '01', title: 'Discover Equipment', text: 'Explore technology equipment and check availability.' },
  { id: '02', title: 'Request to Borrow', text: 'Submit and manage equipment borrowing requests.' },
  { id: '03', title: 'Track Your Loan', text: 'Follow borrowing status and return deadlines.' },
]

/** Adds .is-visible to .reveal children as they scroll into view (content stays visible without JS). */
function useReveal() {
  const root = useRef<HTMLDivElement>(null)
  const [ready, setReady] = useState(false)
  useEffect(() => {
    const nodes = root.current?.querySelectorAll('.reveal')
    if (!nodes?.length || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(entries => entries.forEach(entry => {
      if (entry.isIntersecting) { entry.target.classList.add('is-visible'); observer.unobserve(entry.target) }
    }), { threshold: 0.2 })
    nodes.forEach(node => observer.observe(node))
    setReady(true)
    return () => observer.disconnect()
  }, [])
  return { root, ready }
}

export default function Landing({ authenticated }: { authenticated: boolean }) {
  const { root, ready } = useReveal()
  const entry = authenticated ? { href: '/dashboard', label: 'Dashboard' } : { href: '/login', label: 'Login' }
  return <div className={ready ? 'landing landing--ready' : 'landing'} ref={root}>
    <div className="landing-ambient" aria-hidden="true"><span /><span /><span /></div>
    <header className="landing-nav">
      <div className="landing-container landing-nav-inner">
        <Brand />
        <nav className="landing-nav-links" aria-label="Primary">
          <a className="landing-link" href="#features">Explore</a>
          <AmbientLink variant="secondary" href={entry.href}>{entry.label}</AmbientLink>
        </nav>
      </div>
    </header>
    <main>
      <section className="landing-hero">
        <Drops />
        <div className="landing-container">
          <p className="landing-eyebrow landing-rise" style={{ '--i': 0 } as React.CSSProperties}>Equipment, connected<span className="landing-pulse" aria-hidden="true" /></p>
          <h1 className="landing-title">
            <span className="landing-line"><span style={{ '--i': 1 } as React.CSSProperties}>Everything you need.</span></span>
            <span className="landing-line"><span style={{ '--i': 2 } as React.CSSProperties}>Within reach<i className="landing-dot">.</i></span></span>
          </h1>
          <p className="landing-lede landing-rise" style={{ '--i': 3 } as React.CSSProperties}>Discover, borrow, and manage technology equipment from one connected workspace.</p>
          <div className="landing-actions landing-rise" style={{ '--i': 4 } as React.CSSProperties}>
            <AmbientLink href="/login" className="landing-cta">Get Started <span className="landing-arrow" aria-hidden="true">→</span></AmbientLink>
            <a className="btn btn--secondary landing-cta" href="#features">Explore the Platform</a>
          </div>
        </div>
        <div className="landing-art" aria-hidden="true"><img src={lightTrails} alt="" /></div>
      </section>
      <section className="landing-features" id="features" aria-labelledby="features-title">
        <div className="landing-container">
          <h2 id="features-title" className="landing-section-title reveal"><em>The</em> platform<i className="landing-dot">.</i></h2>
          <ol className="landing-steps">
            {steps.map((step, index) => <li key={step.id} className="landing-step reveal" style={{ '--d': `${index * 110}ms` } as React.CSSProperties} onPointerMove={spotlight}>
              <span className="landing-step-id">{step.id}</span>
              <h3>{step.title}</h3>
              <p>{step.text}</p>
            </li>)}
          </ol>
        </div>
      </section>
    </main>
    <footer className="landing-footer">
      <div className="landing-container landing-footer-inner">
        <Brand small />
        <span>Technology equipment borrowing for the department.</span>
      </div>
    </footer>
  </div>
}
