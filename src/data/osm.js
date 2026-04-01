import { DEFAULT_SEARCH_RADIUS } from "../constants.js";
import { latLngToLocal } from "../geometry/coordinates.js";
import {
  dedupePolygon,
  polygonCentroid,
  polygonSignedArea,
} from "../geometry/polygon.js";
import { preprocessBuildings } from "./buildings.js";
import {
  deriveOsmBuildingHeights,
  getBuildingFootprintArea,
} from "./height.js";

function overpassQuery(lat, lng, radius) {
  return `
[out:json][timeout:25];
(
  way["building"](around:${radius},${lat},${lng});
  relation["building"](around:${radius},${lat},${lng});
);
out geom;
`;
}

function polygonFromGeometry(geometry, origin) {
  if (!Array.isArray(geometry) || geometry.length < 3) {
    return null;
  }

  const projected = geometry.map(({ lat, lon }) => {
    const local = latLngToLocal(lat, lon, origin);
    return [local.x, local.z];
  });

  const poly = dedupePolygon(projected);
  if (poly.length < 3) {
    return null;
  }

  if (Math.abs(polygonSignedArea(poly)) < 6) {
    return null;
  }

  return poly;
}

function relationOuterPolygons(relation, origin) {
  if (!Array.isArray(relation.members)) {
    return [];
  }

  return relation.members
    .filter((member) => member.role === "outer" && Array.isArray(member.geometry))
    .map((member) => polygonFromGeometry(member.geometry, origin))
    .filter(Boolean)
    .sort(
      (left, right) =>
        Math.abs(polygonSignedArea(right)) - Math.abs(polygonSignedArea(left))
    );
}

function buildingColor(index) {
  const palette = [
    "#c8bfaf",
    "#b9b6b0",
    "#c8b8a5",
    "#d4c7b6",
    "#aab1bb",
    "#cfc3a9",
  ];
  return palette[index % palette.length];
}

export async function fetchBuildingsFromOverpass(
  center,
  radius = DEFAULT_SEARCH_RADIUS
) {
  const response = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: {
      "Content-Type": "text/plain;charset=UTF-8",
    },
    body: overpassQuery(center.lat, center.lng, radius),
  });

  if (!response.ok) {
    throw new Error(`Overpass HTTP ${response.status}`);
  }

  const json = await response.json();
  const elements = Array.isArray(json?.elements) ? json.elements : [];
  const rawBuildings = [];

  elements.forEach((element, index) => {
    const tags = element.tags || {};
    const base = {
      id: `osm-${element.type}-${element.id}`,
      name: tags.name,
      color: buildingColor(index),
      tags,
    };

    if (element.type === "way" && Array.isArray(element.geometry)) {
      const poly = polygonFromGeometry(element.geometry, center);
      if (poly) {
        rawBuildings.push({
          ...base,
          poly,
          centroid: polygonCentroid(poly),
          footprintAreaM2: getBuildingFootprintArea(poly),
        });
      }
      return;
    }

    if (element.type === "relation") {
      const outers = relationOuterPolygons(element, center);
      if (outers[0]) {
        rawBuildings.push({
          ...base,
          poly: outers[0],
          centroid: polygonCentroid(outers[0]),
          footprintAreaM2: getBuildingFootprintArea(outers[0]),
        });
      }
    }
  });

  const buildings = preprocessBuildings(deriveOsmBuildingHeights(rawBuildings), "osm");
  if (buildings.length < 4) {
    throw new Error("Not enough building footprints returned near this address");
  }

  return buildings;
}
