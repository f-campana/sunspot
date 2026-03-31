export const FLOOR_HEIGHT = 3;
export const SAMPLE_ROWS = 3;
export const NORMAL_OFFSET = 0.5;
export const SLOT_MINUTES = 15;
export const DEFAULT_SEARCH_RADIUS = 150;
export const MIN_FLOOR = 0;
export const MAX_FLOOR = 15;

export const DEFAULT_TIME_RANGE = {
  startMinutes: 6 * 60,
  endMinutes: 21 * 60,
  slotMinutes: SLOT_MINUTES,
};

export const DEFAULT_CENTER = {
  lat: 48.8938,
  lng: 2.2874,
  label: "12 rue Anatole France, Levallois-Perret",
};

export const SAMPLE_DEBUG_COLORS = {
  lit: "#f6b444",
  blocked: "#f1605f",
  inactive: "#7f8798",
};

export const SEASONS = {
  winter: { label: "Hiver", month: 11, day: 21 },
  spring: { label: "Printemps", month: 2, day: 20 },
  summer: { label: "Été", month: 5, day: 21 },
  today: { label: "Aujourd'hui", relative: true },
};

export const CAMERA_PRESETS = {
  perspective: {
    label: "3D",
    position: [135, 96, 148],
    target: [0, 14, 0],
  },
  top: {
    label: "Dessus",
    position: [0.1, 265, 0.1],
    target: [0, 0, 0],
  },
  street: {
    label: "Rue",
    position: [0, 48, 132],
    target: [0, 15, 0],
  },
};

export function getSeasonDate(seasonKey, minutes = 12 * 60) {
  const definition = SEASONS[seasonKey] || SEASONS.today;
  const now = new Date();
  const date = definition.relative
    ? new Date(now)
    : new Date(now.getFullYear(), definition.month, definition.day);

  date.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  return date;
}

export function formatMinutes(minutes) {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}

export function floorLabel(floor) {
  return floor === 0 ? "RDC" : `Étage ${floor}`;
}
