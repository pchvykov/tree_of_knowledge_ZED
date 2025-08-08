// Shared constants for Tree of Knowledge application

// Graph Configuration
export const GRAPH_CONFIG = {
  DEFAULT_GRAPH: "test",
  SVG_DIMENSIONS: {
    WIDTH: 800,
    HEIGHT: 600,
  },
};

// Visual Constants
export const COLORS = {
  NODE_DEFAULT: "steelblue",
  NODE_SELECTED: "orange",
  NODE_DRAG_LINK: "red",
  LINK_DEFAULT: "#999",
  LINK_SELECTED: "orange",
  LINK_TEMP: "red",
  STROKE_DEFAULT: "black",
};

export const STROKE_WIDTHS = {
  DEFAULT: 2,
  SELECTED: 3,
  LINK_SELECTED: 4,
  DRAG_HIGHLIGHT: 3,
};

// Node Configuration
export const NODE_DEFAULTS = {
  TYPE: "concept",
  IMPORTANCE: 5,
  ZOOM_LEVEL: 0,
  RADIUS_MULTIPLIER: 3,
};

// Link Configuration
export const LINK_DEFAULTS = {
  TYPE: "implies",
  STRENGTH: 3,
  DISTANCE: 100,
};

// UI Constants
export const UI = {
  FONT_SIZE: "12px",
  LABEL_OFFSET: {
    X: 0,
    Y: 5,
  },
  TEMP_LINE_DASH: "5,5",
};

// Interaction Constants
export const INTERACTIONS = {
  CLICK_TOLERANCE: 5,
  DRAG_THRESHOLD: 3,
};

// Mode Constants
export const MODES = {
  USER: "user",
  ADMIN: "admin",
};
