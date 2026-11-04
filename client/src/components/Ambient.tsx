import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { linkClick } from '../navigation'
import { ambientHandlers, buttonClass } from './ambientPointer'

type Variant = 'primary' | 'secondary'

export function AmbientLink({ href, variant = 'primary', className, children }: { href: string; variant?: Variant; className?: string; children: ReactNode }) {
  return <a className={buttonClass(variant, className)} href={href} onClick={linkClick(href)} {...ambientHandlers}>
    <span className="btn-label">{children}</span>
  </a>
}

export function AmbientButton({ variant = 'primary', className, children, ...rest }: { variant?: Variant; children: ReactNode } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button className={buttonClass(variant, className)} {...ambientHandlers} {...rest}>
    <span className="btn-label">{children}</span>
  </button>
}
