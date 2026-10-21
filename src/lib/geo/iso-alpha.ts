/**
 * ISO 3166-1 alpha-2 <-> alpha-3, as a static table.
 *
 * Two parts of the system speak different dialects of the same standard, and
 * neither can be changed to match the other. `race-events.country` stores
 * alpha-3 (`FRA`) — the catalogue CSVs, the badge, the validator all say so.
 * Nominatim answers in alpha-2 (`fr`), and so does the model when it is asked
 * which country a place is in. Geocoding is where the two have to meet, so the
 * conversion lives here once, in both directions.
 *
 * WHY A TABLE AND NOT `Intl`. `Intl.DisplayNames` can name a region from an
 * alpha-2 code but never hands back an alpha-3, and a lookup that works in
 * Node and not in a Worker (or the reverse) is exactly the kind of thing that
 * passes in the test lane and fails when it ships. A 249-line constant has no
 * runtime to differ between.
 *
 * WHY A WRONG ROW IS WORSE THAN A MISSING ONE. This table fills in
 * `race-events.country` when the event had none, and it is also what pins a
 * geocode to a country (`countrycodes=`) — the guard that stops an AI-supplied
 * place name from landing on a namesake in another country. A swapped pair
 * would restrict Valdivia (Chile) to Argentina and then report "not found"; a
 * pair that is merely absent just skips the guard's country and the event is
 * left without one, which the admin can see. `U-GEO-T4` checks that the table
 * is a bijection and spot-checks the countries this club actually races in.
 */

// alpha-2 then alpha-3, space separated pairs. One string rather than an
// object literal so a row is one short token and a reviewer can scan the
// alpha-3 column for a typo.
const PAIRS = `
AD AND, AE ARE, AF AFG, AG ATG, AI AIA, AL ALB, AM ARM, AO AGO, AQ ATA, AR ARG,
AS ASM, AT AUT, AU AUS, AW ABW, AX ALA, AZ AZE, BA BIH, BB BRB, BD BGD, BE BEL,
BF BFA, BG BGR, BH BHR, BI BDI, BJ BEN, BL BLM, BM BMU, BN BRN, BO BOL, BQ BES,
BR BRA, BS BHS, BT BTN, BV BVT, BW BWA, BY BLR, BZ BLZ, CA CAN, CC CCK, CD COD,
CF CAF, CG COG, CH CHE, CI CIV, CK COK, CL CHL, CM CMR, CN CHN, CO COL, CR CRI,
CU CUB, CV CPV, CW CUW, CX CXR, CY CYP, CZ CZE, DE DEU, DJ DJI, DK DNK, DM DMA,
DO DOM, DZ DZA, EC ECU, EE EST, EG EGY, EH ESH, ER ERI, ES ESP, ET ETH, FI FIN,
FJ FJI, FK FLK, FM FSM, FO FRO, FR FRA, GA GAB, GB GBR, GD GRD, GE GEO, GF GUF,
GG GGY, GH GHA, GI GIB, GL GRL, GM GMB, GN GIN, GP GLP, GQ GNQ, GR GRC, GS SGS,
GT GTM, GU GUM, GW GNB, GY GUY, HK HKG, HM HMD, HN HND, HR HRV, HT HTI, HU HUN,
ID IDN, IE IRL, IL ISR, IM IMN, IN IND, IO IOT, IQ IRQ, IR IRN, IS ISL, IT ITA,
JE JEY, JM JAM, JO JOR, JP JPN, KE KEN, KG KGZ, KH KHM, KI KIR, KM COM, KN KNA,
KP PRK, KR KOR, KW KWT, KY CYM, KZ KAZ, LA LAO, LB LBN, LC LCA, LI LIE, LK LKA,
LR LBR, LS LSO, LT LTU, LU LUX, LV LVA, LY LBY, MA MAR, MC MCO, MD MDA, ME MNE,
MF MAF, MG MDG, MH MHL, MK MKD, ML MLI, MM MMR, MN MNG, MO MAC, MP MNP, MQ MTQ,
MR MRT, MS MSR, MT MLT, MU MUS, MV MDV, MW MWI, MX MEX, MY MYS, MZ MOZ, NA NAM,
NC NCL, NE NER, NF NFK, NG NGA, NI NIC, NL NLD, NO NOR, NP NPL, NR NRU, NU NIU,
NZ NZL, OM OMN, PA PAN, PE PER, PF PYF, PG PNG, PH PHL, PK PAK, PL POL, PM SPM,
PN PCN, PR PRI, PS PSE, PT PRT, PW PLW, PY PRY, QA QAT, RE REU, RO ROU, RS SRB,
RU RUS, RW RWA, SA SAU, SB SLB, SC SYC, SD SDN, SE SWE, SG SGP, SH SHN, SI SVN,
SJ SJM, SK SVK, SL SLE, SM SMR, SN SEN, SO SOM, SR SUR, SS SSD, ST STP, SV SLV,
SX SXM, SY SYR, SZ SWZ, TC TCA, TD TCD, TF ATF, TG TGO, TH THA, TJ TJK, TK TKL,
TL TLS, TM TKM, TN TUN, TO TON, TR TUR, TT TTO, TV TUV, TW TWN, TZ TZA, UA UKR,
UG UGA, UM UMI, US USA, UY URY, UZ UZB, VA VAT, VC VCT, VE VEN, VG VGB, VI VIR,
VN VNM, VU VUT, WF WLF, WS WSM, YE YEM, YT MYT, ZA ZAF, ZM ZMB, ZW ZWE
`

const ENTRIES: [string, string][] = PAIRS.split(',')
  .map((pair) => pair.trim().split(/\s+/) as [string, string])
  .filter((pair) => pair.length === 2 && pair[0] !== '')

const ALPHA2_TO_ALPHA3 = new Map<string, string>(ENTRIES)
const ALPHA3_TO_ALPHA2 = new Map<string, string>(ENTRIES.map(([a2, a3]) => [a3, a2]))

/** Every row of the table, for the test that checks its shape. */
export const ISO_ALPHA_ENTRIES: readonly (readonly [string, string])[] = ENTRIES

/**
 * `fr` / `FR` -> `FRA`. `undefined` for anything not in the table — an
 * unknown code must not be guessed at, because the caller writes the answer
 * into `race-events.country`.
 */
export function alpha2ToAlpha3(code: string | null | undefined): string | undefined {
  if (typeof code !== 'string') return undefined
  return ALPHA2_TO_ALPHA3.get(code.trim().toUpperCase())
}

/** `FRA` -> `FR`; the form `countrycodes=` wants (lowercase is added there). */
export function alpha3ToAlpha2(code: string | null | undefined): string | undefined {
  if (typeof code !== 'string') return undefined
  return ALPHA3_TO_ALPHA2.get(code.trim().toUpperCase())
}
