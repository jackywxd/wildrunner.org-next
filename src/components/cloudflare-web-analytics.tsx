import Script from "next/script";

/**
 * Manual Cloudflare Web Analytics beacon.
 * Set NEXT_PUBLIC_CF_WEB_ANALYTICS_TOKEN from the Cloudflare dashboard
 * (Analytics & Logs → Web Analytics → JS snippet token).
 * When the site is proxied through Cloudflare, automatic injection can replace this.
 */
export function CloudflareWebAnalytics() {
  const token = process.env.NEXT_PUBLIC_CF_WEB_ANALYTICS_TOKEN;
  if (!token) return null;

  return (
    <Script
      defer
      src="https://static.cloudflareinsights.com/beacon.min.js"
      data-cf-beacon={JSON.stringify({ token })}
      strategy="afterInteractive"
    />
  );
}
