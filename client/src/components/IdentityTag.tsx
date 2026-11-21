/**
 * UAT-E03 (#63): the signed-in account by its username instead of a UUID prefix. Screen readers hear "Signed in as
 * <username>"; sighted users see the username. Without a username (an older API) it shows the role, never an ID.
 */
export default function IdentityTag({ identity }: { identity: { role: 'BORROWER' | 'CUSTODIAN'; username?: string } }) {
  const name = identity.username || (identity.role === 'BORROWER' ? 'Borrower account' : 'Custodian account')
  return <span className="identity-tag" title={identity.username ? `Signed in as ${identity.username}` : undefined}>
    <span className="visually-hidden">Signed in as </span>{name}
  </span>
}
