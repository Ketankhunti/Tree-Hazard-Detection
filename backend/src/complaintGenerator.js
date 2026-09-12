/**
 * Complaint Generator
 *
 * Transforms real HRM Public Trees data into the TreeComplaint format
 * that the frontend scoring engine expects.
 *
 * Since the HRM dataset is a tree inventory (not a complaint system),
 * we synthesize realistic complaints based on tree attributes:
 * - Dead trees (FCODE=LCDS) → "dead/dying tree" complaints
 * - Out of service (ASSETSTAT=OUT) → hazard complaints
 * - Trees with WIRES=Y → wire interference complaints
 * - Large trees (DBH 7-9) → structural risk complaints
 * - Stumps (FCODE=LCST) → removal request complaints
 */

import { fetchTreesByStreet, fetchTreesInHalifax } from "./hrmApi.js";

// Halifax neighborhoods with known street names for realistic distribution
const HALIFAX_STREETS = [
  { street: "QUINPOOL", neighborhood: "Quinpool" },
  { street: "SPRING GARDEN", neighborhood: "Downtown" },
  { street: "ROBIE", neighborhood: "Halifax Peninsula" },
  { street: "BARRINGTON", neighborhood: "Downtown" },
  { street: "GOTTINGEN", neighborhood: "North End" },
  { street: "AGRICOLA", neighborhood: "North End" },
  { street: "CORNWALLIS", neighborhood: "North End" },
  { street: "YOUNG", neighborhood: "West End" },
  { street: "CHEBUCTO", neighborhood: "West End" },
  { street: "NORTH", neighborhood: "Downtown" },
  { street: "SOUTH", neighborhood: "South End" },
  { street: "INVERNESS", neighborhood: "Clayton Park" },
  { street: "LACEWOOD", neighborhood: "Clayton Park" },
  { street: "WENTWORTH", neighborhood: "Wentworth" },
  { street: "COBID", neighborhood: "Clayton Park" },
];

// Complaint templates based on tree condition
function generateComplaintText(tree) {
  const { commonName, dbhLabel, wiresPresent, featureLabel, statusLabel } = tree;

  if (tree.featureCode === "LCDS" || tree.assetStatus === "OUT") {
    const templates = [
      `Large ${commonName} at this location appears dead or dying. ${dbhLabel} trunk with no foliage. ${wiresPresent ? "Tree is near overhead wires — falling limbs could hit power lines." : "Concerned about falling branches in storms."} Needs urgent assessment.`,
      `Dead ${commonName} tree, ${dbhLabel}. Bark peeling, no leaves this season. ${wiresPresent ? "Overhead wires nearby, hazard if it falls." : "Could fall on sidewalk/pedestrians."} Please inspect and remove.`,
      `This ${commonName} has been dead for over a year. ${dbhLabel}, completely bare. ${wiresPresent ? "Wires are right next to it." : ""} Safety risk, especially in wind.`,
    ];
    return templates[Math.floor(Math.random() * templates.length)];
  }

  if (tree.featureCode === "LCST") {
    return `Tree stump left on the boulevard after removal. ${dbhLabel} stump is a tripping hazard for pedestrians. Please grind it down or remove.`;
  }

  if (wiresPresent && tree.dbh >= 5) {
    return `Mature ${commonName} (${dbhLabel}) growing into overhead utility wires. Branches touching lines, especially after wind. Needs pruning before it causes an outage or fire.`;
  }

  if (tree.dbh >= 7) {
    return `Very large ${commonName} tree, ${dbhLabel}. Some large dead branches visible in the canopy. ${wiresPresent ? "Near wires. " : ""}Concerned about limb drop onto the street/sidewalk during the next storm. Please assess for pruning.`;
  }

  if (tree.dbh <= 2) {
    return `Young ${commonName} tree planted on the boulevard appears damaged. Leaning significantly, bark split on the south side. May need staking or replacement.`;
  }

  // Default: general maintenance
  return `Mature ${commonName} (${dbhLabel}) on the street. Some crossing branches and deadwood in the lower canopy. ${wiresPresent ? "Near overhead wires. " : ""}Requesting pruning assessment for pedestrian/vehicle clearance.`;
}

// Determine complaint status based on tree condition
// Frontend expects: "Pending" | "Inspected" | "In Progress"
function getComplaintStatus(tree) {
  if (tree.featureCode === "LCDS" || tree.assetStatus === "OUT")
    return "In Progress"; // Dead/dying trees are actively being worked
  if (tree.featureCode === "LCST") return "Inspected"; // Stump already inspected, removal pending
  return "Pending"; // Everything else awaiting inspection
}

// Generate a realistic "days waiting" based on tree urgency
function getDaysWaiting(tree) {
  if (tree.featureCode === "LCDS" || tree.assetStatus === "OUT")
    return Math.floor(Math.random() * 5) + 1; // 1-5 days (urgent)
  if (tree.wiresPresent && tree.dbh >= 5)
    return Math.floor(Math.random() * 15) + 5; // 5-20 days (high priority)
  if (tree.dbh >= 7)
    return Math.floor(Math.random() * 20) + 10; // 10-30 days (large tree)
  return Math.floor(Math.random() * 60) + 15; // 15-75 days (routine)
}

// Generate a complaint ID
let complaintCounter = 0;
function generateComplaintId() {
  complaintCounter++;
  return `HRM-${String(complaintCounter).padStart(4, "0")}`;
}

/**
 * Fetch real tree data from HRM and generate complaints.
 * @param {number} count - target number of complaints to generate
 * @returns {Promise<Array<TreeComplaint>>}
 */
export async function generateComplaintsFromHRM(count = 20) {
  const complaints = [];
  const treesPerStreet = Math.ceil(count / HALIFAX_STREETS.length);

  for (const { street, neighborhood } of HALIFAX_STREETS) {
    if (complaints.length >= count) break;

    try {
      const trees = await fetchTreesByStreet(street, treesPerStreet + 2);
      for (const tree of trees) {
        if (complaints.length >= count) break;

        const status = getComplaintStatus(tree);
        const daysWaiting = getDaysWaiting(tree);
        const submittedDate = new Date(
          Date.now() - daysWaiting * 24 * 60 * 60 * 1000
        ).toISOString();

        complaints.push({
          id: generateComplaintId(),
          address: tree.location,
          street: street
            .split(" ")
            .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
            .join(" "),
          neighborhood,
          complaintText: generateComplaintText(tree),
          daysWaiting,
          submittedDate,
          status,
          latitude: tree.latitude,
          longitude: tree.longitude,
          // Enriched tree data from HRM
          treeData: {
            assetId: tree.assetId,
            commonName: tree.commonName,
            scientificName: tree.scientificName,
            dbh: tree.dbh,
            dbhLabel: tree.dbhLabel,
            wiresPresent: tree.wiresPresent,
            featureCode: tree.featureCode,
            featureLabel: tree.featureLabel,
            assetStatus: tree.assetStatus,
            statusLabel: tree.statusLabel,
            generalLocation: tree.generalLocation,
            yearPlanted: tree.yearPlanted,
          },
        });
      }
    } catch (err) {
      console.error(`Failed to fetch trees for ${street}:`, err.message);
      // Continue to next street on error
    }
  }

  return complaints;
}

/**
 * Fetch all trees in Halifax for the map view.
 * @returns {Promise<Array>}
 */
export async function getHalifaxTreeInventory() {
  try {
    return await fetchTreesInHalifax(1000);
  } catch (err) {
    console.error("Failed to fetch tree inventory:", err.message);
    return [];
  }
}
