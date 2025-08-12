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
  ORIENTED: true,
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

// Force Simulation Constants - exact values from old app
export const FORCE_CONFIG = {
  CHARGE_STRENGTH: -200,
  LINK_DISTANCE: 80,
  ALPHA_TARGET_ACTIVE: 0.1,
  ALPHA_TARGET_IDLE: 0.01,
  ALPHA_DECAY: 0.02,
  VELOCITY_DECAY: 0.4,
  // Values from old app HTML inputs
  LINK_DIST_MULT: 100.4, // Graph_density input
  LINK_STR_INPUT: 30, // Lk_long_Str input
  LINK_S_STR_INPUT: 2.1, // Lk_short_Str input
  LINK_ORT_INPUT: 1.1, // Lk_orient input
  CHARGE_INPUT: 6.1, // Charge input
  GRAV_INPUT: 15, // Gravity input
  SIZE_INPUT: 1.5, // Size input
  PH_CH_INPUT: 90.05, // Phantom charges field input
  ORIENTING_STRENGTH: 1.1,
  THEOREM_ORTHOGONAL_STRENGTH: 1.1,
};

// Arrow and Marker Constants
export const ARROW_CONFIG = {
  MARKER_ID: "arrowHead",
  VIEW_BOX: "0 0 10 10",
  REF_X: 8,
  REF_Y: 5,
  MARKER_WIDTH: 6,
  MARKER_HEIGHT: 6,
  PATH: "M 0 0 L 10 5 L 0 10 z",
  OPACITY: 0.7,
};

// Keyboard Shortcuts
export const KEYBOARD_SHORTCUTS = {
  SPACEBAR: 32,
  DELETE: 46,
  BACKSPACE: 8,
  CTRL_C: 67,
  CTRL_V: 86,
  CTRL_O: 79, // Orient link
  CTRL_R: 82, // Reverse link
  CTRL_PLUS: 187,
  CTRL_MINUS: 189,
  CTRL_UP: 221,
  CTRL_DOWN: 219,
};
