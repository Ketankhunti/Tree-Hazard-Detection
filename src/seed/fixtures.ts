import type { LocationSource, RequestStatus } from "../lib/types";

/**
 * Seed dataset for the Halifax tree-triage demo.
 *
 * GEOGRAPHY IS DELIBERATE, NOT DECORATIVE.
 *
 * The same-day bundling feature is only demonstrable if the data contains real
 * spatial structure, so these coordinates are laid out as five groups:
 *
 *   Cluster A - North End / Hydrostone   tight, ~200-350m spread
 *   Cluster B - West End / Quinpool      moderate, ~400-700m spread
 *   Cluster C - South End                moderate
 *   Cluster D - Downtown                 moderate
 *   Isolated  - Fairview / Clayton Park  ~2.5km from everything else
 *
 * The scenario the product brief describes is built in on purpose:
 *
 *   - The #1 ranked request (Agricola, Critical) sits in Cluster A.
 *   - The #2 ranked request (Dutch Village, Critical) is the ISOLATED one, so
 *     it cannot be bundled with #1 - exactly the "second most critical but too
 *     far away" case.
 *   - Several mid- and low-ranked requests sit 200-350m from #1, so bundling
 *     has genuinely useful, non-obvious recommendations to surface.
 *
 * Also seeded: two already-completed jobs (one with resident feedback), one
 * pre-linked duplicate pair, and one UNLINKED near-duplicate pair left as raw
 * material for the duplicate-detection task.
 *
 * Emails are all @example.com. Nothing here should ever reach a real inbox.
 */

export interface Fixture {
  id: string;
  reference: string;
  reporterName: string;
  reporterEmail: string;
  address: string;
  street: string;
  neighborhood: string;
  latitude: number;
  longitude: number;
  locationSource: LocationSource;
  description: string;
  /** Days before "now" that the resident submitted this. */
  daysAgo: number;
  status: RequestStatus;
  estimatedHours: number;
  /** Set when this report is a second sighting of another request's tree. */
  duplicateOf?: string;
  /** Days before "now" the crew closed it. Only for Completed records. */
  completedDaysAgo?: number;
  feedback?: { rating: number; comment: string };
  /** Whether the seeder should attach a placeholder photo. */
  photo?: boolean;
}

