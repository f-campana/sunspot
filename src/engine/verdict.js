export const VERDICT_WEIGHTS = {
  directSunlight: 30,
  duration: 20,
  continuity: 15,
  timeOfDay: 15,
  seasonalRobustness: 10,
  verticalConsistency: 10,
};

export const DIRECT_SUN_CAP_SCORE = 40;
export const SUMMER_ONLY_CAP_SCORE = 59;
export const FRAGMENTED_LIGHT_CAP_SCORE = 59;
export const WEAK_PARTIAL_SUN_CAP_SCORE = 49;
export const NEAR_ZERO_DIRECT_SUN_HOURS = 0.35;
export const MIN_GOOD_CONTINUOUS_RUN_MINUTES = 90;
export const STRONG_CONTINUOUS_RUN_MINUTES = 180;
export const AFTERNOON_START_MINUTES = 13 * 60;
export const WINTER_ROBUST_HOURS_THRESHOLD = 2.5;
export const WINTER_WEAK_HOURS_THRESHOLD = 1;
export const SUMMER_STRONG_HOURS_THRESHOLD = 5;
export const VERTICAL_MISMATCH_THRESHOLD = 0.28;
export const HEAVY_OBSTRUCTION_THRESHOLD = 0.22;
export const WEAK_PARTIAL_SUN_THRESHOLD = 0.3;

const VERDICT_LABELS = [
  { min: 80, verdict: "Excellent" },
  { min: 60, verdict: "Bon" },
  { min: 40, verdict: "Moyen" },
  { min: 0, verdict: "Faible" },
];

const VERDICT_META = {
  Excellent: {
    label: "Excellent",
    tone: "excellent",
    color: "#f6b444",
    accent: "rgba(246,180,68,0.16)",
  },
  Bon: {
    label: "Bon",
    tone: "good",
    color: "#e9d47d",
    accent: "rgba(233,212,125,0.14)",
  },
  Moyen: {
    label: "Moyen",
    tone: "medium",
    color: "#b8b5a7",
    accent: "rgba(184,181,167,0.12)",
  },
  Faible: {
    label: "Faible",
    tone: "weak",
    color: "#8da0be",
    accent: "rgba(141,160,190,0.12)",
  },
};

function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function scoreRatio(value, target) {
  if (target <= 0) {
    return 0;
  }

  return clamp(value / target);
}

function roundScore(value) {
  return Math.round(value * 10) / 10;
}

function getDaytimeShare(summary, startMinutes, endMinutes) {
  const slots = summary.timeline.filter(
    (entry) =>
      entry.state !== "night" &&
      entry.time >= startMinutes &&
      entry.time < endMinutes
  );

  if (slots.length === 0) {
    return 0;
  }

  return (
    slots.reduce((total, entry) => total + entry.ratio, 0) / slots.length
  );
}

function computeDirectSunlightDimension(summary) {
  const peakRatio = Math.max(...summary.timeline.map((entry) => entry.ratio), 0);
  const score =
    VERDICT_WEIGHTS.directSunlight *
    clamp(summary.avgRatio * 0.7 + peakRatio * 0.3);

  return {
    score,
    peakRatio,
    avgRatio: summary.avgRatio,
    nearZero: summary.hours <= NEAR_ZERO_DIRECT_SUN_HOURS || peakRatio < 0.18,
  };
}

function computeDurationDimension(summary) {
  return {
    score: VERDICT_WEIGHTS.duration * scoreRatio(summary.hours, 6),
    hours: summary.hours,
  };
}

function computeContinuityDimension(summary) {
  const runScore =
    summary.bestRun >= STRONG_CONTINUOUS_RUN_MINUTES
      ? 1
      : scoreRatio(summary.bestRun, MIN_GOOD_CONTINUOUS_RUN_MINUTES);

  return {
    score: VERDICT_WEIGHTS.continuity * runScore,
    fragmented:
      summary.hours > 1.25 && summary.bestRun < MIN_GOOD_CONTINUOUS_RUN_MINUTES,
    bestRun: summary.bestRun,
  };
}

