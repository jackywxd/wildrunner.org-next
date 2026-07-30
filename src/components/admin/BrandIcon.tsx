import React from 'react'

/**
 * The mark shown in the admin navigation.
 *
 * Self-contained on purpose — purple ground, light horse — so it reads on
 * either admin theme without inheriting anything. Kept in sync with
 * public/static/brand/mark-purple.svg, which SiteLogo also uses.
 *
 * Inlined rather than an <img> only for consistency with BrandLogo, which
 * has to be inline to pick up currentColor.
 */
export function BrandIcon() {
  return (
    <svg
      role="img"
      aria-label="野馬營"
      data-testid="brand-icon"
      viewBox="0 0 120 120"
      width="100%"
      height="100%"
    >
      <rect width="120" height="120" fill="#8A3FFA" />
      <g transform="translate(60 62) rotate(-13) scale(0.66) translate(-74 -60)">
        <g fill="#F3F2F2">
          <path d="M10 72 L34 44 L52 26 L54 26 L60 12 L66 25 L69 24 L78 14 L81 31 L84 46 L92 70 L104 108 L56 108 L44 80 L26 80 L16 86 Z" />
          <path d="M88 32 L126 18 L128 30 L90 44 Z M96 52 L132 40 L134 52 L98 64 Z M104 74 L136 64 L138 76 L106 86 Z" />
        </g>
      </g>
    </svg>
  )
}
