import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react'
import { AmbientButton } from './Ambient'

export function AuthCard({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return <main className="auth-layout">
    <section className="auth-card" aria-labelledby="auth-title">
      <h1 id="auth-title">{title}</h1>
      <p className="auth-subtitle">{subtitle}</p>
      {children}
    </section>
  </main>
}

export function Field({ label, id, ...input }: { label: string; id: string } & InputHTMLAttributes<HTMLInputElement>) {
  return <div className="field"><label htmlFor={id}>{label}</label><input id={id} {...input} /></div>
}

export function AuthButton({ busy, children, ...rest }: { busy?: boolean; children: ReactNode } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return <AmbientButton className="btn--block auth-button" type="submit" {...rest} disabled={busy || rest.disabled}>{children}</AmbientButton>
}
