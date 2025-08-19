import * as d3 from "d3";
import {
  COLORS,
  STROKE_WIDTHS,
  NODE_DEFAULTS,
  LINK_DEFAULTS,
  UI,
  GRAPH_CONFIG,
  FORCE_CONFIG,
  ARROW_CONFIG,
  KEYBOARD_SHORTCUTS,
} from "../../lib/constants.js";

/**
 * D3 Graph Visualization Helper (updated to use D3 v7 custom-force approach)
 * Replaces the legacy force-layout with a simulation using custom forces:
 *  - charge (manyBody)
 *  - link (forceLink; kept but with custom strength/distance)
 *  - center
 *  - gravity (custom)
 *  - orientation (custom)
 *  - springs (custom three-regime spring force)
 *  - collision (forceCollide)
 *
 * The implementation preserves the UI surface and interactions from the previous
 * file while replacing the force-related internals to match the pseudocode.
 */
export class GraphRenderer {
  constructor(svgSelector, options = {}) {
    this.svgSelector = svgSelector;
    this.svg = null;
    this.nodeGroup = null;
    this.linkGroup = null;
    this.width = options.width || GRAPH_CONFIG.SVG_DIMENSIONS.WIDTH;
    this.height = options.height || GRAPH_CONFIG.SVG_DIMENSIONS.HEIGHT;

    // Drag / interaction state
    this.isDraggingForLink = false;
    this.isDraggingNode = false;
    this.tempLine = null;
    this.dragStartNode = null;

    // Selection state
    this.selectedItem = null;

    // Callbacks
    this.onNodeClick = options.onNodeClick || (() => {});
    this.onLinkClick = options.onLinkClick || (() => {});
    this.onNodeDoubleClick = options.onNodeDoubleClick || (() => {});
    this.onEmptySpaceClick = options.onEmptySpaceClick || (() => {});
    this.onNodeDragEnd = options.onNodeDragEnd || (() => {});
    this.onLinkCreate = options.onLinkCreate || (() => {});
    this.onLinkOrient = options.onLinkOrient || (() => {});
    this.onLinkReverse = options.onLinkReverse || (() => {});

    this.isAdminMode = options.isAdminMode || false;

    // Simulation and data
    this.simulation = null;
    this.currentLinks = [];
    this.currentNodes = [];

    // Tuning for annealing / noise
    // Reduced defaults to avoid excessive initial jitter
    this.noiseFrequency = 0.01; // fewer noisy ticks by default
    this.noiseStrength = 0.2; // smaller noise magnitude by default
    // Last timestamp for alpha logging (we log roughly once per second)
    this._lastAlphaLogTime = 0;
    // Saved runtime tuning while RUN button is held
    this._savedAlphaDecay = null;
    this._savedNoiseStrength = null;
    this._savedNoiseFrequency = null;

    this.initialize();
  }

  initialize() {
    this.svg = d3.select(this.svgSelector);

    // Setup arrow markers for directed edges
    this.setupArrowMarkers();

    // Add click handler for empty space
    this.svg.on("click", (event) => {
      if (event.target === this.svg.node()) {
        const mousePos = d3.pointer(event);
        this.onEmptySpaceClick(mousePos[0], mousePos[1]);
      }
    });

    // Create groups for links and nodes (links first so they appear behind nodes)
    this.linkGroup = this.svg.append("g").attr("class", "links");
    this.nodeGroup = this.svg.append("g").attr("class", "nodes");

    // Setup keyboard handlers
    this.setupKeyboardHandlers();

    // Bind the UI physics controls (live) so changes affect the running simulation
    // This reads the input fields in the main HTML and updates force parameters.
    this.bindPhysicsControls();
  }

  setupArrowMarkers() {
    let defs = this.svg.select("defs");
    if (defs.empty()) {
      defs = this.svg.append("defs");
    }

    defs
      .append("marker")
      .attr("id", ARROW_CONFIG.MARKER_ID)
      .attr("viewBox", ARROW_CONFIG.VIEW_BOX)
      .attr("refX", ARROW_CONFIG.REF_X)
      .attr("refY", ARROW_CONFIG.REF_Y)
      .attr("markerWidth", ARROW_CONFIG.MARKER_WIDTH)
      .attr("markerHeight", ARROW_CONFIG.MARKER_HEIGHT)
      .attr("orient", "auto")
      .append("path")
      .attr("d", ARROW_CONFIG.PATH)
      .attr("fill", COLORS.LINK_DEFAULT)
      .style("opacity", ARROW_CONFIG.OPACITY);
  }

