/* THIS FILE WAS GENERATED AUTOMATICALLY BY PAYLOAD. */
/* DO NOT MODIFY IT BECAUSE IT COULD BE REWRITTEN AT ANY TIME. */
import config from '@payload-config'
import '@payloadcms/next/css'
import type { ServerFunctionClient } from 'payload'
import { handleServerFunctions, RootLayout } from '@payloadcms/next/layouts'
import React from 'react'

import { importMap } from './admin/importMap.js'
import './custom.css'

type Args = {
  children: React.ReactNode
}

const serverFunction: ServerFunctionClient = async function (args) {
  'use server'
  return handleServerFunctions({
    ...args,
    config,
    importMap,
  })
}

/**
 * Separate root layout for /admin so site chrome (theme, framer-motion, etc.)
 * does not wrap Payload and cause DOM insertBefore / hydration crashes.
 *
 * `RootLayout` renders its own <html lang={languageCode}> and <body> — do not
 * add another pair around it. A hand-written <html><body> wrapper lived here
 * and produced a nested <html> inside <body> on every admin page: React logged
 * "cannot be a child of <body>", remounted html and body, and failed
 * hydration, so the whole admin tree was thrown away and rebuilt client-side.
 * It also pinned the outer lang to "en", which is what made the panel look
 * like an i18n bug. The route group alone is what keeps site chrome out —
 * `(site)/layout.tsx` is a sibling and never wraps /admin.
 */
const Layout = ({ children }: Args) => (
  <RootLayout config={config} importMap={importMap} serverFunction={serverFunction}>
    {children}
  </RootLayout>
)

export default Layout
