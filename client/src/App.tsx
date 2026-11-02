import { useEffect, useState, type FormEvent } from 'react'
import './App.css'

type Identity = { id: string; role: 'BORROWER' | 'CUSTODIAN' }
type Asset = { assetId: string; name: string; category: string; description: string; available: boolean }
type BorrowRequest = { id: string; assetId: string; status: string; submittedAt: string }
type Loan = { id: string; assetId: string; dueAt: string; returnedAt: string | null }
const apiBase = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000'

class ApiFailure extends Error {
  status: number
  constructor(status: number, message: string) { super(message); this.status = status }
}

async function api<T>(path: string, options: RequestInit = {}, csrf?: string): Promise<{ data: T; token?: string }> {
  let response: Response
  try {
    response = await fetch(`${apiBase}/api${path}`, {
      ...options,
      credentials: 'include',
      headers: {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
        ...options.headers,
      },
    })
  } catch {
    throw new ApiFailure(0, 'Unable to reach the KitLoop API. Please try again.')
  }
  const body = response.status === 204 ? null : await response.json().catch(() => null)
  if (!response.ok) throw new ApiFailure(response.status, body?.error?.message ?? 'The request could not be completed.')
  return { data: body as T, token: response.headers.get('X-CSRF-Token') ?? undefined }
}