  setupKeyboardHandlers() {
    d3.select(window).on("keydown", (event) => {
      this.handleKeyDown(event);
    });
  }

  handleKeyDown(event) {
    if (!this.selectedItem || !this.isAdminMode) return;

    if (event.ctrlKey || event.metaKey) {
      switch (event.keyCode) {
        case KEYBOARD_SHORTCUTS.CTRL_O: // Orient link
          event.preventDefault();
          if (this.selectedItem.source) {
            this.toggleLinkOrientation(this.selectedItem);
          }
          break;
        case KEYBOARD_SHORTCUTS.CTRL_R: // Reverse link
          event.preventDefault();
          if (this.selectedItem.source) {
            this.reverseLinkDirection(this.selectedItem);
          }
          break;
      }
    }
  }

  // ---------------------------
  // Simulation setup (D3 v7)
  // ---------------------------
  setupForceSimulation() {
    const width = this.width;
    const height = this.height;
    const self = this;

    // Custom gravity force (towards a gravityCenter, default center)
    function createCustomGravityForce() {
      let nodes;
      const gravityCenter = { x: width / 2, y: height / 2 };
      const gravityStrength = 1; // multiplier, scaled by FORCE_CONFIG.GRAV_INPUT later

      function force(alpha) {
        const g = 30 * alpha * (FORCE_CONFIG.GRAV_INPUT / 10); // scaled
        for (let i = 0; i < nodes.length; i++) {
          const node = nodes[i];
          if (node.permFixed || node.fixed) continue;

          const gravityX = (gravityCenter.x - node.x) * g * gravityStrength;
          const gravityY = (gravityCenter.y - node.y) * g * gravityStrength;

          const mass = node.importance || NODE_DEFAULTS.IMPORTANCE;
          node.vx += gravityX / mass;
          node.vy += gravityY / mass;
        }
      }
      force.initialize = function (_nodes) {
        nodes = _nodes;
      };
      return force;
    }

    // Orienting force for directed links
    function createOrientationForce() {
      let nodes = [];
      let links = [];
      function force(alpha) {
        const g = 30 * alpha;
        links.forEach((link) => {
          if (!link.source || !link.target) return;
          const source = link.source;
          const target = link.target;
          if (
            (source.permFixed || source.fixed) &&
            (target.permFixed || target.fixed)
          )
            return;

          const dx = target.x - source.x;
          const dy = target.y - source.y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          if (distance < 0.01) return;

          const strength = link.strength || LINK_DEFAULTS.STRENGTH;
          const orientingStrength =
            g * Math.pow(strength, 2.1) * (FORCE_CONFIG.LINK_ORT_INPUT || 1);

          // Rotation-like orienting force (heuristic from pseudocode)
          const rotationForce =
            -orientingStrength *
            (Math.exp((-dx * dx) / (distance * distance)) - Math.exp(-1)) *
            Math.sign(dx || 1);

          const fx = rotationForce * (-dy / distance);
          const fy = rotationForce * (dx / distance);

          if (!(source.permFixed || source.fixed)) {
            source.vx -= fx / (source.importance || NODE_DEFAULTS.IMPORTANCE);
            source.vy -= fy / (source.importance || NODE_DEFAULTS.IMPORTANCE);
          }
          if (!(target.permFixed || target.fixed)) {
            target.vx += fx / (target.importance || NODE_DEFAULTS.IMPORTANCE);
            target.vy += fy / (target.importance || NODE_DEFAULTS.IMPORTANCE);
          }
        });
      }
      force.initialize = function (_nodes) {
        nodes = _nodes;
        // If simulation has a link force attached, grab its links if possible
        const linkForce = self.simulation && self.simulation.force("link");
        links = (linkForce && linkForce.links && linkForce.links()) || [];
      };
      return force;
    }

    // Custom spring force with three-regime system
    function createCustomSpringForce() {
      let nodes = [];
      let links = [];
      function force(alpha) {
        const g = 30 * alpha;
        links.forEach((link) => {
          if (!link.source || !link.target) return;
          const source = link.source;
          const target = link.target;

          const dx = target.x - source.x;
          const dy = target.y - source.y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          const strength = link.strength || LINK_DEFAULTS.STRENGTH;
          const targetDistance = self.getCustomLinkDistance(link);

          const transDist = targetDistance * strength;
          let springForce;
          const minDistance = link.minDist || 30;
          // Short regime
          if (distance < transDist) {
            springForce =
              ((distance - minDistance) * g * Math.pow(strength, 2.1)) / 50;
          } else {
            // Long regime - apply a weak constant pulling force
            const linkStrengthConst = (FORCE_CONFIG.LINK_STR_INPUT || 1) * 0.01;
            springForce = linkStrengthConst * strength;
          }

          if (distance > 0.01) {
            const fx = (dx / distance) * springForce;
            const fy = (dy / distance) * springForce;

            if (!(source.permFixed || source.fixed)) {
              source.vx += fx / (source.importance || NODE_DEFAULTS.IMPORTANCE);
              source.vy += fy / (source.importance || NODE_DEFAULTS.IMPORTANCE);
            }
            if (!(target.permFixed || target.fixed)) {
              target.vx -= fx / (target.importance || NODE_DEFAULTS.IMPORTANCE);
              target.vy -= fy / (target.importance || NODE_DEFAULTS.IMPORTANCE);
            }
          }
        });
      }
      force.initialize = function (_nodes) {
        nodes = _nodes;
        const linkForce = self.simulation && self.simulation.force("link");
        links = (linkForce && linkForce.links && linkForce.links()) || [];
      };
      return force;
    }

    // Create the simulation
    this.simulation = d3
      .forceSimulation()
      .nodes([])
      .alphaDecay(FORCE_CONFIG.ALPHA_DECAY || 0.02) // use configured decay to allow stopping
      .alphaTarget(0)
      .velocityDecay(0.9) // equivalent to v3 friction
      .on("tick", () => this.onTick())
      .on("end", () => this.onForceEnd());

    // Attach forces
    this.simulation
      .force(
        "charge",
        d3
          .forceManyBody()
          .strength((d) => {
            // Custom charge based on node importance (negative for repulsion)
            const importance = d.importance || NODE_DEFAULTS.IMPORTANCE;
            // Match pseudocode -(importance)^(p+1) with p ~= 1.1 -> exponent 2.1
            return (
              -Math.pow(importance, 2.1) * (FORCE_CONFIG.CHARGE_INPUT || 1)
            );
          })
          .distanceMax(
            (d) =>
              (d.importance || NODE_DEFAULTS.IMPORTANCE) *
              (FORCE_CONFIG.PH_CH_INPUT || 90),
          ),
      )
      .force(
        "link",
        d3
          .forceLink()
          .id((d) => d._id)
          .strength((d) => this.getLinkStrength(d))
          .distance((d) => this.getCustomLinkDistance(d))
          .links([]),
      )
      .force("center", d3.forceCenter(width / 2, height / 2).strength(0.01))
      .force("gravity", createCustomGravityForce())
      .force("orientation", createOrientationForce())
      .force("springs", createCustomSpringForce())
      .force(
        "collision",
        d3
          .forceCollide()
          .radius((d) => {
            return (
              Math.sqrt(d.importance || NODE_DEFAULTS.IMPORTANCE) *
              NODE_DEFAULTS.RADIUS_MULTIPLIER
            );
          })
          .strength(0.8),
      );

    // Setup RUN button and manual drag handling
    this.setupRunButton();

    // Manual drag handling (non-fx/fy) so we can keep nodes independent of .fx/.fy
    this.isDragging = false;
    this.dragNode = null;

    this.forceDrag = d3
      .drag()
      .on("start", (event, d) => {
        // Support link creation mode (ctrl/meta)
        if (
          this.isAdminMode &&
          (event.sourceEvent.ctrlKey || event.sourceEvent.metaKey)
        ) {
          event.sourceEvent.stopPropagation();
          event.sourceEvent.preventDefault();
          this.startLinkCreation(event, d);
          return;
        }
        this.isDragging = true;
        this.dragNode = d;
        d.dragging = true;
        // Keep simulation active while dragging
        if (!event.active) {
          this.simulation
            .alphaTarget(FORCE_CONFIG.ALPHA_TARGET_ACTIVE || 0.1)
            .restart();
        }
      })
      .on("drag", (event, d) => {
        if (this.isDraggingForLink) {
          this.updateTempLine(event.x, event.y);
          return;
        }
        // Directly set position (we don't set fx/fy so nodes can still be affected)
        d.x = event.x;
        d.y = event.y;
        // Ensure simulation keeps moving
        if (this.simulation.alpha() < 0.1) {
          this.simulation.alpha(0.1);
        }
      })
      .on("end", (event, d) => {
        if (this.isDraggingForLink) {
          this.finishLinkCreation(event);
        } else {
          this.isDragging = false;
          this.dragNode = null;
          d.dragging = false;
          if (this.isAdminMode) {
            this.onNodeDragEnd(d._id, d.x, d.y);
          }
          // Ramp down the alpha target
          if (!event.active) {
            this.simulation.alphaTarget(0);
          }
        }
      });
  }

