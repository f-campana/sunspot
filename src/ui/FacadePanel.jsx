import { useState } from "react";
import { floorLabel, formatMinutes } from "../constants.js";
import {
  getAddressDisplayLabel,
} from "../data/addressMatching.js";
import {
  getHeightConfidenceLabel,
  getHeightSourceLabel,
} from "../data/height.js";
import {
  getStoreysConfidenceLabel,
  getStoreysSourceLabel,
} from "../data/storeys.js";
import {
  getFacadeAccentColor,
  getFacadeLabel,
} from "../geometry/facades.js";

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
  summary,
}) {
  const [detailOpen, setDetailOpen] = useState(false);

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

  const addressDisplay = getAddressDisplayLabel(building);
  const verdictMeta = summary.verdict_meta;
  const lowConfidenceHeight = building.height_confidence === "low";
  const lowConfidenceStoreys = building.storeys_confidence === "low";

  return (
    <aside className="facade-panel">
      {/* Block A — Identity */}
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
          </div>
          {addressDisplay.label && (
            <p className="facade-panel__address-line" style={{ marginTop: 6 }}>
              {addressDisplay.label}
            </p>
          )}
        </div>
      </div>

      {/* Block B — Verdict Card (hero) */}
      <section className="facade-section facade-section--verdict">
        <div
          className={`verdict-card verdict-card--${verdictMeta.tone}`}
          style={{
            "--verdict-color": verdictMeta.color,
            "--verdict-accent": verdictMeta.accent,
          }}
        >
          <div className="verdict-card__row">
            <div>
              <p className="verdict-card__eyebrow">Verdict Sunspot</p>
              <h3 className="verdict-card__label">{summary.verdict}</h3>
            </div>
            <div className="verdict-score">
              <span className="verdict-score__value">{summary.verdict_score}</span>
              <span className="verdict-score__suffix">/100</span>
            </div>
          </div>
          <p className="verdict-card__primary">{summary.verdict_primary}</p>
          {summary.verdict_insights?.length > 0 && (
            <div className="verdict-insights">
              {summary.verdict_insights.map((line) => (
                <p className="verdict-insight" key={line}>
                  {line}
                </p>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Detail toggle */}
      <button
        className="detail-toggle"
        onClick={() => setDetailOpen((prev) => !prev)}
        aria-expanded={detailOpen}
      >
        <span className="detail-toggle__icon">{detailOpen ? "▾" : "▸"}</span>
        {detailOpen ? "Masquer le détail" : "Voir le détail technique"}
      </button>

      {/* Expandable detail panel */}
      {detailOpen && (
        <div className="detail-panel">
          {/* Timeline */}
          <div className="detail-panel__section">
            <div className="section-heading">
              <span>Journée</span>
              <strong>
                {currentTimelineEntry
                  ? `${formatMinutes(currentTimelineEntry.time)} · ${Math.round(currentTimelineEntry.ratio * 100)}%`
                  : ""}
              </strong>
            </div>
            <p className="detail-summary-line">
              {summary.hours.toFixed(1)}h de soleil direct
              {summary.bestWindow
                ? ` · meilleur créneau ${formatMinutes(summary.bestWindow.start)}–${formatMinutes(summary.bestWindow.end)}`
                : ""}
            </p>
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
          </div>

          {/* Vertical exposure */}
          <div className="detail-panel__section">
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
          </div>

          {/* Trust / data reliability */}
          <div className="detail-panel__section">
            <div className="section-heading">
              <span>Fiabilité des données</span>
            </div>
            <div className="trust-compact">
              <p className="trust-line">
                <span className="trust-line__label">Hauteur</span>
                <span>{Math.round(building.height_m)} m · {getHeightSourceLabel(building.height_source)} · {getHeightConfidenceLabel(building.height_confidence)}</span>
              </p>
              <p className="trust-line">
                <span className="trust-line__label">Étages</span>
                <span>{building.storeys || 0} · {getStoreysSourceLabel(building.storeys_source)} · {getStoreysConfidenceLabel(building.storeys_confidence)}</span>
              </p>
              {building.rnb_id && (
                <p className="trust-line">
                  <span className="trust-line__label">RNB</span>
                  <span>{building.rnb_id}</span>
                </p>
              )}
              {building.bdnb_id && building.storeys_source === "bdnb" && (
                <p className="trust-line">
                  <span className="trust-line__label">BDNB</span>
                  <span>{building.bdnb_id}</span>
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Floor clamp warning */}
      {isClampedFloor && (
        <p className="panel-micro" style={{ marginTop: 8 }}>
          Étage demandé : {floorLabel(requestedFloor)} — limité
          à {floorLabel(effectiveFloor)} selon le nombre d'étages estimé du bâtiment
          {lowConfidenceStoreys || lowConfidenceHeight
            ? " (donnée approximative)."
            : "."}
        </p>
      )}

      {/* Block C — Facade Switcher */}
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
                  onClick={() => {
                    setDetailOpen(false);
                    onSelectEdge(edge.index);
                  }}
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
    </aside>
  );
}
