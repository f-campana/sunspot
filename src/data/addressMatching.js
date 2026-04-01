import { FLOOR_HEIGHT } from "../constants.js";

export const ADDRESS_MATCH_MAX_DISTANCE_M = 28;
export const ADDRESS_MATCH_AMBIGUITY_DELTA_M = 4;

function distancePointToSegment(px, pz, ax, az, bx, bz) {
  const abx = bx - ax;
  const abz = bz - az;
  const apx = px - ax;
  const apz = pz - az;
  const abLengthSquared = abx * abx + abz * abz;
  const t =
    abLengthSquared === 0
      ? 0
      : Math.max(
          0,
          Math.min(1, (apx * abx + apz * abz) / abLengthSquared)
        );

  const closestX = ax + abx * t;
  const closestZ = az + abz * t;
  return Math.hypot(px - closestX, pz - closestZ);
}

export function pointInPolygon(point, polygon) {
  let inside = false;

  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
    const [xi, zi] = polygon[index];
    const [xj, zj] = polygon[previous];
    const intersects =
      zi > point.z !== zj > point.z &&
      point.x < ((xj - xi) * (point.z - zi)) / (zj - zi || 1e-9) + xi;

    if (intersects) {
      inside = !inside;
    }
  }

  return inside;
}

export function distancePointToPolygon(point, polygon) {
  if (pointInPolygon(point, polygon)) {
    return 0;
  }

  let minDistance = Infinity;
  for (let index = 0; index < polygon.length; index += 1) {
    const [ax, az] = polygon[index];
    const [bx, bz] = polygon[(index + 1) % polygon.length];
    minDistance = Math.min(
      minDistance,
      distancePointToSegment(point.x, point.z, ax, az, bx, bz)
    );
  }

  return minDistance;
}

function rankCandidates(building, addresses) {
  return addresses
    .map((address) => {
      const inside = pointInPolygon(address, building.poly);
      const polygonDistanceM = distancePointToPolygon(address, building.poly);
      const centroidDistanceM = Math.hypot(
        address.x - building.centroid.x,
        address.z - building.centroid.z
      );

      return {
        address,
        inside,
        polygonDistanceM,
        centroidDistanceM,
      };
    })
    .sort((left, right) => {
      if (left.inside !== right.inside) {
        return left.inside ? -1 : 1;
      }
      if (left.polygonDistanceM !== right.polygonDistanceM) {
        return left.polygonDistanceM - right.polygonDistanceM;
      }
      return left.centroidDistanceM - right.centroidDistanceM;
    });
}

function formatMatch(result) {
  return {
    matched_address: result.address
      ? {
          label: result.address.label,
          housenumber: result.address.housenumber,
          street: result.address.street,
          city: result.address.city,
          postcode: result.address.postcode,
        }
      : null,
    address_match_confidence: result.confidence,
    address_match_reason: result.reason,
    address_match_debug: result.debug,
  };
}

export function matchAddressToBuilding(building, addresses) {
  const candidates = rankCandidates(building, addresses);
  const best = candidates[0];
  const second = candidates[1] || null;

  if (!best) {
    return formatMatch({
      address: null,
      confidence: "none",
      reason: "none",
      debug: {
        candidate_count: 0,
      },
    });
  }

  if (best.inside) {
    const ambiguous =
      second?.inside &&
      second.centroidDistanceM - best.centroidDistanceM <= ADDRESS_MATCH_AMBIGUITY_DELTA_M;

    return formatMatch({
      address: best.address,
      confidence: ambiguous ? "medium" : "high",
      reason: ambiguous ? "ambiguous" : "inside_polygon",
      debug: {
        candidate_count: candidates.length,
        top_candidate_distance_m: Number(best.centroidDistanceM.toFixed(1)),
        inside_candidates: candidates.filter((candidate) => candidate.inside).length,
        competing_candidates: candidates.slice(0, 5).map((candidate) => ({
          label: candidate.address.label,
          inside: candidate.inside,
          polygon_distance_m: Number(candidate.polygonDistanceM.toFixed(1)),
          centroid_distance_m: Number(candidate.centroidDistanceM.toFixed(1)),
        })),
      },
    });
  }

  if (best.polygonDistanceM > ADDRESS_MATCH_MAX_DISTANCE_M) {
    return formatMatch({
      address: null,
      confidence: "none",
      reason: "none",
      debug: {
        candidate_count: candidates.length,
        nearest_distance_m: Number(best.polygonDistanceM.toFixed(1)),
      },
    });
  }

  const ambiguous =
    second &&
    second.polygonDistanceM - best.polygonDistanceM <= ADDRESS_MATCH_AMBIGUITY_DELTA_M;

  return formatMatch({
    address: best.address,
    confidence: ambiguous
      ? "low"
      : best.polygonDistanceM <= FLOOR_HEIGHT * 2
        ? "medium"
        : "low",
    reason: ambiguous ? "ambiguous" : "nearest_point",
    debug: {
      candidate_count: candidates.length,
      nearest_distance_m: Number(best.polygonDistanceM.toFixed(1)),
      centroid_distance_m: Number(best.centroidDistanceM.toFixed(1)),
      competing_candidates: candidates.slice(0, 5).map((candidate) => ({
        label: candidate.address.label,
        inside: candidate.inside,
        polygon_distance_m: Number(candidate.polygonDistanceM.toFixed(1)),
        centroid_distance_m: Number(candidate.centroidDistanceM.toFixed(1)),
      })),
    },
  });
}

export function matchAddressesToBuildings(buildings, addresses) {
  return buildings.map((building) => ({
    ...building,
    ...matchAddressToBuilding(building, addresses),
  }));
}

const ADDRESS_MATCH_CONFIDENCE_LABELS = {
  high: "élevée",
  medium: "moyenne",
  low: "faible",
  none: "indisponible",
};

const ADDRESS_MATCH_REASON_LABELS = {
  inside_polygon: "point d’adresse dans le bâtiment",
  nearest_point: "adresse la plus proche",
  ambiguous: "correspondance incertaine",
  none: "aucune correspondance fiable",
};

export function getAddressMatchConfidenceLabel(confidence) {
  return ADDRESS_MATCH_CONFIDENCE_LABELS[confidence] || confidence || "indisponible";
}

export function getAddressMatchReasonLabel(reason) {
  return ADDRESS_MATCH_REASON_LABELS[reason] || reason || "aucune correspondance fiable";
}

export function getAddressDisplayLabel(building) {
  if (!building?.matched_address?.label) {
    return {
      label: "Adresse non déterminée",
      prefix: "Adresse",
    };
  }

  if (building.address_match_confidence === "high") {
    return {
      prefix: "Adresse",
      label: building.matched_address.label,
    };
  }

  return {
    prefix: "Adresse probable",
    label: building.matched_address.label,
  };
}
