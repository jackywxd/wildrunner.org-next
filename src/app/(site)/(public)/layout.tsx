import type { ReactNode } from "react";
import NextTopLoader from "nextjs-toploader";
import App from "@/components/app";
import PageTransitionEffect from "@/components/transition/PageTransitionEffect";
import { TailwindIndicator } from "@/components/tailwind-indicator";
import { CloudflareWebAnalytics } from "@/components/cloudflare-web-analytics";

/**
 * The public marketing site's chrome: SiteHeader nav, the footer, the route
 * progress bar, page-transition animation, the dev breakpoint badge and
 * analytics — moved here as the one unit they were before, unchanged, so
 * public pages behave exactly as they did (PageTransitionEffect still wraps
 * only the page content, inside App, so the header/footer themselves don't
 * animate on navigation).
 *
 * Split out from (site)/layout.tsx so all of this applies only to the
 * actual public pages (home, about, posts, gallery). (site)/layout.tsx
 * still owns <html>, fonts, the anti-FOUC theme script and Providers —
 * those stay shared with every route under (site), including
 * /design-preview and the future /members area, which intentionally do NOT
 * want the public nav and marketing footer stacked on top of their own
 * shell.
 */
export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <App>
      <NextTopLoader showSpinner={false} />
      <PageTransitionEffect>{children}</PageTransitionEffect>
      <TailwindIndicator />
      <CloudflareWebAnalytics />
    </App>
  );
}
