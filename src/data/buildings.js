import { FLOOR_HEIGHT } from "../constants.js";
import { normalizeFixedHeight } from "./height.js";
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

      return {
        id: building.id || `building-${index}`,
        name: building.name || `Building ${index + 1}`,
        poly,
        edges,
        centroid: polygonCentroid(poly),
        ...normalizedHeight,
        color: building.color || building.clr || "#c8c0b0",
        tags: building.tags || {},
        source,
      };
    })
    .filter((building) => building.poly.length >= 3 && building.edges.length > 0);
}

export function getMaxFloorIndex(building) {
  return Math.max(
    0,
    Math.floor((building.height_m - (FLOOR_HEIGHT - 0.3)) / FLOOR_HEIGHT)
  );
}
