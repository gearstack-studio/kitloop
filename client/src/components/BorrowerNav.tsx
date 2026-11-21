import { AmbientLink } from './Ambient'

/** The borrower's pages, in reading order. Ordinary links: each is a separate route (not ARIA tabs). */
const pages = [
  { href: '/dashboard', label: 'Equipment dashboard' },
  { href: '/requests', label: 'My requests' },
] as const

/**
 * UAT-E04 (#64): both borrower pages stay visible as links. The current page is filled (primary) and carries
 * aria-current="page"; the other is outlined (secondary). Replaces the single toggle whose label named the other page.
 */
export default function BorrowerNav({ path }: { path: string }) {
  return <nav className="borrower-nav" aria-label="Borrower pages">
    <ul>
      {pages.map(page => {
        const current = path === page.href
        return <li key={page.href}>
          <AmbientLink href={page.href} variant={current ? 'primary' : 'secondary'} current={current}>{page.label}</AmbientLink>
        </li>
      })}
    </ul>
  </nav>
}
