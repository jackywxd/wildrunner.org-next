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

/**
 * The Six Star badge's interior — six discs in a ring, not terrain.
 *
 * A SECOND RENDERER RATHER THAN A SEVENTH MOTIF. `Motif` is a list of
 * terrains, and the six majors are not a place; giving this a motif value
 * would make the badge claim to be a race with unusual scenery. It is an
 * achievement, and it is the only badge on the site that is.
 *
 * The shape is Abbott's own medal: six city medallions around a hub. Six
 * plain discs at 60° is as much of that as survives a 64x64 viewBox — the
 * skylines stamped on the real ones are illegible below about 200px, and
 * drawing them anyway is how a badge turns into grey mush.
 *
 * No text inside the art. Every race badge carries an abbreviation because
 * one ridge cannot tell 100 races apart; there is exactly one of these, and
 * six discs already say which.
 *
 * AND NO SIZE FALLBACK, unlike the terrain renderer. That one hides the
 * ridge below 44px because it turns to noise behind the abbreviation —
 * there is no abbreviation here, and rendered at 32px the six discs are
 * still plainly six discs. Checked by looking at both, not assumed: a lone
 * numeral in their place was the weaker of the two.
 */
export const renderSixMajorsArt: BadgeArtRenderer = (token) => {
  return (
    <>
      <rect fill={token.primary} height={BADGE_ART_HEIGHT} width={64} x={0} y={0} />
      <circle cx={32.0} cy={7.5} fill={token.ink} opacity={0.92} r={6.2} />
      <circle cx={43.7} cy={14.2} fill={token.ink} opacity={0.92} r={6.2} />
      <circle cx={43.7} cy={27.8} fill={token.ink} opacity={0.92} r={6.2} />
      <circle cx={32.0} cy={34.5} fill={token.ink} opacity={0.92} r={6.2} />
      <circle cx={20.3} cy={27.8} fill={token.ink} opacity={0.92} r={6.2} />
      <circle cx={20.3} cy={14.2} fill={token.ink} opacity={0.92} r={6.2} />
      <circle cx={32} cy={21} fill={token.secondary} r={7.4} />
    </>
  );
};
