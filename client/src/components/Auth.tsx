import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react'
import { linkClick } from '../navigation'
import { AmbientButton } from './Ambient'

export function AuthCard({ title, subtitle, children, footer }: { title: string; subtitle: string; children: ReactNode; footer: ReactNode }) {
  return <main className="auth-layout">
    <section className="auth-card" aria-labelledby="auth-title">
      <h1 id="auth-title">{title}</h1>
      <p className="auth-subtitle">{subtitle}</p>
      {children}
      <p className="auth-footer">{footer}</p>
    </section>
  </main>
}

export function Field({ label, id, ...input }: { label: string; id: string } & InputHTMLAttributes<HTMLInputElement>) {
  return <div className="field"><label htmlFor={id}>{label}</label><input id={id} {...input} /></div>
}

export function AuthButton({ busy, children, ...rest }: { busy?: boolean; children: ReactNode } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return <AmbientButton className="btn--block auth-button" type="submit" {...rest} disabled={busy || rest.disabled}>{children}</AmbientButton>
}

export function AuthLink({ to, children }: { to: string; children: ReactNode }) {
  return <a className="link" href={to} onClick={linkClick(to)}>{children}</a>
}
