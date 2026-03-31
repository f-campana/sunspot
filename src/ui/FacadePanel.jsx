import { floorLabel, formatMinutes } from "../constants.js";
import { generateInsights } from "../engine/insights.js";
import {
  getFacadeAccentColor,
  getFacadeLabel,
} from "../geometry/facades.js";

function scoreLabel(score) {
  if (score >= 55) return "Excellent";
  if (score >= 25) return "Correct";
  return "Faible";
}

function scoreTier(score) {
  if (score >= 55) return "success";
  if (score >= 25) return "warning";
  return "danger";
}

function timelineSlotStyle(entry, isCurrent) {
  const background =
    entry.state === "night"
      ? "#0e0f13"
      : entry.ratio > 0
        ? `rgba(245,166,35,${0.12 + entry.ratio * 0.68})`
        : "rgba(255,255,255,0.03)";

  return {
    background,
    outline: isCurrent ? "1.5px solid rgba(255,255,255,0.85)" : "none",
    outlineOffset: isCurrent ? "-1px" : undefined,
  };
}

export default function FacadePanel({
  building,
  currentTimelineEntry,
  effectiveFloor,
  isClampedFloor,
  onSelectEdge,
  requestedFloor,
  season,
  summary,
}) {
  if (!building || !summary) {
    return (
      <aside className="facade-panel facade-panel--empty">
        <div className="empty-state">
          <p className="eyebrow">Interaction</p>
          <h2>Sélectionnez une façade</h2>
          <p>
            Cliquez sur la face d'un bâtiment pour analyser
            l'ensoleillement de cette façade, étage par étage.
          </p>
        </div>
      </aside>
    );
  }

  const tier = scoreTier(summary.score);
  const insights = generateInsights(summary, season, effectiveFloor);

  return (
    <aside className="facade-panel">
      {/* Header */}
      <div className="facade-panel__header">
        <div
          className="edge-swatch"
          style={{ backgroundColor: summary.edgeColor }}
        />
        <div style={{ flex: 1 }}>
          <div className="facade-panel__title-row">
            <h2>
              {building.name || "Bâtiment"} —{" "}
              <span style={{ color: summary.edgeColor }}>
                Façade {summary.edgeLabel.toLowerCase()}
              </span>
            </h2>
            <span className={`score-badge score-badge--${tier}`}>
              {scoreLabel(summary.score)}
            </span>
          </div>
        </div>
      </div>

      {/* Metrics 2×2 */}
      <div className="stats-grid">
        <article className="stat-card">
          <span className="meta-label">Ensoleillement</span>
          <strong className="stat-value">{summary.hours.toFixed(1)}h</strong>
          <span className="stat-sub">par jour</span>
        </article>
        <article className="stat-card">
          <span className="meta-label">Meilleur créneau</span>
          <strong className="stat-value">
            {summary.bestWindow
              ? `${formatMinutes(summary.bestWindow.start)}–${formatMinutes(summary.bestWindow.end)}`
              : "—"}
          </strong>
        </article>
        <article className="stat-card">
          <span className="meta-label">Score soleil</span>
          <strong
            className="stat-value"
            style={{
              color:
                tier === "success"
                  ? "#75d8a7"
                  : tier === "warning"
                    ? "#f6b444"
                    : "#f1605f",
            }}
          >
            {summary.score}
          </strong>
          <span className="stat-sub">/100</span>
        </article>
        <article className="stat-card">
          <span className="meta-label">Couverture moy.</span>
          <strong className="stat-value">
            {Math.round(summary.avgRatio * 100)}%
          </strong>
          <span className="stat-sub">façade éclairée</span>
        </article>
      </div>

      {/* Timeline */}
      <section className="facade-section">
        <div className="section-heading">
          <span>Journée</span>
          <strong>
            {currentTimelineEntry
              ? `${formatMinutes(currentTimelineEntry.time)} · ${Math.round(currentTimelineEntry.ratio * 100)}%`
              : ""}
          </strong>
        </div>
        <div className="timeline-strip">
          {summary.timeline.map((entry) => (
            <div
              className="timeline-slot"
              key={entry.time}
              style={timelineSlotStyle(
                entry,
                currentTimelineEntry?.time === entry.time
              )}
              title={`${formatMinutes(entry.time)} — ${Math.round(entry.ratio * 100)}%`}
            />
          ))}
        </div>
        <div className="timeline-ticks">
          <span>06h</span>
          <span>09h</span>
          <span>12h</span>
          <span>15h</span>
          <span>18h</span>
          <span>21h</span>
        </div>
      </section>

      {/* Vertical exposure */}
      <section className="facade-section">
        <div className="section-heading">
          <span>Exposition verticale</span>
        </div>
        <div className="vertical-bars">
          <div>
            <div className="bar-row">
              <span>Haut</span>
              <strong>{Math.round(summary.topRatio * 100)}%</strong>
            </div>
            <div className="bar-track">
              <div
                className="bar-fill"
                style={{
                  backgroundColor: "#f6b444",
                  width: `${summary.topRatio * 100}%`,
                }}
              />
            </div>
          </div>
          <div>
            <div className="bar-row">
              <span>Bas</span>
              <strong>{Math.round(summary.bottomRatio * 100)}%</strong>
            </div>
            <div className="bar-track">
              <div
                className="bar-fill"
                style={{
                  backgroundColor: "#eb8f73",
                  width: `${summary.bottomRatio * 100}%`,
                }}
              />
            </div>
          </div>
        </div>
      </section>

      {/* Facade switcher */}
      <section className="facade-section">
        <div className="section-heading">
          <span>
            Façades ({building.edges.filter((e) => e.len > 4).length})
          </span>
        </div>
        <div className="edge-list">
          {building.edges
            .filter((edge) => edge.len > 4)
            .map((edge) => {
              const isActive = edge.index === summary.edgeIndex;
              const color = getFacadeAccentColor(edge);
              return (
                <button
                  className={
                    isActive ? "edge-button is-active" : "edge-button"
                  }
                  key={edge.index}
                  onClick={() => onSelectEdge(edge.index)}
                  style={
                    isActive
                      ? {
                          borderColor: color,
                          backgroundColor: `${color}20`,
                          color,
                        }
                      : undefined
                  }
                >
                  {getFacadeLabel(edge)} {Math.round(edge.len)}{"\u00a0"}m
                </button>
              );
            })}
        </div>
      </section>

      {/* Insights — headline + details */}
      {insights.headline && (
        <section className="facade-section facade-section--insights">
          <div className="section-heading">
            <span>Analyse</span>
          </div>
          <div className="insights-list">
            <p className="insight-headline">{insights.headline}</p>
            {insights.details.map((line, index) => (
              <p className="insight-detail" key={index}>
                {line}
              </p>
            ))}
          </div>
        </section>
      )}

      {/* Floor clamp warning */}
      {isClampedFloor && (
        <p className="panel-micro" style={{ marginTop: 8 }}>
          Étage demandé : {floorLabel(requestedFloor)} — limité
          à {floorLabel(effectiveFloor)} par la hauteur du bâtiment.
        </p>
      )}
    </aside>
  );
}
