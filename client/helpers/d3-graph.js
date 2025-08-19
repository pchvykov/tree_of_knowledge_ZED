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
 * GraphRenderer (refactored)
 * - Centralized physics into a single custom force for speed & clarity.
 * - Live UI control binding remains supported via bindPhysicsControls().
 *
 * Minimal, efficient per-tick physics:
 *  - Single pass over links: linear spring + optional orienting torque
 *  - Single pass over nodes: gravity, annealing noise, bounding
 *  - Uses node.vx/vy modifications (d3 integrates)
 */
export class GraphRenderer {
  constructor(svgSelector, options = {}) {
    this.svgSelector = svgSelector;
    this.svg = null;
    this.nodeGroup = null;
    this.linkGroup = null;
    this.width = options.width || GRAPH_CONFIG.SVG_DIMENSIONS.WIDTH;
    this.height = options.height || GRAPH_CONFIG.SVG_DIMENSIONS.HEIGHT;

    // runtime data
    this.simulation = null;
    this.currentNodes = [];
    this.currentLinks = [];

    // default annealing/noise
    this.noiseFrequency = 0.01;
    this.noiseStrength = 0.2;

    // small guards
    this._savingCoordinatesUntil = 0;
    this._lastSavedPositions = null;
    this._lastSavedPositionsUntil = 0;

    this.initialize();
  }

  initialize() {
    this.svg = d3.select(this.svgSelector);
    this.setupArrowMarkers();
    this.svg.on("click", (event) => {
      if (event.target === this.svg.node()) {
        const mousePos = d3.pointer(event);
        this.onEmptySpaceClick &&
          this.onEmptySpaceClick(mousePos[0], mousePos[1]);
      }
    });
    this.linkGroup = this.svg.append("g").attr("class", "links");
    this.nodeGroup = this.svg.append("g").attr("class", "nodes");
    this.setupKeyboardHandlers();

    // create and bind simulation and UI hooks
    this.setupForceSimulation();
    this.bindPhysicsControls();
  }

  setupArrowMarkers() {
    let defs = this.svg.select("defs");
    if (defs.empty()) defs = this.svg.append("defs");
    defs
      .selectAll(`#${ARROW_CONFIG.MARKER_ID}`)
      .data([0])
      .join("marker")
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
    // Ensure we don't attach multiple listeners
    if (this._keyHandler) {
      try {
        window.removeEventListener("keydown", this._keyHandler, true);
      } catch (e) {}
      this._keyHandler = null;
    }
    const handler = (event) => {
      // handle only Cmd/Ctrl combos
      if (!(event.ctrlKey || event.metaKey)) return;
      // only act in admin mode and when a link is selected
      if (!this.isAdminMode || !this.selectedItem || !this.selectedItem.source)
        return;
      // allow both `event.key` and keyCode fallbacks
      const k = (event.key || "").toLowerCase();
      const code = event.keyCode || 0;
      if (k === "o" || code === 79) {
        // intercept before browser default and other handlers
        event.preventDefault();
        try {
          event.stopImmediatePropagation();
        } catch (e) {}
        event.stopPropagation();
        this.toggleLinkOrientation(this.selectedItem);
      } else if (k === "r" || code === 82) {
        event.preventDefault();
        try {
          event.stopImmediatePropagation();
        } catch (e) {}
        event.stopPropagation();
        this.reverseLinkDirection(this.selectedItem);
      }
    };
    // attach once (avoid duplicate listeners)
    window.addEventListener("keydown", handler, true);
    this._keyHandler = handler;
  }

