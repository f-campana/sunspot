/**
 * Generate human-readable insights about facade sunlight exposure.
 * Inspired by the original prototype's analysis section.
 */
export function generateInsights(summary, season, floor) {
  const insights = [];
  const hours = summary.hours;

  if (hours >= 6) {
    insights.push("Tres bon ensoleillement naturel");
  } else if (hours >= 3.5) {
    insights.push("Ensoleillement correct");
  } else if (hours >= 1.5) {
    insights.push("Ensoleillement limite -- luminosite indirecte dominante");
  } else if (hours > 0.2) {
    insights.push("Tres faible ensoleillement direct");
  } else {
    insights.push("Aucun ensoleillement direct sur cette facade");
    return insights;
  }

  if (summary.bestRun >= 180) {
    insights.push(`Longue plage continue (~${Math.round(summary.bestRun / 60)}h)`);
  } else if (summary.bestRun >= 90) {
    insights.push(`Creneau continu modere (~${Math.round(summary.bestRun / 60)}h)`);
  } else if (hours > 1) {
    insights.push("Soleil intermittent -- pas de longue plage continue");
  }

  if (summary.peakPeriod === "am") {
    insights.push("Exposition dominante le matin");
  } else {
    insights.push("Exposition dominante l'apres-midi");
  }

  if (summary.avgRatio > 0.05 && summary.avgRatio < 0.4) {
    insights.push("Facade majoritairement ombragee -- soleil partiel uniquement");
  } else if (summary.avgRatio >= 0.4 && summary.avgRatio < 0.7) {
    insights.push("Couverture partielle -- une partie de la facade reste dans l'ombre");
  }

  const topBetter =
    summary.topRatio > summary.bottomRatio * 1.8 && summary.topRatio > 0.15;
  const bottomBetter =
    summary.bottomRatio > summary.topRatio * 1.8 && summary.bottomRatio > 0.15;

  if (topBetter) {
    insights.push("Ensoleillement concentre sur la partie haute de l'etage");
  } else if (bottomBetter) {
    insights.push("Lumiere rasante -- partie basse plus exposee");
  } else if (!topBetter && !bottomBetter && summary.avgRatio > 0.5) {
    insights.push("Exposition homogene sur la hauteur de l'etage");
  }

  if (season === "winter" && hours < 2) {
    insights.push("Tres faible lumiere hivernale");
  }
  if (season === "winter" && hours >= 3.5) {
    insights.push("Bon ensoleillement meme en hiver");
  }
  if (season === "summer" && hours >= 7) {
    insights.push("Excellente luminosite estivale");
  }
  if (floor <= 1 && summary.obstruction > 55) {
    insights.push("Rez-de-chaussee fortement ombrage");
  }
  if (floor >= 4 && summary.obstruction < 20) {
    insights.push("Hauteur degagee -- peu d'obstruction");
  }

  return insights;
}