function App() {
  const [identity, setIdentity] = useState<Identity | null>(null)
  const [csrf, setCsrf] = useState('')
  const [checking, setChecking] = useState(true)
  const [busy, setBusy] = useState(false)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [assets, setAssets] = useState<Asset[]>([])
  const [requests, setRequests] = useState<BorrowRequest[]>([])
  const [loans, setLoans] = useState<Loan[]>([])
  const [dueDates, setDueDates] = useState<Record<string, string>>({})

  function endSession(message: string) {
    setIdentity(null); setCsrf(''); setAssets([]); setRequests([]); setLoans([]); setNotice(message)
  }

  useEffect(() => {
    let active = true
    api<Identity>('/auth/me').then(({ data, token }) => {
      if (active) { setIdentity(data); setCsrf(token ?? '') }
    }).catch((failure: ApiFailure) => {
      if (active && failure.status !== 401) setError(failure.message)
    }).finally(() => { if (active) setChecking(false) })
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!identity) return
    let active = true
    Promise.all([
      api<Asset[]>('/assets'),
      api<BorrowRequest[]>(identity.role === 'BORROWER' ? '/requests/mine' : '/requests/pending'),
      api<Loan[]>(identity.role === 'BORROWER' ? '/loans/mine' : '/loans/active'),
    ]).then(([catalog, requestList, loanList]) => {
      if (active) { setAssets(catalog.data); setRequests(requestList.data); setLoans(loanList.data) }
    }).catch((failure: ApiFailure) => {
      if (!active) return
      if (failure.status === 401) endSession('Your session has ended. Please sign in again.')
      else setError(failure.message)
    })
    return () => { active = false }
  }, [identity])

  async function refreshData(role: Identity['role']) {
    const [catalog, requestList, loanList] = await Promise.all([
      api<Asset[]>('/assets'),
      api<BorrowRequest[]>(role === 'BORROWER' ? '/requests/mine' : '/requests/pending'),
      api<Loan[]>(role === 'BORROWER' ? '/loans/mine' : '/loans/active'),
    ])
    setAssets(catalog.data); setRequests(requestList.data); setLoans(loanList.data)
  }

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!username.trim() || !password) { setError('Enter both a username and password.'); return }
    setBusy(true); setError(''); setNotice('')
    try {
      const result = await api<{ user: Identity }>('/auth/login', {
        method: 'POST', body: JSON.stringify({ username: username.trim(), password }),
      })
      setCsrf(result.token ?? ''); setIdentity(result.data.user); setUsername('')
    } catch (failure) {
      const issue = failure as ApiFailure
      setError(issue.status === 401 ? 'Invalid username or password.' : issue.message)
    } finally { setPassword(''); setBusy(false) }
  }

  async function signOut() {
    setBusy(true); setError('')
    try {
      await api('/auth/logout', { method: 'POST' }, csrf)
      endSession('You have signed out.')
    } catch (failure) {
      const issue = failure as ApiFailure
      if (issue.status === 401) endSession('Your session has ended. Please sign in again.')
      else setError(issue.message)
    } finally { setBusy(false) }
  }

  async function act(path: string, body: object, message: string) {
    if (!identity) return
    setBusy(true); setError(''); setNotice('')
    try {
      await api(path, { method: 'POST', body: JSON.stringify(body) }, csrf)
      await refreshData(identity.role)
      setNotice(message)
    } catch (failure) {
      const issue = failure as ApiFailure
      if (issue.status === 401) endSession('Your session has ended. Please sign in again.')
      else setError(issue.status === 403 ? 'You do not have permission for this action.' : issue.message)
    } finally { setBusy(false) }
  }

  if (checking) return <main className="centered"><p role="status">Checking your session…</p></main>

  return <div className="shell">
    <header className="topbar"><div className="brand"><span className="brand-mark">K</span><span>KitLoop</span></div>
      {identity && <div className="topbar-actions"><span className="role-badge">{identity.role === 'BORROWER' ? 'Borrower' : 'Custodian'}</span><button className="text-button" onClick={signOut} disabled={busy}>Sign out</button></div>}
    </header>
    {!identity ? <main className="login-layout">
      <section className="welcome"><span className="eyebrow">DEPARTMENT EQUIPMENT</span><h1>Keep the right gear in the right hands.</h1><p>Explore available equipment, request a loan, and keep every handoff accountable.</p><div className="welcome-line">Inventory · Borrowing · Custody</div></section>
      <section className="login-card" aria-labelledby="login-title"><span className="eyebrow">WELCOME BACK</span><h2 id="login-title">Sign in to KitLoop</h2><p>Use your seeded demo account to continue.</p>
        <form onSubmit={signIn}><label htmlFor="username">Username</label><input id="username" value={username} onChange={event => setUsername(event.target.value)} autoComplete="username" required />
          <label htmlFor="password">Password</label><input id="password" type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete="current-password" required />
          <button className="primary-button" type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button></form>
        {error && <p className="alert" role="alert">{error}</p>}{notice && <p className="notice" role="status">{notice}</p>}
      </section>
    </main> : <main className="dashboard">
      <div className="page-heading"><div><span className="eyebrow">{identity.role} WORKSPACE</span><h1>{identity.role === 'BORROWER' ? 'Find your next tool.' : 'Manage the handoff.'}</h1><p>{identity.role === 'BORROWER' ? 'Browse equipment and follow your requests and loans.' : 'Review requests and check out equipment in your assigned inventory.'}</p></div><span className="identity-tag">Account {identity.id.slice(0, 8)}</span></div>
      {error && <p className="alert" role="alert">{error}</p>}{notice && <p className="notice" role="status">{notice}</p>}
      <section className="panel"><div className="section-heading"><h2>Equipment catalog</h2><span>{assets.length} assets</span></div><div className="asset-grid">{assets.map(asset => <article className="asset-card" key={asset.assetId}><div className="asset-meta"><span>{asset.category}</span><span className={asset.available ? 'available' : 'unavailable'}>{asset.available ? 'Available' : 'Checked out'}</span></div><h3>{asset.name}</h3><p>{asset.description}</p><div className="asset-footer"><code>{asset.assetId}</code>{identity.role === 'BORROWER' && <button disabled={busy || !asset.available} onClick={() => act('/requests', { assetId: asset.assetId }, 'Borrow request submitted.')}>Request to borrow</button>}</div></article>)}</div></section>
      <section className="panel"><div className="section-heading"><h2>{identity.role === 'BORROWER' ? 'My requests' : 'Pending requests'}</h2><span>{requests.length} records</span></div>{requests.length === 0 ? <p className="empty">No requests to show yet.</p> : <div className="record-list">{requests.map(item => <article className="record" key={item.id}><div><strong>{item.assetId}</strong><small>{new Date(item.submittedAt).toLocaleString()} · {item.status}</small></div>{identity.role === 'CUSTODIAN' && <div className="checkout-controls"><input type="datetime-local" aria-label={`Due date for ${item.assetId}`} value={dueDates[item.id] ?? ''} onChange={event => setDueDates({ ...dueDates, [item.id]: event.target.value })} /><button disabled={busy || !dueDates[item.id]} onClick={() => act(`/requests/${item.id}/checkout`, { assetId: item.assetId, dueAt: new Date(dueDates[item.id]).toISOString() }, 'Checkout recorded. Active loan created.')}>Check out</button></div>}</article>)}</div>}</section>
      <section className="panel"><div className="section-heading"><h2>{identity.role === 'BORROWER' ? 'My loans' : 'Active loans'}</h2><span>{loans.length} records</span></div>{loans.length === 0 ? <p className="empty">No loans to show yet.</p> : <div className="record-list">{loans.map(loan => <article className="record" key={loan.id}><div><strong>{loan.assetId}</strong><small>Due {new Date(loan.dueAt).toLocaleDateString()} · {loan.returnedAt ? 'Returned' : 'Active'}</small></div></article>)}</div>}</section>
    </main>}
  </div>
}

export default App
