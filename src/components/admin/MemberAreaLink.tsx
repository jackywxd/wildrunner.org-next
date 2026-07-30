import Link from 'next/link'

/**
 * Sidebar entry taking an admin over to the member-facing area.
 *
 * A plain `next/link` and no role check: `/members` is open to every
 * authenticated account (the member UI is a different view of the same
 * content, not a lesser one), and the member shell shows the reverse link
 * back to `/admin` only to admins.
 *
 * Safe for M0-T9, which enumerates `a[href^="/admin"]` to check what a
 * member can see in the sidebar — `/members` doesn't match that prefix.
 */
export function MemberAreaLink() {
  return (
    <Link
      href="/members"
      data-testid="admin-member-area-link"
      className="nav__link"
      style={{
        display: 'block',
        marginBottom: 'calc(var(--base) / 2)',
        textDecoration: 'none',
      }}
    >
      切換到會員介面
    </Link>
  )
}
