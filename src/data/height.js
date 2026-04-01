import { polygonCentroid, polygonSignedArea } from "../geometry/polygon.js";

export const DEFAULT_FLOOR_HEIGHT_M = 3;
export const DEFAULT_ROOF_LEVEL_HEIGHT_M = 1.5;
export const MAX_ROOF_ALLOWANCE_M = 3;
export const HEIGHT_NEIGHBOR_RADIUS_M = 45;
export const MIN_NEIGHBOR_SAMPLES = 2;
export const MIN_VALID_HEIGHT_M = 2;
export const MAX_VALID_HEIGHT_M = 120;
export const DEFAULT_SMALL_STRUCTURE_HEIGHT_M = 6;
export const DEFAULT_HOUSE_HEIGHT_M = 9;
export const DEFAULT_LOW_RISE_HEIGHT_M = 12;
export const DEFAULT_URBAN_HEIGHT_M = 18;
export const DEFAULT_URBAN_BLOCK_HEIGHT_M = 21;
export const NEARBY_DIAGNOSTIC_LIMIT = 5;

const NON_NUMERIC_HEIGHT_VALUES = new Set([
  "",
  "yes",
  "no",
  "unknown",
  "none",
  "null",
]);

function parseNumericToken(value) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  if (NON_NUMERIC_HEIGHT_VALUES.has(normalized)) {
    return null;
  }

  const match = normalized.match(/-?\d+(?:[.,]\d+)?/);
  if (!match) {
    return null;
  }

  const numeric = Number.parseFloat(match[0].replace(",", "."));
  return Number.isFinite(numeric) ? numeric : null;
}

