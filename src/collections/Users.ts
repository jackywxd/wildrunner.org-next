import type { CollectionConfig } from 'payload'

import { isAdmin, isAdminFieldLevel, isAdminOrSelf, isAdminUser } from '../access'
import { inviteEmailHTML, inviteLinkFor } from '../lib/invite'
import { ensureAuthorIdentity } from './hooks/author-identity'
import { clearInvitePending } from './hooks/clear-invite-pending'
import { ensureFirstUserIsAdmin } from './hooks/first-user-admin'

export const Users: CollectionConfig = {
  slug: 'users',
  labels: {
    singular: { en: 'User', 'zh-TW': '使用者' },
    plural: { en: 'Users', 'zh-TW': '使用者' },
  },
  admin: {
    useAsTitle: 'email',
    defaultColumns: ['email', 'displayName', 'role', 'invitePending', 'updatedAt'],
    // Members still reach /admin/account for their own profile; this only
    // drops the collection from the sidebar. Access control is the gate.
    hidden: ({ user }) => !isAdminUser(user),
    components: {
      beforeListTable: ['@/components/admin/InviteMemberPanel#InviteMemberPanel'],
    },
  },
  auth: {
    /**
     * 30 days, against Payload's 7200-second default.
     *
     * One value drives three things that have to agree: the JWT's `exp`,
     * the cookie's `Expires`, and the `expiresAt` of the row this login
     * adds to `users.sessions` (`useSessions` defaults to true). Setting it
     * here is the only way to move all three together.
     *
     * It is an *absolute* expiry, not a sliding one. Payload can renew a
     * session — `/api/users/refresh-token` pushes all three forward — but
     * nothing in the members area calls it: the login page posts to
     * /api/users/login and that is the last auth request of the session.
     * (/admin does renew, which is why the 2-hour default was only ever
     * felt by members and never by an admin.) So a member is signed out 30
     * days after logging in however active they have been in between, and
     * making that a rolling window means adding the refresh call — not
     * raising this number.
     */
    tokenExpiration: 60 * 60 * 24 * 30,
    forgotPassword: {
      // No `expiration` here on purpose: a value set on the collection wins
      // over the per-call argument, and the invite endpoint needs to ask for
      // a 7-day token while ordinary resets stay at the 1-hour default.
      generateEmailSubject: (args) =>
        args?.user?.invitePending ? '邀請你成為野馬營作者' : '重設你的野馬營密碼',
      generateEmailHTML: (args) => {
        const link = inviteLinkFor(
          args?.req?.payload.config.serverURL ?? '',
          args?.token ?? '',
        )
        if (args?.user?.invitePending) {
          return inviteEmailHTML(link)
        }
        return `
          <p>我們收到重設「野馬營」密碼的請求。</p>
          <p><a href="${link}">${link}</a></p>
          <p>如果不是你本人操作，忽略這封信即可，密碼不會變更。</p>
        `
      },
    },
  },
  access: {
    read: isAdminOrSelf,
    create: async ({ req }) => {
      if (isAdminUser(req.user)) return true
      // A logged-in member must not be able to mint further accounts.
      if (req.user) return false

      // Bootstrap: the very first user of an empty install.
      const existing = await req.payload.find({
        collection: 'users',
        limit: 1,
        depth: 0,
        overrideAccess: true,
      })
      return existing.totalDocs === 0
    },
    update: isAdminOrSelf,
    delete: isAdmin,
  },
  hooks: {
    beforeChange: [ensureFirstUserIsAdmin],
    afterChange: [ensureAuthorIdentity],
    afterLogin: [clearInvitePending],
  },
  fields: [
    {
      name: 'displayName',
      type: 'text',
      label: { en: 'Display Name', 'zh-TW': '顯示名稱' },
      admin: {
        description:
          'Seeds the author alias shown on the site. The alias itself lives on the author record.',
      },
    },
    {
      name: 'author',
      type: 'relationship',
      relationTo: 'authors',
      label: { en: 'Author', 'zh-TW': '作者' },
      access: {
        create: isAdminFieldLevel,
        update: isAdminFieldLevel,
      },
      admin: {
        position: 'sidebar',
        description:
          'Byline this account publishes under. Created automatically; edit the alias on the author record itself.',
      },
    },
    {
      name: 'invitePending',
      type: 'checkbox',
      label: { en: 'Invite Pending', 'zh-TW': '邀請待確認' },
      defaultValue: false,
      access: {
        create: isAdminFieldLevel,
        update: isAdminFieldLevel,
      },
      admin: {
        position: 'sidebar',
        readOnly: true,
        description: 'Cleared automatically the first time they sign in.',
      },
    },
    {
      name: 'invitedAt',
      type: 'date',
      label: { en: 'Invited At', 'zh-TW': '邀請時間' },
      access: {
        create: isAdminFieldLevel,
        update: isAdminFieldLevel,
      },
      admin: { position: 'sidebar', readOnly: true },
    },
    {
      name: 'invitedBy',
      type: 'relationship',
      relationTo: 'users',
      label: { en: 'Invited By', 'zh-TW': '邀請人' },
      access: {
        create: isAdminFieldLevel,
        update: isAdminFieldLevel,
      },
      admin: { position: 'sidebar', readOnly: true },
    },
    {
      name: 'storageQuotaMb',
      type: 'number',
      label: { en: 'Storage Quota (MB)', 'zh-TW': '儲存空間配額（MB）' },
      min: 0,
      access: {
        create: isAdminFieldLevel,
        update: isAdminFieldLevel,
      },
      admin: {
        position: 'sidebar',
        description: `Overrides the default (${process.env.MEMBER_STORAGE_QUOTA_MB ?? '10240'} MB) for this account. Leave blank to use the default.`,
      },
    },
    {
      name: 'role',
      type: 'select',
      label: { en: 'Role', 'zh-TW': '角色' },
      required: true,
      defaultValue: 'member',
      options: [
        { label: { en: 'Admin', 'zh-TW': '管理員' }, value: 'admin' },
        { label: { en: 'Member', 'zh-TW': '會員' }, value: 'member' },
      ],
      saveToJWT: true,
      access: {
        create: isAdminFieldLevel,
        update: isAdminFieldLevel,
      },
      admin: {
        position: 'sidebar',
        description: 'Admins manage everything; members only their own content.',
      },
    },
  ],
  versions: false,
}
