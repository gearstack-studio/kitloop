import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import Brand from './components/Brand'
import Landing from './Landing'
import Backdrop from './components/Backdrop'
import Catalog, { type Asset, type CatalogStatus } from './components/Catalog'
import Requests, { BorrowRequestForm, type BorrowRequest, type RequestStatus } from './components/Requests'
import Checkout from './components/Checkout'
import { CancelRequest, DeclineRequest } from './components/RequestActions'
import Loans, { type Loan, type LoanStatus } from './components/Loans'
import { AmbientButton, AmbientLink } from './components/Ambient'
import { AuthButton, AuthCard, Field } from './components/Auth'
import { navigate, usePath } from './navigation'
import { borrowEligibility } from './borrowEligibility'
import './App.css'
import './Login.css'

type Identity = { id: string; role: 'BORROWER' | 'CUSTODIAN' }
// PR #72 P1: phase 1 of the lifecycle rollout reads every request status but offers no lifecycle actions.
type Features = { requestLifecycleActions?: boolean }
const lifecycleActionsOn = (features?: Features) => features?.requestLifecycleActions === true
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
  const sessionEpoch = useRef(0)
  const requestReadId = useRef(0)
  const loanReadId = useRef(0)
  const path = usePath()
  const [identity, setIdentity] = useState<Identity | null>(null)
  const [lifecycleActions, setLifecycleActions] = useState(false)
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
  const [requestStatus, setRequestStatus] = useState<RequestStatus>('loading')
  const [selectedAsset, setSelectedAsset] = useState('')
  const [loans, setLoans] = useState<Loan[]>([])
  const [loanStatus, setLoanStatus] = useState<LoanStatus>('loading')

  const endSession = useCallback((message: string) => {
    sessionEpoch.current++
    setIdentity(null); setLifecycleActions(false); setCsrf(''); setAssets([]); setCatalogStatus('loading'); setRequests([]); setRequestStatus('loading'); setSelectedAsset(''); setLoans([]); setLoanStatus('loading'); setNotice(message); setError('')
  }, [])

  const loadRequests = useCallback((role: Identity['role'], options: {
    signal?: AbortSignal; reportRefreshFailure?: boolean
  } = {}) => {
    const epoch = sessionEpoch.current
    const readId = ++requestReadId.current
    const isCurrent = () => !options.signal?.aborted && epoch === sessionEpoch.current && readId === requestReadId.current
    return api<BorrowRequest[]>(role === 'BORROWER' ? '/requests/mine' : '/requests/pending', { signal: options.signal }).then(({ data }) => {
      if (!isCurrent()) return
      setRequests(data)
      setRequestStatus('ready')
    }, (failure: ApiFailure) => {
      if (!isCurrent()) return
      if (failure.status === 401) endSession('Your session has ended. Please sign in again.')
      else {
        setRequestStatus('error')
        if (options.reportRefreshFailure) throw failure
      }
    })
  }, [endSession])

  const loadLoans = useCallback((role: Identity['role'], signal?: AbortSignal) => {
    const epoch = sessionEpoch.current
    const readId = ++loanReadId.current
    const isCurrent = () => !signal?.aborted && epoch === sessionEpoch.current && readId === loanReadId.current
    return api<Loan[]>(role === 'BORROWER' ? '/loans/mine' : '/loans/active', { signal }).then(({ data }) => {
      if (!isCurrent()) return
      setLoans(data)
      setLoanStatus('ready')
    }, (failure: ApiFailure) => {
      if (!isCurrent()) return
      if (failure.status === 401) endSession('Your session has ended. Please sign in again.')
      else setLoanStatus('error')
    })
  }, [endSession])

  useEffect(() => {
    let active = true
    api<Identity & { features?: Features }>('/auth/me').then(({ data, token }) => {
      if (active) { setIdentity({ id: data.id, role: data.role }); setLifecycleActions(lifecycleActionsOn(data.features)); setCsrf(token ?? '') }
    }).catch((failure: ApiFailure) => {
      if (active && failure.status !== 401) setError(failure.message)
    }).finally(() => { if (active) setChecking(false) })
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!identity) return
    const epoch = sessionEpoch.current
    let active = true
    api<Asset[]>('/assets').then(({ data }) => {
      if (active && epoch === sessionEpoch.current) { setAssets(data); setCatalogStatus('ready') }
    }).catch((failure: ApiFailure) => {
      if (!active || epoch !== sessionEpoch.current) return
      if (failure.status === 401) endSession('Your session has ended. Please sign in again.')
      else setCatalogStatus('error')
    })
    const controller = new AbortController()
    void loadRequests(identity.role, { signal: controller.signal })
    void loadLoans(identity.role, controller.signal)
    return () => { active = false; controller.abort() }
  }, [identity, endSession, loadLoans, loadRequests])

  async function refreshData(role: Identity['role']) {
    const epoch = sessionEpoch.current
    setLoanStatus('loading')
    const [catalog] = await Promise.all([
      api<Asset[]>('/assets'),
      loadRequests(role, { reportRefreshFailure: true }),
      loadLoans(role),
    ])
    if (epoch === sessionEpoch.current) {
      setAssets(catalog.data); setCatalogStatus('ready')
    }
  }

  function retryRequests() {
    if (!identity) return
    setRequestStatus('loading')
    void loadRequests(identity.role)
  }

  async function retryCatalog() {
    const epoch = sessionEpoch.current
    setCatalogStatus('loading')
    try {
      const result = await api<Asset[]>('/assets')
      if (epoch === sessionEpoch.current) { setAssets(result.data); setCatalogStatus('ready') }
    } catch (failure) {
      if (epoch !== sessionEpoch.current) return
      if ((failure as ApiFailure).status === 401) endSession('Your session has ended. Please sign in again.')
      else setCatalogStatus('error')
    }
  }

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!username.trim() || !password) { setError('Enter both a username and password.'); return }
    setBusy(true); setError(''); setNotice('')
    try {
      const result = await api<{ user: Identity; features?: Features }>('/auth/login', {
        method: 'POST', body: JSON.stringify({ username: username.trim(), password }),
      })
      sessionEpoch.current++
      setCsrf(result.token ?? ''); setIdentity(result.data.user); setLifecycleActions(lifecycleActionsOn(result.data.features)); setUsername('')
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
    const epoch = sessionEpoch.current
    setBusy(true); setError(''); setNotice('')
    try {
      await api(path, { method: 'POST', body: JSON.stringify(body) }, csrf)
      if (epoch !== sessionEpoch.current) return
      setNotice(message)
      setSelectedAsset('')
      try { await refreshData(identity.role) } catch (failure) {
        if (epoch !== sessionEpoch.current) return
        if ((failure as ApiFailure).status === 401) endSession('Your session has ended. Please sign in again.')
        else { setCatalogStatus('error'); setError('The action succeeded, but updated records could not be loaded. Retry loading before submitting again.') }
      }
    } catch (failure) {
      if (epoch !== sessionEpoch.current) return
      const issue = failure as ApiFailure
      if (issue.status === 401) endSession('Your session has ended. Please sign in again.')
      else {
        // A 409 means server state changed under us; refetch so the catalog shows current availability (FEAT-02 AC-13).
        if (issue.status === 409) {
          try { await refreshData(identity.role) } catch (refreshFailure) {
            if (epoch !== sessionEpoch.current) return
            if ((refreshFailure as ApiFailure).status === 401) { endSession('Your session has ended. Please sign in again.'); return }
            setCatalogStatus('error')
          }
        }
        setError(issue.status === 403 ? 'You do not have permission for this action.' : issue.message)
      }
    } finally { setBusy(false) }
  }

  const route = path === '/' || path === '/login' || path === '/dashboard' || path === '/requests' ? path : null

  useEffect(() => {
    if (checking) return
    if ((route === '/dashboard' || route === '/requests') && !identity) navigate('/login', { replace: true })
    else if (route === '/requests' && identity?.role === 'CUSTODIAN') navigate('/dashboard', { replace: true })
    else if (route === '/login' && identity) navigate('/dashboard', { replace: true })
  }, [checking, identity, route])

  if (route === '/') return <Landing authenticated={!checking && !!identity} />
  if (!route) return <div className="shell shell--login">
    <header className="topbar"><Brand /></header>
    <AuthCard title="Page not found" subtitle="The page you requested is unavailable.">
      <AmbientLink href="/">Back to home</AmbientLink>
    </AuthCard>
  </div>
  if (checking) return <main className="centered"><p role="status">Checking your session…</p></main>

  return <div className={`shell ${identity ? 'shell--authenticated' : 'shell--login'}`}>
    {!identity && <Backdrop />}
    <header className="topbar"><Brand />
      {!identity && <AmbientLink variant="secondary" href="/">← Back to home</AmbientLink>}
      {identity && <div className="topbar-controls"><span className="identity-tag">Account {identity.id.slice(0, 8)}</span><AmbientButton variant="secondary" onClick={signOut} disabled={busy}>{busy ? 'Please wait…' : 'Sign out'}</AmbientButton></div>}
    </header>
    {!identity ? <AuthCard title="Welcome back" subtitle="Sign in to your KitLoop account.">
        <form onSubmit={signIn}>
          <Field id="username" label="Username" value={username} onChange={event => setUsername(event.target.value)} autoComplete="username" required />
          <Field id="password" label="Password" type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete="current-password" required />
          <AuthButton busy={busy}>{busy ? 'Signing in…' : 'Sign In'}</AuthButton>
        </form>
        {error && <p className="alert" role="alert">{error}</p>}{notice && <p className="notice" role="status">{notice}</p>}
      </AuthCard>
    : <main className="dashboard">
      <div className="page-heading"><div><span className="eyebrow">{identity.role} WORKSPACE</span><h1>{identity.role === 'BORROWER' ? 'Find your next tool.' : 'Manage the handoff.'}</h1><p>{identity.role === 'BORROWER' ? 'Browse equipment and follow your requests and loans.' : 'Review requests and check out equipment in your assigned inventory.'}</p></div><span className="identity-tag">Account {identity.id.slice(0, 8)}</span></div>
      {error && <p className="alert" role="alert">{error}</p>}{notice && <p className="notice" role="status">{notice}</p>}
      {identity.role === 'BORROWER' && <nav aria-label="Borrower pages"><AmbientLink href={route === '/requests' ? '/dashboard' : '/requests'}>{route === '/requests' ? 'Equipment dashboard' : 'My Requests page'}</AmbientLink></nav>}
      {route !== '/requests' && <Catalog assets={assets} status={catalogStatus} onRetry={retryCatalog}
        canRequest={identity.role === 'BORROWER'} requests={requests} requestStatus={requestStatus}
        busy={busy} onRequest={assetId => { setSelectedAsset(assetId); navigate('/requests') }} />}
      {identity.role === 'BORROWER' && route === '/requests' && <>
        {catalogStatus === 'error' && <div role="alert"><p>Available equipment could not be loaded.</p><button onClick={retryCatalog}>Retry equipment</button></div>}
        <BorrowRequestForm assets={assets} requests={requests} selected={selectedAsset} onSelect={setSelectedAsset} busy={busy}
          ready={catalogStatus === 'ready' && requestStatus === 'ready'} onSubmit={event => {
            event.preventDefault()
            if (busy || catalogStatus !== 'ready' || requestStatus !== 'ready' ||
              !assets.some(asset => asset.assetId === selectedAsset && borrowEligibility(asset, requests) === 'eligible')) return
            void act('/requests', { assetId: selectedAsset }, 'Borrow request submitted with PENDING status.')
          }} />
      </>}
      <Requests requests={requests} status={requestStatus} onRetry={retryRequests} custodian={identity.role === 'CUSTODIAN'}>
        {item => identity.role === 'CUSTODIAN' ? <div className="request-actions">
          <Checkout request={item} busy={busy}
            ready={catalogStatus === 'ready'} available={assets.some(asset => asset.assetId === item.assetId && asset.available)}
            onCheckout={(entry, dueAt) => { void act(`/requests/${entry.id}/checkout`, { assetId: entry.assetId, dueAt }, lifecycleActions
              ? 'Checkout recorded. Request CHECKED_OUT and active loan created. Any other pending requests for this equipment were declined.'
              : 'Checkout recorded. Request CHECKED_OUT and active loan created.') }} />
          {lifecycleActions && <DeclineRequest request={item} busy={busy}
            onDecline={(entry, reason) => { void act(`/requests/${entry.id}/decline`, { reason }, 'Request declined.') }} />}
        </div> : lifecycleActions && <CancelRequest request={item} busy={busy}
          onCancel={entry => { void act(`/requests/${entry.id}/cancel`, {}, 'Request cancelled.') }} />}
      </Requests>
      <Loans loans={loans} status={loanStatus} custodian={identity.role === 'CUSTODIAN'}
        onRetry={() => { setLoanStatus('loading'); void loadLoans(identity.role) }} />
    </main>}
  </div>
}

export default App
