import { AuthButton, AuthCard, AuthLink, Field } from './components/Auth'

/** Preview only: the backend exposes no registration endpoint, so nothing is submitted. */
export default function SignUp() {
  return <AuthCard title="Create your account" subtitle="Get started with KitLoop."
    footer={<>Already have an account? <AuthLink to="/login">Sign in</AuthLink></>}>
    <p className="notice" role="status">Sign up is a preview and isn't available yet. Accounts are currently issued by your department.</p>
    <form onSubmit={event => event.preventDefault()}>
      <fieldset className="auth-fieldset" disabled>
        <Field id="signup-name" label="Full name" autoComplete="name" />
        <Field id="signup-username" label="Username" autoComplete="username" />
        <Field id="signup-password" label="Password" type="password" autoComplete="new-password" />
        <Field id="signup-confirm" label="Confirm password" type="password" autoComplete="new-password" />
      </fieldset>
      <AuthButton disabled>Create Account</AuthButton>
    </form>
  </AuthCard>
}