  // ---------------------------
  // Tick handler
  // ---------------------------
  onTick() {
    // Ensure RUN behavior keeps alpha up while pressing run
    if (this.forceRun) {
      this.simulation.alpha(0.1);
    }

    // Add annealing noise and apply constraints in tick before DOM update
    const nodes = this.simulation.nodes() || [];
    const alpha = this.simulation.alpha();
    const g = 30 * alpha;

    nodes.forEach((node) => {
      // Initialize vx/vy if not present
      if (typeof node.vx === "undefined") node.vx = 0;
      if (typeof node.vy === "undefined") node.vy = 0;

      // Alpha logging disabled to reduce console noise.

      // Noise for annealing (scaled by alpha to reduce early jitter)
      if (
        !node.permFixed &&
        !node.fixed &&
        Math.random() < this.noiseFrequency
      ) {
        const noiseMag = this.noiseStrength * g * alpha;
        node.vx += (Math.random() - 0.5) * noiseMag;
        node.vy += (Math.random() - 0.5) * noiseMag;
      }

      // Apply custom constraints
      this.applyCustomConstraints(node);
    });

    // Update visuals
    if (this.nodeGroup && this.linkGroup) {
      this.nodeGroup
        .selectAll("circle")
        .attr("cx", (d) => d.x)
        .attr("cy", (d) => d.y);

      this.nodeGroup
        .selectAll("text")
        .attr("x", (d) => d.x + UI.LABEL_OFFSET.X)
        .attr("y", (d) => d.y + UI.LABEL_OFFSET.Y);

      this.linkGroup
        .selectAll("line")
        .attr("x1", (d) => (d.source && d.source.x) || 0)
        .attr("y1", (d) => (d.source && d.source.y) || 0)
        .attr("x2", (d) => (d.target && d.target.x) || 0)
        .attr("y2", (d) => (d.target && d.target.y) || 0);
    }
  }

