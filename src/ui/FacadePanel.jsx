import { floorLabel, formatMinutes } from "../constants.js";
import {
  getFacadeAccentColor,
  getFacadeLabel,
} from "../geometry/facades.js";

function timelineSlotStyle(entry, isCurrent) {
  const strength = 0.18 + entry.ratio * 0.72;
  const background =
    entry.state === "night"
      ? "#0e1220"
      : `linear-gradient(180deg, rgba(246,180,68,${strength}) 0%, rgba(241,96,95,${Math.max(
          0.06,
          (1 - entry.ratio) * 0.24
        )}) 100%)`;

  return {
    background,
    outline: isCurrent ? "1px solid rgba(255,255,255,0.8)" : "none",
  };
}

export default function FacadePanel({
  building,
  currentTimelineEntry,
  effectiveFloor,
  isClampedFloor,
  onSelectEdge,
  requestedFloor,
  summary,
}) {
  if (!building || !summary) {
    return (
      <aside className="facade-panel facade-panel--empty">
        <div className="empty-state">
          <p className="eyebrow">Facade interaction</p>
          <h2>Select a facade</h2>
          <p>
            Click a building face to attach the simulation to a real polygon edge and
            compute floor-band sunlight exposure across the day.
          </p>
        </div>
      </aside>
    );
  }

  return (
    <aside className="facade-panel">
      <div className="facade-panel__header">
        <div>
          <p className="eyebrow">Selected facade</p>
          <h2>{building.name}</h2>
          <p className="panel-muted">
            {summary.edgeLabel} edge, {Math.round(summary.edgeLength)} m
          </p>
        </div>
        <div
          className="edge-swatch"
          style={{ backgroundColor: summary.edgeColor }}
        />
      </div>

      <div className="stats-grid">
        <article className="stat-card">
          <span className="meta-label">Sunlight hours</span>
          <strong>{summary.hours.toFixed(1)}h</strong>
        </article>
        <article className="stat-card">
          <span className="meta-label">Score</span>
          <strong>{summary.score}/100</strong>
        </article>
        <article className="stat-card">
          <span className="meta-label">Average coverage</span>
          <strong>{Math.round(summary.avgRatio * 100)}%</strong>
        </article>
        <article className="stat-card">
          <span className="meta-label">Best continuous run</span>
          <strong>
            {summary.bestWindow
              ? `${formatMinutes(summary.bestWindow.start)}-${formatMinutes(
                  summary.bestWindow.end
                )}`
              : "No sustained run"}
          </strong>
        </article>
      </div>

      <section className="facade-section">
        <div className="section-heading">
          <span>Timeline</span>
          <strong>
            {currentTimelineEntry
              ? `${formatMinutes(currentTimelineEntry.time)} · ${Math.round(
                  currentTimelineEntry.ratio * 100
                )}%`
              : "No current slot"}
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
              title={`${formatMinutes(entry.time)} · ${Math.round(entry.ratio * 100)}%`}
            />
          ))}
        </div>
      </section>

      <section className="facade-section">
        <div className="section-heading">
          <span>Vertical exposure</span>
          <strong>{summary.sampleCount} sample rays</strong>
        </div>
        <div className="vertical-bars">
          <div>
            <div className="bar-row">
              <span>Top</span>
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
              <span>Bottom</span>
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

      <section className="facade-section">
        <div className="section-heading">
          <span>Floor band</span>
          <strong>{floorLabel(effectiveFloor)}</strong>
        </div>
        <p className="panel-muted">
          Evaluating {floorLabel(effectiveFloor)}
          {isClampedFloor
            ? ` (requested ${floorLabel(requestedFloor)} but capped by building height).`
            : "."}
        </p>
      </section>

      <section className="facade-section">
        <div className="section-heading">
          <span>Available edges</span>
        </div>
        <div className="edge-list">
          {building.edges
            .filter((edge) => edge.len > 4)
            .map((edge) => {
              const isActive = edge.index === summary.edgeIndex;
              const color = getFacadeAccentColor(edge);
              return (
                <button
                  className={isActive ? "edge-button is-active" : "edge-button"}
                  key={edge.index}
                  onClick={() => onSelectEdge(edge.index)}
                  style={
                    isActive
                      ? { borderColor: color, backgroundColor: `${color}20`, color }
                      : undefined
                  }
                >
                  {getFacadeLabel(edge)} · {Math.round(edge.len)} m
                </button>
              );
            })}
        </div>
      </section>
    </aside>
  );
}
