/**
 * GENERATED FILE — DO NOT EDIT.
 *
 * Produced from data/race-events.csv and data/race-categories.csv by
 * `pnpm tsx scripts/csv-to-seed.ts`. Edit the CSVs, which are the artefact
 * a human reviews, and regenerate.
 *
 * It exists because migrations are bundled into the Worker, where there is
 * no filesystem to read a CSV from — see that script's header.
 *
 * 100 events, 394 categories.
 */

export type SeedEvent = {
  country?: string;
  itraUrl?: string;
  key: string;
  name: string;
  nameZh?: string;
  series: string;
  source?: string;
  verifiedAt?: string;
  website?: string;
};

export type SeedCategory = {
  distanceKm?: number;
  elevationGainM?: number;
  eventKey: string;
  key: string;
  label: string;
  order: number;
  source?: string;
  verified: boolean;
  verifiedAt?: string;
};

export const SEED_EVENTS: SeedEvent[] = [
  {
    "country": "GBR",
    "key": "utmb-arc-of-attrition",
    "name": "Arc of Attrition",
    "series": "utmb",
    "website": "https://arcofattrition.utmb.world/"
  },
  {
    "country": "ITA",
    "key": "utmb-chianti",
    "name": "Chianti Ultra Trail",
    "series": "utmb",
    "website": "https://chianti.utmb.world/"
  },
  {
    "country": "ESP",
    "key": "utmb-tenerife",
    "name": "Tenerife Bluetrail",
    "series": "utmb",
    "website": "https://tenerife.utmb.world/"
  },
  {
    "country": "HRV",
    "key": "utmb-istria",
    "name": "Istria 100",
    "series": "utmb",
    "website": "https://istria.utmb.world/"
  },
  {
    "country": "FRA",
    "key": "utmb-ventoux",
    "name": "Trail du Ventoux",
    "series": "utmb",
    "website": "https://ventoux.utmb.world/"
  },
  {
    "country": "PRT",
    "key": "utmb-oh-my-deus",
    "name": "Oh Meu Deus",
    "series": "utmb",
    "source": "https://ohmeudeus.utmb.world/",
    "verifiedAt": "2026-08-05",
    "website": "https://ohmeudeus.utmb.world/"
  },
  {
    "country": "FRA",
    "key": "utmb-alsace",
    "name": "Alsace Grand Est",
    "series": "utmb",
    "source": "https://alsace.utmb.world/",
    "verifiedAt": "2026-08-05",
    "website": "https://alsace.utmb.world/"
  },
  {
    "country": "GBR",
    "key": "utmb-snowdonia",
    "name": "Eryri by UTMB",
    "series": "utmb",
    "source": "https://eryri.utmb.world/",
    "verifiedAt": "2026-08-05",
    "website": "https://eryri.utmb.world/"
  },
  {
    "country": "AUT",
    "key": "utmb-mozart",
    "name": "Mozart 100",
    "series": "utmb",
    "source": "https://mozart.utmb.world/",
    "verifiedAt": "2026-08-05",
    "website": "https://mozart.utmb.world/"
  },
  {
    "country": "AND",
    "key": "utmb-andorra",
    "name": "Andorra Trail 100",
    "series": "utmb",
    "source": "https://andorra.utmb.world/",
    "verifiedAt": "2026-08-05",
    "website": "https://andorra.utmb.world/"
  },
  {
    "country": "FRA",
    "key": "utmb-saint-jacques",
    "name": "Saint-Jacques",
    "series": "utmb",
    "source": "https://saint-jacques.utmb.world/",
    "verifiedAt": "2026-08-05",
    "website": "https://saint-jacques.utmb.world/"
  },
  {
    "country": "DEU",
    "key": "utmb-zugspitz",
    "name": "Zugspitz Ultratrail",
    "series": "utmb",
    "website": "https://zugspitz.utmb.world/"
  },
  {
    "country": "ITA",
    "key": "utmb-lavaredo",
    "name": "Lavaredo Ultra Trail",
    "series": "utmb",
    "website": "https://lavaredo.utmb.world/"
  },
  {
    "country": "ESP",
    "key": "utmb-val-daran",
    "name": "Val d'Aran",
    "series": "utmb",
    "source": "https://valdaran.utmb.world/",
    "verifiedAt": "2026-08-05",
    "website": "https://valdaran.utmb.world/"
  },
  {
    "country": "FRA",
    "key": "utmb-restonica",
    "name": "Restonica Trail",
    "series": "utmb",
    "source": "https://restonica.utmb.world/",
    "verifiedAt": "2026-08-05",
    "website": "https://restonica.utmb.world/"
  },
  {
    "country": "CHE",
    "key": "utmb-verbier",
    "name": "Verbier Saint-Bernard",
    "series": "utmb",
    "source": "https://verbier.utmb.world/",
    "verifiedAt": "2026-08-05",
    "website": "https://verbier.utmb.world/"
  },
  {
    "country": "CHE",
    "key": "utmb-eiger",
    "name": "Eiger Ultra Trail",
    "series": "utmb",
    "website": "https://eiger.utmb.world/"
  },
  {
    "country": "ITA",
    "key": "utmb-mrww",
    "name": "Monterosa Walserwaeg",
    "series": "utmb",
    "source": "https://mrww.utmb.world/",
    "verifiedAt": "2026-08-05",
    "website": "https://mrww.utmb.world/"
  },
  {
    "country": "ROU",
    "key": "utmb-bucovina",
    "name": "Bucovina Ultra Rocks",
    "series": "utmb",
    "source": "https://bucovina.utmb.world/",
    "verifiedAt": "2026-08-05",
    "website": "https://bucovina.utmb.world/"
  },
  {
    "country": "LVA",
    "key": "utmb-gauja",
    "name": "Gauja Trail",
    "series": "utmb",
    "source": "https://gauja.utmb.world/",
    "verifiedAt": "2026-08-05",
    "website": "https://gauja.utmb.world/"
  },
  {
    "country": "AUT",
    "key": "utmb-kat100",
    "name": "KAT100",
    "series": "utmb",
    "source": "https://kat.utmb.world/",
    "verifiedAt": "2026-08-05",
    "website": "https://kat.utmb.world/"
  },
  {
    "country": "FRA",
    "key": "utmb-mont-blanc",
    "name": "UTMB Mont-Blanc",
    "nameZh": "UTMB 白朗峰",
    "series": "utmb",
    "source": "https://montblanc.utmb.world/",
    "verifiedAt": "2026-08-05",
    "website": "https://montblanc.utmb.world/"
  },
  {
    "country": "CHE",
    "key": "utmb-wildstrubel",
    "name": "Wildstrubel",
    "series": "utmb",
    "source": "https://wildstrubel.utmb.world/",
    "verifiedAt": "2026-08-05",
    "website": "https://wildstrubel.utmb.world/"
  },
  {
    "country": "TUR",
    "key": "utmb-kackar",
    "name": "Kaçkar by UTMB",
    "series": "utmb",
    "source": "https://kackar.utmb.world/",
    "verifiedAt": "2026-08-05",
    "website": "https://kackar.utmb.world/"
  },
  {
    "country": "SVN",
    "key": "utmb-julian-alps",
    "name": "Julian Alps Trail Run",
    "series": "utmb",
    "source": "https://julianalps.utmb.world/",
    "verifiedAt": "2026-08-05",
    "website": "https://julianalps.utmb.world/"
  },
  {
    "country": "FRA",
    "key": "utmb-nice",
    "name": "Nice Côte d'Azur",
    "series": "utmb",
    "source": "https://nice.utmb.world/",
    "verifiedAt": "2026-08-05",
    "website": "https://nice.utmb.world/"
  },
  {
    "country": "SWE",
    "key": "utmb-kullamannen",
    "name": "Kullamannen",
    "series": "utmb",
    "source": "https://kullamannen.utmb.world/",
    "verifiedAt": "2026-08-05",
    "website": "https://kullamannen.utmb.world/"
  },
  {
    "country": "ESP",
    "key": "utmb-mallorca",
    "name": "Mallorca Serra de Tramuntana",
    "series": "utmb",
    "source": "https://mallorca.utmb.world/",
    "verifiedAt": "2026-08-05",
    "website": "https://mallorca.utmb.world/"
  },
  {
    "country": "NZL",
    "key": "utmb-tarawera",
    "name": "Tarawera Ultra-Trail",
    "series": "utmb",
    "website": "https://tarawera.utmb.world/"
  },
  {
    "country": "AUS",
    "key": "utmb-australia",
    "name": "Ultra-Trail Australia",
    "series": "utmb",
    "source": "https://uta.utmb.world/",
    "verifiedAt": "2026-08-05",
    "website": "https://uta.utmb.world/"
  },
  {
    "country": "AUS",
    "key": "utmb-kosciuszko",
    "name": "Kosciuszko by UTMB",
    "series": "utmb",
    "website": "https://kosciuszko.utmb.world/"
  },
  {
    "country": "MEX",
    "key": "utmb-puerto-vallarta",
    "name": "Puerto Vallarta México",
    "series": "utmb",
    "source": "https://puerto-vallarta.utmb.world/",
    "verifiedAt": "2026-08-05",
    "website": "https://puerto-vallarta.utmb.world/"
  },
  {
    "country": "USA",
    "key": "utmb-desert-rats",
    "name": "Desert RATS",
    "series": "utmb",
    "source": "https://desertrats.utmb.world/",
    "verifiedAt": "2026-08-05",
    "website": "https://desertrats.utmb.world/"
  },
  {
    "country": "USA",
    "key": "utmb-canyons",
    "name": "Canyons Endurance Runs",
    "series": "utmb",
    "website": "https://canyons.utmb.world/"
  },
  {
    "country": "USA",
    "key": "utmb-rothrock",
    "name": "Rothrock Trail Challenge",
    "series": "utmb",
    "source": "https://rothrock.utmb.world/",
    "verifiedAt": "2026-08-05",
    "website": "https://rothrock.utmb.world/"
  },
  {
    "country": "USA",
    "key": "utmb-western-states",
    "name": "Western States 100",
    "nameZh": "西部 100",
    "series": "utmb",
    "source": "https://www.wser.org/",
    "verifiedAt": "2026-08-05",
    "website": "https://www.wser.org/"
  },
  {
    "country": "USA",
    "key": "utmb-speedgoat",
    "name": "Speedgoat Mountain Races",
    "series": "utmb",
    "source": "https://speedgoat.utmb.world/",
    "verifiedAt": "2026-08-05",
    "website": "https://speedgoat.utmb.world/"
  },
  {
    "country": "CAN",
    "key": "utmb-borealys",
    "name": "Boréalys Mont-Tremblant",
    "series": "utmb",
    "source": "https://borealys.utmb.world/",
    "verifiedAt": "2026-08-05",
    "website": "https://borealys.utmb.world/"
  },
  {
    "country": "CAN",
    "key": "utmb-whistler",
    "name": "Ultra Trail Whistler",
    "nameZh": "威士拿 UTMB",
    "series": "utmb",
    "website": "https://whistler.utmb.world/"
  },
  {
    "country": "USA",
    "key": "utmb-grindstone",
    "name": "Grindstone Trail Running Festival",
    "series": "utmb",
    "source": "https://grindstone.utmb.world/",
    "verifiedAt": "2026-08-05",
    "website": "https://grindstone.utmb.world/"
  },
  {
    "country": "USA",
    "key": "utmb-kodiak",
    "name": "Kodiak Ultra Marathons",
    "series": "utmb",
    "source": "https://kodiak.utmb.world/",
    "verifiedAt": "2026-08-05",
    "website": "https://kodiak.utmb.world/"
  },
  {
    "country": "USA",
    "key": "utmb-pacific-trails",
    "name": "Pacific Trails Ultra",
    "series": "utmb",
    "source": "https://pacifictrails.utmb.world/",
    "verifiedAt": "2026-08-05",
    "website": "https://pacifictrails.utmb.world/"
  },
  {
    "country": "ARG",
    "key": "utmb-valholl",
    "name": "Ushuaia by UTMB",
    "series": "utmb",
    "source": "https://ushuaia.utmb.world/",
    "verifiedAt": "2026-08-05",
    "website": "https://ushuaia.utmb.world/"
  },
  {
    "country": "BRA",
    "key": "utmb-torrencial",
    "name": "Torrencial Trail",
    "series": "utmb",
    "source": "https://torrencial.utmb.world/races",
    "verifiedAt": "2026-08-05",
    "website": "https://torrencial.utmb.world/races"
  },
  {
    "country": "ECU",
    "key": "utmb-quito",
    "name": "Quito Trail",
    "series": "utmb",
    "source": "https://quito.utmb.world/",
    "verifiedAt": "2026-08-05",
    "website": "https://quito.utmb.world/"
  },
  {
    "country": "BRA",
    "key": "utmb-paraty",
    "name": "Paraty Brazil",
    "series": "utmb",
    "source": "https://paraty.utmb.world/",
    "verifiedAt": "2026-08-05",
    "website": "https://paraty.utmb.world/"
  },
  {
    "country": "ARG",
    "key": "utmb-bariloche",
    "name": "Bariloche by UTMB",
    "series": "utmb",
    "source": "https://bariloche.utmb.world/",
    "verifiedAt": "2026-08-05",
    "website": "https://bariloche.utmb.world/"
  },
  {
    "country": "TWN",
    "key": "utmb-kenting",
    "name": "Xtrail Kenting",
    "nameZh": "墾丁",
    "series": "utmb",
    "source": "https://xtrail.utmb.world/",
    "verifiedAt": "2026-08-05",
    "website": "https://xtrail.utmb.world/"
  },
  {
    "country": "CHN",
    "key": "utmb-xiamen",
    "name": "Xiamen by UTMB",
    "nameZh": "廈門",
    "series": "utmb",
    "source": "https://xiamen.utmb.world/",
    "verifiedAt": "2026-08-05",
    "website": "https://xiamen.utmb.world/"
  },
  {
    "country": "CHN",
    "key": "utmb-mogan",
    "name": "Ultra-Trail Mogan",
    "nameZh": "莫干山",
    "series": "utmb",
    "source": "https://mogan.utmb.world/",
    "verifiedAt": "2026-08-05",
    "website": "https://mogan.utmb.world/"
  },
  {
    "country": "THA",
    "key": "utmb-amazean",
    "name": "Amazean Jungle Thailand",
    "series": "utmb",
    "source": "https://amazean.utmb.world/",
    "verifiedAt": "2026-08-05",
    "website": "https://amazean.utmb.world/"
  },
  {
    "country": "JPN",
    "key": "utmb-kagaspa",
    "name": "Kaga Spa Trail Endurance 100",
    "series": "utmb",
    "source": "https://kagaspa.utmb.world/",
    "verifiedAt": "2026-08-05",
    "website": "https://kagaspa.utmb.world/"
  },
  {
    "country": "MYS",
    "key": "utmb-malaysia",
    "name": "Malaysia Ultra-Trail",
    "series": "utmb",
    "source": "https://malaysia.utmb.world/",
    "verifiedAt": "2026-08-05",
    "website": "https://malaysia.utmb.world/"
  },
  {
    "country": "OMN",
    "key": "utmb-oman",
    "name": "Oman by UTMB",
    "series": "utmb",
    "source": "https://oman.utmb.world/",
    "verifiedAt": "2026-08-05",
    "website": "https://oman.utmb.world/"
  },
  {
    "country": "MUS",
    "key": "utmb-mauritius",
    "name": "Mauritius Ultra-Trail",
    "series": "utmb",
    "source": "unresolved: mauritius.utmb.world 302s to utmb.world and the event is absent from UTMB's official list"
  },
  {
    "country": "HKG",
    "key": "wtm-hk100",
    "name": "Anta Guanjun Hong Kong 100",
    "nameZh": "香港 100",
    "series": "wtm",
    "source": "https://ultraracecalendar.com/events/6165/hong-kong-100/",
    "verifiedAt": "2026-08-05",
    "website": "https://ultraracecalendar.com/events/6165/hong-kong-100/"
  },
  {
    "country": "USA",
    "key": "wtm-black-canyon",
    "name": "Black Canyon Ultras",
    "series": "wtm",
    "source": "https://www.aravaiparunning.com/blackcanyon/",
    "verifiedAt": "2026-08-05",
    "website": "https://www.aravaiparunning.com/blackcanyon/"
  },
  {
    "country": "ESP",
    "key": "wtm-transgrancanaria",
    "name": "The North Face Transgrancanaria",
    "series": "wtm",
    "website": "https://transgrancanaria.net/"
  },
  {
    "country": "JPN",
    "key": "wtm-mt-fuji",
    "name": "Mt. FUJI 100",
    "nameZh": "富士山 100",
    "series": "wtm",
    "source": "https://www.mtfuji100.com/",
    "verifiedAt": "2026-08-05",
    "website": "https://www.mtfuji100.com/"
  },
  {
    "country": "PRT",
    "itraUrl": "https://itra.run/Races/RaceDetails/10959",
    "key": "wtm-miut",
    "name": "Madeira Island Ultra-Trail",
    "series": "wtm",
    "source": "https://itra.run/Races/RaceDetails/10959",
    "verifiedAt": "2026-08-05",
    "website": "https://itra.run/Races/RaceDetails/10959"
  },
  {
    "country": "GBR",
    "itraUrl": "https://itra.run/Races/RaceDetails/106345",
    "key": "wtm-south-downs",
    "name": "South Downs Way 100",
    "series": "wtm",
    "source": "https://www.centurionrunning.com/races/south-downs-way-100-2026",
    "verifiedAt": "2026-08-05",
    "website": "https://www.centurionrunning.com/races/south-downs-way-100-2026"
  },
  {
    "country": "CAN",
    "key": "wtm-quebec-mega-trail",
    "name": "Québec Mega Trail",
    "series": "wtm",
    "source": "https://ultratrailcanada.com/en/",
    "verifiedAt": "2026-08-05",
    "website": "https://ultratrailcanada.com/en/"
  },
  {
    "country": "VNM",
    "key": "wtm-vietnam-mountain",
    "name": "Vietnam Mountain Marathon",
    "series": "wtm",
    "source": "https://vietnamtrailseries.com/mountain-marathon/",
    "verifiedAt": "2026-08-05",
    "website": "https://vietnamtrailseries.com/mountain-marathon/"
  },
  {
    "country": "AUS",
    "key": "wtm-grampians",
    "name": "Grampians Peaks Trail",
    "series": "wtm",
    "source": "https://www.gpt100.com.au/",
    "verifiedAt": "2026-08-05",
    "website": "https://www.gpt100.com.au/"
  },
  {
    "country": "ZAF",
    "key": "wtm-cape-town",
    "name": "RMB Ultra-Trail Cape Town",
    "series": "wtm",
    "website": "https://www.ultratrailcapetown.com/"
  },
  {
    "country": "USA",
    "key": "other-hardrock",
    "name": "Hardrock 100",
    "nameZh": "硬石 100",
    "series": "others",
    "source": "https://hardrock100.com/hardrock-lottery.php",
    "website": "https://hardrock100.com/"
  },
  {
    "country": "USA",
    "key": "other-leadville",
    "name": "Leadville Trail 100",
    "series": "others",
    "source": "https://www.leadvilleraceseries.com/run/leadvilletrail100run/",
    "verifiedAt": "2026-08-05",
    "website": "https://www.leadvilleraceseries.com/run/leadvilletrail100run/"
  },
  {
    "country": "USA",
    "key": "other-badwater",
    "name": "Badwater 135",
    "nameZh": "惡水 135",
    "series": "others",
    "source": "https://www.badwater.com/",
    "verifiedAt": "2026-08-05",
    "website": "https://www.badwater.com/"
  },
  {
    "country": "USA",
    "key": "other-wasatch",
    "name": "Wasatch Front 100",
    "series": "others",
    "source": "https://www.wasatch100.com/",
    "verifiedAt": "2026-08-05",
    "website": "https://www.wasatch100.com/"
  },
  {
    "country": "USA",
    "key": "other-angeles-crest",
    "name": "Angeles Crest 100",
    "series": "others",
    "source": "https://ac100.com/",
    "verifiedAt": "2026-08-05",
    "website": "https://ac100.com/"
  },
  {
    "country": "USA",
    "key": "other-vermont",
    "name": "Vermont 100",
    "series": "others",
    "source": "https://vermont100.com/",
    "verifiedAt": "2026-08-05",
    "website": "https://vermont100.com/"
  },
  {
    "country": "USA",
    "key": "other-barkley",
    "name": "Barkley Marathons",
    "nameZh": "巴克利馬拉松",
    "series": "others",
    "source": "https://www.mattmahoney.net/barkley/faq.html — the Barkley has no official website; entry is by email to a race director whose address is secret",
    "verifiedAt": "2026-08-05"
  },
  {
    "country": "USA",
    "key": "other-cocodona",
    "name": "Cocodona 250",
    "series": "others",
    "source": "https://www.aravaiparunning.com/cocodona/",
    "verifiedAt": "2026-08-05",
    "website": "https://www.aravaiparunning.com/cocodona/"
  },
  {
    "country": "USA",
    "key": "other-moab-240",
    "name": "Moab 240",
    "series": "others",
    "source": "https://www.destinationtrailrun.com/moab",
    "verifiedAt": "2026-08-05",
    "website": "https://www.destinationtrailrun.com/moab"
  },
  {
    "country": "USA",
    "key": "other-bigfoot-200",
    "name": "Bigfoot 200",
    "series": "others",
    "source": "https://www.destinationtrailrun.com/bigfoot",
    "verifiedAt": "2026-08-05",
    "website": "https://www.destinationtrailrun.com/bigfoot"
  },
  {
    "country": "CAN",
    "key": "other-sinister-7",
    "name": "Sinister 7 Ultra",
    "series": "others",
    "source": "https://www.sinistersports.ca/sinister7/",
    "website": "https://www.sinistersports.ca/sinister7/"
  },
  {
    "country": "CAN",
    "key": "other-canadian-death-race",
    "name": "Canadian Death Race",
    "series": "others",
    "source": "https://www.sinistersports.ca/deathrace/",
    "website": "https://www.sinistersports.ca/deathrace/"
  },
  {
    "country": "CAN",
    "key": "other-squamish-50",
    "name": "Squamish 50",
    "series": "others",
    "source": "https://squamish50.com/registration/",
    "website": "https://squamish50.com/"
  },
  {
    "country": "ITA",
    "key": "other-tor-des-geants",
    "name": "Tor des Géants",
    "nameZh": "巨人之旅",
    "series": "others",
    "source": "https://torxtrail.com/tor330-tor-des-geants/",
    "website": "https://torxtrail.com/"
  },
  {
    "country": "FRA",
    "key": "other-templiers",
    "name": "Grand Trail des Templiers",
    "series": "others",
    "source": "https://www.festivaldestempliers.com/",
    "verifiedAt": "2026-08-05",
    "website": "https://www.festivaldestempliers.com/"
  },
  {
    "country": "ESP",
    "key": "other-transvulcania",
    "name": "Transvulcania",
    "nameZh": "橫越火山",
    "series": "others",
    "source": "https://www.transvulcania.com/",
    "verifiedAt": "2026-08-05",
    "website": "https://www.transvulcania.com/"
  },
  {
    "country": "CHE",
    "key": "other-sierre-zinal",
    "name": "Sierre-Zinal",
    "series": "others",
    "source": "https://www.sierre-zinal.com/en/sierre-zinal-2026-dates-2840.html",
    "website": "https://www.sierre-zinal.com/"
  },
  {
    "country": "ESP",
    "key": "other-zegama",
    "name": "Zegama-Aizkorri",
    "series": "others",
    "source": "https://www.zegama-aizkorri.com/",
    "verifiedAt": "2026-08-05",
    "website": "https://www.zegama-aizkorri.com/"
  },
  {
    "country": "ITA",
    "key": "other-trofeo-kima",
    "name": "Trofeo Kima",
    "series": "others",
    "source": "https://www.trofeokima.org/",
    "verifiedAt": "2026-08-05",
    "website": "https://www.trofeokima.org/"
  },
  {
    "country": "CHE",
    "key": "other-ticino-wildlands",
    "name": "Ticino Wildlands",
    "series": "others",
    "source": "https://www.ticino500.ch/",
    "website": "https://www.ticino500.ch/"
  },
  {
    "country": "HKG",
    "key": "other-translantau",
    "name": "Translantau",
    "nameZh": "大嶼山越野賽",
    "series": "utmb",
    "website": "https://translantau.utmb.world/"
  },
  {
    "country": "HKG",
    "key": "other-hk4tuc",
    "name": "Hong Kong Four Trails Ultra Challenge",
    "nameZh": "香港四徑大挑戰",
    "series": "others",
    "source": "https://linktr.ee/hk4tuc",
    "verifiedAt": "2026-08-05",
    "website": "https://linktr.ee/hk4tuc"
  },
  {
    "country": "REU",
    "key": "other-diagonale-des-fous",
    "name": "Grand Raid de la Réunion",
    "nameZh": "瘋人對角線",
    "series": "others",
    "source": "https://la1ere.franceinfo.fr/reunion/grand-raid-2026-decouvrez-les-traces-des-cinq-courses-1682019.html",
    "website": "https://www.grandraid-reunion.com/"
  },
  {
    "country": "MAR",
    "key": "other-marathon-des-sables",
    "name": "Marathon des Sables",
    "nameZh": "撒哈拉沙漠馬拉松",
    "series": "others",
    "source": "https://www.marathondessables.com/",
    "verifiedAt": "2026-08-05",
    "website": "https://www.marathondessables.com/"
  },
  {
    "country": "CHN",
    "key": "other-chongli-168",
    "name": "Chongli 168",
    "nameZh": "崇礼 168",
    "series": "others",
    "source": "https://www.news.cn/sports/20260714/3b0fb7fd97664f099b76f8204ce12715/c.html",
    "verifiedAt": "2026-08-05",
    "website": "https://chongli-168.mararun.com/"
  },
  {
    "country": "CHN",
    "key": "other-ninghai",
    "name": "Ninghai Trail Challenge",
    "nameZh": "宁海越野挑战赛",
    "series": "others",
    "source": "https://www.ninghai.gov.cn/art/2024/10/17/art_1229092276_59178857.html",
    "verifiedAt": "2026-08-05",
    "website": "http://www.ninghai100.com"
  },
  {
    "country": "CHN",
    "key": "other-dali-100",
    "name": "Dali 100",
    "nameZh": "大理 100",
    "series": "others",
    "source": "http://race.leiut.cn/",
    "verifiedAt": "2026-08-05",
    "website": "http://race.leiut.cn/"
  },
  {
    "country": "CHN",
    "itraUrl": "https://itra.run/Races/RaceDetails/106406",
    "key": "other-wugongshan",
    "name": "Wugongshan International Trail Race",
    "nameZh": "武功山国际越野赛",
    "series": "others",
    "source": "http://www.mtwugong.com/",
    "verifiedAt": "2026-08-05",
    "website": "http://www.mtwugong.com/"
  },
  {
    "country": "CHN",
    "key": "other-huangshan-168",
    "name": "Huangshan 168",
    "nameZh": "黄山 168",
    "series": "others",
    "source": "https://www.runninginchina.org/event/default/2980.html — no stable official domain; the event runs under rotating sponsor names (徽州168, 西宏168) and registers through third-party platforms",
    "verifiedAt": "2026-08-05"
  },
  {
    "country": "ZAF",
    "key": "utmb-mut",
    "name": "Mountain Ultra Trail",
    "series": "utmb",
    "source": "https://mut.utmb.world/",
    "verifiedAt": "2026-08-05",
    "website": "https://mut.utmb.world/"
  },
  {
    "country": "CAN",
    "key": "other-fat-dog",
    "name": "Fat Dog 120",
    "series": "others",
    "source": "https://www.fatdog120.ca/",
    "verifiedAt": "2026-08-05",
    "website": "https://www.fatdog120.ca/"
  },
  {
    "country": "CAN",
    "key": "other-knee-knacker",
    "name": "Knee Knackering North Shore Trail Run",
    "series": "others",
    "source": "https://kneeknacker.com/",
    "verifiedAt": "2026-08-05",
    "website": "https://kneeknacker.com/"
  },
  {
    "country": "CAN",
    "key": "other-frosty-mountain",
    "name": "Frosty Mountain Ultra",
    "series": "others",
    "source": "https://trailwhisperer.ca/frosty/",
    "verifiedAt": "2026-08-05",
    "website": "https://trailwhisperer.ca/frosty/"
  },
  {
    "country": "CAN",
    "key": "other-meet-your-maker",
    "name": "Meet Your Maker 50",
    "series": "others",
    "source": "https://trailrunner.com/event/meet-your-maker-50/",
    "verifiedAt": "2026-08-05",
    "website": "https://trailrunner.com/event/meet-your-maker-50/"
  },
  {
    "country": "CAN",
    "key": "other-black-spur",
    "name": "Black Spur Ultra",
    "series": "others",
    "source": "https://www.sinistersports.ca/blackspur/",
    "verifiedAt": "2026-08-05",
    "website": "https://www.sinistersports.ca/blackspur/"
  }
];

