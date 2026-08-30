import { expect, test } from "@playwright/test";

import { emWidth, fitBandLabel } from "@/lib/races/badge-band";
import { BADGE_BAND_WIDTH } from "@/lib/races/badge-contract";

/**
 * U-BAND — the distance label is made to fit the badge, at every length.
 *
 * WHAT THIS IS FOR. The badge draws its label centred in a 64-unit frame, and
 * an `<svg>` root clips at its own edge — so a label wider than the frame did
 * not overflow anywhere visible, it was sliced at both ends and drawn at full
 * size. 「Monte Rosa Trail」 rendered as 「nte Rosa T」 on the riders page and
 * nothing about it looked like a bug worth chasing; it looked like a badge.
 *
 * That is the failure this pins, and it is the reason the assertions are
 * about *width* rather than about any particular string. The rule is "no
 * label is ever wider than the band", and 222 of the 344 distance labels in
 * the seed data used to break it. A test naming two of them would go green
 * the moment somebody adds a third.
 *
 * WIDTH IS ESTIMATED, AND THAT IS THE POINT. There is no text-metrics API on
 * the server, so `emWidth` is the same estimate the fitter uses. That makes
 * this a test of the fitter's arithmetic, not of a browser's typesetting —
 * which is the only one of the two that is ours. What a real font does with
 * 0.6em is the vendor's, and §0 says not to test it.
 */
const fits = (result: { fontSize: number; text: string }) =>
  emWidth(result.text) * result.fontSize <= BADGE_BAND_WIDTH;

test("U-BAND-1: a short label is left exactly as it is", () => {
  // The case that must not pay for the fix. 「42K」 is most of the catalogue,
  // it already fitted, and a fitter that shrank or stretched it would have
  // made 222 badges better and a hundred worse.
  const band = fitBandLabel("42K", "", 13);
  expect(band).toEqual({ fontSize: 13, text: "42K" });
});

test("U-BAND-2: a label that overflows is shrunk, not cut", () => {
  // The majority case, and the reason shrinking comes first: 「20K Quinde」
  // is over the frame at 13 but whole at 9.7, and cutting it to fit at 13
  // would throw away half a name to solve a problem it does not have.
  const band = fitBandLabel("20K Quinde", "", 13);
  expect(band.text).toBe("20K Quinde");
  expect(band.fontSize).toBeLessThan(13);
  expect(fits(band)).toBe(true);
});

test("U-BAND-3: a label too long to shrink is cut, and says so", () => {
  const band = fitBandLabel("Western States 100-Mile Endurance Run", "", 13);
  // The ellipsis is the assertion. Shrinking this far is a grey smear, and a
  // smear and a slice are equally unreadable — the difference is that one of
  // them tells the reader the name continues.
  expect(band.text.endsWith("…")).toBe(true);
  expect(band.text.startsWith("Western")).toBe(true);
  expect(fits(band)).toBe(true);
});

test("U-BAND-4: the year survives a cut that the race name does not", () => {
  // The wrong answer this could give. Year and label share one band, so a
  // fitter that treated them as one string would spend its last characters
  // on the name and drop 「2024」 — the half of a badge a reader cannot
  // infer from the artwork.
  const band = fitBandLabel("Western States 100-Mile Endurance Run", " 2024", 11);
  expect(band.text.endsWith("… 2024")).toBe(true);
  expect(fits(band)).toBe(true);
});

test("U-BAND-5: CJK is measured as full-width, not as latin", () => {
  // A distance is named by whoever edits it in /admin, on a site whose copy
  // is Traditional Chinese throughout. At 0.6em per character this string is
  // measured as two thirds of its real width and sails past the fitter into
  // the clipping this whole module exists to end.
  const band = fitBandLabel("越野跑 50 公里", "", 13);
  expect(fits(band)).toBe(true);
  expect(band.fontSize).toBeLessThan(13);
});

test("U-BAND-6: no label in the catalogue is wider than the band", () => {
  // The corpus assertion. The five above name strings a change could route
  // around; this one is the property itself, over every shape the catalogue
  // actually holds — a route name, a bare distance, an accented one, the
  // longest there is, and the empty string a missing label would arrive as.
  const labels = [
    "",
    "42K",
    "100M",
    "20K Quinde",
    "BELLA VISTA 55K",
    "Monte Rosa Trail",
    "CPS - Camins de Pedra en Sec",
    "Ultra Trail Métropole Nice Côte d'Azur 100M",
    "越野跑 50 公里",
  ];

  for (const label of labels) {
    for (const suffix of ["", " 2024"]) {
      const band = fitBandLabel(label, suffix, suffix ? 11 : 13);
      expect(fits(band), `${label || "(empty)"}${suffix}`).toBe(true);
      expect(band.fontSize, `${label || "(empty)"}${suffix}`).toBeGreaterThan(0);
    }
  }
});