function roundDiagnostic(value, precision = 1) {
  if (!Number.isFinite(value)) {
    return null;
  }

  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

export function isValidHeightMeters(heightM) {
  return (
    Number.isFinite(heightM) &&
    heightM >= MIN_VALID_HEIGHT_M &&
    heightM <= MAX_VALID_HEIGHT_M
  );
}

function normalizeHeightMeters(value, unit = "m") {
  if (!Number.isFinite(value)) {
    return null;
  }

  switch (unit) {
    case "m":
      return value;
    case "cm":
      return value / 100;
    case "mm":
      return value / 1000;
    case "ft":
      return value * 0.3048;
    default:
      return null;
  }
}

export function parseHeightMeters(tags = {}) {
  const rawHeight = tags.height;
  if (rawHeight === undefined || rawHeight === null) {
    return null;
  }

  if (typeof rawHeight === "number") {
    return isValidHeightMeters(rawHeight) ? rawHeight : null;
  }

  if (typeof rawHeight !== "string") {
    return null;
  }

  const normalized = rawHeight.trim().toLowerCase();
  if (NON_NUMERIC_HEIGHT_VALUES.has(normalized)) {
    return null;
  }

  const patterns = [
    { regex: /(-?\d+(?:[.,]\d+)?)\s*(m|meter|meters|metre|metres)\b/, unit: "m" },
    { regex: /(-?\d+(?:[.,]\d+)?)\s*(cm|centimeter|centimeters|centimetre|centimetres)\b/, unit: "cm" },
    { regex: /(-?\d+(?:[.,]\d+)?)\s*(mm|millimeter|millimeters|millimetre|millimetres)\b/, unit: "mm" },
    { regex: /(-?\d+(?:[.,]\d+)?)\s*(ft|feet|foot)\b/, unit: "ft" },
    { regex: /(-?\d+(?:[.,]\d+)?)\s*'/, unit: "ft" },
  ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern.regex);
    if (!match) {
      continue;
    }

    const value = Number.parseFloat(match[1].replace(",", "."));
    const meters = normalizeHeightMeters(value, pattern.unit);
    if (isValidHeightMeters(meters)) {
      return meters;
    }
  }

  const numeric = parseNumericToken(normalized);
  if (!Number.isFinite(numeric)) {
    return null;
  }

  return isValidHeightMeters(numeric) ? numeric : null;
}

export function parseBuildingLevels(tags = {}) {
  const levels = parseNumericToken(tags["building:levels"]);
  if (!Number.isFinite(levels) || levels <= 0 || levels > 50) {
    return null;
  }

  return levels;
}

export function parseRoofLevels(tags = {}) {
  const levels = parseNumericToken(tags["roof:levels"]);
  if (!Number.isFinite(levels) || levels <= 0 || levels > 10) {
    return null;
  }

  return levels;
}

export function getBuildingFootprintArea(poly) {
  return Math.abs(polygonSignedArea(poly));
}

function getRawHeightTagDiagnostics(tags = {}) {
  const rawHeight = tags.height ?? null;
  const rawBuildingLevels = tags["building:levels"] ?? null;
  const rawRoofLevels = tags["roof:levels"] ?? null;
  const parsedHeightM = parseHeightMeters(tags);
  const parsedBuildingLevels = parseBuildingLevels(tags);
  const parsedRoofLevels = parseRoofLevels(tags);

  return {
    raw_height: rawHeight,
    raw_levels: rawBuildingLevels,
    raw_roof_levels: rawRoofLevels,
    parsed_height_m: parsedHeightM,
    parsed_building_levels: parsedBuildingLevels,
    parsed_roof_levels: parsedRoofLevels,
    rejected_height: rawHeight !== null && !parsedHeightM,
    rejected_levels: rawBuildingLevels !== null && !parsedBuildingLevels,
    rejected_roof_levels: rawRoofLevels !== null && !parsedRoofLevels,
  };
}

function classifyHeightConfidence(source) {
  if (source === "osm_height") {
    return "high";
  }
  if (source === "building_levels") {
    return "medium";
  }
  if (source === "neighbor_inference") {
    return "medium";
  }
  return "low";
}

export function inferFallbackHeight({ tags = {}, footprintAreaM2 }) {
  const buildingType = String(tags.building || "").toLowerCase();

  if (["garage", "garages", "shed", "kiosk", "roof"].includes(buildingType)) {
    return DEFAULT_SMALL_STRUCTURE_HEIGHT_M;
  }

  if (
    ["house", "detached", "semidetached_house", "terrace", "bungalow"].includes(
      buildingType
    )
  ) {
    return DEFAULT_HOUSE_HEIGHT_M;
  }

  if (
    ["industrial", "warehouse", "retail", "supermarket", "service"].includes(
      buildingType
    )
  ) {
    return DEFAULT_LOW_RISE_HEIGHT_M;
  }

  if (footprintAreaM2 < 35) {
    return DEFAULT_SMALL_STRUCTURE_HEIGHT_M;
  }

  if (footprintAreaM2 < 90) {
    return DEFAULT_LOW_RISE_HEIGHT_M;
  }

  if (
    footprintAreaM2 >= 250 ||
    ["apartments", "residential", "commercial", "office"].includes(buildingType)
  ) {
    return DEFAULT_URBAN_BLOCK_HEIGHT_M;
  }

  return DEFAULT_URBAN_HEIGHT_M;
}

export function getFallbackBucket({ tags = {}, footprintAreaM2 }) {
  const buildingType = String(tags.building || "").toLowerCase();

  if (["garage", "garages", "shed", "kiosk", "roof"].includes(buildingType)) {
    return "petite_structure";
  }

  if (
    ["house", "detached", "semidetached_house", "terrace", "bungalow"].includes(
      buildingType
    )
  ) {
    return "maison";
  }

  if (
    ["industrial", "warehouse", "retail", "supermarket", "service"].includes(
      buildingType
    )
  ) {
    return "batiment_bas_industriel";
  }

  if (footprintAreaM2 < 35) {
    return "petite_emprise";
  }

  if (footprintAreaM2 < 90) {
    return "emprise_compacte";
  }

  if (
    footprintAreaM2 >= 250 ||
    ["apartments", "residential", "commercial", "office"].includes(buildingType)
  ) {
    return "ilot_urbain_dense";
  }

  return "urbain_intermediaire";
}

export function estimateFloorCount(heightM) {
  if (!isValidHeightMeters(heightM)) {
    return 0;
  }

  return Math.max(1, Math.round(heightM / DEFAULT_FLOOR_HEIGHT_M));
}

const HEIGHT_SOURCE_LABELS = {
  osm_height: "hauteur OSM",
  building_levels: "niveaux OSM",
  neighbor_inference: "inférence par voisinage",
  default_fallback: "estimation par défaut",
};

const HEIGHT_CONFIDENCE_LABELS = {
  high: "élevée",
  medium: "moyenne",
  low: "faible",
};

export function getHeightSourceLabel(source) {
  return HEIGHT_SOURCE_LABELS[source] || source || "inconnue";
}

export function getHeightConfidenceLabel(confidence) {
  return HEIGHT_CONFIDENCE_LABELS[confidence] || confidence || "inconnue";
}

function computeRoofAllowanceMeters(tags = {}) {
  const roofLevels = parseRoofLevels(tags);
  if (!roofLevels) {
    return 0;
  }

  return Math.min(roofLevels * DEFAULT_ROOF_LEVEL_HEIGHT_M, MAX_ROOF_ALLOWANCE_M);
}

function getKnownHeightCandidate(building) {
  const tagDiagnostics = getRawHeightTagDiagnostics(building.tags);
  const explicitHeightM = tagDiagnostics.parsed_height_m;
  if (explicitHeightM) {
    return {
      height_m: explicitHeightM,
      height_source: "osm_height",
      height_confidence: classifyHeightConfidence("osm_height"),
      height_debug: {
        footprint_area_m2: building.footprintAreaM2,
        selection_reason: "explicit_height",
        ...tagDiagnostics,
      },
    };
  }

  const levels = tagDiagnostics.parsed_building_levels;
  if (levels) {
    const roofAllowanceM = computeRoofAllowanceMeters(building.tags);
    return {
      height_m: levels * DEFAULT_FLOOR_HEIGHT_M + roofAllowanceM,
      height_source: "building_levels",
      height_confidence: classifyHeightConfidence("building_levels"),
      height_debug: {
        roof_allowance_m: roofAllowanceM,
        footprint_area_m2: building.footprintAreaM2,
        selection_reason: "building_levels",
        ...tagDiagnostics,
      },
    };
  }

  return null;
}

function distanceBetweenBuildings(left, right) {
  return Math.hypot(
    left.centroid.x - right.centroid.x,
    left.centroid.z - right.centroid.z
  );
}

function median(values) {
  if (values.length === 0) {
    return null;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const midIndex = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 0) {
    return (sorted[midIndex - 1] + sorted[midIndex]) / 2;
  }

  return sorted[midIndex];
}

export function inferHeightFromNeighbors(building, candidates) {
  const tagDiagnostics = getRawHeightTagDiagnostics(building.tags);
  const nearbyHeights = candidates
    .filter((candidate) => candidate.id !== building.id)
    .map((candidate) => ({
      candidate,
      distanceM: distanceBetweenBuildings(building, candidate),
    }))
    .filter(({ distanceM }) => distanceM <= HEIGHT_NEIGHBOR_RADIUS_M)
    .sort((left, right) => left.distanceM - right.distanceM);

  if (nearbyHeights.length < MIN_NEIGHBOR_SAMPLES) {
    return null;
  }

  const sampleHeights = nearbyHeights.map(({ candidate }) => candidate.height_m);
  const medianHeightM = median(sampleHeights);
  if (!isValidHeightMeters(medianHeightM)) {
    return null;
  }

  return {
    height_m: medianHeightM,
    height_source: "neighbor_inference",
    height_confidence: classifyHeightConfidence("neighbor_inference"),
    height_debug: {
      neighbor_sample_count: nearbyHeights.length,
      neighbor_height_median: roundDiagnostic(medianHeightM),
      neighbor_height_min: roundDiagnostic(Math.min(...sampleHeights)),
      neighbor_height_max: roundDiagnostic(Math.max(...sampleHeights)),
      neighbor_radius_m: HEIGHT_NEIGHBOR_RADIUS_M,
      footprint_area_m2: building.footprintAreaM2,
      selection_reason: "neighbor_median",
      neighbor_examples: nearbyHeights
        .slice(0, NEARBY_DIAGNOSTIC_LIMIT)
        .map(({ candidate, distanceM }) => ({
          id: candidate.id,
          name: candidate.name,
          distance_m: roundDiagnostic(distanceM),
          height_m: roundDiagnostic(candidate.height_m),
          height_source: candidate.height_source,
          height_confidence: candidate.height_confidence,
        })),
      ...tagDiagnostics,
    },
  };
}

export function deriveBuildingHeight(building, knownCandidates) {
  const directHeight = getKnownHeightCandidate(building);
  if (directHeight) {
    return directHeight;
  }

  const neighborHeight = inferHeightFromNeighbors(building, knownCandidates);
  if (neighborHeight) {
    return neighborHeight;
  }

  const fallbackHeightM = inferFallbackHeight({
    tags: building.tags,
    footprintAreaM2: building.footprintAreaM2,
  });

  return {
    height_m: fallbackHeightM,
    height_source: "default_fallback",
    height_confidence: classifyHeightConfidence("default_fallback"),
    height_debug: {
      fallback_reason: "no_explicit_or_neighbor_height",
      fallback_bucket: getFallbackBucket({
        tags: building.tags,
        footprintAreaM2: building.footprintAreaM2,
      }),
      footprint_area_m2: building.footprintAreaM2,
      selection_reason: "fallback",
      ...getRawHeightTagDiagnostics(building.tags),
    },
  };
}

export function deriveOsmBuildingHeights(rawBuildings) {
  const buildingsWithGeometry = rawBuildings.map((building) => ({
    ...building,
    centroid: building.centroid || polygonCentroid(building.poly),
    footprintAreaM2:
      building.footprintAreaM2 || getBuildingFootprintArea(building.poly),
  }));

  const knownCandidates = [];
  const result = buildingsWithGeometry.map((building) => {
    const directHeight = getKnownHeightCandidate(building);
    if (!directHeight) {
      return building;
    }

    const normalized = {
      ...building,
      ...directHeight,
    };
    knownCandidates.push(normalized);
    return normalized;
  });

  const finalized = result.map((building) => {
    if (building.height_m) {
      return building;
    }

    return {
      ...building,
      ...deriveBuildingHeight(building, knownCandidates),
    };
  });

  if (import.meta.env.DEV && finalized.length > 0) {
    const bySource = finalized.reduce((counts, building) => {
      counts[building.height_source] = (counts[building.height_source] || 0) + 1;
      return counts;
    }, {});
    console.debug("[height] OSM inference summary", {
      buildingCount: finalized.length,
      bySource,
      sample: finalized.slice(0, 5).map((building) => ({
        id: building.id,
        height_m: building.height_m,
        height_source: building.height_source,
        height_confidence: building.height_confidence,
      })),
    });
  }

  return finalized;
}

export function normalizeFixedHeight(building) {
  const height_m = parseHeightMeters({ height: building.height ?? building.h });
  if (height_m) {
    return {
      height_m,
      height_source: "osm_height",
      height_confidence: "high",
      height_debug: {
        raw_height: building.height ?? building.h ?? null,
        parsed_height_m: height_m,
        selection_reason: "fixed_height",
      },
    };
  }

  return {
    height_m: inferFallbackHeight({
      tags: building.tags,
      footprintAreaM2: getBuildingFootprintArea(building.poly),
    }),
    height_source: "default_fallback",
    height_confidence: "low",
    height_debug: {
      fallback_reason: "missing_fixed_height",
      fallback_bucket: getFallbackBucket({
        tags: building.tags,
        footprintAreaM2: getBuildingFootprintArea(building.poly),
      }),
      selection_reason: "fallback",
    },
  };
}

export function getNearbyHeightDiagnostics(building, buildings) {
  return buildings
    .filter((candidate) => candidate.id !== building.id)
    .map((candidate) => ({
      id: candidate.id,
      name: candidate.name,
      distance_m: roundDiagnostic(distanceBetweenBuildings(building, candidate)),
      height_m: roundDiagnostic(candidate.height_m),
      height_source: candidate.height_source,
      height_confidence: candidate.height_confidence,
    }))
    .filter((candidate) => candidate.distance_m <= HEIGHT_NEIGHBOR_RADIUS_M)
    .sort((left, right) => left.distance_m - right.distance_m)
    .slice(0, NEARBY_DIAGNOSTIC_LIMIT);
}
