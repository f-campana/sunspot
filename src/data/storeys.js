import { parseBuildingLevels, DEFAULT_FLOOR_HEIGHT_M } from "./height.js";

export const MIN_VALID_STOREYS = 1;
export const MAX_VALID_STOREYS = 50;
export const DEFAULT_SMALL_STRUCTURE_STOREYS = 1;
export const DEFAULT_HOUSE_STOREYS = 2;
export const DEFAULT_LOW_RISE_STOREYS = 3;
export const DEFAULT_URBAN_STOREYS = 6;
export const DEFAULT_URBAN_BLOCK_STOREYS = 7;

function parseNumericStoreys(value) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value !== "string") {
    return null;
  }

  const match = value.trim().match(/-?\d+(?:[.,]\d+)?/);
  if (!match) {
    return null;
  }

  const numeric = Number.parseFloat(match[0].replace(",", "."));
  return Number.isFinite(numeric) ? numeric : null;
}

export function normalizeStoreyCount(value) {
  const numeric = parseNumericStoreys(value);
  if (!Number.isFinite(numeric)) {
    return null;
  }

  const normalized = Math.round(numeric);
  if (normalized < MIN_VALID_STOREYS || normalized > MAX_VALID_STOREYS) {
    return null;
  }

  return normalized;
}

export function inferFallbackStoreys(building) {
  const footprintAreaM2 = building.footprintAreaM2 || 0;
  const buildingType = String(building.tags?.building || "").toLowerCase();

  if (["garage", "garages", "shed", "kiosk", "roof"].includes(buildingType)) {
    return DEFAULT_SMALL_STRUCTURE_STOREYS;
  }

  if (
    ["house", "detached", "semidetached_house", "terrace", "bungalow"].includes(
      buildingType
    )
  ) {
    return DEFAULT_HOUSE_STOREYS;
  }

  if (
    ["industrial", "warehouse", "retail", "supermarket", "service"].includes(
      buildingType
    )
  ) {
    return DEFAULT_LOW_RISE_STOREYS;
  }

  if (footprintAreaM2 < 35) {
    return DEFAULT_SMALL_STRUCTURE_STOREYS;
  }

  if (footprintAreaM2 < 90) {
    return DEFAULT_LOW_RISE_STOREYS;
  }

  if (
    footprintAreaM2 >= 250 ||
    ["apartments", "residential", "commercial", "office"].includes(buildingType)
  ) {
    return DEFAULT_URBAN_BLOCK_STOREYS;
  }

  return DEFAULT_URBAN_STOREYS;
}

function classifyDerivedStoreysConfidence(heightSource) {
  if (heightSource === "bdtopo" || heightSource === "osm_height") {
    return "medium";
  }
  if (heightSource === "building_levels") {
    return "medium";
  }
  return "low";
}

export function deriveStoreysFromHeight(heightM) {
  const estimate = normalizeStoreyCount(heightM / DEFAULT_FLOOR_HEIGHT_M);
  return estimate || null;
}

function roundToTenth(value) {
  if (!Number.isFinite(value)) {
    return null;
  }

  return Math.round(value * 10) / 10;
}

export function deriveBuildingStoreys(building) {
  const explicitStoreys = normalizeStoreyCount(building.storeys);
  if (explicitStoreys) {
    return {
      storeys: explicitStoreys,
      storeys_source: building.storeys_source || "fallback",
      storeys_confidence: building.storeys_confidence || "low",
      storeys_debug: building.storeys_debug || null,
    };
  }

  const osmLevels = normalizeStoreyCount(parseBuildingLevels(building.tags));
  if (osmLevels) {
    return {
      storeys: osmLevels,
      storeys_source: "osm_levels",
      storeys_confidence: "medium",
      storeys_debug: {
        raw_levels: building.tags?.["building:levels"] ?? null,
        parsed_levels: osmLevels,
        selection_reason: "osm_levels",
      },
    };
  }

  const heightDerivedStoreys = deriveStoreysFromHeight(building.height_m);
  if (heightDerivedStoreys) {
    return {
      storeys: heightDerivedStoreys,
      storeys_source: "derived_from_height",
      storeys_confidence: classifyDerivedStoreysConfidence(
        building.height_source
      ),
      storeys_debug: {
        derived_from_height_m: roundToTenth(building.height_m),
        height_source: building.height_source || null,
        selection_reason: "height_conversion",
      },
    };
  }

  return {
    storeys: inferFallbackStoreys(building),
    storeys_source: "fallback",
    storeys_confidence: "low",
    storeys_debug: {
      selection_reason: "fallback",
      height_source: building.height_source || null,
    },
  };
}

export function finalizeBuildingStoreys(building) {
  return {
    ...building,
    ...deriveBuildingStoreys(building),
  };
}

export function deriveStoreysForBuildings(buildings) {
  return buildings.map(finalizeBuildingStoreys);
}

export function getBuildingFloorCount(building) {
  return normalizeStoreyCount(building?.storeys) || 1;
}

export function getMaxFloorIndexFromStoreys(building) {
  return Math.max(0, getBuildingFloorCount(building) - 1);
}

const STOREYS_SOURCE_LABELS = {
  bdnb: "BDNB",
  osm_levels: "niveaux OSM",
  derived_from_height: "calcul à partir de la hauteur",
  fallback: "estimation par défaut",
};

const STOREYS_CONFIDENCE_LABELS = {
  high: "élevée",
  medium: "moyenne",
  low: "faible",
  none: "indisponible",
};

export function getStoreysSourceLabel(source) {
  return STOREYS_SOURCE_LABELS[source] || source || "inconnue";
}

export function getStoreysConfidenceLabel(confidence) {
  return STOREYS_CONFIDENCE_LABELS[confidence] || confidence || "inconnue";
}
