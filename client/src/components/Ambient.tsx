import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { linkClick } from '../navigation'
import { ambientHandlers, buttonClass } from './ambientPointer'

type Variant = 'primary' | 'secondary'

/** `current` marks the link to the page being shown (aria-current="page"); omitted, nothing changes. */
export function AmbientLink({ href, variant = 'primary', className, current, children }: { href: string; variant?: Variant; className?: string; current?: boolean; children: ReactNode }) {
  return <a className={buttonClass(variant, className)} href={href} onClick={linkClick(href)} aria-current={current ? 'page' : undefined} {...ambientHandlers}>
    <span className="btn-label">{children}</span>
  </a>
}

export function AmbientButton({ variant = 'primary', className, children, ...rest }: { variant?: Variant; children: ReactNode } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button className={buttonClass(variant, className)} {...ambientHandlers} {...rest}>
    <span className="btn-label">{children}</span>
  </button>
}
