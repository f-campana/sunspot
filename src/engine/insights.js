/**
 * Generate structured insights about facade sunlight exposure.
 * Returns { headline, details[] } for hierarchical display.
 */
export function generateInsights(summary, season, floor) {
  const hours = summary.hours;
  let headline;
  const details = [];

  // Primary headline
  if (hours >= 6) {
    headline = "Très bon ensoleillement naturel";
  } else if (hours >= 3.5) {
    headline = "Ensoleillement correct";
  } else if (hours >= 1.5) {
    headline = "Ensoleillement limité — luminosité indirecte dominante";
  } else if (hours > 0.2) {
    headline = "Très faible ensoleillement direct";
  } else {
    headline = "Aucun ensoleillement direct sur cette façade";
    return { headline, details };
  }

  // Supporting details
  if (summary.bestRun >= 180) {
    details.push(`Longue plage continue (~${Math.round(summary.bestRun / 60)}h)`);
  } else if (summary.bestRun >= 90) {
    details.push(`Créneau continu modéré (~${Math.round(summary.bestRun / 60)}h)`);
  } else if (hours > 1) {
    details.push("Soleil intermittent — pas de longue plage continue");
  }

  if (summary.peakPeriod === "am") {
    details.push("Exposition dominante le matin");
  } else {
    details.push("Exposition dominante l'après-midi");
  }

  if (summary.avgRatio > 0.05 && summary.avgRatio < 0.4) {
    details.push("Façade majoritairement ombragée — soleil partiel uniquement");
  } else if (summary.avgRatio >= 0.4 && summary.avgRatio < 0.7) {
    details.push("Couverture partielle — une partie de la façade reste dans l'ombre");
  }

  const topBetter =
    summary.topRatio > summary.bottomRatio * 1.8 && summary.topRatio > 0.15;
  const bottomBetter =
    summary.bottomRatio > summary.topRatio * 1.8 && summary.bottomRatio > 0.15;

  if (topBetter) {
    details.push("Ensoleillement concentré sur la partie haute de l'étage");
  } else if (bottomBetter) {
    details.push("Lumière rasante — partie basse plus exposée");
  } else if (!topBetter && !bottomBetter && summary.avgRatio > 0.5) {
    details.push("Exposition homogène sur la hauteur de l'étage");
  }

  if (season === "winter" && hours < 2) {
    details.push("Très faible lumière hivernale");
  }
  if (season === "winter" && hours >= 3.5) {
    details.push("Bon ensoleillement même en hiver");
  }
  if (season === "summer" && hours >= 7) {
    details.push("Excellente luminosité estivale");
  }
  if (floor <= 1 && summary.obstruction > 55) {
    details.push("Rez-de-chaussée fortement ombragé");
  }
  if (floor >= 4 && summary.obstruction < 20) {
    details.push("Hauteur dégagée — peu d'obstruction");
  }

  return { headline, details };
}
