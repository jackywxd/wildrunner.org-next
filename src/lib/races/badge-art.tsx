/**
 * MOCKUP badge artwork — owned by the badge artwork track.
 *
 * Placeholder implementation of `BadgeArtRenderer`. Replace the body freely;
 * the signature is the contract (badge-contract.ts) and must not move.
 *
 * The final version is cartoon-styled: heavy outlines, flat fills, simplified
 * geometry. This one is flat fills and a ridge, which is enough to verify
 * layout, contrast and density at both rendered sizes.
 */

import type { BadgeArtRenderer } from "./badge-contract";
import { BADGE_ART_HEIGHT } from "./badge-contract";
import { motifPath } from "./motifs";

export const renderBadgeArt: BadgeArtRenderer = (token, size) => {
  // At directory size the abbreviation is the only thing that survives, so
  // the terrain is dropped rather than drawn as noise behind it.
  const terrainReadable = size >= 44;

  return (
    <>
      <rect
        fill={token.primary}
        height={BADGE_ART_HEIGHT}
        width={64}
        x={0}
        y={0}
      />
      {terrainReadable && (
        <path d={motifPath(token.motif)} fill={token.secondary} />
      )}
      <text
        dominantBaseline="central"
        fill={token.ink}
        fontFamily="inherit"
        fontSize={terrainReadable ? 15 : 22}
        fontWeight={900}
        textAnchor="middle"
        x={32}
        y={terrainReadable ? 32 : 22}
      >
        {token.abbr}
      </text>
    </>
  );
};
