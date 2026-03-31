import * as THREE from "three";
import {
  DEFAULT_TIME_RANGE,
  SAMPLE_ROWS,
  SLOT_MINUTES,
} from "../constants.js";
import { buildFacadeSamples } from "../geometry/facades.js";
import { getSunDirection, getSunPosition } from "./sun.js";

const DAYLIGHT_ALTITUDE_THRESHOLD = 0.02;
const FACADE_FACING_THRESHOLD = 0.05;
const RUN_LIT_THRESHOLD = 0.3;

function splitVerticalRatios(samples, hits) {
  const midpointRow = Math.floor(SAMPLE_ROWS / 2);
  let topCount = 0;
  let topLit = 0;
  let bottomCount = 0;
  let bottomLit = 0;

  samples.forEach((sample, index) => {
    const lit = hits[index] ? 1 : 0;
    if (sample.row >= midpointRow) {
      topCount += 1;
      topLit += lit;
      return;
    }

    bottomCount += 1;
    bottomLit += lit;
  });

  return {
    topRatio: topCount ? topLit / topCount : 0,
    bottomRatio: bottomCount ? bottomLit / bottomCount : 0,
  };
}

export function raycastFacadeSamples({
  samples,
  sunDirection,
  meshes,
  selfMesh,
  raycaster,
}) {
  const occluders = meshes.filter((mesh) => mesh !== selfMesh);

  return samples.map((sample) => {
    raycaster.set(sample.point, sunDirection);
    raycaster.near = 0.3;
    raycaster.far = 800;
    return raycaster.intersectObjects(occluders, false).length === 0;
  });
}

export function evaluateFacadeAtTime({
  building,
  edge,
  floor,
  date,
  center,
  meshes,
  selfMesh,
  raycaster,
}) {
  const samples = buildFacadeSamples(edge, floor);
  const position = getSunPosition(date, center.lat, center.lng);
  const facadeNormal = new THREE.Vector3(edge.nx, 0, edge.nz);
  const sampleStates = samples.map(() => "inactive");

  if (position.altitude <= DAYLIGHT_ALTITUDE_THRESHOLD) {
    return {
      ratio: 0,
      topRatio: 0,
      bottomRatio: 0,
      sampleCount: samples.length,
      sampleStates,
      samples,
      state: "night",
      building,
      edge,
      position,
    };
  }

  const sunDirection = getSunDirection(position);
  if (sunDirection.dot(facadeNormal) <= FACADE_FACING_THRESHOLD) {
    return {
      ratio: 0,
      topRatio: 0,
      bottomRatio: 0,
      sampleCount: samples.length,
      sampleStates,
      samples,
      state: "inactive",
      building,
      edge,
      position,
    };
  }

  const hits = raycastFacadeSamples({
    samples,
    sunDirection,
    meshes,
    selfMesh,
    raycaster,
  });

  let litCount = 0;
  hits.forEach((hit, index) => {
    sampleStates[index] = hit ? "lit" : "blocked";
    if (hit) {
      litCount += 1;
    }
  });

  const { topRatio, bottomRatio } = splitVerticalRatios(samples, hits);

  return {
    ratio: litCount / samples.length,
    topRatio,
    bottomRatio,
    sampleCount: samples.length,
    sampleStates,
    samples,
    state: litCount > 0 ? "lit" : "shade",
    building,
    edge,
    position,
  };
}

export function computeSunExposure({
  building,
  edge,
  floor,
  date,
  center,
  meshes,
  selfMesh,
  raycaster,
  timeRange = DEFAULT_TIME_RANGE,
}) {
  const timeline = [];
  let totalLitRatio = 0;
  let totalTopRatio = 0;
  let totalBottomRatio = 0;
  let daySlots = 0;
  let amLitRatio = 0;
  let pmLitRatio = 0;
  let currentRun = 0;
  let currentRunStart = -1;
  let bestRun = 0;
  let bestRunStart = -1;

  for (
    let minute = timeRange.startMinutes;
    minute <= timeRange.endMinutes;
    minute += timeRange.slotMinutes || SLOT_MINUTES
  ) {
    const slotDate = new Date(date);
    slotDate.setHours(Math.floor(minute / 60), minute % 60, 0, 0);

    const evaluation = evaluateFacadeAtTime({
      building,
      edge,
      floor,
      date: slotDate,
      center,
      meshes,
      selfMesh,
      raycaster,
    });

    timeline.push({
      time: minute,
      ratio: evaluation.ratio,
      topRatio: evaluation.topRatio,
      bottomRatio: evaluation.bottomRatio,
      state: evaluation.state,
    });

    if (evaluation.state !== "night") {
      daySlots += 1;
    }

    totalLitRatio += evaluation.ratio;
    totalTopRatio += evaluation.topRatio;
    totalBottomRatio += evaluation.bottomRatio;

    if (minute < 12 * 60) {
      amLitRatio += evaluation.ratio;
    } else {
      pmLitRatio += evaluation.ratio;
    }

    if (evaluation.ratio >= RUN_LIT_THRESHOLD) {
      currentRun += timeRange.slotMinutes || SLOT_MINUTES;
      if (currentRunStart < 0) {
        currentRunStart = minute;
      }
    } else {
      if (currentRun > bestRun) {
        bestRun = currentRun;
        bestRunStart = currentRunStart;
      }
      currentRun = 0;
      currentRunStart = -1;
    }
  }

  if (currentRun > bestRun) {
    bestRun = currentRun;
    bestRunStart = currentRunStart;
  }

  const hours = (totalLitRatio * (timeRange.slotMinutes || SLOT_MINUTES)) / 60;
  const score = Math.min(100, Math.round((hours / 8) * 100));
  const avgRatio = daySlots ? totalLitRatio / daySlots : 0;
  const topRatio = daySlots ? totalTopRatio / daySlots : 0;
  const bottomRatio = daySlots ? totalBottomRatio / daySlots : 0;

  return {
    hours,
    score,
    avgRatio,
    topRatio,
    bottomRatio,
    edgeIndex: edge.index,
    bestRun,
    bestWindow:
      bestRunStart >= 0
        ? {
            start: bestRunStart,
            end: bestRunStart + bestRun,
          }
        : null,
    obstruction: Math.max(0, 100 - score),
    peakPeriod: amLitRatio > pmLitRatio ? "am" : "pm",
    timeline,
    sampleCount: buildFacadeSamples(edge, floor).length,
  };
}