  setupForceSimulation() {
    const self = this;

    // Single custom physics force that does springs + orientation + gravity + noise + bounds
    function createCustomPhysicsForce() {
      let nodes;
      function force(alpha) {
        if (!nodes) return;
        const links = self.currentLinks || [];
        const g = 30 * alpha;

        // read control values once per tick
        const shortStr = FORCE_CONFIG.LINK_S_STR_INPUT || 2.1;
        const orientInput = FORCE_CONFIG.LINK_ORT_INPUT || 1.1;
        const gravInput = FORCE_CONFIG.GRAV_INPUT || 15;
        const chargeInput = FORCE_CONFIG.CHARGE_INPUT || 1;
        const width = self.width;
        const height = self.height;
        const centerX = width / 2;
        const centerY = height / 2;

        // Single pass over links: compute spring + orientation forces
        for (let i = 0, L = links.length; i < L; i++) {
          const link = links[i];
          if (!link || !link.source || !link.target) continue;
          const s = link.source,
            t = link.target;
          if (!s || !t) continue;

          // skip if both fixed/permFixed
          if ((s.permFixed || s.fixed) && (t.permFixed || t.fixed)) continue;

          const dx = t.x - s.x,
            dy = t.y - s.y;
          let len = Math.hypot(dx, dy);
          if (len < 1e-6) len = 1e-6;

          const strength = link.strength || LINK_DEFAULTS.STRENGTH;
          const minDist = link.minDist || 30;

          // linear spring (short-spring style applied to all links)
          const scale =
            (g / 50) * (strength * strength) * shortStr * (1 - minDist / len);
          let fx = (dx / len) * scale;
          let fy = (dy / len) * scale;

          // orienting torque for directed links (applied as perpendicular force)
          if (link.oriented) {
            const orientScale =
              ((orientInput * g * Math.pow(strength, 3)) / len) *
              (Math.exp(-dx / len) - Math.exp(-1)) *
              Math.sign(dy || 1);
            // perpendicular components:
            const ofx = -dy * orientScale;
            const ofy = dx * orientScale;
            // combine
            // add orient forces to fx/fy (orient considered additional)
            fx += ofx; // eslint-disable-line no-param-reassign
            fy += ofy; // eslint-disable-line no-param-reassign
          } else if (link.type === "theorem") {
            const orthScale =
              ((-orientInput * g * Math.pow(strength, 3)) / len) *
              Math.pow(dx / len, 2) *
              Math.sign(dy) *
              Math.sign(dx);
            const ofx = -dy * orthScale;
            const ofy = dx * orthScale;
            fx += ofx; // eslint-disable-line no-param-reassign
            fy += ofy; // eslint-disable-line no-param-reassign
          }

          const sMass = s.importance || NODE_DEFAULTS.IMPORTANCE;
          const tMass = t.importance || NODE_DEFAULTS.IMPORTANCE;

          if (!(s.permFixed || s.fixed || s.dragging)) {
            s.vx = (s.vx || 0) + fx / sMass;
            s.vy = (s.vy || 0) + fy / sMass;
          }
          if (!(t.permFixed || t.fixed || t.dragging)) {
            t.vx = (t.vx || 0) - fx / tMass;
            t.vy = (t.vy || 0) - fy / tMass;
          }
        }

        // Single pass over nodes: gravity, noise, bounds
        for (let j = 0, N = nodes.length; j < N; j++) {
          const n = nodes[j];
          if (!n) continue;
          if (n.permFixed || n.fixed || n.dragging) {
            // apply bounds inline for fixed/permFixed nodes to avoid calling this.applyBounds
            const padF =
              Math.sqrt(n.importance || NODE_DEFAULTS.IMPORTANCE) *
                (FORCE_CONFIG.SIZE_INPUT || NODE_DEFAULTS.RADIUS_MULTIPLIER) +
              5;
            n.x = Math.max(padF, Math.min(self.width - padF, n.x));
            n.y = Math.max(padF, Math.min(self.height - padF, n.y));
            continue;
          }

          const mass = n.importance || NODE_DEFAULTS.IMPORTANCE;

          // rectified cubic-like gravity toward center (similar behavior to old app)
          const dxG = n.x - centerX,
            dyG = n.y - centerY;
          const grav = 0.01 * gravInput;
          // apply cubic-ish pull scaled by alpha and canvas size
          n.vx =
            (n.vx || 0) -
            (grav * alpha * Math.pow(dxG, 2) * Math.sign(dxG)) /
              (Math.max(1, width) / 2) /
              mass;
          n.vy =
            (n.vy || 0) -
            (grav * alpha * Math.pow(dyG, 2) * Math.sign(dyG)) /
              (Math.max(1, height) / 2) /
              mass;

          // annealing noise (quadratic so it decays rapidly as alpha shrinks)
          if (Math.random() < self.noiseFrequency) {
            const noise =
              (g *
                g *
                (Math.random() - 0.5) *
                (n.importance || NODE_DEFAULTS.IMPORTANCE)) /
              100;
            n.vx += noise / mass;
            n.vy += noise / mass;
          }

          // apply bounding constraints inline for performance
          const pad =
            Math.sqrt(n.importance || NODE_DEFAULTS.IMPORTANCE) *
              (FORCE_CONFIG.SIZE_INPUT || NODE_DEFAULTS.RADIUS_MULTIPLIER) +
            5;
          if (n.x < pad) n.x = pad;
          if (n.x > self.width - pad) n.x = self.width - pad;
          if (n.y < pad) n.y = pad;
          if (n.y > self.height - pad) n.y = self.height - pad;
        }
      }
      force.initialize = function (_nodes) {
        nodes = _nodes;
      };
      return force;
    }

    // create simulation
    this.simulation = d3
      .forceSimulation()
      .nodes([])
      .alphaDecay(FORCE_CONFIG.ALPHA_DECAY || 0.02)
      .alphaTarget(0)
      .velocityDecay(0.9)
      .on("tick", () => this.onTick())
      .on("end", () => this.onForceEnd());

    // built-in charge (many-body) and collide, keep link force only for ID mapping if needed
    this.simulation
      .force(
        "charge",
        d3
          .forceManyBody()
          .strength((d) => {
            const importance = d.importance || NODE_DEFAULTS.IMPORTANCE;
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
      .force("link", null) // no built-in link force to avoid duplication
      .force(
        "center",
        d3.forceCenter(this.width / 2, this.height / 2).strength(0.01),
      )
      .force("physics", createCustomPhysicsForce())
      .force(
        "collision",
        d3
          .forceCollide()
          .radius(
            (d) =>
              Math.sqrt(d.importance || NODE_DEFAULTS.IMPORTANCE) *
              (FORCE_CONFIG.SIZE_INPUT || NODE_DEFAULTS.RADIUS_MULTIPLIER),
          )
          .strength(0.8),
      );

    // Run button & drag behavior
    this.setupRunButton();
    this.createSharedDrag();
  }

  // create a shared drag handler used by node elements
  createSharedDrag() {
    this.isDragging = false;
    this.dragNode = null;
    this.forceDrag = d3
      .drag()
      .on("start", (event, d) => {
        if (
          this.isAdminMode &&
          (event.sourceEvent.ctrlKey || event.sourceEvent.metaKey)
        ) {
          event.sourceEvent.stopPropagation();
          event.sourceEvent.preventDefault();
          this.startLinkCreation && this.startLinkCreation(event, d);
          return;
        }
        // begin dragging: mark and fix coordinates so physics won't move node
        this.isDragging = true;
        this.dragNode = d;
        d.dragging = true;
        d.fx = d.x;
        d.fy = d.y;
        if (!event.active && this.simulation)
          this.simulation
            .alphaTarget(FORCE_CONFIG.ALPHA_TARGET_ACTIVE || 0.1)
            .restart();
      })
      .on("drag", (event, d) => {
        if (this.isDraggingForLink) {
          this.updateTempLine && this.updateTempLine(event.x, event.y);
          return;
        }
        // while dragging, keep node fixed to pointer coordinates
        d.fx = event.x;
        d.fy = event.y;
        if (this.simulation && this.simulation.alpha() < 0.1)
          this.simulation.alpha(0.1);
      })
      .on("end", (event, d) => {
        if (this.isDraggingForLink) {
          this.finishLinkCreation && this.finishLinkCreation(event);
        } else {
          // clear dragging state
          this.isDragging = false;
          this.dragNode = null;
          d.dragging = false;
          // if node is permanently fixed keep its fx/fy, if hover-fixed keep them, otherwise release
          if (d.permFixed) {
            d.fixed = true;
            d.fx = d.x;
            d.fy = d.y;
          } else if (d._hoverFixed) {
            // remain fixed while hovered
            d.fixed = true;
            d.fx = d.x;
            d.fy = d.y;
          } else {
            // release so physics will affect the node again
            d.fixed = false;
            d.fx = null;
            d.fy = null;
          }
          // ensure minimal velocity so it participates in solver
          d.vx = d.vx || 0;
          d.vy = d.vy || 0;
          // update stroke to indicate permanent/fixed status
          try {
            this.nodeGroup
              .selectAll("circle")
              .filter((n) => n && n._id === d._id)
              .attr("stroke", d.permFixed || d.fixed ? "red" : "black")
              .attr(
                "stroke-width",
                d.permFixed || d.fixed
                  ? STROKE_WIDTHS.DRAG_HIGHLIGHT
                  : STROKE_WIDTHS.DEFAULT,
              );
          } catch (e) {}
          if (this.isAdminMode && this.onNodeDragEnd)
            this.onNodeDragEnd(d._id, d.x, d.y);
          if (!event.active && this.simulation) {
            this.simulation.alphaTarget(0);
            this.simulation
              .alpha(Math.max(this.simulation.alpha(), 0.05))
              .restart();
          }
        }
      });
  }

  onTick() {
    // keep RUN active if requested
    if (this.forceRun && this.simulation) this.simulation.alpha(0.1);

    // update visuals from node positions (d3 handles the physics integration)
    if (!this.nodeGroup || !this.linkGroup) return;

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
          this._savedAlphaDecay = this.simulation.alphaDecay();
          this._savedNoiseStrength = this.noiseStrength;
          this._savedNoiseFrequency = this.noiseFrequency;
          this.simulation.alphaTarget(0.3).restart();
          this.simulation.alphaDecay(0.00005);
          this.noiseStrength = 0.08;
          this.noiseFrequency = 0.01;
        }
      })
      .on("mouseup", () => {
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

  onForceEnd() {
    if (this.isAdminMode && this.simulation) {
      const nodes = this.simulation.nodes() || [];
      if (nodes.length) {
        // snapshot positions to prevent immediate reactive restart
        const SAVE_BLOCK_MS = 3000;
        this._savingCoordinatesUntil = Date.now() + SAVE_BLOCK_MS;
        this._lastSavedPositions = {};
        nodes.forEach((n) => {
          if (n && n._id !== undefined)
            this._lastSavedPositions[n._id] = {
              x: Math.round((n.x || 0) * 10) / 10,
              y: Math.round((n.y || 0) * 10) / 10,
            };
        });
        this._lastSavedPositionsUntil = Date.now() + 10000;
        if (typeof Meteor !== "undefined" && Meteor.call) {
          Meteor.call("updateCoordinates", nodes, (err) => {
            this._savingCoordinatesUntil = Date.now() + SAVE_BLOCK_MS;
            // keep snapshot until updateGraph detects changes or timeout elapses
            setTimeout(() => {
              if (Date.now() >= this._savingCoordinatesUntil)
                this._savingCoordinatesUntil = 0;
            }, SAVE_BLOCK_MS);
          });
        } else {
          this._savingCoordinatesUntil = 0;
        }
      }
    }
  }

  // Bind controls in the HTML to live physics parameters
  bindPhysicsControls() {
    const self = this;
    const read = (id, fallback) => {
      const el = document.getElementById(id);
      if (!el) return fallback;
      const v = parseFloat(el.value);
      return Number.isFinite(v) ? v : fallback;
    };
    const apply = () => {
      FORCE_CONFIG.LINK_DIST_MULT = read(
        "linkDistMult",
        FORCE_CONFIG.LINK_DIST_MULT || 100.4,
      );
      FORCE_CONFIG.LINK_STR_INPUT = read(
        "linkStrInput",
        FORCE_CONFIG.LINK_STR_INPUT || 30,
      );
      FORCE_CONFIG.LINK_S_STR_INPUT = read(
        "linkSStrInput",
        FORCE_CONFIG.LINK_S_STR_INPUT || 2.1,
      );
      FORCE_CONFIG.LINK_ORT_INPUT = read(
        "linkOrtInput",
        FORCE_CONFIG.LINK_ORT_INPUT || 1.1,
      );
      FORCE_CONFIG.CHARGE_INPUT = read(
        "ChargeInput",
        FORCE_CONFIG.CHARGE_INPUT || 6.1,
      );
      FORCE_CONFIG.GRAV_INPUT = read(
        "gravInput",
        FORCE_CONFIG.GRAV_INPUT || 15,
      );
      FORCE_CONFIG.SIZE_INPUT = read(
        "sizeInput",
        FORCE_CONFIG.SIZE_INPUT || NODE_DEFAULTS.RADIUS_MULTIPLIER,
      );
      // update dynamic force callbacks where necessary
      if (self.simulation) {
        const ch = self.simulation.force("charge");
        if (ch && ch.strength)
          ch.strength(
            (d) =>
              -Math.pow(d.importance || NODE_DEFAULTS.IMPORTANCE, 2.1) *
              (FORCE_CONFIG.CHARGE_INPUT || 1),
          );
        const coll = self.simulation.force("collision");
        if (coll && coll.radius)
          coll.radius(
            (d) =>
              Math.sqrt(d.importance || NODE_DEFAULTS.IMPORTANCE) *
              (FORCE_CONFIG.SIZE_INPUT || NODE_DEFAULTS.RADIUS_MULTIPLIER),
          );
        // visual update
        self.nodeGroup
          .selectAll("circle")
          .attr(
            "r",
            (d) =>
              Math.sqrt(d.importance) *
              (FORCE_CONFIG.SIZE_INPUT || NODE_DEFAULTS.RADIUS_MULTIPLIER),
          );
        self.linkGroup
          .selectAll("line")
          .attr(
            "stroke-width",
            (d) =>
              (d.strength || LINK_DEFAULTS.STRENGTH) *
              (FORCE_CONFIG.SIZE_INPUT || NODE_DEFAULTS.RADIUS_MULTIPLIER),
          );
        if (self.simulation.alpha() < 0.02)
          self.simulation.alpha(0.08).restart();
      }
    };
    [
      "linkDistMult",
      "linkStrInput",
      "linkSStrInput",
      "linkOrtInput",
      "ChargeInput",
      "gravInput",
      "sizeInput",
    ].forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener("input", apply);
      el.addEventListener("change", apply);
    });
    apply();
  }

  // update graph data and visuals
  updateGraph(nodes, links) {
    const selectedId = this.selectedItem ? this.selectedItem._id : null;
    this.linkGroup.selectAll("*").remove();
    this.nodeGroup.selectAll("*").remove();

    // ensure sim exists
    if (!this.simulation) this.setupForceSimulation();

    // normalize links: resolve ids -> node objects
    links.forEach((l) => {
      l.strength = l.strength || LINK_DEFAULTS.STRENGTH;
      l.oriented =
        l.oriented !== undefined ? l.oriented : LINK_DEFAULTS.ORIENTED;
      l.minDist = l.minDist || 30 + (l.strength || LINK_DEFAULTS.STRENGTH) * 5;
      if (typeof l.source === "string")
        l.source = nodes.find((n) => n._id === l.source);
      if (typeof l.target === "string")
        l.target = nodes.find((n) => n._id === l.target);
    });

    nodes.forEach((n) => {
      n.importance = n.importance || NODE_DEFAULTS.IMPORTANCE;
    });

    this.currentNodes = nodes;
    this.currentLinks = links;

    this.renderLinks(links, nodes);
    this.renderNodes(nodes);

    // attach nodes to simulation & let custom force reference this.currentLinks
    if (this.simulation) {
      this.simulation.nodes(nodes);
      // guard automatic restart if saving coordinates (prevent save->reactive->restart loop)
      const now = Date.now();
      const savingActive =
        this._savingCoordinatesUntil && now < this._savingCoordinatesUntil;
      // if we have a last-saved snapshot and incoming positions match it, do not restart
      let shouldRestart = true;
      if (
        this._lastSavedPositions &&
        this._lastSavedPositionsUntil &&
        now < this._lastSavedPositionsUntil
      ) {
        const EPS = 1.2;
        let allMatch = true;
        for (let i = 0; i < nodes.length; i++) {
          const n = nodes[i];
          const snap =
            this._lastSavedPositions && n && this._lastSavedPositions[n._id];
          if (
            !snap ||
            Math.abs((n.x || 0) - snap.x) > EPS ||
            Math.abs((n.y || 0) - snap.y) > EPS
          ) {
            allMatch = false;
            break;
          }
        }
        if (allMatch) {
          shouldRestart = false;
        } else {
          this._lastSavedPositions = null;
          this._lastSavedPositionsUntil = 0;
        }
      } else if (savingActive) {
        shouldRestart = false;
      }

      if (shouldRestart && this.simulation.alpha() < 0.005)
        this.simulation.alpha(0.15).restart();
    }

    if (selectedId) this.restoreSelection(selectedId, nodes, links);
  }

  renderLinks(links) {
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
      .style("marker-mid", (d) =>
        d.oriented &&
        d.type !== "derivation" &&
        d.type !== "used" &&
        d.type !== "specialCase"
          ? `url(#${ARROW_CONFIG.MARKER_ID})`
          : null,
      )
      .on("click", (event, d) => {
        event.stopPropagation();
        this.selectItem(d);
        this.onLinkClick && this.onLinkClick(d);
      });
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
        (d) =>
          Math.sqrt(d.importance) *
          (FORCE_CONFIG.SIZE_INPUT || NODE_DEFAULTS.RADIUS_MULTIPLIER),
      )
      .attr("fill", COLORS.NODE_DEFAULT)
      .attr("stroke", (d) => (d.permFixed || d.fixed ? "red" : "black"))
      .attr("stroke-width", (d) =>
        d.permFixed || d.fixed
          ? STROKE_WIDTHS.DRAG_HIGHLIGHT
          : STROKE_WIDTHS.DEFAULT,
      )
      .style("cursor", this.isAdminMode ? "move" : "pointer")
      .call(this.forceDrag)
      .on("mouseover", (event, d) => {
        // temporarily fix while hovering (only if not permanently fixed)
        if (!d.permFixed) {
          d._hoverFixed = true;
          d.fixed = true;
          d.fx = d.x;
          d.fy = d.y;
          d3.select(event.currentTarget)
            .attr("stroke", "red")
            .attr("stroke-width", STROKE_WIDTHS.DRAG_HIGHLIGHT);
        }
      })
      .on("mouseout", (event, d) => {
        // remove hover-fix unless it is permanent or node is being dragged
        if (!d.permFixed) {
          d._hoverFixed = false;
          if (!d.dragging) {
            d.fixed = false;
            d.fx = null;
            d.fy = null;
            d3.select(event.currentTarget)
              .attr("stroke", "black")
              .attr("stroke-width", STROKE_WIDTHS.DEFAULT);
          }
        }
      })
      .on("contextmenu", (event, d) => {
        // right-click to permanently fix in client; persist to server in admin mode
        event.preventDefault();
        d.permFixed = true;
        d.fixed = true;
        d.fx = d.x;
        d.fy = d.y;
        d3.select(event.currentTarget)
          .attr("stroke", "red")
          .attr("stroke-width", STROKE_WIDTHS.DRAG_HIGHLIGHT);
        if (this.isAdminMode && typeof Meteor !== "undefined" && Meteor.call) {
          // server method should store permanent fixed state (assumed to exist)
          Meteor.call("setPermanentFixed", d._id, true, (err) => {
            if (err) console.error("Failed to persist permFixed:", err);
          });
        }
      })
      .on("dblclick", (event, d) => {
        if (!this.isDraggingForLink) {
          event.stopPropagation();
          this.onNodeDoubleClick && this.onNodeDoubleClick(d);
        }
      })
      .on("click", (event, d) => {
        if (!event.defaultPrevented && !this.isDraggingForLink) {
          event.stopPropagation();
          this.selectItem(d);
          this.onNodeClick && this.onNodeClick(d);
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
    if (this.tempLine) this.tempLine.attr("x2", x).attr("y2", y);
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
      this.onLinkCreate &&
        this.onLinkCreate(this.dragStartNode._id, targetNode._id);
    } else {
      const mousePos = d3.pointer(event.sourceEvent, this.svg.node());
      this.onEmptySpaceClick &&
        this.onEmptySpaceClick(
          mousePos[0],
          mousePos[1],
          this.dragStartNode._id,
        );
    }
    this.isDraggingForLink = false;
    this.dragStartNode = null;
  }

  selectItem(itemData) {
    this.selectedItem = itemData;
    this.updateSelectionDisplay();
  }

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
    if (selectedNode) this.selectedItem = selectedNode;
    else if (selectedLink) this.selectedItem = selectedLink;
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

  toggleLinkOrientation(linkData) {
    linkData.oriented = !linkData.oriented;
    this.linkGroup
      .selectAll("line")
      .filter((d) => d._id === linkData._id)
      .attr("class", (d) => {
        let classes = "link";
        if (d.type) classes += ` ${d.type}`;
        if (d.oriented) classes += " oriented";
        return classes;
      })
      .style("marker-mid", (d) =>
        d.oriented &&
        d.type !== "derivation" &&
        d.type !== "used" &&
        d.type !== "specialCase"
          ? `url(#${ARROW_CONFIG.MARKER_ID})`
          : null,
      );
    if (this.onLinkOrient) this.onLinkOrient(linkData._id, linkData.oriented);
  }

  reverseLinkDirection(linkData) {
    const tmp = linkData.source;
    linkData.source = linkData.target;
    linkData.target = tmp;
    if (this.onLinkReverse) this.onLinkReverse(linkData._id);
    if (this.simulation && this.simulation.alpha() < 0.005)
      this.simulation.alpha(0.1).restart();
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