function computeTimeOfDayDimension(summary) {
  const morningShare = getDaytimeShare(summary, 6 * 60, 12 * 60);
  const afternoonShare = getDaytimeShare(summary, AFTERNOON_START_MINUTES, 19 * 60);
  const neutralShare = getDaytimeShare(summary, 12 * 60, AFTERNOON_START_MINUTES);
  const weightedPresence = clamp(
    afternoonShare * 1 +
      neutralShare * 0.8 +
      morningShare * 0.65
  );

  return {
    score: VERDICT_WEIGHTS.timeOfDay * weightedPresence,
    morningShare,
    afternoonShare,
    dominantPeriod:
      afternoonShare > morningShare + 0.05 ? "pm" : morningShare > afternoonShare + 0.05 ? "am" : "balanced",
  };
}

function computeSeasonalRobustnessDimension(seasonal) {
  const summerHours = seasonal?.summer?.hours || 0;
  const winterHours = seasonal?.winter?.hours || 0;
  const winterRetention = summerHours > 0 ? clamp(winterHours / summerHours) : 0;
  const winterPresence = scoreRatio(winterHours, WINTER_ROBUST_HOURS_THRESHOLD);
  const score =
    VERDICT_WEIGHTS.seasonalRobustness *
    clamp(winterRetention * 0.55 + winterPresence * 0.45);

  return {
    score,
    summerHours,
    winterHours,
    winterRetention,
    summerOnly:
      summerHours >= SUMMER_STRONG_HOURS_THRESHOLD &&
      winterHours <= WINTER_WEAK_HOURS_THRESHOLD,
  };
}

function computeVerticalConsistencyDimension(summary) {
  const mismatch = Math.abs(summary.topRatio - summary.bottomRatio);
  const consistency = clamp(1 - mismatch / 0.5);

  return {
    score: VERDICT_WEIGHTS.verticalConsistency * consistency,
    mismatch,
    strongObstructionProxy:
      summary.avgRatio <= HEAVY_OBSTRUCTION_THRESHOLD &&
      summary.topRatio <= WEAK_PARTIAL_SUN_THRESHOLD &&
      summary.bottomRatio <= WEAK_PARTIAL_SUN_THRESHOLD,
  };
}

function applyGuardrails(score, breakdown) {
  let cappedScore = score;
  const appliedGuardrails = [];

  if (breakdown.directSunlight.nearZero) {
    cappedScore = Math.min(cappedScore, DIRECT_SUN_CAP_SCORE);
    appliedGuardrails.push("no_direct_sun");
  }

  if (breakdown.seasonalRobustness.summerOnly) {
    cappedScore = Math.min(cappedScore, SUMMER_ONLY_CAP_SCORE);
    appliedGuardrails.push("summer_only");
  }

  if (breakdown.continuity.fragmented) {
    cappedScore = Math.min(cappedScore, FRAGMENTED_LIGHT_CAP_SCORE);
    appliedGuardrails.push("fragmented_light");
  }

  if (
    breakdown.verticalConsistency.strongObstructionProxy &&
    breakdown.directSunlight.avgRatio <= WEAK_PARTIAL_SUN_THRESHOLD
  ) {
    cappedScore = Math.min(cappedScore, WEAK_PARTIAL_SUN_CAP_SCORE);
    appliedGuardrails.push("strong_obstruction");
  }

  return {
    score: cappedScore,
    appliedGuardrails,
  };
}

function getVerdictLabel(score) {
  return VERDICT_LABELS.find((entry) => score >= entry.min)?.verdict || "Faible";
}

function pushInsight(insights, text) {
  if (!text || insights.includes(text) || insights.length >= 3) {
    return;
  }

  insights.push(text);
}