  // ---------------------------
  // RUN button that temporarily keeps alpha high
  // ---------------------------
  setupRunButton() {
    this.forceRun = false;

    const runButton = this.svg
      .append("svg:g")
      .attr("id", "runButton")
      .attr("transform", `translate(${this.width - 50}, 2.5)`)
      .style("cursor", "pointer")
      .on("mousedown", () => {
        this.forceRun = true;
        if (this.simulation) {
          // save previous tuning
          this._savedAlphaDecay = this.simulation.alphaDecay();
          this._savedNoiseStrength = this.noiseStrength;
          this._savedNoiseFrequency = this.noiseFrequency;
          // During RUN: keep simulation active longer and reduce noise to reduce jitter
          this.simulation.alphaTarget(0.3).restart();
          this.simulation.alphaDecay(0.00005);
          this.noiseStrength = 0.08;
          this.noiseFrequency = 0.01;
        }
      })
      .on("mouseup", () => {
        this.forceRun = false;
        if (this.simulation) {
          // restore previous tuning
          if (this._savedAlphaDecay != null)
            this.simulation.alphaDecay(this._savedAlphaDecay);
          if (this._savedNoiseStrength != null)
            this.noiseStrength = this._savedNoiseStrength;
          if (this._savedNoiseFrequency != null)
            this.noiseFrequency = this._savedNoiseFrequency;
          this.simulation.alphaTarget(0);
        }
      })
      .on("mouseleave", () => {
        this.forceRun = false;
        if (this.simulation) {
          if (this._savedAlphaDecay != null)
            this.simulation.alphaDecay(this._savedAlphaDecay);
          if (this._savedNoiseStrength != null)
            this.noiseStrength = this._savedNoiseStrength;
          if (this._savedNoiseFrequency != null)
            this.noiseFrequency = this._savedNoiseFrequency;
          this.simulation.alphaTarget(0);
        }
      });

    runButton
      .append("rect")
      .attr("width", 40)
      .attr("height", 30)
      .attr("fill", "lightgray")
      .attr("stroke", "black");

    runButton
      .append("text")
      .text(">>>")
      .attr("x", 3)
      .attr("y", "1em")
      .attr("font-family", "monospace")
      .attr("font-size", "14px");
  }

