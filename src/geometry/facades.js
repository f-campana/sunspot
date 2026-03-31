import * as THREE from "three";
import {
  FLOOR_HEIGHT,
  NORMAL_OFFSET,
  SAMPLE_ROWS,
} from "../constants.js";
import { normalizePolygonWinding } from "./polygon.js";

export function buildFacadeEdges(poly) {
  const normalized = normalizePolygonWinding(poly);
  const edges = [];

  for (let index = 0; index < normalized.length; index += 1) {
    const [ax, az] = normalized[index];
    const [bx, bz] = normalized[(index + 1) % normalized.length];
    const dx = bx - ax;
    const dz = bz - az;
    const len = Math.hypot(dx, dz);

    if (len < 0.001) {
      continue;
    }

    edges.push({
      index,
      ax,
      az,
      bx,
      bz,
      len,
      nx: dz / len,
      nz: -dx / len,
      midX: (ax + bx) / 2,
      midZ: (az + bz) / 2,
    });
  }

  return edges;
}

export function sampleColumnsForEdge(edge) {
  if (edge.len >= 45) {
    return 7;
  }
  if (edge.len >= 25) {
    return 5;
  }
  return 3;
}

export function buildFacadeSamples(edge, floor, rows = SAMPLE_ROWS) {
  const columns = sampleColumnsForEdge(edge);
  const bottomY = floor * FLOOR_HEIGHT + 0.3;
  const topY = floor * FLOOR_HEIGHT + FLOOR_HEIGHT - 0.3;
  const samples = [];

  for (let column = 0; column < columns; column += 1) {
    const columnFactor = columns === 1 ? 0.5 : column / (columns - 1);
    const edgeFactor = 0.1 + columnFactor * 0.8;
    const x =
      edge.ax + (edge.bx - edge.ax) * edgeFactor + edge.nx * NORMAL_OFFSET;
    const z =
      edge.az + (edge.bz - edge.az) * edgeFactor + edge.nz * NORMAL_OFFSET;

    for (let row = 0; row < rows; row += 1) {
      const rowFactor = rows === 1 ? 0.5 : row / (rows - 1);
      const y = bottomY + rowFactor * (topY - bottomY);
      samples.push({
        row,
        column,
        point: new THREE.Vector3(x, y, z),
      });
    }
  }

  return samples;
}

export function distancePointToSegment(px, pz, ax, az, bx, bz) {
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

export function findClosestEdge({ building, hitNormal, hitPoint }) {
  let bestEdge = building.edges[0];
  let bestScore = -Infinity;

  building.edges.forEach((edge) => {
    const normalAlignment = hitNormal.x * edge.nx + hitNormal.z * edge.nz;
    const distance = hitPoint
      ? distancePointToSegment(
          hitPoint.x,
          hitPoint.z,
          edge.ax,
          edge.az,
          edge.bx,
          edge.bz
        )
      : 0;
    const distanceScore = 1 / (1 + distance * 0.35);
    const score = normalAlignment * 0.75 + distanceScore * 0.25;

    if (score > bestScore) {
      bestScore = score;
      bestEdge = edge;
    }
  });

  return bestEdge;
}

export function getFacadeLabel(edge) {
  const angle = (Math.atan2(edge.nz, edge.nx) * 180) / Math.PI;
  const normalizedAngle = ((angle % 360) + 360) % 360;

  if (normalizedAngle >= 337 || normalizedAngle < 22) return "East";
  if (normalizedAngle < 67) return "South-East";
  if (normalizedAngle < 112) return "South";
  if (normalizedAngle < 157) return "South-West";
  if (normalizedAngle < 202) return "West";
  if (normalizedAngle < 247) return "North-West";
  if (normalizedAngle < 292) return "North";
  return "North-East";
}

export function getFacadeAccentColor(edge) {
  const label = getFacadeLabel(edge);

  if (label.includes("South")) return "#f6b444";
  if (label.includes("North")) return "#7ab3ff";
  if (label.includes("East")) return "#75d8a7";
  return "#eb8f73";
}