export const fixtures: Fixture[] = [
  // =========================================================================
  // CLUSTER A - North End / Hydrostone. Contains the #1 ranked request.
  // =========================================================================
  {
    id: "r-a1-agricola",
    reference: "HFX-2026-0412",
    reporterName: "Maya Doucette",
    reporterEmail: "maya.doucette@example.com",
    address: "6021 Agricola Street",
    street: "Agricola Street",
    neighborhood: "North End",
    latitude: 44.6592,
    longitude: -63.5968,
    locationSource: "exif",
    description:
      "Massive oak leaning approximately 45 degrees toward the house after last night's storm. The trunk appears to be splitting near the base and several large limbs are hanging over the roof.",
    daysAgo: 3,
    status: "Submitted",
    estimatedHours: 5,
    photo: true,
  },
  {
    id: "r-a2-almon",
    reference: "HFX-2026-0155",
    reporterName: "Tom Beaulieu",
    reporterEmail: "tom.beaulieu@example.com",
    address: "5890 Almon Street",
    street: "Almon Street",
    neighborhood: "Hydrostone",
    latitude: 44.6601,
    longitude: -63.5993,
    locationSource: "geocoded",
    description:
      "Large limb is cracked and hanging above the street where everyone parks. It shifted noticeably during the rain yesterday.",
    daysAgo: 58,
    status: "Triaged",
    estimatedHours: 2.5,
    photo: true,
  },
  {
    id: "r-a3-young",
    reference: "HFX-2026-0288",
    reporterName: "Priya Raman",
    reporterEmail: "priya.raman@example.com",
    address: "5657 Young Street",
    street: "Young Street",
    neighborhood: "North End",
    latitude: 44.6612,
    longitude: -63.5981,
    locationSource: "geocoded",
    description:
      "Small branches from the city tree are touching the utility line over the lane. No arcing, just contact when it is windy.",
    daysAgo: 189,
    status: "Triaged",
    estimatedHours: 2,
    photo: true,
  },
  {
    id: "r-a4-isleville",
    reference: "HFX-2026-0331",
    reporterName: "Colin Fraser",
    reporterEmail: "colin.fraser@example.com",
    address: "2840 Isleville Street",
    street: "Isleville Street",
    neighborhood: "North End",
    latitude: 44.6585,
    longitude: -63.5944,
    locationSource: "geocoded",
    description:
      "Roots are pushing up the sidewalk slabs and blocking the walkway for strollers. The tree itself looks healthy.",
    daysAgo: 73,
    status: "Submitted",
    estimatedHours: 3,
  },
  {
    id: "r-a5-duffus",
    reference: "HFX-2026-0402",
    reporterName: "Sarah Gillis",
    reporterEmail: "sarah.gillis@example.com",
    address: "3155 Duffus Street",
    street: "Duffus Street",
    neighborhood: "North End",
    latitude: 44.662,
    longitude: -63.5952,
    locationSource: "geocoded",
    description:
      "Low branches hanging over the sidewalk, tall people have to duck around them. Not damaged, just needs a clearance cut.",
    daysAgo: 34,
    status: "Submitted",
    estimatedHours: 1.5,
  },
  {
    id: "r-a6-gottingen",
    reference: "HFX-2026-0510",
    reporterName: "Denise Aucoin",
    reporterEmail: "denise.aucoin@example.com",
    address: "2255 Gottingen Street",
    street: "Gottingen Street",
    neighborhood: "North End",
    latitude: 44.6528,
    longitude: -63.5885,
    locationSource: "exif",
    description:
      "The tree has split down the main trunk fork and you can see straight through the middle. It is uprooted on one side and leaning over the daycare fence and the sidewalk.",
    daysAgo: 168,
    status: "In Progress",
    estimatedHours: 6,
    photo: true,
  },

  // =========================================================================
  // CLUSTER B - West End / Quinpool
  // =========================================================================
  {
    id: "r-b1-quinpool",
    reference: "HFX-2026-0394",
    reporterName: "Jean-Luc Comeau",
    reporterEmail: "jl.comeau@example.com",
    address: "6410 Quinpool Road",
    street: "Quinpool Road",
    neighborhood: "Quinpool District",
    latitude: 44.6455,
    longitude: -63.5971,
    locationSource: "exif",
    description:
      "Dead tree beside the sidewalk is leaning toward overhead power lines. Sparking was heard twice during the wind storm last week and the roots are lifted on one side.",
    daysAgo: 96,
    status: "Triaged",
    estimatedHours: 5.5,
    photo: true,
  },
  {
    id: "r-b2-oxford",
    reference: "HFX-2026-0287",
    reporterName: "Hannah Wu",
    reporterEmail: "hannah.wu@example.com",
    address: "3155 Oxford Street",
    street: "Oxford Street",
    neighborhood: "West End",
    latitude: 44.6462,
    longitude: -63.601,
    locationSource: "geocoded",
    description:
      "The whole tree is visibly tilting toward the street more than it was last month and there is a new crack in the sidewalk beside it. Cars park underneath it all day.",
    daysAgo: 290,
    status: "Triaged",
    estimatedHours: 4,
    photo: true,
  },
  {
    id: "r-b3-chebucto",
    reference: "HFX-2026-0382",
    reporterName: "Owen Publicover",
    reporterEmail: "owen.publicover@example.com",
    address: "6337 Chebucto Road",
    street: "Chebucto Road",
    neighborhood: "West End",
    latitude: 44.6448,
    longitude: -63.6015,
    locationSource: "geocoded",
    description:
      "Standing dead tree next to the walking path, no bark left on the top third. No buildings nearby but people use this path constantly.",
    daysAgo: 121,
    status: "Submitted",
    estimatedHours: 3.5,
  },
  {
    id: "r-b4-pepperell",
    reference: "HFX-2026-0357",
    reporterName: "Grace Nickerson",
    reporterEmail: "grace.nickerson@example.com",
    address: "6234 Pepperell Street",
    street: "Pepperell Street",
    neighborhood: "West End",
    latitude: 44.6435,
    longitude: -63.5985,
    locationSource: "geocoded",
    description:
      "Requesting removal because the tree drops sap on my car and the acorns make a mess of the walkway every year.",
    daysAgo: 161,
    status: "Submitted",
    estimatedHours: 1,
  },

  {
    id: "r-b5-vernon",
    reference: "HFX-2026-0366",
    reporterName: "Aditi Sharma",
    reporterEmail: "aditi.sharma@example.com",
    address: "6108 Vernon Street",
    street: "Vernon Street",
    neighborhood: "West End",
    latitude: 44.644,
    longitude: -63.595,
    locationSource: "geocoded",
    description:
      "Several dead branches high in the maple directly over the sidewalk. One came down on its own last week and landed on the walkway.",
    daysAgo: 112,
    status: "Submitted",
    estimatedHours: 2.5,
  },
  {
    id: "r-b6-cork",
    reference: "HFX-2026-0429",
    reporterName: "Liam Hennessey",
    reporterEmail: "liam.hennessey@example.com",
    address: "6242 Cork Street",
    street: "Cork Street",
    neighborhood: "West End",
    latitude: 44.647,
    longitude: -63.5995,
    locationSource: "geocoded",
    description:
      "The boulevard tree has grown uneven and needs a trim. Purely a tidiness issue, nothing is damaged.",
    daysAgo: 27,
    status: "Submitted",
    estimatedHours: 1,
  },

  // =========================================================================
  // CLUSTER C - South End
  // =========================================================================
  {
    id: "r-c1-springgarden",
    reference: "HFX-2026-0441",
    reporterName: "Alan Rhodenizer",
    reporterEmail: "alan.rhodenizer@example.com",
    address: "1180 Spring Garden Road",
    street: "Spring Garden Road",
    neighborhood: "South End",
    latitude: 44.6432,
    longitude: -63.5795,
    locationSource: "geocoded",
    description:
      "A few dead branches high in the oak over the bus shelter. Nothing hanging loose that I can see but they should come out at some point.",
    daysAgo: 8,
    status: "Submitted",
    estimatedHours: 2,
  },
  {
    id: "r-c2-southpark",
    reference: "HFX-2026-0373",
    reporterName: "Ingrid Sollows",
    reporterEmail: "ingrid.sollows@example.com",
    address: "1649 South Park Street",
    street: "South Park Street",
    neighborhood: "South End",
    latitude: 44.6421,
    longitude: -63.5811,
    locationSource: "geocoded",
    description:
      "Large mushroom growth and a soft hollow rot at the base of the trunk. The tree is about sixty feet tall and overhangs the public parking lot.",
    daysAgo: 134,
    status: "Scheduled",
    estimatedHours: 4.5,
    photo: true,
  },
  {
    id: "r-c3-tower",
    reference: "HFX-2026-0420",
    reporterName: "Marc Leblanc",
    reporterEmail: "marc.leblanc@example.com",
    address: "1333 Tower Road",
    street: "Tower Road",
    neighborhood: "South End",
    latitude: 44.6395,
    longitude: -63.5848,
    locationSource: "geocoded",
    description:
      "Tree looks ugly and needs trimming. It is uneven compared to the neighbours' and makes the block look unkept.",
    daysAgo: 5,
    status: "Submitted",
    estimatedHours: 1,
  },
  {
    id: "r-c4-jubilee",
    reference: "HFX-2026-0210",
    reporterName: "Fatima Noor",
    reporterEmail: "fatima.noor@example.com",
    address: "6155 Jubilee Road",
    street: "Jubilee Road",
    neighborhood: "South End",
    latitude: 44.6387,
    longitude: -63.5936,
    locationSource: "geocoded",
    description:
      "Leaves are blocking the sidewalk every fall and clogging my gutters. Would like it pruned back before the season starts.",
    daysAgo: 34,
    status: "Submitted",
    estimatedHours: 1,
  },

  // =========================================================================
  // CLUSTER D - Downtown
  // =========================================================================
  {
    id: "r-d1-barrington",
    reference: "HFX-2026-0390",
    reporterName: "Ruth Kowalski",
    reporterEmail: "ruth.kowalski@example.com",
    address: "1585 Barrington Street",
    street: "Barrington Street",
    neighborhood: "Downtown Halifax",
    latitude: 44.6459,
    longitude: -63.5738,
    locationSource: "geocoded",
    description:
      "Large dead branch hanging over the driveway entrance to the building. It has been there for several weeks and appears to be getting worse.",
    daysAgo: 12,
    status: "Submitted",
    estimatedHours: 2.5,
    photo: true,
  },
  {
    id: "r-d2-brunswick",
    reference: "HFX-2026-0295",
    reporterName: "Peter Oickle",
    reporterEmail: "peter.oickle@example.com",
    address: "2144 Brunswick Street",
    street: "Brunswick Street",
    neighborhood: "Downtown Halifax",
    latitude: 44.6514,
    longitude: -63.5849,
    locationSource: "geocoded",
    description:
      "Low branches hanging over the sidewalk near the crosswalk. Not damaged, just needs a clearance cut before winter.",
    daysAgo: 246,
    status: "Submitted",
    estimatedHours: 1.5,
  },

  // =========================================================================
  // ISOLATED - Fairview / Clayton Park. ~2.5km from Cluster A.
  // This is the "#2 priority but too far to bundle with #1" case.
  // =========================================================================
  {
    id: "r-e1-dutchvillage",
    reference: "HFX-2026-0302",
    reporterName: "Bev Hiltz",
    reporterEmail: "bev.hiltz@example.com",
    address: "3470 Dutch Village Road",
    street: "Dutch Village Road",
    neighborhood: "Fairview",
    latitude: 44.6617,
    longitude: -63.6272,
    locationSource: "exif",
    description:
      "Storm brought the tree down partially onto the garage roof. It is still attached at the base and unstable, and it is resting against the electrical wire running to the house.",
    daysAgo: 224,
    status: "Triaged",
    estimatedHours: 6,
    photo: true,
  },
  {
    id: "r-e2-seaforth",
    reference: "HFX-2026-0415",
    reporterName: "Dan Whynot",
    reporterEmail: "dan.whynot@example.com",
    address: "2601 Seaforth Street",
    street: "Seaforth Street",
    neighborhood: "Fairview",
    latitude: 44.6644,
    longitude: -63.6231,
    locationSource: "geocoded",
    description: "Something seems wrong with the tree behind my house.",
    daysAgo: 177,
    status: "Submitted",
    estimatedHours: 2,
  },
  {
    id: "r-e3-lawrence",
    reference: "HFX-2026-0433",
    reporterName: "Krista Surette",
    reporterEmail: "krista.surette@example.com",
    address: "5440 Lawrence Street",
    street: "Lawrence Street",
    neighborhood: "North End",
    latitude: 44.6539,
    longitude: -63.5907,
    locationSource: "geocoded",
    description: "Tree looks weird.",
    daysAgo: 2,
    status: "Submitted",
    estimatedHours: 1,
  },

  // =========================================================================
  // DUPLICATE PAIR 1 - already linked. Proves the queue hides linked copies.
  // Two neighbours reported the same fallen tree on Robie a day apart.
  // =========================================================================
  {
    id: "r-dup-robie-primary",
    reference: "HFX-2026-0278",
    reporterName: "Elaine Boutilier",
    reporterEmail: "elaine.boutilier@example.com",
    address: "2789 Robie Street",
    street: "Robie Street",
    neighborhood: "Peninsula North",
    latitude: 44.6567,
    longitude: -63.5981,
    locationSource: "exif",
    description:
      "Large tree has fallen partially onto the driveway and is blocking the street. The remaining trunk is cracked and appears unstable. Two cars are trapped behind it.",
    daysAgo: 41,
    status: "Triaged",
    estimatedHours: 5,
    photo: true,
  },
  {
    id: "r-dup-robie-copy",
    reference: "HFX-2026-0281",
    reporterName: "Gerald Tanner",
    reporterEmail: "gerald.tanner@example.com",
    address: "2795 Robie Street",
    street: "Robie Street",
    neighborhood: "Peninsula North",
    latitude: 44.6569,
    longitude: -63.5979,
    locationSource: "geocoded",
    description:
      "A tree came down across the driveway next door and is partly blocking Robie. Looks like the trunk is cracked. Cars cannot get out.",
    daysAgo: 40,
    status: "Duplicate",
    estimatedHours: 5,
    duplicateOf: "r-dup-robie-primary",
  },

  // =========================================================================
  // DUPLICATE PAIR 2 - NOT linked. Raw material for duplicate detection.
  // Both are live in the queue right now, which is the bug to be fixed.
  // =========================================================================
  {
    id: "r-dup-windsor-a",
    reference: "HFX-2026-0446",
    reporterName: "Nadia Mombourquette",
    reporterEmail: "nadia.m@example.com",
    address: "3312 Windsor Street",
    street: "Windsor Street",
    neighborhood: "West End",
    latitude: 44.6535,
    longitude: -63.6042,
    locationSource: "exif",
    description:
      "Huge branch snapped off in the wind and is hanging over the sidewalk by the bus stop. It has not come down yet but it is swinging.",
    daysAgo: 4,
    status: "Submitted",
    estimatedHours: 3,
    photo: true,
  },
  {
    id: "r-dup-windsor-b",
    reference: "HFX-2026-0448",
    reporterName: "Scott Dauphinee",
    reporterEmail: "scott.dauphinee@example.com",
    address: "3318 Windsor Street",
    street: "Windsor Street",
    neighborhood: "West End",
    latitude: 44.6536,
    longitude: -63.6041,
    locationSource: "geocoded",
    description:
      "Broken limb hanging above the sidewalk near the bus stop after the storm. Dangerous for anyone waiting there.",
    daysAgo: 3,
    status: "Submitted",
    estimatedHours: 3,
  },

  // =========================================================================
  // COMPLETED - out of the queue, retained for history and duplicate checks.
  // =========================================================================
  {
    id: "r-done-northst",
    reference: "HFX-2026-0104",
    reporterName: "Meredith Googoo",
    reporterEmail: "meredith.googoo@example.com",
    address: "5657 North Street",
    street: "North Street",
    neighborhood: "North End",
    latitude: 44.6561,
    longitude: -63.5921,
    locationSource: "geocoded",
    description:
      "Dead elm in the boulevard, no leaves at all this season and bark falling off in sheets. It is right beside a bus shelter.",
    daysAgo: 96,
    status: "Completed",
    estimatedHours: 4,
    completedDaysAgo: 21,
    feedback: {
      rating: 5,
      comment:
        "Crew arrived early and cleaned up everything. The stump grinding was a nice surprise. Thank you.",
    },
    photo: true,
  },
  {
    id: "r-done-connaught",
    reference: "HFX-2026-0088",
    reporterName: "Victor Hebb",
    reporterEmail: "victor.hebb@example.com",
    address: "6890 Connaught Avenue",
    street: "Connaught Avenue",
    neighborhood: "West End",
    latitude: 44.6489,
    longitude: -63.6087,
    locationSource: "geocoded",
    description:
      "Broken branch caught in the canopy about thirty feet up, directly above the cafe patio seating. It moved during the storm on the weekend.",
    daysAgo: 147,
    status: "Completed",
    estimatedHours: 3,
    completedDaysAgo: 60,
  },
  {
    id: "r-rejected-inglis",
    reference: "HFX-2026-0221",
    reporterName: "Lorne Naugler",
    reporterEmail: "lorne.naugler@example.com",
    address: "5440 Inglis Street",
    street: "Inglis Street",
    neighborhood: "South End",
    latitude: 44.6301,
    longitude: -63.5762,
    locationSource: "geocoded",
    description:
      "The tree in my neighbour's yard drops leaves on my side of the fence and I would like it removed.",
    daysAgo: 118,
    status: "Rejected",
    estimatedHours: 1,
  },
];

/** Cluster centres, used by the seeder's summary output. */
export const CLUSTER_LABELS: Record<string, string> = {
  "r-a": "North End / Hydrostone",
  "r-b": "West End / Quinpool",
  "r-c": "South End",
  "r-d": "Downtown",
  "r-e": "Fairview (isolated)",
};