function buildVerdictInsights(breakdown, summary) {
  const insights = [];

  if (breakdown.directSunlight.nearZero) {
    pushInsight(insights, "Très peu de soleil direct");
  } else if (breakdown.timeOfDay.dominantPeriod === "pm") {
    pushInsight(insights, "Soleil direct l’après-midi");
  } else if (breakdown.timeOfDay.dominantPeriod === "am") {
    pushInsight(insights, "Soleil surtout le matin");
  } else {
    pushInsight(insights, "Exposition répartie dans la journée");
  }

  if (breakdown.seasonalRobustness.winterHours >= WINTER_ROBUST_HOURS_THRESHOLD) {
    pushInsight(insights, "Bonne tenue même en hiver");
  } else if (breakdown.seasonalRobustness.summerOnly) {
    pushInsight(insights, "Résultat nettement plus faible en hiver");
  }

  if (summary.bestRun >= STRONG_CONTINUOUS_RUN_MINUTES) {
    pushInsight(insights, "Longue plage de lumière continue");
  } else if (breakdown.continuity.fragmented) {
    pushInsight(insights, "Lumière morcelée sur la journée");
  }

  if (breakdown.verticalConsistency.mismatch <= 0.14) {
    pushInsight(insights, "Lumière homogène sur la hauteur");
  } else if (summary.topRatio > summary.bottomRatio + VERTICAL_MISMATCH_THRESHOLD) {
    pushInsight(insights, "Partie haute nettement mieux exposée");
  } else if (summary.bottomRatio > summary.topRatio + VERTICAL_MISMATCH_THRESHOLD) {
    pushInsight(insights, "Partie basse un peu mieux exposée");
  }

  return insights.slice(0, 3);
}

function buildPrimaryExplanation(verdict, breakdown) {
  if (verdict === "Faible") {
    if (breakdown.directSunlight.nearZero) {
      return "Cette façade reçoit très peu de soleil direct.";
    }
    return "La lumière directe reste limitée et peu régulière.";
  }

  if (verdict === "Moyen") {
    if (breakdown.seasonalRobustness.summerOnly) {
      return "La lumière est correcte en été, mais baisse nettement hors belle saison.";
    }
    return "La façade bénéficie d’une lumière utile, mais avec des limites sensibles.";
  }

  if (verdict === "Bon") {
    return "La façade reçoit une lumière naturelle agréable sur une bonne partie de la journée.";
  }

  return "Cette façade offre une très bonne qualité de lumière naturelle.";
}

export function getVerdictMeta(verdict) {
  return VERDICT_META[verdict] || VERDICT_META.Faible;
}

export function computeSunspotVerdict({
  summary,
  seasonal = {},
} = {}) {
  if (!summary) {
    return null;
  }

  const breakdown = {
    directSunlight: computeDirectSunlightDimension(summary),
    duration: computeDurationDimension(summary),
    continuity: computeContinuityDimension(summary),
    timeOfDay: computeTimeOfDayDimension(summary),
    seasonalRobustness: computeSeasonalRobustnessDimension(seasonal),
    verticalConsistency: computeVerticalConsistencyDimension(summary),
  };

  const rawScore = Object.values(breakdown).reduce(
    (total, dimension) => total + dimension.score,
    0
  );
  const guardrails = applyGuardrails(rawScore, breakdown);
  const verdict_score = Math.round(clamp(guardrails.score, 0, 100));
  const verdict = getVerdictLabel(verdict_score);
  const verdict_insights = buildVerdictInsights(breakdown, summary);
  const verdict_primary = buildPrimaryExplanation(verdict, breakdown);

  return {
    verdict,
    verdict_score,
    verdict_primary,
    verdict_insights,
    verdict_meta: getVerdictMeta(verdict),
    verdict_breakdown: {
      directSunlight: roundScore(breakdown.directSunlight.score),
      duration: roundScore(breakdown.duration.score),
      continuity: roundScore(breakdown.continuity.score),
      timeOfDay: roundScore(breakdown.timeOfDay.score),
      seasonalRobustness: roundScore(breakdown.seasonalRobustness.score),
      verticalConsistency: roundScore(breakdown.verticalConsistency.score),
      rawScore: roundScore(rawScore),
      finalScore: verdict_score,
      appliedGuardrails: guardrails.appliedGuardrails,
      dominantPeriod: breakdown.timeOfDay.dominantPeriod,
      winterHours: roundScore(breakdown.seasonalRobustness.winterHours),
      summerHours: roundScore(breakdown.seasonalRobustness.summerHours),
      bestRunMinutes: breakdown.continuity.bestRun,
      verticalMismatch: roundScore(breakdown.verticalConsistency.mismatch),
    },
  };
}