  // ---------------------------
  // Force end behavior
  // ---------------------------
  onForceEnd() {
    if (this.isAdminMode) {
      const nodes = this.simulation ? this.simulation.nodes() : [];
      if (nodes && nodes.length > 0) {
        // Persist coordinates to server (Meteor environment expected)
        // Instead of a simple boolean, set a timestamp until which we consider the save 'in progress'.
        // This avoids immediate reactive updates from restarting the simulation.
        const SAVE_BLOCK_MS = 3000; // block auto-restarts for 3 seconds after initiating a save
        this._savingCoordinatesUntil = Date.now() + SAVE_BLOCK_MS;
        if (typeof Meteor !== "undefined" && Meteor.call) {
          Meteor.call("updateCoordinates", nodes, (error) => {
            // clear the saving-until timestamp after save completes
            this._savingCoordinatesUntil = 0;
            if (error) {
              console.error("Error saving coordinates:", error);
            } else {
              console.log("Coordinates saved to database");
            }
          });
        } else {
          // If Meteor is not available, clear the timestamp immediately
          this._savingCoordinatesUntil = 0;
        }
      }
    }
  }

  // ---------------------------
  // Utility: link strength & distance
  // ---------------------------
  // Bind UI controls to simulation and update parameters live.
  bindPhysicsControls() {
    const self = this;

    const read = (id, fallback) => {
      try {
        const el = document.getElementById(id);
        if (!el) return fallback;
        const v = parseFloat(el.value);
        return isFinite(v) ? v : fallback;
      } catch (e) {
        return fallback;
      }
    };

    const applyValues = () => {
      // Read values from DOM (fall back to configured constants)
      this.linkDistMult = read(
        "linkDistMult",
        FORCE_CONFIG.LINK_DIST_MULT || 100.4,
      );
      this.linkStrInput = read(
        "linkStrInput",
        FORCE_CONFIG.LINK_STR_INPUT || 30,
      );
      this.linkSStrInput = read(
        "linkSStrInput",
        FORCE_CONFIG.LINK_S_STR_INPUT || 2.1,
      );
      this.linkOrtInput = read(
        "linkOrtInput",
        FORCE_CONFIG.LINK_ORT_INPUT || 1.1,
      );
      this.chargeInput = read("ChargeInput", FORCE_CONFIG.CHARGE_INPUT || 6.1);
      this.gravInput = read("gravInput", FORCE_CONFIG.GRAV_INPUT || 15);
      this.sizeInput = read(
        "sizeInput",
        NODE_DEFAULTS.RADIUS_MULTIPLIER || 1.5,
      );

      // Update central config so other code/closures can reference updated values
      FORCE_CONFIG.LINK_DIST_MULT = this.linkDistMult;
      FORCE_CONFIG.LINK_STR_INPUT = this.linkStrInput;
      FORCE_CONFIG.LINK_S_STR_INPUT = this.linkSStrInput;
      FORCE_CONFIG.LINK_ORT_INPUT = this.linkOrtInput;
      FORCE_CONFIG.CHARGE_INPUT = this.chargeInput;
      FORCE_CONFIG.GRAV_INPUT = this.gravInput;
      FORCE_CONFIG.SIZE_INPUT = this.sizeInput;

      // Update charge force dynamically if present (strength callback reads FORCE_CONFIG)
      const chargeForce = this.simulation && this.simulation.force("charge");
      if (chargeForce && chargeForce.strength) {
        chargeForce.strength((d) => {
          const importance = d.importance || NODE_DEFAULTS.IMPORTANCE;
          // negative for repulsion; exponent chosen to match legacy v3 behavior
          return -Math.pow(importance, 2.1) * (FORCE_CONFIG.CHARGE_INPUT || 1);
        });
      }

      // Update link force parameters if present
      const linkForce = this.simulation && this.simulation.force("link");
      if (linkForce && linkForce.distance) {
        // keep distance as function so it will pick up updated FORCE_CONFIG
        linkForce.distance((d) => {
          // delegate to getCustomLinkDistance which uses latest controls
          return self.getCustomLinkDistance(d);
        });
      }
      if (linkForce && linkForce.strength) {
        linkForce.strength((d) => {
          // prefer per-link zoom strength if defined, otherwise use link.strength
          return self.getLinkStrength(d);
        });
      }

      // Update collision radius according to size control
      const collide = this.simulation && this.simulation.force("collision");
      if (collide && collide.radius) {
        collide.radius((d) => {
          return (
            Math.sqrt(d.importance || NODE_DEFAULTS.IMPORTANCE) *
            (this.sizeInput || NODE_DEFAULTS.RADIUS_MULTIPLIER)
          );
        });
      }

      // Update gravity inputs in our custom gravity force via FORCE_CONFIG.GRAV_INPUT,
      // the gravity custom force references FORCE_CONFIG.GRAV_INPUT at runtime.

      // Wake simulation mildly so changes animate in (but keep it stable)
      if (this.simulation) {
        const a = Math.max(
          0.06,
          Math.min(0.18, this.simulation.alpha() + 0.06),
        );
        this.simulation.alpha(a).restart();
      }

      // Also update visuals that depend on size
      this.nodeGroup
        .selectAll("circle")
        .attr(
          "r",
          (d) =>
            Math.sqrt(d.importance) *
            (this.sizeInput || NODE_DEFAULTS.RADIUS_MULTIPLIER),
        );
      // Links and markers that depend on size should be updated where they're rendered.
    };

    // Attach listeners to inputs (change + input for responsive updates)
    const ids = [
      "linkDistMult",
      "linkStrInput",
      "linkSStrInput",
      "linkOrtInput",
      "ChargeInput",
      "gravInput",
      "sizeInput",
    ];
    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener("input", applyValues);
        el.addEventListener("change", applyValues);
      }
    });

    // Initial application
    applyValues();
  }

  getLinkStrength(link) {
    const zoomLevel = (link && link.zoomLevel) || NODE_DEFAULTS.ZOOM_LEVEL || 0;
    return (
      (link && (link[`strength${zoomLevel}`] || link.strength)) ||
      LINK_DEFAULTS.STRENGTH
    );
  }

  getCustomLinkDistance(link) {
    // Base distance scaled by link strength with UI-controlled density multiplier.
    const baseDistance = LINK_DEFAULTS.DISTANCE || 100;
    const strength = link && (link.strength || LINK_DEFAULTS.STRENGTH);
    // linkDistMult historically was a percentage-like multiplier (e.g. 100.4). Use it as a percent factor.
    const mult =
      (this.linkDistMult || FORCE_CONFIG.LINK_DIST_MULT || 100) / 100;
    // Use sqrt of strength to moderate growth; apply density multiplier and clamp a small floor
    const dist = baseDistance * Math.sqrt(Math.max(0.1, strength)) * mult;
    return Math.max(20, dist); // avoid tiny distances
  }

  applyCustomConstraints(node) {
    // If phantom nodes exist in the app, treat them as fixed
    if (node.phantom) {
      node.fixed = true;
    }

    // Keep nodes within bounds with padding based on importance
    const padding =
      Math.sqrt(node.importance || NODE_DEFAULTS.IMPORTANCE) *
        NODE_DEFAULTS.RADIUS_MULTIPLIER +
      5;
    node.x = Math.max(padding, Math.min(this.width - padding, node.x));
    node.y = Math.max(padding, Math.min(this.height - padding, node.y));
  }

  // ---------------------------
  // Graph rendering and updates
  // ---------------------------
  updateGraph(nodes, links) {
    // Preserve selection
    const selectedId = this.selectedItem ? this.selectedItem._id : null;

    // Clear previous shapes
    this.linkGroup.selectAll("*").remove();
    this.nodeGroup.selectAll("*").remove();

    // Ensure simulation exists
    if (!this.simulation) {
      this.setupForceSimulation();
    }

    // Normalize links: replace ids with node objects if necessary
    links.forEach((link) => {
      link.strength = link.strength || LINK_DEFAULTS.STRENGTH;
      link.oriented =
        link.oriented !== undefined ? link.oriented : LINK_DEFAULTS.ORIENTED;
      link.minDist =
        link.minDist || 30 + (link.strength || LINK_DEFAULTS.STRENGTH) * 5;

      if (typeof link.source === "string") {
        link.source = nodes.find((n) => n._id === link.source);
      }
      if (typeof link.target === "string") {
        link.target = nodes.find((n) => n._id === link.target);
      }
    });

    // Set up node defaults
    nodes.forEach((node) => {
      node.importance = node.importance || NODE_DEFAULTS.IMPORTANCE;
      node.parMinLen = [null, Infinity];
      node.chiMinLen = [null, Infinity];
    });

    // Render and bind DOM elements
    this.renderLinks(links, nodes);
    this.renderNodes(nodes);

    // Update simulation nodes and link force links
    this.currentNodes = nodes;
    this.currentLinks = links;

    if (this.simulation) {
      this.simulation.nodes(nodes);
      const linkForce = this.simulation.force("link");
      if (linkForce && linkForce.links) {
        linkForce.links(links);
      }

      // Initialize custom forces which may have grabbed link references on initialize
      const gravity = this.simulation.force("gravity");
      if (gravity && gravity.initialize) gravity.initialize(nodes);
      const orient = this.simulation.force("orientation");
      if (orient && orient.initialize) orient.initialize(nodes);
      const springs = this.simulation.force("springs");
      if (springs && springs.initialize) springs.initialize(nodes);

      // Only restart if simulation is nearly idle and we're not within the post-save blocking window.
      // If a server save was recently initiated, reactive updates may follow; avoid auto-restarting
      // the simulation until the saving window expires or the save completes.
      const now = Date.now();
      const savingActive =
        this._savingCoordinatesUntil && now < this._savingCoordinatesUntil;
      if (!savingActive && this.simulation.alpha() < 0.005) {
        // use a lower restart alpha so the simulation doesn't become wildly energetic
        this.simulation.alpha(0.15).restart();
      }
    }

    // Restore selection
    if (selectedId) {
      this.restoreSelection(selectedId, nodes, links);
    }
  }

  renderLinks(links, nodes) {
    this.linkGroup
      .selectAll("line")
      .data(links)
      .enter()
      .append("line")
      .attr("class", (d) => {
        let classes = "link";
        if (d.type) classes += ` ${d.type}`;
        if (d.oriented) classes += " oriented";
        return classes;
      })
      .attr("x1", (d) => (d.source && d.source.x) || 0)
      .attr("y1", (d) => (d.source && d.source.y) || 0)
      .attr("x2", (d) => (d.target && d.target.x) || 0)
      .attr("y2", (d) => (d.target && d.target.y) || 0)
      .style("cursor", "pointer")
      .style("marker-mid", (d) => {
        return d.oriented &&
          d.type !== "derivation" &&
          d.type !== "used" &&
          d.type !== "specialCase"
          ? `url(#${ARROW_CONFIG.MARKER_ID})`
          : null;
      })
      .on("click", (event, d) => {
        event.stopPropagation();
        this.selectItem(d);
        this.onLinkClick(d);
      });
  }

  toggleLinkOrientation(linkData) {
    const newOriented = !linkData.oriented;
    linkData.oriented = newOriented;

    // Update the visual representation
    this.linkGroup
      .selectAll("line")
      .filter((d) => d._id === linkData._id)
      .attr("class", (d) => {
        let classes = "link";
        if (d.type) classes += ` ${d.type}`;
        if (d.oriented) classes += " oriented";
        return classes;
      })
      .style("marker-mid", (d) => {
        return d.oriented &&
          d.type !== "derivation" &&
          d.type !== "used" &&
          d.type !== "specialCase"
          ? `url(#${ARROW_CONFIG.MARKER_ID})`
          : null;
      });

    // Call server method to persist the change
    if (this.onLinkOrient) {
      this.onLinkOrient(linkData._id, newOriented);
    }
  }

  renderNodes(nodes) {
    this.nodeGroup
      .selectAll("circle")
      .data(nodes)
      .enter()
      .append("circle")
      .attr("class", "node")
      .attr("cx", (d) => d.x)
      .attr("cy", (d) => d.y)
      .attr(
        "r",
        (d) => Math.sqrt(d.importance) * NODE_DEFAULTS.RADIUS_MULTIPLIER,
      )
      .attr("fill", COLORS.NODE_DEFAULT)
      .style("cursor", this.isAdminMode ? "move" : "pointer")
      .call(this.createDragBehavior())
      .on("dblclick", (event, d) => {
        if (!this.isDraggingForLink) {
          event.stopPropagation();
          this.onNodeDoubleClick(d);
        }
      })
      .on("click", (event, d) => {
        if (!event.defaultPrevented && !this.isDraggingForLink) {
          event.stopPropagation();
          this.selectItem(d);
          this.onNodeClick(d);
        }
      });

    this.nodeGroup
      .selectAll("text")
      .data(nodes)
      .enter()
      .append("text")
      .attr("x", (d) => d.x + UI.LABEL_OFFSET.X)
      .attr("y", (d) => d.y + UI.LABEL_OFFSET.Y)
      .attr("text-anchor", "middle")
      .attr("fill", "white")
      .attr("font-size", UI.FONT_SIZE)
      .style("pointer-events", "none")
      .style("user-select", "none")
      .text((d) => d.content);
  }

  createDragBehavior() {
    // Return the shared drag behavior created in setupForceSimulation
    if (!this.forceDrag) {
      this.setupForceSimulation();
    }
    return this.forceDrag;
  }

  startLinkCreation(event, node) {
    this.isDraggingForLink = true;
    this.dragStartNode = node;

    this.tempLine = this.svg
      .append("line")
      .attr("x1", node.x)
      .attr("y1", node.y)
      .attr("x2", node.x)
      .attr("y2", node.y)
      .attr("stroke", COLORS.LINK_TEMP)
      .attr("stroke-width", STROKE_WIDTHS.DEFAULT)
      .attr("stroke-dasharray", UI.TEMP_LINE_DASH);
  }

  updateTempLine(x, y) {
    if (this.tempLine) {
      this.tempLine.attr("x2", x).attr("y2", y);
    }
  }

  finishLinkCreation(event) {
    if (this.tempLine) {
      this.tempLine.remove();
      this.tempLine = null;
    }

    const targetElement = document.elementFromPoint(
      event.sourceEvent.clientX,
      event.sourceEvent.clientY,
    );
    const targetNode = d3.select(targetElement).datum();

    if (targetNode && targetNode._id !== this.dragStartNode._id) {
      this.onLinkCreate(this.dragStartNode._id, targetNode._id);
    } else {
      const mousePos = d3.pointer(event.sourceEvent, this.svg.node());
      this.onEmptySpaceClick(mousePos[0], mousePos[1], this.dragStartNode._id);
    }

    this.isDraggingForLink = false;
    this.dragStartNode = null;
  }

  // ---------------------------
  // Selection utilities
  // ---------------------------
  selectItem(itemData) {
    this.selectedItem = itemData;
    this.updateSelectionDisplay();
  }

  selectNode = this.selectItem;
  selectLink = this.selectItem;

  clearAllSelections() {
    this.selectedItem = null;
    this.updateSelectionDisplay();
  }

  updateSelectionDisplay() {
    this.nodeGroup.selectAll("circle").classed("node_selected", false);
    this.linkGroup.selectAll("line").classed("link_selected", false);

    if (this.selectedItem) {
      if (this.selectedItem.source) {
        this.linkGroup
          .selectAll("line")
          .classed("link_selected", (d) => d._id === this.selectedItem._id);
      } else {
        this.nodeGroup
          .selectAll("circle")
          .classed("node_selected", (d) => d._id === this.selectedItem._id);
      }
    }
  }

  restoreSelection(selectedId, nodes, links) {
    const selectedNode = nodes.find((n) => n._id === selectedId);
    const selectedLink = links.find((l) => l._id === selectedId);

    if (selectedNode) {
      this.selectedItem = selectedNode;
    } else if (selectedLink) {
      this.selectedItem = selectedLink;
    }
    this.updateSelectionDisplay();
  }

  getNodeById(nodeId, nodesList) {
    return (
      nodesList?.find((n) => n._id === nodeId) ||
      this.nodeGroup
        .selectAll("circle")
        .data()
        .find((n) => n._id === nodeId)
    );
  }

  reverseLinkDirection(linkData) {
    const temp = linkData.source;
    linkData.source = linkData.target;
    linkData.target = temp;

    if (this.onLinkReverse) {
      this.onLinkReverse(linkData._id);
    }

    if (this.simulation && this.simulation.alpha() < 0.005) {
      this.simulation.alpha(0.1).restart();
    }
  }

  setAdminMode(isAdmin) {
    this.isAdminMode = isAdmin;
    this.nodeGroup
      .selectAll("circle")
      .style("cursor", isAdmin ? "move" : "pointer");
  }

  destroy() {
    this.svg?.selectAll("*").remove();
    this.svg?.on("click", null);
    d3.select(window).on("keydown", null);
    if (this.simulation) {
      this.simulation.stop();
      this.simulation = null;
    }
  }
}
