import { useEffect, useState, type FormEvent } from 'react'
import Brand from './components/Brand'
import Landing from './Landing'
import SignUp from './SignUp'
import Backdrop from './components/Backdrop'
import Catalog, { type Asset, type CatalogStatus } from './components/Catalog'
import { AmbientButton, AmbientLink } from './components/Ambient'
import { AuthButton, AuthCard, AuthLink, Field } from './components/Auth'
import { navigate, usePath } from './navigation'
import './App.css'
import './Login.css'

type Identity = { id: string; role: 'BORROWER' | 'CUSTODIAN' }
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
  const path = usePath()
  const [identity, setIdentity] = useState<Identity | null>(null)
  const [csrf, setCsrf] = useState('')
  const [checking, setChecking] = useState(true)
  const [busy, setBusy] = useState(false)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [assets, setAssets] = useState<Asset[]>([])
  const [catalogStatus, setCatalogStatus] = useState<CatalogStatus>('loading')
  const [requests, setRequests] = useState<BorrowRequest[]>([])
  const [loans, setLoans] = useState<Loan[]>([])
  const [dueDates, setDueDates] = useState<Record<string, string>>({})

  function endSession(message: string) {
    setIdentity(null); setCsrf(''); setAssets([]); setCatalogStatus('loading'); setRequests([]); setLoans([]); setNotice(message)
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
    api<Asset[]>('/assets').then(({ data }) => {
      if (active) { setAssets(data); setCatalogStatus('ready') }
    }).catch((failure: ApiFailure) => {
      if (!active) return
      if (failure.status === 401) endSession('Your session has ended. Please sign in again.')
      else setCatalogStatus('error')
    })
    Promise.all([
      api<BorrowRequest[]>(identity.role === 'BORROWER' ? '/requests/mine' : '/requests/pending'),
      api<Loan[]>(identity.role === 'BORROWER' ? '/loans/mine' : '/loans/active'),
    ]).then(([requestList, loanList]) => {
      if (active) { setRequests(requestList.data); setLoans(loanList.data) }
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
    setAssets(catalog.data); setCatalogStatus('ready'); setRequests(requestList.data); setLoans(loanList.data)
  }

  async function retryCatalog() {
    setCatalogStatus('loading')
    try {
      setAssets((await api<Asset[]>('/assets')).data)
      setCatalogStatus('ready')
    } catch (failure) {
      if ((failure as ApiFailure).status === 401) endSession('Your session has ended. Please sign in again.')
      else setCatalogStatus('error')
    }
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
      else {
        // A 409 means server state changed under us; refetch so the catalog shows current availability (FEAT-02 AC-13).
        if (issue.status === 409) await refreshData(identity.role).catch(() => undefined)
        setError(issue.status === 403 ? 'You do not have permission for this action.' : issue.message)
      }
    } finally { setBusy(false) }
  }

  const route = path === '/login' || path === '/signup' || path === '/dashboard' ? path : '/'

  useEffect(() => {
    if (checking) return
    if (route === '/dashboard' && !identity) navigate('/login', { replace: true })
    else if ((route === '/login' || route === '/signup') && identity) navigate('/dashboard', { replace: true })
    else if (path !== route) navigate('/', { replace: true })
  }, [checking, identity, route, path])

  if (route === '/') return <Landing authenticated={!checking && !!identity} />
  if (checking) return <main className="centered"><p role="status">Checking your session…</p></main>

  return <div className={`shell ${identity ? 'shell--authenticated' : 'shell--login'}`}>
    {!identity && <Backdrop />}
    <header className="topbar"><Brand />
      {!identity && <AmbientLink variant="secondary" href="/">← Back to home</AmbientLink>}
      {identity && <div className="topbar-controls"><span className="identity-tag">Account {identity.id.slice(0, 8)}</span><AmbientButton variant="secondary" onClick={signOut} disabled={busy}>{busy ? 'Signing out…' : 'Sign out'}</AmbientButton></div>}
    </header>
    {!identity ? (route === '/signup' ? <SignUp /> : <AuthCard title="Welcome back" subtitle="Sign in to your KitLoop account." footer={<>Don't have an account? <AuthLink to="/signup">Sign up</AuthLink></>}>
        <form onSubmit={signIn}>
          <Field id="username" label="Username" value={username} onChange={event => setUsername(event.target.value)} autoComplete="username" required />
          <Field id="password" label="Password" type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete="current-password" required />
          <AuthButton busy={busy}>{busy ? 'Signing in…' : 'Sign In'}</AuthButton>
        </form>
        {error && <p className="alert" role="alert">{error}</p>}{notice && <p className="notice" role="status">{notice}</p>}
      </AuthCard>)
    : <main className="dashboard">
      <div className="page-heading"><div><span className="eyebrow">{identity.role} WORKSPACE</span><h1>{identity.role === 'BORROWER' ? 'Find your next tool.' : 'Manage the handoff.'}</h1><p>{identity.role === 'BORROWER' ? 'Browse equipment and follow your requests and loans.' : 'Review requests and check out equipment in your assigned inventory.'}</p></div><span className="identity-tag">Account {identity.id.slice(0, 8)}</span></div>
      {error && <p className="alert" role="alert">{error}</p>}{notice && <p className="notice" role="status">{notice}</p>}
      <Catalog assets={assets} status={catalogStatus} onRetry={retryCatalog} canRequest={identity.role === 'BORROWER'} busy={busy} onRequest={assetId => act('/requests', { assetId }, 'Borrow request submitted.')} />
      <section className="panel"><div className="section-heading"><h2>{identity.role === 'BORROWER' ? 'My requests' : 'Pending requests'}</h2><span>{requests.length} records</span></div>{requests.length === 0 ? <p className="empty">No requests to show yet.</p> : <div className="record-list">{requests.map(item => <article className="record" key={item.id}><div><strong>{item.assetId}</strong><small>{new Date(item.submittedAt).toLocaleString()} · {item.status}</small></div>{identity.role === 'CUSTODIAN' && <div className="checkout-controls"><input type="datetime-local" aria-label={`Due date for ${item.assetId}`} value={dueDates[item.id] ?? ''} onChange={event => setDueDates({ ...dueDates, [item.id]: event.target.value })} /><button disabled={busy || !dueDates[item.id]} onClick={() => act(`/requests/${item.id}/checkout`, { assetId: item.assetId, dueAt: new Date(dueDates[item.id]).toISOString() }, 'Checkout recorded. Active loan created.')}>Check out</button></div>}</article>)}</div>}</section>
      <section className="panel"><div className="section-heading"><h2>{identity.role === 'BORROWER' ? 'My loans' : 'Active loans'}</h2><span>{loans.length} records</span></div>{loans.length === 0 ? <p className="empty">No loans to show yet.</p> : <div className="record-list">{loans.map(loan => <article className="record" key={loan.id}><div><strong>{loan.assetId}</strong><small>Due {new Date(loan.dueAt).toLocaleDateString()} · {loan.returnedAt ? 'Returned' : 'Active'}</small></div></article>)}</div>}</section>
    </main>}
  </div>
}

export default App