export const SEED_CATEGORIES: SeedCategory[] = [
  {
    "distanceKm": 173,
    "elevationGainM": 5507,
    "eventKey": "utmb-arc-of-attrition",
    "key": "100m",
    "label": "Arc 100M",
    "order": 1,
    "source": "https://arcofattrition.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 82.7,
    "elevationGainM": 2708,
    "eventKey": "utmb-arc-of-attrition",
    "key": "100k",
    "label": "Arc 100K",
    "order": 2,
    "source": "https://arcofattrition.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 49.4,
    "elevationGainM": 1458,
    "eventKey": "utmb-arc-of-attrition",
    "key": "50k",
    "label": "Arc 50K",
    "order": 3,
    "source": "https://arcofattrition.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 22.1,
    "elevationGainM": 744,
    "eventKey": "utmb-arc-of-attrition",
    "key": "20k",
    "label": "Arc 20K",
    "order": 4,
    "source": "https://arcofattrition.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 123,
    "elevationGainM": 5200,
    "eventKey": "utmb-chianti",
    "key": "utcc",
    "label": "Ultra Trail Chianti Castles",
    "order": 1,
    "source": "https://chianti.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 73,
    "elevationGainM": 3000,
    "eventKey": "utmb-chianti",
    "key": "ultra",
    "label": "Chianti Ultra Trail",
    "order": 2,
    "source": "https://chianti.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 46,
    "elevationGainM": 1650,
    "eventKey": "utmb-chianti",
    "key": "marathon",
    "label": "Chianti Marathon Trail",
    "order": 3,
    "source": "https://chianti.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 20,
    "elevationGainM": 920,
    "eventKey": "utmb-chianti",
    "key": "half",
    "label": "Chianti Half Trail",
    "order": 4,
    "source": "https://chianti.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 10,
    "elevationGainM": 400,
    "eventKey": "utmb-chianti",
    "key": "wine-run",
    "label": "Chianti Wine Run",
    "order": 5,
    "source": "https://chianti.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 110,
    "elevationGainM": 6250,
    "eventKey": "utmb-tenerife",
    "key": "110k",
    "label": "Tenerife Bluetrail 110K",
    "order": 1,
    "source": "https://tenerife.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 82,
    "elevationGainM": 3300,
    "eventKey": "utmb-tenerife",
    "key": "82k",
    "label": "Tenerife Bluetrail 82K",
    "order": 2,
    "source": "https://tenerife.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 68,
    "elevationGainM": 3600,
    "eventKey": "utmb-tenerife",
    "key": "68k",
    "label": "Tenerife Bluetrail 68K",
    "order": 3,
    "source": "https://tenerife.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 47,
    "elevationGainM": 2600,
    "eventKey": "utmb-tenerife",
    "key": "47k",
    "label": "Tenerife Bluetrail 47K",
    "order": 4,
    "source": "https://tenerife.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 47,
    "elevationGainM": 2600,
    "eventKey": "utmb-tenerife",
    "key": "47k-relay",
    "label": "Tenerife Bluetrail 47K Relay",
    "order": 5,
    "source": "https://tenerife.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 24,
    "elevationGainM": 1300,
    "eventKey": "utmb-tenerife",
    "key": "24k",
    "label": "Tenerife Bluetrail 24K",
    "order": 6,
    "source": "https://tenerife.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 6.5,
    "elevationGainM": 850,
    "eventKey": "utmb-tenerife",
    "key": "vnc",
    "label": "Vertical Night Challenge",
    "order": 7,
    "source": "https://tenerife.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 168,
    "elevationGainM": 6800,
    "eventKey": "utmb-istria",
    "key": "168k",
    "label": "Istria 168K",
    "order": 1,
    "source": "https://istria.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 111,
    "elevationGainM": 4200,
    "eventKey": "utmb-istria",
    "key": "110k",
    "label": "Istria 110K",
    "order": 2,
    "source": "https://istria.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 69.6,
    "elevationGainM": 2400,
    "eventKey": "utmb-istria",
    "key": "69k",
    "label": "Istria 69K",
    "order": 3,
    "source": "https://istria.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 42,
    "elevationGainM": 1000,
    "eventKey": "utmb-istria",
    "key": "42k",
    "label": "Istria 42K",
    "order": 4,
    "source": "https://istria.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 21.5,
    "elevationGainM": 157,
    "eventKey": "utmb-istria",
    "key": "21k",
    "label": "Istria 21K",
    "order": 5,
    "source": "https://istria.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 125,
    "elevationGainM": 5700,
    "eventKey": "utmb-ventoux",
    "key": "ugp",
    "label": "Ultra Géant de Provence",
    "order": 1,
    "source": "https://ventoux.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 87,
    "elevationGainM": 4200,
    "eventKey": "utmb-ventoux",
    "key": "gev",
    "label": "Grande Epopée Ventoux",
    "order": 2,
    "source": "https://ventoux.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 51,
    "elevationGainM": 2500,
    "eventKey": "utmb-ventoux",
    "key": "mmt",
    "label": "Mistral Marathon Trail",
    "order": 3,
    "source": "https://ventoux.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 26,
    "elevationGainM": 1100,
    "eventKey": "utmb-ventoux",
    "key": "tdc",
    "label": "Trail des Coteaux",
    "order": 4,
    "source": "https://ventoux.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 167,
    "elevationGainM": 8900,
    "eventKey": "utmb-oh-my-deus",
    "key": "100m",
    "label": "Oh Meu Deus 100M",
    "order": 1,
    "source": "https://ohmeudeus.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 94,
    "elevationGainM": 5300,
    "eventKey": "utmb-oh-my-deus",
    "key": "100k",
    "label": "Oh Meu Deus 100K",
    "order": 2,
    "source": "https://ohmeudeus.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 52,
    "elevationGainM": 2900,
    "eventKey": "utmb-oh-my-deus",
    "key": "50k",
    "label": "Oh Meu Deus 50K",
    "order": 3,
    "source": "https://ohmeudeus.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 22,
    "elevationGainM": 1000,
    "eventKey": "utmb-oh-my-deus",
    "key": "20k",
    "label": "Oh Meu Deus 20K",
    "order": 4,
    "source": "https://ohmeudeus.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 158,
    "elevationGainM": 5100,
    "eventKey": "utmb-alsace",
    "key": "utdc",
    "label": "Ultra-Trail des Chevaliers",
    "order": 1,
    "source": "https://alsace.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 108,
    "elevationGainM": 3900,
    "eventKey": "utmb-alsace",
    "key": "utdp",
    "label": "Ultra-Trail des Païens",
    "order": 2,
    "source": "https://alsace.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 47,
    "elevationGainM": 1600,
    "eventKey": "utmb-alsace",
    "key": "tdc",
    "label": "Trail des Celtes",
    "order": 3,
    "source": "https://alsace.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 29,
    "elevationGainM": 800,
    "eventKey": "utmb-alsace",
    "key": "tdp",
    "label": "Trail des Pèlerins",
    "order": 4,
    "source": "https://alsace.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 18,
    "elevationGainM": 250,
    "eventKey": "utmb-alsace",
    "key": "rdp",
    "label": "Ronde des Pages",
    "order": 5,
    "source": "https://alsace.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 10.5,
    "elevationGainM": 400,
    "eventKey": "utmb-alsace",
    "key": "tde",
    "label": "Trail des Ecuyers",
    "order": 6,
    "source": "https://alsace.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 163,
    "elevationGainM": 9200,
    "eventKey": "utmb-snowdonia",
    "key": "100m",
    "label": "Eryri 100M",
    "order": 1,
    "source": "https://eryri.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 106,
    "elevationGainM": 5400,
    "eventKey": "utmb-snowdonia",
    "key": "100k",
    "label": "Eryri 100K",
    "order": 2,
    "source": "https://eryri.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 78,
    "elevationGainM": 2500,
    "eventKey": "utmb-snowdonia",
    "key": "80k",
    "label": "Eryri 80K",
    "order": 3,
    "source": "https://eryri.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 56,
    "elevationGainM": 3400,
    "eventKey": "utmb-snowdonia",
    "key": "50k",
    "label": "Eryri 50K",
    "order": 4,
    "source": "https://eryri.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 22,
    "elevationGainM": 1100,
    "eventKey": "utmb-snowdonia",
    "key": "25k",
    "label": "Eryri 25K",
    "order": 5,
    "source": "https://eryri.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 119,
    "elevationGainM": 6000,
    "eventKey": "utmb-mozart",
    "key": "100",
    "label": "mozart 100",
    "order": 1,
    "source": "https://mozart.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 84,
    "elevationGainM": 4800,
    "eventKey": "utmb-mozart",
    "key": "ultra",
    "label": "mozart Ultra",
    "order": 2,
    "source": "https://mozart.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 84,
    "elevationGainM": 4800,
    "eventKey": "utmb-mozart",
    "key": "ultra-relay",
    "label": "mozart Ultra Relay",
    "order": 3,
    "source": "https://mozart.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 44,
    "elevationGainM": 1600,
    "eventKey": "utmb-mozart",
    "key": "marathon",
    "label": "mozart Marathon",
    "order": 4,
    "source": "https://mozart.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 28,
    "elevationGainM": 1100,
    "eventKey": "utmb-mozart",
    "key": "half",
    "label": "mozart Half Marathon",
    "order": 5,
    "source": "https://mozart.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 12,
    "elevationGainM": 200,
    "eventKey": "utmb-mozart",
    "key": "lake",
    "label": "mozart Lake Trail",
    "order": 6,
    "source": "https://mozart.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 105,
    "elevationGainM": 6800,
    "eventKey": "utmb-andorra",
    "key": "105k",
    "label": "Ultra 105K",
    "order": 1,
    "source": "https://andorra.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 79,
    "elevationGainM": 3900,
    "eventKey": "utmb-andorra",
    "key": "80k",
    "label": "Trail 80K",
    "order": 2,
    "source": "https://andorra.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 50,
    "elevationGainM": 3400,
    "eventKey": "utmb-andorra",
    "key": "50k",
    "label": "Trail 50K",
    "order": 3,
    "source": "https://andorra.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 24.9,
    "elevationGainM": 1350,
    "eventKey": "utmb-andorra",
    "key": "21k",
    "label": "Trail 21K",
    "order": 4,
    "source": "https://andorra.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 10,
    "elevationGainM": 500,
    "eventKey": "utmb-andorra",
    "key": "10k",
    "label": "Trail 10K",
    "order": 5,
    "source": "https://andorra.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 140,
    "elevationGainM": 6000,
    "eventKey": "utmb-saint-jacques",
    "key": "100m",
    "label": "Ultra du Saint Jacques 100M",
    "order": 1,
    "source": "https://saint-jacques.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 88,
    "elevationGainM": 3600,
    "eventKey": "utmb-saint-jacques",
    "key": "100k",
    "label": "Grand Trail du Saint Jacques 100K",
    "order": 2,
    "source": "https://saint-jacques.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 55,
    "elevationGainM": 2100,
    "eventKey": "utmb-saint-jacques",
    "key": "50k",
    "label": "Monistrail 50K",
    "order": 3,
    "source": "https://saint-jacques.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 28,
    "elevationGainM": 750,
    "eventKey": "utmb-saint-jacques",
    "key": "20k",
    "label": "Les Chibottes 20K",
    "order": 4,
    "source": "https://saint-jacques.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 12,
    "elevationGainM": 200,
    "eventKey": "utmb-saint-jacques",
    "key": "12k",
    "label": "Le 12 du Dolaizon",
    "order": 5,
    "source": "https://saint-jacques.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 107,
    "elevationGainM": 5280,
    "eventKey": "utmb-zugspitz",
    "key": "zut100",
    "label": "ZUT100",
    "order": 1,
    "source": "https://zugspitz.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 74,
    "elevationGainM": 3000,
    "eventKey": "utmb-zugspitz",
    "key": "ultratrail",
    "label": "Ultratrail",
    "order": 2,
    "source": "https://zugspitz.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 74,
    "elevationGainM": 3000,
    "eventKey": "utmb-zugspitz",
    "key": "ehrwald",
    "label": "Ehrwald Trail",
    "order": 3,
    "source": "https://zugspitz.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 69,
    "elevationGainM": 3140,
    "eventKey": "utmb-zugspitz",
    "key": "leutasch",
    "label": "Leutasch Trail",
    "order": 4,
    "source": "https://zugspitz.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 44,
    "elevationGainM": 2110,
    "eventKey": "utmb-zugspitz",
    "key": "mittenwald",
    "label": "Mittenwald Trail",
    "order": 5,
    "source": "https://zugspitz.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 29,
    "elevationGainM": 1565,
    "eventKey": "utmb-zugspitz",
    "key": "gapa",
    "label": "Garmisch-Partenkirchen Trail",
    "order": 6,
    "source": "https://zugspitz.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 16,
    "elevationGainM": 760,
    "eventKey": "utmb-zugspitz",
    "key": "grainau",
    "label": "Grainau Trail",
    "order": 7,
    "source": "https://zugspitz.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 120,
    "elevationGainM": 5800,
    "eventKey": "utmb-lavaredo",
    "key": "120k",
    "label": "Lavaredo 120K",
    "order": 1,
    "source": "https://lavaredo.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 80,
    "elevationGainM": 4600,
    "eventKey": "utmb-lavaredo",
    "key": "80k",
    "label": "Lavaredo 80K",
    "order": 2,
    "source": "https://lavaredo.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 50,
    "elevationGainM": 2600,
    "eventKey": "utmb-lavaredo",
    "key": "50k",
    "label": "Lavaredo 50K",
    "order": 3,
    "source": "https://lavaredo.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 20,
    "elevationGainM": 1000,
    "eventKey": "utmb-lavaredo",
    "key": "20k",
    "label": "Lavaredo 20K",
    "order": 4,
    "source": "https://lavaredo.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 10,
    "elevationGainM": 300,
    "eventKey": "utmb-lavaredo",
    "key": "10k",
    "label": "Lavaredo 10K",
    "order": 5,
    "source": "https://lavaredo.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 163,
    "elevationGainM": 10000,
    "eventKey": "utmb-val-daran",
    "key": "vda",
    "label": "Torn dera Val d'Aran",
    "order": 1,
    "source": "https://valdaran.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 110,
    "elevationGainM": 6400,
    "eventKey": "utmb-val-daran",
    "key": "cdh",
    "label": "Camins d'Hèr",
    "order": 2,
    "source": "https://valdaran.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 75,
    "elevationGainM": 5100,
    "eventKey": "utmb-val-daran",
    "key": "tdl",
    "label": "Termières dera Libertat",
    "order": 3,
    "source": "https://valdaran.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 55,
    "elevationGainM": 3300,
    "eventKey": "utmb-val-daran",
    "key": "pda",
    "label": "Peades d'Aigua",
    "order": 4,
    "source": "https://valdaran.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 32,
    "elevationGainM": 2100,
    "eventKey": "utmb-val-daran",
    "key": "exp",
    "label": "Experiència d'Aran",
    "order": 5,
    "source": "https://valdaran.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 18,
    "elevationGainM": 900,
    "eventKey": "utmb-val-daran",
    "key": "sky-promesas",
    "label": "SKY 18K Promesas",
    "order": 6,
    "source": "https://valdaran.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 18,
    "elevationGainM": 900,
    "eventKey": "utmb-val-daran",
    "key": "sky",
    "label": "SKY Baqueira Beret",
    "order": 7,
    "source": "https://valdaran.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 10,
    "elevationGainM": 500,
    "eventKey": "utmb-val-daran",
    "key": "vielha10k",
    "label": "Vielha 10K",
    "order": 8,
    "source": "https://valdaran.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 110,
    "elevationGainM": 7200,
    "eventKey": "utmb-restonica",
    "key": "utc100m",
    "label": "UTC100M",
    "order": 1,
    "source": "https://restonica.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 69,
    "elevationGainM": 3950,
    "eventKey": "utmb-restonica",
    "key": "rt100k",
    "label": "RT100K",
    "order": 2,
    "source": "https://restonica.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 33,
    "elevationGainM": 2400,
    "eventKey": "utmb-restonica",
    "key": "tt50k",
    "label": "TT50K",
    "order": 3,
    "source": "https://restonica.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 17,
    "elevationGainM": 650,
    "eventKey": "utmb-restonica",
    "key": "gt20k",
    "label": "GT20K",
    "order": 4,
    "source": "https://restonica.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 140,
    "elevationGainM": 9000,
    "eventKey": "utmb-verbier",
    "key": "x-alpine",
    "label": "X-Alpine",
    "order": 1,
    "source": "https://verbier.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 77,
    "elevationGainM": 5100,
    "eventKey": "utmb-verbier",
    "key": "x-traversee",
    "label": "X-Traversée",
    "order": 2,
    "source": "https://verbier.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 43,
    "elevationGainM": 3000,
    "eventKey": "utmb-verbier",
    "key": "marathon",
    "label": "Verbier Marathon",
    "order": 3,
    "source": "https://verbier.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 28,
    "elevationGainM": 1700,
    "eventKey": "utmb-verbier",
    "key": "x-plore",
    "label": "Verbier X-Plore",
    "order": 4,
    "source": "https://verbier.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 261,
    "elevationGainM": 18000,
    "eventKey": "utmb-eiger",
    "key": "e250",
    "label": "E250 UNESCO Trail",
    "order": 1,
    "source": "https://eiger.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 101,
    "elevationGainM": 6700,
    "eventKey": "utmb-eiger",
    "key": "e101",
    "label": "E101 Ultra Trail",
    "order": 2,
    "source": "https://eiger.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 51,
    "elevationGainM": 3100,
    "eventKey": "utmb-eiger",
    "key": "e51",
    "label": "E51 Panorama Trail",
    "order": 3,
    "source": "https://eiger.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 35,
    "elevationGainM": 2500,
    "eventKey": "utmb-eiger",
    "key": "e35",
    "label": "E35 North Face Trail",
    "order": 4,
    "source": "https://eiger.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 16,
    "elevationGainM": 950,
    "eventKey": "utmb-eiger",
    "key": "e16",
    "label": "E16 Pleasure Trail",
    "order": 5,
    "source": "https://eiger.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 15,
    "elevationGainM": 800,
    "eventKey": "utmb-eiger",
    "key": "surprise",
    "label": "Trail Surprise",
    "order": 6,
    "source": "https://eiger.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 120,
    "elevationGainM": 8200,
    "eventKey": "utmb-mrww",
    "key": "sdv",
    "label": "Sentieri dei Valdôtains",
    "order": 1,
    "source": "https://mrww.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 82,
    "elevationGainM": 6300,
    "eventKey": "utmb-mrww",
    "key": "mrt",
    "label": "Monte Rosa Trail",
    "order": 2,
    "source": "https://mrww.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 43,
    "elevationGainM": 3100,
    "eventKey": "utmb-mrww",
    "key": "wwt",
    "label": "Walserwaeg Trail",
    "order": 3,
    "source": "https://mrww.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 15,
    "elevationGainM": 650,
    "eventKey": "utmb-mrww",
    "key": "rmt",
    "label": "Regina Margherita Trail",
    "order": 4,
    "source": "https://mrww.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 9,
    "elevationGainM": 600,
    "eventKey": "utmb-mrww",
    "key": "jwt",
    "label": "Junior Walser Trail",
    "order": 5,
    "source": "https://mrww.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 4,
    "eventKey": "utmb-mrww",
    "key": "bp",
    "label": "Becca Pink",
    "order": 6,
    "source": "https://mrww.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 114,
    "elevationGainM": 7000,
    "eventKey": "utmb-bucovina",
    "key": "ultra-rocks",
    "label": "Ultra Rocks",
    "order": 1,
    "source": "https://bucovina.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 72,
    "elevationGainM": 4600,
    "eventKey": "utmb-bucovina",
    "key": "four-summits",
    "label": "Four Summits",
    "order": 2,
    "source": "https://bucovina.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 48,
    "elevationGainM": 3200,
    "eventKey": "utmb-bucovina",
    "key": "ladys-rocks",
    "label": "Lady's Rocks",
    "order": 3,
    "source": "https://bucovina.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 33,
    "elevationGainM": 2000,
    "eventKey": "utmb-bucovina",
    "key": "rocky",
    "label": "Rocky",
    "order": 4,
    "source": "https://bucovina.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 20,
    "elevationGainM": 1100,
    "eventKey": "utmb-bucovina",
    "key": "radical",
    "label": "Radical",
    "order": 5,
    "source": "https://bucovina.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 16.5,
    "elevationGainM": 700,
    "eventKey": "utmb-bucovina",
    "key": "rumble-rock",
    "label": "Rumble Rock",
    "order": 6,
    "source": "https://bucovina.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 5,
    "elevationGainM": 550,
    "eventKey": "utmb-bucovina",
    "key": "runc",
    "label": "Runc Challenge",
    "order": 7,
    "source": "https://bucovina.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 91,
    "elevationGainM": 2200,
    "eventKey": "utmb-gauja",
    "key": "100k",
    "label": "Gauja Trail 100K",
    "order": 1,
    "source": "https://gauja.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 53,
    "elevationGainM": 1200,
    "eventKey": "utmb-gauja",
    "key": "50k",
    "label": "Gauja Trail 50K",
    "order": 2,
    "source": "https://gauja.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 21,
    "elevationGainM": 500,
    "eventKey": "utmb-gauja",
    "key": "20k",
    "label": "Gauja Trail 20K",
    "order": 3,
    "source": "https://gauja.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 21,
    "elevationGainM": 500,
    "eventKey": "utmb-gauja",
    "key": "20k-nw",
    "label": "Gauja Trail 20K Nordic Walking",
    "order": 4,
    "source": "https://gauja.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 13.5,
    "elevationGainM": 300,
    "eventKey": "utmb-gauja",
    "key": "10k",
    "label": "Gauja Trail 10K",
    "order": 5,
    "source": "https://gauja.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 6,
    "elevationGainM": 100,
    "eventKey": "utmb-gauja",
    "key": "youth",
    "label": "Gauja Trail Youth",
    "order": 6,
    "source": "https://gauja.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 169,
    "elevationGainM": 9000,
    "eventKey": "utmb-kat100",
    "key": "100m",
    "label": "100 Miles",
    "order": 1,
    "source": "https://kat.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 75,
    "elevationGainM": 4100,
    "eventKey": "utmb-kat100",
    "key": "endurance",
    "label": "Endurance Trail",
    "order": 2,
    "source": "https://kat.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 51,
    "elevationGainM": 3250,
    "eventKey": "utmb-kat100",
    "key": "marathon",
    "label": "Marathon Trail",
    "order": 3,
    "source": "https://kat.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 24,
    "elevationGainM": 1650,
    "eventKey": "utmb-kat100",
    "key": "speed",
    "label": "Speed Trail",
    "order": 4,
    "source": "https://kat.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 8,
    "elevationGainM": 250,
    "eventKey": "utmb-kat100",
    "key": "easy",
    "label": "Easy Trail",
    "order": 5,
    "source": "https://kat.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 300,
    "elevationGainM": 25000,
    "eventKey": "utmb-mont-blanc",
    "key": "ptl",
    "label": "PTL",
    "order": 1,
    "source": "https://montblanc.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 174,
    "elevationGainM": 9900,
    "eventKey": "utmb-mont-blanc",
    "key": "utmb",
    "label": "UTMB",
    "order": 2,
    "source": "https://montblanc.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 145,
    "elevationGainM": 9500,
    "eventKey": "utmb-mont-blanc",
    "key": "tds",
    "label": "TDS",
    "order": 3,
    "source": "https://montblanc.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 101,
    "elevationGainM": 6050,
    "eventKey": "utmb-mont-blanc",
    "key": "ccc",
    "label": "CCC",
    "order": 4,
    "source": "https://montblanc.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 60,
    "elevationGainM": 3500,
    "eventKey": "utmb-mont-blanc",
    "key": "occ",
    "label": "OCC",
    "order": 5,
    "source": "https://montblanc.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 40,
    "elevationGainM": 2350,
    "eventKey": "utmb-mont-blanc",
    "key": "mcc",
    "label": "MCC",
    "order": 6,
    "source": "https://montblanc.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 15,
    "elevationGainM": 1200,
    "eventKey": "utmb-mont-blanc",
    "key": "etc",
    "label": "ETC",
    "order": 7,
    "source": "https://montblanc.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 15,
    "elevationGainM": 1200,
    "eventKey": "utmb-mont-blanc",
    "key": "ycc",
    "label": "YCC",
    "order": 8,
    "source": "https://montblanc.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 113,
    "elevationGainM": 6600,
    "eventKey": "utmb-wildstrubel",
    "key": "wild110",
    "label": "Wild 110 Crans-Montana",
    "order": 1,
    "source": "https://wildstrubel.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 72,
    "elevationGainM": 4600,
    "eventKey": "utmb-wildstrubel",
    "key": "wild70",
    "label": "Wild 70 Kandersteg",
    "order": 2,
    "source": "https://wildstrubel.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 55,
    "elevationGainM": 3300,
    "eventKey": "utmb-wildstrubel",
    "key": "wild55",
    "label": "Wild 55 Adelboden",
    "order": 3,
    "source": "https://wildstrubel.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 42,
    "elevationGainM": 2700,
    "eventKey": "utmb-wildstrubel",
    "key": "glacier-marathon",
    "label": "Wild Glacier Marathon Lenk",
    "order": 4,
    "source": "https://wildstrubel.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 26,
    "elevationGainM": 1200,
    "eventKey": "utmb-wildstrubel",
    "key": "wild25",
    "label": "Wild 25 Leukerbad",
    "order": 5,
    "source": "https://wildstrubel.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 10,
    "elevationGainM": 500,
    "eventKey": "utmb-wildstrubel",
    "key": "wild10",
    "label": "Wild 10 Crans-Montana",
    "order": 6,
    "source": "https://wildstrubel.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 10,
    "elevationGainM": 500,
    "eventKey": "utmb-wildstrubel",
    "key": "nextgen",
    "label": "Wild NextGen Crans-Montana",
    "order": 7,
    "source": "https://wildstrubel.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 82,
    "elevationGainM": 5600,
    "eventKey": "utmb-kackar",
    "key": "100k",
    "label": "Kaçkar 100K",
    "order": 1,
    "source": "https://kackar.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 44,
    "elevationGainM": 3000,
    "eventKey": "utmb-kackar",
    "key": "50k",
    "label": "Kaçkar 50K",
    "order": 2,
    "source": "https://kackar.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 20,
    "elevationGainM": 1400,
    "eventKey": "utmb-kackar",
    "key": "20k",
    "label": "Kaçkar 20K",
    "order": 3,
    "source": "https://kackar.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 4,
    "elevationGainM": 230,
    "eventKey": "utmb-kackar",
    "key": "ayder4k",
    "label": "Ayder 4K",
    "order": 4,
    "source": "https://kackar.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 124,
    "elevationGainM": 5893,
    "eventKey": "utmb-julian-alps",
    "key": "120k",
    "label": "I Feel Slovenia 120K",
    "order": 1,
    "source": "https://julianalps.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 80,
    "elevationGainM": 3826,
    "eventKey": "utmb-julian-alps",
    "key": "80k",
    "label": "Lake Bled 80K",
    "order": 2,
    "source": "https://julianalps.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 50,
    "elevationGainM": 2665,
    "eventKey": "utmb-julian-alps",
    "key": "50k",
    "label": "Sky Trail 50K",
    "order": 3,
    "source": "https://julianalps.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 25,
    "elevationGainM": 1028,
    "eventKey": "utmb-julian-alps",
    "key": "25k",
    "label": "Kranjska Gora 25K",
    "order": 4,
    "source": "https://julianalps.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 15,
    "elevationGainM": 553,
    "eventKey": "utmb-julian-alps",
    "key": "15k",
    "label": "Intersport Speed 15K",
    "order": 5,
    "source": "https://julianalps.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 10,
    "elevationGainM": 308,
    "eventKey": "utmb-julian-alps",
    "key": "10k",
    "label": "Funny 10K",
    "order": 6,
    "source": "https://julianalps.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 165,
    "elevationGainM": 8900,
    "eventKey": "utmb-nice",
    "key": "100m",
    "label": "Ultra Trail Métropole Nice Côte d'Azur 100M",
    "order": 1,
    "source": "https://nice.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 109,
    "elevationGainM": 5400,
    "eventKey": "utmb-nice",
    "key": "100k",
    "label": "Roubion - Nice 100K",
    "order": 2,
    "source": "https://nice.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 50,
    "elevationGainM": 2000,
    "eventKey": "utmb-nice",
    "key": "50k-eze",
    "label": "Eze - Nice 50K",
    "order": 3,
    "source": "https://nice.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 39,
    "elevationGainM": 1388,
    "eventKey": "utmb-nice",
    "key": "50k-levens",
    "label": "Levens - Nice 50K",
    "order": 4,
    "source": "https://nice.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 23,
    "elevationGainM": 680,
    "eventKey": "utmb-nice",
    "key": "20k",
    "label": "Saint-Jean-Cap-Ferrat - Nice 20K",
    "order": 5,
    "source": "https://nice.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 173,
    "elevationGainM": 2300,
    "eventKey": "utmb-kullamannen",
    "key": "100m",
    "label": "Ultra 100 Miles",
    "order": 1,
    "source": "https://kullamannen.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 108,
    "elevationGainM": 749,
    "eventKey": "utmb-kullamannen",
    "key": "100k",
    "label": "Sprint Ultra 100 km",
    "order": 2,
    "source": "https://kullamannen.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 53,
    "elevationGainM": 727,
    "eventKey": "utmb-kullamannen",
    "key": "seventh-seal",
    "label": "Seventh Seal",
    "order": 3,
    "source": "https://kullamannen.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 22,
    "elevationGainM": 96,
    "eventKey": "utmb-kullamannen",
    "key": "north-shore",
    "label": "North Shore",
    "order": 4,
    "source": "https://kullamannen.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "eventKey": "utmb-mallorca",
    "key": "sdt",
    "label": "SDT - Serra de Tramuntana",
    "order": 1,
    "source": "https://mallorca.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "eventKey": "utmb-mallorca",
    "key": "cps",
    "label": "CPS - Camins de Pedra en Sec",
    "order": 2,
    "source": "https://mallorca.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "eventKey": "utmb-mallorca",
    "key": "etm",
    "label": "ETM - Els Tres Mils",
    "order": 3,
    "source": "https://mallorca.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "eventKey": "utmb-mallorca",
    "key": "cda",
    "label": "CDA - Camins de s'Arxiduc",
    "order": 4,
    "source": "https://mallorca.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 163,
    "elevationGainM": 3800,
    "eventKey": "utmb-tarawera",
    "key": "tmiler",
    "label": "TMiler",
    "order": 1,
    "source": "https://tarawera.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 102,
    "elevationGainM": 2300,
    "eventKey": "utmb-tarawera",
    "key": "t102",
    "label": "T102",
    "order": 2,
    "source": "https://tarawera.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 52,
    "elevationGainM": 1150,
    "eventKey": "utmb-tarawera",
    "key": "t50",
    "label": "T50",
    "order": 3,
    "source": "https://tarawera.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 23,
    "elevationGainM": 400,
    "eventKey": "utmb-tarawera",
    "key": "t21",
    "label": "T21",
    "order": 4,
    "source": "https://tarawera.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 14,
    "elevationGainM": 161,
    "eventKey": "utmb-tarawera",
    "key": "t14",
    "label": "T14",
    "order": 5,
    "source": "https://tarawera.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 161.1,
    "elevationGainM": 7200,
    "eventKey": "utmb-australia",
    "key": "utamiler",
    "label": "UTAMiler",
    "order": 1,
    "source": "https://uta.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 101,
    "elevationGainM": 4400,
    "eventKey": "utmb-australia",
    "key": "uta100",
    "label": "UTA100",
    "order": 2,
    "source": "https://uta.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 51,
    "elevationGainM": 2400,
    "eventKey": "utmb-australia",
    "key": "uta50",
    "label": "UTA50",
    "order": 3,
    "source": "https://uta.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 22,
    "elevationGainM": 1200,
    "eventKey": "utmb-australia",
    "key": "uta22",
    "label": "UTA22",
    "order": 4,
    "source": "https://uta.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 11.5,
    "elevationGainM": 731,
    "eventKey": "utmb-australia",
    "key": "uta11",
    "label": "UTA11",
    "order": 5,
    "source": "https://uta.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 161,
    "elevationGainM": 5131,
    "eventKey": "utmb-kosciuszko",
    "key": "koscimiler",
    "label": "KosciMiler",
    "order": 1,
    "source": "https://kosciuszko.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 106,
    "elevationGainM": 3260,
    "eventKey": "utmb-kosciuszko",
    "key": "kosci100",
    "label": "Kosci100",
    "order": 2,
    "source": "https://kosciuszko.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 50,
    "elevationGainM": 1400,
    "eventKey": "utmb-kosciuszko",
    "key": "kosci50",
    "label": "Kosci50",
    "order": 3,
    "source": "https://kosciuszko.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 32,
    "elevationGainM": 670,
    "eventKey": "utmb-kosciuszko",
    "key": "kosci30",
    "label": "Kosci30",
    "order": 4,
    "source": "https://kosciuszko.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 81,
    "elevationGainM": 3900,
    "eventKey": "utmb-puerto-vallarta",
    "key": "hikuri81k",
    "label": "Hikuri 81K",
    "order": 1,
    "source": "https://puerto-vallarta.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 53,
    "elevationGainM": 2500,
    "eventKey": "utmb-puerto-vallarta",
    "key": "nakawe53k",
    "label": "Nakawé 53K",
    "order": 2,
    "source": "https://puerto-vallarta.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 37,
    "elevationGainM": 1600,
    "eventKey": "utmb-puerto-vallarta",
    "key": "haramara37k",
    "label": "Haramara 37K",
    "order": 3,
    "source": "https://puerto-vallarta.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 20,
    "elevationGainM": 1050,
    "eventKey": "utmb-puerto-vallarta",
    "key": "ereno20k",
    "label": "Ereno 20K",
    "order": 4,
    "source": "https://puerto-vallarta.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 5,
    "elevationGainM": 200,
    "eventKey": "utmb-puerto-vallarta",
    "key": "pata-salada5k",
    "label": "Pata Salada 5K",
    "order": 5,
    "source": "https://puerto-vallarta.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 100,
    "elevationGainM": 2050,
    "eventKey": "utmb-desert-rats",
    "key": "100k",
    "label": "100K",
    "order": 1,
    "source": "https://desertrats.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 48,
    "elevationGainM": 1050,
    "eventKey": "utmb-desert-rats",
    "key": "50k",
    "label": "50K",
    "order": 2,
    "source": "https://desertrats.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 21,
    "elevationGainM": 700,
    "eventKey": "utmb-desert-rats",
    "key": "21k",
    "label": "21K",
    "order": 3,
    "source": "https://desertrats.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 9,
    "elevationGainM": 200,
    "eventKey": "utmb-desert-rats",
    "key": "10k",
    "label": "10K",
    "order": 4,
    "source": "https://desertrats.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 161,
    "elevationGainM": 5550,
    "eventKey": "utmb-canyons",
    "key": "100m",
    "label": "100M",
    "order": 1,
    "source": "https://canyons.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 100,
    "elevationGainM": 3750,
    "eventKey": "utmb-canyons",
    "key": "100k",
    "label": "100K",
    "order": 2,
    "source": "https://canyons.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 50,
    "elevationGainM": 1700,
    "eventKey": "utmb-canyons",
    "key": "50k",
    "label": "50K",
    "order": 3,
    "source": "https://canyons.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 25,
    "elevationGainM": 850,
    "eventKey": "utmb-canyons",
    "key": "25k",
    "label": "25K",
    "order": 4,
    "source": "https://canyons.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 53.3,
    "elevationGainM": 1550,
    "eventKey": "utmb-rothrock",
    "key": "50k",
    "label": "50K",
    "order": 1,
    "source": "https://rothrock.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 26.9,
    "elevationGainM": 1188,
    "eventKey": "utmb-rothrock",
    "key": "25k",
    "label": "25K",
    "order": 2,
    "source": "https://rothrock.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 161,
    "elevationGainM": 5490,
    "eventKey": "utmb-western-states",
    "key": "100m",
    "label": "Western States 100-Mile Endurance Run",
    "order": 1,
    "source": "https://www.wser.org/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 50,
    "elevationGainM": 3450,
    "eventKey": "utmb-speedgoat",
    "key": "50k",
    "label": "50K",
    "order": 1,
    "source": "https://speedgoat.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 31,
    "elevationGainM": 2000,
    "eventKey": "utmb-speedgoat",
    "key": "30k",
    "label": "30K",
    "order": 2,
    "source": "https://speedgoat.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 10,
    "elevationGainM": 500,
    "eventKey": "utmb-speedgoat",
    "key": "10k",
    "label": "10K",
    "order": 3,
    "source": "https://speedgoat.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 5.6,
    "elevationGainM": 921,
    "eventKey": "utmb-speedgoat",
    "key": "summit",
    "label": "The Summit",
    "order": 4,
    "source": "https://speedgoat.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 81,
    "elevationGainM": 4020,
    "eventKey": "utmb-borealys",
    "key": "odyssee100k",
    "label": "Odyssée 100K",
    "order": 1,
    "source": "https://borealys.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 81,
    "elevationGainM": 4020,
    "eventKey": "utmb-borealys",
    "key": "relais80k",
    "label": "Relais 80K",
    "order": 2,
    "source": "https://borealys.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 46.4,
    "elevationGainM": 2612,
    "eventKey": "utmb-borealys",
    "key": "tremblante50k",
    "label": "Tremblante 50K",
    "order": 3,
    "source": "https://borealys.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 26.6,
    "elevationGainM": 1645,
    "eventKey": "utmb-borealys",
    "key": "diable20k",
    "label": "Diable 20K",
    "order": 4,
    "source": "https://borealys.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 14.5,
    "elevationGainM": 896,
    "eventKey": "utmb-borealys",
    "key": "chutes-croches",
    "label": "Chutes-Croches 20K",
    "order": 5,
    "source": "https://borealys.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 5.8,
    "elevationGainM": 379,
    "eventKey": "utmb-borealys",
    "key": "ptite5k",
    "label": "P'tite 5K",
    "order": 6,
    "source": "https://borealys.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 100,
    "elevationGainM": 5100,
    "eventKey": "utmb-whistler",
    "key": "100k",
    "label": "100K",
    "order": 1,
    "source": "https://whistler.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 50,
    "elevationGainM": 3200,
    "eventKey": "utmb-whistler",
    "key": "50k",
    "label": "50K",
    "order": 2,
    "source": "https://whistler.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 26,
    "elevationGainM": 1500,
    "eventKey": "utmb-whistler",
    "key": "25k",
    "label": "25K",
    "order": 3,
    "source": "https://whistler.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 12,
    "elevationGainM": 550,
    "eventKey": "utmb-whistler",
    "key": "10k",
    "label": "10K",
    "order": 4,
    "source": "https://whistler.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 167.4,
    "elevationGainM": 6400,
    "eventKey": "utmb-grindstone",
    "key": "100m",
    "label": "100M",
    "order": 1,
    "source": "https://grindstone.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 100,
    "elevationGainM": 3350,
    "eventKey": "utmb-grindstone",
    "key": "100k",
    "label": "100K",
    "order": 2,
    "source": "https://grindstone.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 50,
    "elevationGainM": 1550,
    "eventKey": "utmb-grindstone",
    "key": "50k",
    "label": "50K",
    "order": 3,
    "source": "https://grindstone.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 21,
    "elevationGainM": 500,
    "eventKey": "utmb-grindstone",
    "key": "21k",
    "label": "21K",
    "order": 4,
    "source": "https://grindstone.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 162,
    "elevationGainM": 4850,
    "eventKey": "utmb-kodiak",
    "key": "100m",
    "label": "100M",
    "order": 1,
    "source": "https://kodiak.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 99,
    "elevationGainM": 3120,
    "eventKey": "utmb-kodiak",
    "key": "100k",
    "label": "100K",
    "order": 2,
    "source": "https://kodiak.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 48.4,
    "elevationGainM": 1339,
    "eventKey": "utmb-kodiak",
    "key": "50k",
    "label": "50K",
    "order": 3,
    "source": "https://kodiak.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 19.5,
    "elevationGainM": 575,
    "eventKey": "utmb-kodiak",
    "key": "21k",
    "label": "21K",
    "order": 4,
    "source": "https://kodiak.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 10.5,
    "elevationGainM": 280,
    "eventKey": "utmb-kodiak",
    "key": "10k",
    "label": "10K",
    "order": 5,
    "source": "https://kodiak.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 51,
    "elevationGainM": 1550,
    "eventKey": "utmb-pacific-trails",
    "key": "50k",
    "label": "50K",
    "order": 1,
    "source": "https://pacifictrails.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 25,
    "elevationGainM": 650,
    "eventKey": "utmb-pacific-trails",
    "key": "25k",
    "label": "25K",
    "order": 2,
    "source": "https://pacifictrails.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 113,
    "elevationGainM": 4854,
    "eventKey": "utmb-valholl",
    "key": "epic130k",
    "label": "EPIC 130K",
    "order": 1,
    "source": "https://ushuaia.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 86.8,
    "elevationGainM": 3677,
    "eventKey": "utmb-valholl",
    "key": "advance85k",
    "label": "ADVANCE 85K",
    "order": 2,
    "source": "https://ushuaia.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 50,
    "elevationGainM": 2712,
    "eventKey": "utmb-valholl",
    "key": "challenge50k",
    "label": "CHALLENGE 50K",
    "order": 3,
    "source": "https://ushuaia.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 33.8,
    "elevationGainM": 1553,
    "eventKey": "utmb-valholl",
    "key": "courage33k",
    "label": "COURAGE 33K",
    "order": 4,
    "source": "https://ushuaia.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 22.4,
    "elevationGainM": 944,
    "eventKey": "utmb-valholl",
    "key": "power22k",
    "label": "POWER 22K",
    "order": 5,
    "source": "https://ushuaia.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 13.4,
    "elevationGainM": 684,
    "eventKey": "utmb-valholl",
    "key": "explore12k",
    "label": "EXPLORE 12K",
    "order": 6,
    "source": "https://ushuaia.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 100,
    "eventKey": "utmb-torrencial",
    "key": "pilolcura100k",
    "label": "PILOLCURA 100K",
    "order": 1,
    "source": "https://torrencial.utmb.world/races",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 65,
    "eventKey": "utmb-torrencial",
    "key": "oncol65k",
    "label": "ONCOL 65K",
    "order": 2,
    "source": "https://torrencial.utmb.world/races",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 44,
    "eventKey": "utmb-torrencial",
    "key": "llancahue44k",
    "label": "LLANCAHUE 44K",
    "order": 3,
    "source": "https://torrencial.utmb.world/races",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 21,
    "eventKey": "utmb-torrencial",
    "key": "collico21k",
    "label": "COLLICO 21K",
    "order": 4,
    "source": "https://torrencial.utmb.world/races",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 12,
    "eventKey": "utmb-torrencial",
    "key": "cau-cau12k",
    "label": "CAU CAU 12K",
    "order": 5,
    "source": "https://torrencial.utmb.world/races",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 6,
    "eventKey": "utmb-torrencial",
    "key": "isla-teja6k",
    "label": "ISLA TEJA 6K",
    "order": 6,
    "source": "https://torrencial.utmb.world/races",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 76,
    "elevationGainM": 4400,
    "eventKey": "utmb-quito",
    "key": "oso80k",
    "label": "80K Oso",
    "order": 1,
    "source": "https://quito.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 53,
    "elevationGainM": 2800,
    "eventKey": "utmb-quito",
    "key": "nutria50k",
    "label": "50K Nutria",
    "order": 2,
    "source": "https://quito.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 31,
    "elevationGainM": 1600,
    "eventKey": "utmb-quito",
    "key": "tucan30k",
    "label": "30K Tucán",
    "order": 3,
    "source": "https://quito.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 20,
    "elevationGainM": 1000,
    "eventKey": "utmb-quito",
    "key": "quinde20k",
    "label": "20K Quinde",
    "order": 4,
    "source": "https://quito.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 13,
    "elevationGainM": 850,
    "eventKey": "utmb-quito",
    "key": "humboldt12k",
    "label": "12K Humboldt",
    "order": 5,
    "source": "https://quito.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 6.5,
    "elevationGainM": 300,
    "eventKey": "utmb-quito",
    "key": "rana6k",
    "label": "6K Rana",
    "order": 6,
    "source": "https://quito.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 108,
    "elevationGainM": 4850,
    "eventKey": "utmb-paraty",
    "key": "ptr108",
    "label": "PTR 108",
    "order": 1,
    "source": "https://paraty.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 58,
    "elevationGainM": 3400,
    "eventKey": "utmb-paraty",
    "key": "ptr58",
    "label": "PTR 58",
    "order": 2,
    "source": "https://paraty.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 34,
    "elevationGainM": 1150,
    "eventKey": "utmb-paraty",
    "key": "ptr34",
    "label": "PTR 34",
    "order": 3,
    "source": "https://paraty.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 25,
    "elevationGainM": 750,
    "eventKey": "utmb-paraty",
    "key": "ptr25",
    "label": "PTR 25",
    "order": 4,
    "source": "https://paraty.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 17,
    "elevationGainM": 600,
    "eventKey": "utmb-paraty",
    "key": "ptr17",
    "label": "PTR 17",
    "order": 5,
    "source": "https://paraty.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 7,
    "elevationGainM": 50,
    "eventKey": "utmb-paraty",
    "key": "run7",
    "label": "RUN 7",
    "order": 6,
    "source": "https://paraty.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 132,
    "elevationGainM": 6516,
    "eventKey": "utmb-bariloche",
    "key": "tronador130k",
    "label": "TRONADOR 130K",
    "order": 1,
    "source": "https://bariloche.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 86,
    "elevationGainM": 4725,
    "eventKey": "utmb-bariloche",
    "key": "frey85k",
    "label": "FREY 85K",
    "order": 2,
    "source": "https://bariloche.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 57.5,
    "elevationGainM": 3000,
    "eventKey": "utmb-bariloche",
    "key": "bella-vista55k",
    "label": "BELLA VISTA 55K",
    "order": 3,
    "source": "https://bariloche.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 36,
    "elevationGainM": 1421,
    "eventKey": "utmb-bariloche",
    "key": "nahuel-huapi33k",
    "label": "NAHUEL HUAPI 33K",
    "order": 4,
    "source": "https://bariloche.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 22,
    "elevationGainM": 800,
    "eventKey": "utmb-bariloche",
    "key": "cerro-lindo22k",
    "label": "CERRO LINDO 22K",
    "order": 5,
    "source": "https://bariloche.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 12.7,
    "elevationGainM": 500,
    "eventKey": "utmb-bariloche",
    "key": "otto12k",
    "label": "OTTO 12K",
    "order": 6,
    "source": "https://bariloche.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 98,
    "elevationGainM": 3291,
    "eventKey": "utmb-kenting",
    "key": "100k",
    "label": "Xtrail 100K",
    "order": 1,
    "source": "https://xtrail.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 50,
    "elevationGainM": 1496,
    "eventKey": "utmb-kenting",
    "key": "50k",
    "label": "Xtrail 50K",
    "order": 2,
    "source": "https://xtrail.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 26,
    "elevationGainM": 589,
    "eventKey": "utmb-kenting",
    "key": "25k",
    "label": "Xtrail 25K",
    "order": 3,
    "source": "https://xtrail.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 11,
    "elevationGainM": 201,
    "eventKey": "utmb-kenting",
    "key": "10k",
    "label": "Xtrail 10K",
    "order": 4,
    "source": "https://xtrail.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 96.4,
    "elevationGainM": 5154,
    "eventKey": "utmb-xiamen",
    "key": "lxm100k",
    "label": "LXM 100K",
    "order": 1,
    "source": "https://xiamen.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 53,
    "elevationGainM": 2460,
    "eventKey": "utmb-xiamen",
    "key": "mxm50k",
    "label": "MXM 50K",
    "order": 2,
    "source": "https://xiamen.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 28.9,
    "elevationGainM": 1519,
    "eventKey": "utmb-xiamen",
    "key": "sxm20k",
    "label": "SXM 20K",
    "order": 3,
    "source": "https://xiamen.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 10.3,
    "elevationGainM": 263,
    "eventKey": "utmb-xiamen",
    "key": "exm10k",
    "label": "EXM 10K",
    "order": 4,
    "source": "https://xiamen.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 114,
    "elevationGainM": 6600,
    "eventKey": "utmb-mogan",
    "key": "dmg",
    "label": "DMG",
    "order": 1,
    "source": "https://mogan.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 81,
    "elevationGainM": 4600,
    "eventKey": "utmb-mogan",
    "key": "cmg",
    "label": "CMG",
    "order": 2,
    "source": "https://mogan.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 48,
    "elevationGainM": 2500,
    "eventKey": "utmb-mogan",
    "key": "mmg",
    "label": "MMG",
    "order": 3,
    "source": "https://mogan.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 25,
    "elevationGainM": 1200,
    "eventKey": "utmb-mogan",
    "key": "emg",
    "label": "EMG",
    "order": 4,
    "source": "https://mogan.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 116,
    "elevationGainM": 5570,
    "eventKey": "utmb-amazean",
    "key": "betong100m",
    "label": "BETONG 100M",
    "order": 1,
    "source": "https://amazean.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 91,
    "elevationGainM": 3870,
    "eventKey": "utmb-amazean",
    "key": "tunnel100k",
    "label": "TUNNEL 100K",
    "order": 2,
    "source": "https://amazean.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 55,
    "elevationGainM": 2200,
    "eventKey": "utmb-amazean",
    "key": "jungle50k",
    "label": "JUNGLE 50K",
    "order": 3,
    "source": "https://amazean.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 26,
    "elevationGainM": 900,
    "eventKey": "utmb-amazean",
    "key": "mist20k",
    "label": "MIST 20K",
    "order": 4,
    "source": "https://amazean.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 17,
    "elevationGainM": 400,
    "eventKey": "utmb-amazean",
    "key": "flower20k",
    "label": "FLOWER 20K",
    "order": 5,
    "source": "https://amazean.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 4,
    "elevationGainM": 70,
    "eventKey": "utmb-amazean",
    "key": "sat-night",
    "label": "SAT NIGHT RUN",
    "order": 6,
    "source": "https://amazean.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 100,
    "eventKey": "utmb-kagaspa",
    "key": "100k",
    "label": "KAGASPA 100K",
    "order": 1,
    "source": "https://kagaspa.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 50,
    "eventKey": "utmb-kagaspa",
    "key": "50k",
    "label": "KAGASPA 50K",
    "order": 2,
    "source": "https://kagaspa.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 20,
    "eventKey": "utmb-kagaspa",
    "key": "20k",
    "label": "KAGASPA 20K",
    "order": 3,
    "source": "https://kagaspa.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 100,
    "eventKey": "utmb-malaysia",
    "key": "my100",
    "label": "MY100",
    "order": 1,
    "source": "https://malaysia.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 50,
    "eventKey": "utmb-malaysia",
    "key": "my50",
    "label": "MY50",
    "order": 2,
    "source": "https://malaysia.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 25,
    "eventKey": "utmb-malaysia",
    "key": "my25",
    "label": "MY25",
    "order": 3,
    "source": "https://malaysia.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 13,
    "eventKey": "utmb-malaysia",
    "key": "my13",
    "label": "MY13",
    "order": 4,
    "source": "https://malaysia.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 154,
    "elevationGainM": 8000,
    "eventKey": "utmb-oman",
    "key": "hajar-ultra",
    "label": "Hajar Ultra",
    "order": 1,
    "source": "https://oman.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 103,
    "elevationGainM": 5000,
    "eventKey": "utmb-oman",
    "key": "jabal-classic",
    "label": "Jabal Classic",
    "order": 2,
    "source": "https://oman.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 50,
    "elevationGainM": 2400,
    "eventKey": "utmb-oman",
    "key": "skyward-canyon",
    "label": "Skyward Canyon",
    "order": 3,
    "source": "https://oman.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 32,
    "elevationGainM": 1400,
    "eventKey": "utmb-oman",
    "key": "old-capital",
    "label": "Old Capital Trail",
    "order": 4,
    "source": "https://oman.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 21.5,
    "elevationGainM": 550,
    "eventKey": "utmb-oman",
    "key": "scenic-ascent",
    "label": "Scenic Ascent",
    "order": 5,
    "source": "https://oman.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "eventKey": "utmb-mauritius",
    "key": "20k",
    "label": "20K",
    "order": 1,
    "verified": false
  },
  {
    "eventKey": "utmb-mauritius",
    "key": "50k",
    "label": "50K",
    "order": 2,
    "verified": false
  },
  {
    "eventKey": "utmb-mauritius",
    "key": "100k",
    "label": "100K",
    "order": 3,
    "verified": false
  },
  {
    "eventKey": "utmb-mauritius",
    "key": "100m",
    "label": "100M",
    "order": 4,
    "verified": false
  },
  {
    "distanceKm": 100,
    "eventKey": "wtm-hk100",
    "key": "100k",
    "label": "100K",
    "order": 1,
    "source": "https://ultraracecalendar.com/events/6165/hong-kong-100/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 100,
    "elevationGainM": 1591,
    "eventKey": "wtm-black-canyon",
    "key": "100k",
    "label": "100K",
    "order": 1,
    "source": "https://www.aravaiparunning.com/blackcanyon/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 50,
    "elevationGainM": 611,
    "eventKey": "wtm-black-canyon",
    "key": "50k",
    "label": "50K",
    "order": 2,
    "source": "https://www.aravaiparunning.com/blackcanyon/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 125,
    "elevationGainM": 6764,
    "eventKey": "wtm-transgrancanaria",
    "key": "classic",
    "label": "Classic",
    "order": 1,
    "source": "https://transgrancanaria.net/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 81,
    "elevationGainM": 4314,
    "eventKey": "wtm-transgrancanaria",
    "key": "advanced",
    "label": "Advanced",
    "order": 2,
    "source": "https://transgrancanaria.net/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 46,
    "elevationGainM": 1784,
    "eventKey": "wtm-transgrancanaria",
    "key": "marathon",
    "label": "Marathon",
    "order": 3,
    "source": "https://transgrancanaria.net/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 23,
    "elevationGainM": 1817,
    "eventKey": "wtm-transgrancanaria",
    "key": "half",
    "label": "Half",
    "order": 4,
    "source": "https://transgrancanaria.net/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 21,
    "elevationGainM": 613,
    "eventKey": "wtm-transgrancanaria",
    "key": "open-agaldar",
    "label": "Open Agáldar",
    "order": 5,
    "source": "https://transgrancanaria.net/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 12,
    "elevationGainM": 869,
    "eventKey": "wtm-transgrancanaria",
    "key": "promo",
    "label": "Promo",
    "order": 6,
    "source": "https://transgrancanaria.net/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 5,
    "elevationGainM": 264,
    "eventKey": "wtm-transgrancanaria",
    "key": "short",
    "label": "Short",
    "order": 7,
    "source": "https://transgrancanaria.net/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 5,
    "elevationGainM": 264,
    "eventKey": "wtm-transgrancanaria",
    "key": "family",
    "label": "Family Trail",
    "order": 8,
    "source": "https://transgrancanaria.net/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 5.5,
    "elevationGainM": 1090,
    "eventKey": "wtm-transgrancanaria",
    "key": "vk",
    "label": "VK El Gigante",
    "order": 9,
    "source": "https://transgrancanaria.net/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 120,
    "elevationGainM": 6886,
    "eventKey": "wtm-transgrancanaria",
    "key": "stages",
    "label": "Stages",
    "order": 10,
    "source": "https://transgrancanaria.net/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "eventKey": "wtm-mt-fuji",
    "key": "fuji100",
    "label": "Mt.FUJI 100",
    "order": 1,
    "source": "https://www.mtfuji100.com/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 70,
    "eventKey": "wtm-mt-fuji",
    "key": "kai70k",
    "label": "KAI 70K",
    "order": 2,
    "source": "https://www.mtfuji100.com/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 40,
    "eventKey": "wtm-mt-fuji",
    "key": "asumi40k",
    "label": "ASUMI 40K",
    "order": 3,
    "source": "https://www.mtfuji100.com/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 114.9,
    "elevationGainM": 7200,
    "eventKey": "wtm-miut",
    "key": "miut115",
    "label": "MIUT 115",
    "order": 1,
    "source": "https://itra.run/Races/RaceDetails/10959",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 85,
    "elevationGainM": 4600,
    "eventKey": "wtm-miut",
    "key": "miut85",
    "label": "MIUT 85",
    "order": 2,
    "source": "https://itra.run/Races/RaceDetails/10959",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 60,
    "eventKey": "wtm-miut",
    "key": "miut60",
    "label": "MIUT 60",
    "order": 3,
    "source": "https://itra.run/Races/RaceDetails/10959",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 42,
    "eventKey": "wtm-miut",
    "key": "miut42",
    "label": "MIUT 42",
    "order": 4,
    "source": "https://itra.run/Races/RaceDetails/10959",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 16,
    "eventKey": "wtm-miut",
    "key": "miut16",
    "label": "MIUT 16",
    "order": 5,
    "source": "https://itra.run/Races/RaceDetails/10959",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 161,
    "eventKey": "wtm-south-downs",
    "key": "sdw100",
    "label": "South Downs Way 100",
    "order": 1,
    "source": "https://www.centurionrunning.com/races/south-downs-way-100-2026",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 135,
    "eventKey": "wtm-quebec-mega-trail",
    "key": "qmt135",
    "label": "QMT135",
    "order": 1,
    "source": "https://ultratrailcanada.com/en/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 80,
    "eventKey": "wtm-quebec-mega-trail",
    "key": "qmt80",
    "label": "QMT80",
    "order": 2,
    "source": "https://ultratrailcanada.com/en/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 50,
    "eventKey": "wtm-quebec-mega-trail",
    "key": "qmt50",
    "label": "QMT50",
    "order": 3,
    "source": "https://ultratrailcanada.com/en/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 32,
    "eventKey": "wtm-quebec-mega-trail",
    "key": "qmt32",
    "label": "QMT32",
    "order": 4,
    "source": "https://ultratrailcanada.com/en/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 25,
    "eventKey": "wtm-quebec-mega-trail",
    "key": "qmt25",
    "label": "QMT25",
    "order": 5,
    "source": "https://ultratrailcanada.com/en/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 15,
    "eventKey": "wtm-quebec-mega-trail",
    "key": "qmt15",
    "label": "QMT15",
    "order": 6,
    "source": "https://ultratrailcanada.com/en/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 6,
    "eventKey": "wtm-quebec-mega-trail",
    "key": "qmt6",
    "label": "QMT6",
    "order": 7,
    "source": "https://ultratrailcanada.com/en/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 161,
    "elevationGainM": 8800,
    "eventKey": "wtm-vietnam-mountain",
    "key": "100m",
    "label": "100 Miles Ultra Trail",
    "order": 1,
    "source": "https://vietnamtrailseries.com/mountain-marathon/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 100,
    "eventKey": "wtm-vietnam-mountain",
    "key": "100k",
    "label": "100km Ultra Trail",
    "order": 2,
    "source": "https://vietnamtrailseries.com/mountain-marathon/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 70,
    "eventKey": "wtm-vietnam-mountain",
    "key": "70k",
    "label": "70km Ultra Trail",
    "order": 3,
    "source": "https://vietnamtrailseries.com/mountain-marathon/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 50,
    "eventKey": "wtm-vietnam-mountain",
    "key": "50k",
    "label": "50km Ultra Trail",
    "order": 4,
    "source": "https://vietnamtrailseries.com/mountain-marathon/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 21,
    "eventKey": "wtm-vietnam-mountain",
    "key": "21k",
    "label": "21km Trail Run",
    "order": 5,
    "source": "https://vietnamtrailseries.com/mountain-marathon/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 10,
    "eventKey": "wtm-vietnam-mountain",
    "key": "10k",
    "label": "10km Trail Run",
    "order": 6,
    "source": "https://vietnamtrailseries.com/mountain-marathon/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 162,
    "elevationGainM": 7700,
    "eventKey": "wtm-grampians",
    "key": "gpt100-miler",
    "label": "GPT100 Miler",
    "order": 1,
    "source": "https://www.gpt100.com.au/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 162,
    "elevationGainM": 7700,
    "eventKey": "wtm-grampians",
    "key": "gpt100-stage",
    "label": "GPT100 Stage Race",
    "order": 2,
    "source": "https://www.gpt100.com.au/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 162,
    "elevationGainM": 7700,
    "eventKey": "wtm-grampians",
    "key": "gpt100-relay",
    "label": "GPT100 Miler Team Relay",
    "order": 3,
    "source": "https://www.gpt100.com.au/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 50,
    "eventKey": "wtm-grampians",
    "key": "gpt50k",
    "label": "GPT50k",
    "order": 4,
    "source": "https://www.gpt100.com.au/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 33,
    "eventKey": "wtm-grampians",
    "key": "gpt33",
    "label": "GPT33",
    "order": 5,
    "source": "https://www.gpt100.com.au/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 160.9,
    "elevationGainM": 7516,
    "eventKey": "wtm-cape-town",
    "key": "utct",
    "label": "UTCT",
    "order": 1,
    "source": "https://www.ultratrailcapetown.com/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 100,
    "eventKey": "wtm-cape-town",
    "key": "ut100",
    "label": "UT100",
    "order": 2,
    "source": "https://www.ultratrailcapetown.com/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 55,
    "eventKey": "wtm-cape-town",
    "key": "pt55",
    "label": "PT55",
    "order": 3,
    "source": "https://www.ultratrailcapetown.com/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 35,
    "eventKey": "wtm-cape-town",
    "key": "tm35",
    "label": "TM35",
    "order": 4,
    "source": "https://www.ultratrailcapetown.com/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 23,
    "eventKey": "wtm-cape-town",
    "key": "ex23",
    "label": "EX23",
    "order": 5,
    "source": "https://www.ultratrailcapetown.com/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 16,
    "eventKey": "wtm-cape-town",
    "key": "ks16",
    "label": "KS16",
    "order": 6,
    "source": "https://www.ultratrailcapetown.com/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "eventKey": "other-hardrock",
    "key": "100m",
    "label": "100M",
    "order": 1,
    "verified": true
  },
  {
    "eventKey": "other-leadville",
    "key": "100m",
    "label": "100M",
    "order": 1,
    "verified": true
  },
  {
    "eventKey": "other-badwater",
    "key": "135m",
    "label": "135M",
    "order": 1,
    "verified": true
  },
  {
    "eventKey": "other-wasatch",
    "key": "100m",
    "label": "100M",
    "order": 1,
    "verified": true
  },
  {
    "eventKey": "other-angeles-crest",
    "key": "100m",
    "label": "100M",
    "order": 1,
    "verified": true
  },
  {
    "eventKey": "other-vermont",
    "key": "100m",
    "label": "100M",
    "order": 1,
    "verified": true
  },
  {
    "eventKey": "other-vermont",
    "key": "100k",
    "label": "100K",
    "order": 2,
    "verified": true
  },
  {
    "eventKey": "other-barkley",
    "key": "fun-run",
    "label": "Fun Run",
    "order": 1,
    "verified": true
  },
  {
    "eventKey": "other-barkley",
    "key": "full",
    "label": "Full",
    "order": 2,
    "verified": true
  },
  {
    "eventKey": "other-cocodona",
    "key": "250m",
    "label": "250M",
    "order": 1,
    "verified": true
  },
  {
    "eventKey": "other-moab-240",
    "key": "240m",
    "label": "240M",
    "order": 1,
    "verified": true
  },
  {
    "eventKey": "other-bigfoot-200",
    "key": "200m",
    "label": "200M",
    "order": 1,
    "verified": true
  },
  {
    "eventKey": "other-sinister-7",
    "key": "100m",
    "label": "100M",
    "order": 1,
    "verified": true
  },
  {
    "eventKey": "other-sinister-7",
    "key": "50m",
    "label": "50M",
    "order": 2,
    "verified": true
  },
  {
    "eventKey": "other-sinister-7",
    "key": "50k",
    "label": "50K",
    "order": 3,
    "verified": true
  },
  {
    "eventKey": "other-sinister-7",
    "key": "half",
    "label": "半馬",
    "order": 4,
    "verified": true
  },
  {
    "eventKey": "other-sinister-7",
    "key": "relay",
    "label": "接力",
    "order": 5,
    "verified": true
  },
  {
    "eventKey": "other-canadian-death-race",
    "key": "118k",
    "label": "118K",
    "order": 1,
    "verified": true
  },
  {
    "eventKey": "other-canadian-death-race",
    "key": "42k",
    "label": "42K",
    "order": 2,
    "verified": true
  },
  {
    "eventKey": "other-canadian-death-race",
    "key": "relay",
    "label": "接力",
    "order": 3,
    "verified": true
  },
  {
    "eventKey": "other-squamish-50",
    "key": "50m",
    "label": "50M",
    "order": 1,
    "verified": true
  },
  {
    "eventKey": "other-squamish-50",
    "key": "50k",
    "label": "50K",
    "order": 2,
    "verified": true
  },
  {
    "eventKey": "other-squamish-50",
    "key": "50-50",
    "label": "50/50",
    "order": 3,
    "verified": true
  },
  {
    "eventKey": "other-squamish-50",
    "key": "23k",
    "label": "23K",
    "order": 4,
    "verified": true
  },
  {
    "eventKey": "other-tor-des-geants",
    "key": "330k",
    "label": "330K",
    "order": 1,
    "verified": true
  },
  {
    "eventKey": "other-tor-des-geants",
    "key": "450k",
    "label": "450K",
    "order": 2,
    "verified": true
  },
  {
    "eventKey": "other-templiers",
    "key": "76k",
    "label": "76K",
    "order": 1,
    "verified": true
  },
  {
    "eventKey": "other-transvulcania",
    "key": "73k",
    "label": "73K",
    "order": 1,
    "verified": true
  },
  {
    "eventKey": "other-sierre-zinal",
    "key": "31k",
    "label": "31K",
    "order": 1,
    "verified": true
  },
  {
    "eventKey": "other-zegama",
    "key": "42k",
    "label": "42K",
    "order": 1,
    "verified": true
  },
  {
    "eventKey": "other-trofeo-kima",
    "key": "50k",
    "label": "50K",
    "order": 1,
    "verified": true
  },
  {
    "eventKey": "other-ticino-wildlands",
    "key": "500k",
    "label": "500K",
    "order": 1,
    "verified": true
  },
  {
    "eventKey": "other-ticino-wildlands",
    "key": "250k",
    "label": "250K",
    "order": 2,
    "verified": true
  },
  {
    "eventKey": "other-ticino-wildlands",
    "key": "50k",
    "label": "50K",
    "order": 3,
    "verified": true
  },
  {
    "distanceKm": 104,
    "elevationGainM": 4500,
    "eventKey": "other-translantau",
    "key": "100",
    "label": "TransLantau100",
    "order": 1,
    "source": "https://translantau.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 45,
    "elevationGainM": 2500,
    "eventKey": "other-translantau",
    "key": "50",
    "label": "TransLantau50",
    "order": 2,
    "source": "https://translantau.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 27,
    "elevationGainM": 1100,
    "eventKey": "other-translantau",
    "key": "25",
    "label": "TransLantau25",
    "order": 3,
    "source": "https://translantau.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 15,
    "elevationGainM": 500,
    "eventKey": "other-translantau",
    "key": "15",
    "label": "TransLantau15",
    "order": 4,
    "source": "https://translantau.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "eventKey": "other-hk4tuc",
    "key": "298k",
    "label": "298K",
    "order": 1,
    "verified": true
  },
  {
    "eventKey": "other-diagonale-des-fous",
    "key": "diagonale",
    "label": "Diagonale",
    "order": 1,
    "verified": true
  },
  {
    "eventKey": "other-diagonale-des-fous",
    "key": "bourbon",
    "label": "Bourbon",
    "order": 2,
    "verified": true
  },
  {
    "eventKey": "other-diagonale-des-fous",
    "key": "mascareignes",
    "label": "Mascareignes",
    "order": 3,
    "verified": true
  },
  {
    "eventKey": "other-marathon-des-sables",
    "key": "250k",
    "label": "250K",
    "order": 1,
    "verified": true
  },
  {
    "distanceKm": 170.7,
    "elevationGainM": 8292,
    "eventKey": "other-chongli-168",
    "key": "168k",
    "label": "崇礼 168",
    "order": 1,
    "source": "https://www.news.cn/sports/20260714/3b0fb7fd97664f099b76f8204ce12715/c.html",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "eventKey": "other-chongli-168",
    "key": "100k",
    "label": "崇礼 100",
    "order": 2,
    "source": "https://www.news.cn/sports/20260714/3b0fb7fd97664f099b76f8204ce12715/c.html",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "eventKey": "other-chongli-168",
    "key": "70k",
    "label": "雪如意 70",
    "order": 3,
    "source": "https://www.news.cn/sports/20260714/3b0fb7fd97664f099b76f8204ce12715/c.html",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "eventKey": "other-chongli-168",
    "key": "50k",
    "label": "万龙 50",
    "order": 4,
    "source": "https://www.news.cn/sports/20260714/3b0fb7fd97664f099b76f8204ce12715/c.html",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "eventKey": "other-chongli-168",
    "key": "30k",
    "label": "云顶 30",
    "order": 5,
    "source": "https://www.news.cn/sports/20260714/3b0fb7fd97664f099b76f8204ce12715/c.html",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 106,
    "elevationGainM": 5190,
    "eventKey": "other-ninghai",
    "key": "utnh",
    "label": "UTNH 105K",
    "order": 1,
    "source": "https://www.ninghai.gov.cn/art/2024/10/17/art_1229092276_59178857.html",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 65,
    "elevationGainM": 2840,
    "eventKey": "other-ninghai",
    "key": "cnh",
    "label": "CNH 60K",
    "order": 2,
    "source": "https://www.ninghai.gov.cn/art/2024/10/17/art_1229092276_59178857.html",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "eventKey": "other-ninghai",
    "key": "ynh",
    "label": "YNH 25K",
    "order": 3,
    "source": "https://www.ninghai.gov.cn/art/2024/10/17/art_1229092276_59178857.html",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "elevationGainM": 4339,
    "eventKey": "other-dali-100",
    "key": "100k",
    "label": "100K",
    "order": 1,
    "source": "https://sports.people.com.cn/n/2015/1105/c14820-27780823.html",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "elevationGainM": 2460,
    "eventKey": "other-dali-100",
    "key": "50k",
    "label": "50K",
    "order": 2,
    "source": "https://sports.people.com.cn/n/2015/1105/c14820-27780823.html",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 98,
    "elevationGainM": 6346,
    "eventKey": "other-wugongshan",
    "key": "100k",
    "label": "100K",
    "order": 1,
    "source": "https://zuicool.com/event/4266400",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 56,
    "elevationGainM": 3302,
    "eventKey": "other-wugongshan",
    "key": "50k",
    "label": "50K",
    "order": 2,
    "source": "https://zuicool.com/event/4266400",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 33,
    "elevationGainM": 1884,
    "eventKey": "other-wugongshan",
    "key": "30k",
    "label": "30K",
    "order": 3,
    "source": "https://zuicool.com/event/4266400",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 162,
    "elevationGainM": 7165,
    "eventKey": "other-huangshan-168",
    "key": "168k",
    "label": "168K",
    "order": 1,
    "source": "https://www.runninginchina.org/event/default/2980.html",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 103,
    "elevationGainM": 4000,
    "eventKey": "other-huangshan-168",
    "key": "100k",
    "label": "100K",
    "order": 2,
    "source": "https://www.runninginchina.org/event/default/2980.html",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 56,
    "elevationGainM": 2258,
    "eventKey": "other-huangshan-168",
    "key": "56k",
    "label": "56K",
    "order": 3,
    "source": "https://www.runninginchina.org/event/default/2980.html",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 35,
    "elevationGainM": 1042,
    "eventKey": "other-huangshan-168",
    "key": "35k",
    "label": "35K",
    "order": 4,
    "source": "https://www.runninginchina.org/event/default/2980.html",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 168,
    "elevationGainM": 8014,
    "eventKey": "utmb-mut",
    "key": "miler",
    "label": "MUT Miler",
    "order": 1,
    "source": "https://mut.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 100,
    "elevationGainM": 4717,
    "eventKey": "utmb-mut",
    "key": "100",
    "label": "MUT 100",
    "order": 2,
    "source": "https://mut.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 58,
    "elevationGainM": 3005,
    "eventKey": "utmb-mut",
    "key": "60",
    "label": "MUT 60",
    "order": 3,
    "source": "https://mut.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 43,
    "elevationGainM": 2312,
    "eventKey": "utmb-mut",
    "key": "marathon",
    "label": "MUT Marathon",
    "order": 4,
    "source": "https://mut.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 25,
    "elevationGainM": 1043,
    "eventKey": "utmb-mut",
    "key": "challenge",
    "label": "MUT Challenge",
    "order": 5,
    "source": "https://mut.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 11.9,
    "elevationGainM": 312,
    "eventKey": "utmb-mut",
    "key": "lite",
    "label": "MUT Lite",
    "order": 6,
    "source": "https://mut.utmb.world/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 200,
    "elevationGainM": 7925,
    "eventKey": "other-fat-dog",
    "key": "120m",
    "label": "120 Mile",
    "order": 1,
    "source": "https://www.fatdog120.ca/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 100,
    "eventKey": "other-fat-dog",
    "key": "100k",
    "label": "100 km",
    "order": 2,
    "source": "https://www.fatdog120.ca/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 64,
    "eventKey": "other-fat-dog",
    "key": "40m",
    "label": "40 Mile",
    "order": 3,
    "source": "https://www.fatdog120.ca/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 48.6,
    "elevationGainM": 2600,
    "eventKey": "other-knee-knacker",
    "key": "50k",
    "label": "30 Mile",
    "order": 1,
    "source": "https://kneeknacker.com/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 50,
    "elevationGainM": 2400,
    "eventKey": "other-frosty-mountain",
    "key": "50k",
    "label": "50K",
    "order": 1,
    "source": "https://trailwhisperer.ca/frosty/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 27,
    "elevationGainM": 1300,
    "eventKey": "other-frosty-mountain",
    "key": "27k",
    "label": "27K",
    "order": 2,
    "source": "https://trailwhisperer.ca/frosty/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 13,
    "elevationGainM": 185,
    "eventKey": "other-frosty-mountain",
    "key": "13k",
    "label": "13K",
    "order": 3,
    "source": "https://trailwhisperer.ca/frosty/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 84,
    "eventKey": "other-meet-your-maker",
    "key": "50m",
    "label": "50 Mile",
    "order": 1,
    "source": "https://trailrunner.com/event/meet-your-maker-50/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 108,
    "elevationGainM": 4460,
    "eventKey": "other-black-spur",
    "key": "108k",
    "label": "108K",
    "order": 1,
    "source": "https://www.sinistersports.ca/blackspur/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 54,
    "elevationGainM": 2230,
    "eventKey": "other-black-spur",
    "key": "54k",
    "label": "54K",
    "order": 2,
    "source": "https://www.sinistersports.ca/blackspur/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  },
  {
    "distanceKm": 21,
    "eventKey": "other-black-spur",
    "key": "21k",
    "label": "21K",
    "order": 3,
    "source": "https://www.sinistersports.ca/blackspur/",
    "verified": true,
    "verifiedAt": "2026-08-05"
  }
];
