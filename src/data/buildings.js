import { FLOOR_HEIGHT } from "../constants.js";
import { normalizeFixedHeight } from "./height.js";
import {
  finalizeBuildingStoreys,
  getMaxFloorIndexFromStoreys,
} from "./storeys.js";
import { buildFacadeEdges } from "../geometry/facades.js";
import {
  normalizePolygonWinding,
  polygonCentroid,
} from "../geometry/polygon.js";

export function preprocessBuildings(rawBuildings, source = "demo") {
  return rawBuildings
    .map((building, index) => {
      const poly = normalizePolygonWinding(building.poly);
      const edges = buildFacadeEdges(poly);
      const normalizedHeight = building.height_m
        ? {
            height_m: building.height_m,
            height_source: building.height_source || "osm_height",
            height_confidence: building.height_confidence || "high",
            height_debug: building.height_debug || null,
          }
        : normalizeFixedHeight({ ...building, poly });

      const normalizedBuilding = {
        id: building.id || `building-${index}`,
        name: building.name || `Building ${index + 1}`,
        poly,
        edges,
        centroid: building.centroid || polygonCentroid(poly),
        footprintAreaM2: building.footprintAreaM2 || null,
        ...normalizedHeight,
        color: building.color || building.clr || "#c8c0b0",
        tags: building.tags || {},
        matched_address: building.matched_address || null,
        address_match_confidence: building.address_match_confidence || "none",
        address_match_reason: building.address_match_reason || "none",
        address_match_debug: building.address_match_debug || null,
        rnb_id: building.rnb_id || null,
        bdnb_id: building.bdnb_id || null,
        rnb_address_label: building.rnb_address_label || null,
        rnb_match_confidence: building.rnb_match_confidence || "none",
        rnb_match_reason: building.rnb_match_reason || "none",
        rnb_match_debug: building.rnb_match_debug || null,
        storeys: building.storeys ?? null,
        storeys_source: building.storeys_source || null,
        storeys_confidence: building.storeys_confidence || null,
        storeys_debug: building.storeys_debug || null,
        source,
      };

      return finalizeBuildingStoreys(normalizedBuilding);
    })
    .filter((building) => building.poly.length >= 3 && building.edges.length > 0);
}

export function getMaxFloorIndex(building) {
  if (building?.storeys) {
    return getMaxFloorIndexFromStoreys(building);
  }

  return Math.max(
    0,
    Math.floor((building.height_m - (FLOOR_HEIGHT - 0.3)) / FLOOR_HEIGHT)
  );
}
