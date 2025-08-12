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
 * D3 Graph Visualization Helper
 * Handles all D3.js rendering and interaction logic
 */
export class GraphRenderer {
  constructor(svgSelector, options = {}) {
    this.svgSelector = svgSelector;
    this.svg = null;
    this.nodeGroup = null;
    this.linkGroup = null;
    this.width = options.width || GRAPH_CONFIG.SVG_DIMENSIONS.WIDTH;
    this.height = options.height || GRAPH_CONFIG.SVG_DIMENSIONS.HEIGHT;

    // Drag state
    this.isDraggingForLink = false;
    this.isDraggingNode = false;
    this.tempLine = null;
    this.dragStartNode = null;

    // Selection state (like old app)
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
  }

  setupArrowMarkers() {
    // Create defs element if it doesn't exist
    let defs = this.svg.select("defs");
    if (defs.empty()) {
      defs = this.svg.append("defs");
    }

    // Add arrowhead marker
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

  setupForceSimulation() {
    // Create force simulation - use charge force like old app, disable others
    this.force = d3
      .forceSimulation()
      .force(
        "charge",
        d3.forceManyBody().strength((d) => {
          return (
            (-FORCE_CONFIG.CHARGE_INPUT / 2) * Math.pow(d.importance || 5, 2)
          );
        }),
      )
      .force("center", null) // Disable built-in center force
      .force("link", null) // Disable built-in link force
      .alphaTarget(FORCE_CONFIG.ALPHA_TARGET_IDLE)
      .alphaDecay(FORCE_CONFIG.ALPHA_DECAY)
      .velocityDecay(0.9) // friction from old app
      .on("tick", () => this.onTick())
      .on("end", () => this.onForceEnd());

    // Setup the RUN button for continuous force simulation
    this.setupRunButton();

    // Manual drag handling that doesn't interfere with force simulation
    this.isDragging = false;
    this.dragNode = null;

    this.forceDrag = d3
      .drag()
      .on("start", (event, d) => {
        // Handle link creation mode
        if (
          this.isAdminMode &&
          (event.sourceEvent.ctrlKey || event.sourceEvent.metaKey)
        ) {
          event.sourceEvent.stopPropagation();
          event.sourceEvent.preventDefault();
          this.startLinkCreation(event, d);
          return;
        }
        // Start manual drag - no fx/fy constraints
        this.isDragging = true;
        this.dragNode = d;
        d.dragging = true; // Flag for force calculations
      })
      .on("drag", (event, d) => {
        if (this.isDraggingForLink) {
          this.updateTempLine(event.x, event.y);
          return;
        }

        // Directly update position - forces will be calculated from this position
        d.x = event.x;
        d.y = event.y;

        // Keep simulation active during drag
        if (this.force.alpha() < 0.1) {
          this.force.alpha(0.1);
        }
      })
      .on("end", (event, d) => {
        if (this.isDraggingForLink) {
          this.finishLinkCreation(event);
        } else {
          // End manual drag
          this.isDragging = false;
          this.dragNode = null;
          d.dragging = false;

          if (this.isAdminMode) {
            // Save position in admin mode
            this.onNodeDragEnd(d._id, d.x, d.y);
          }
        }
      });
  }

  onTick() {
    // Keep running while RUN button is held down
    if (this.forceRun) {
      this.force.alpha(0.1);
    }

    if (this.nodeGroup && this.linkGroup) {
      // Apply custom force calculations before updating positions
      this.applyCustomForces();

      // Update node positions
      this.nodeGroup
        .selectAll("circle")
        .attr("cx", (d) => d.x)
        .attr("cy", (d) => d.y);

      // Update label positions
      this.nodeGroup
        .selectAll("text")
        .attr("x", (d) => d.x + UI.LABEL_OFFSET.X)
        .attr("y", (d) => d.y + UI.LABEL_OFFSET.Y);

      // Update link positions
      this.linkGroup
        .selectAll("line")
        .attr("x1", (d) => d.source.x)
        .attr("y1", (d) => d.source.y)
        .attr("x2", (d) => d.target.x)
        .attr("y2", (d) => d.target.y);
    }
  }

  boundCoordinates(node) {
    // Keep nodes within canvas bounds - exact implementation from old app
    const margin = 20;
    node.x = Math.max(margin, Math.min(this.width - margin, node.x));
    node.y = Math.max(margin, Math.min(this.height - margin, node.y));
  }

  // Add forceRun functionality and RUN button
  setupRunButton() {
    this.forceRun = false;

    // Create RUN button
    const runButton = this.svg
      .append("svg:g")
      .attr("id", "runButton")
      .attr("transform", `translate(${this.width - 50}, 2.5)`)
      .style("cursor", "pointer")
      .on("mousedown", () => {
        this.forceRun = true;
        this.force.alpha(0.1);
      })
      .on("mouseup", () => {
        this.forceRun = false;
      })
      .on("mouseleave", () => {
        this.forceRun = false;
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

  // Handle force simulation end - save coordinates to database in admin mode
  onForceEnd() {
    if (this.isAdminMode) {
      const nodes = this.force.nodes();
      if (nodes && nodes.length > 0) {
        Meteor.call("updateCoordinates", nodes, (error) => {
          if (error) {
            console.error("Error saving coordinates:", error);
          } else {
            console.log("Coordinates saved to database");
            // Could add a notification here if needed
          }
        });
      }
    }
  }

  applyCustomForces() {
    // Exact physics implementation from old app using D3 v6 compatible approach
    const nodes = this.force.nodes();
    const links = this.currentLinks || [];
    const alpha = this.force.alpha();
    const g = 30 * alpha; // e.alpha = 0.1 maximum from old app

    // Initialize node properties for percolating springs
    nodes.forEach((node) => {
      node.parMinLen = node.parMinLen || [null, Infinity];
      node.chiMinLen = node.chiMinLen || [null, Infinity];
      // Initialize velocity if not exists (D3 v6 compatibility)
      if (typeof node.vx === "undefined") node.vx = 0;
      if (typeof node.vy === "undefined") node.vy = 0;
    });

    // Link forces with percolating springs model - exact old implementation
    links.forEach((link) => {
      if (
        !link.source ||
        !link.target ||
        typeof link.source.x === "undefined"
      ) {
        return;
      }

      const delx = link.target.x - link.source.x;
      const dely = link.target.y - link.source.y;
      const len =
        Math.sqrt(delx * delx + dely * dely) + (link.strength || 3) / 4;

      if (len === 0) return;

      link.minDist = link.minDist || 30;
      const strength = link.strength || 3;

      // Percolating springs model
      link.strong = false;
      if (
        len < link.target.parMinLen[1] ||
        link.target.parMinLen[0] == link._id
      ) {
        link.target.parMinLen[0] = link._id;
        link.target.parMinLen[1] = (len * FORCE_CONFIG.LINK_DIST_MULT) / 100;
        link.strong = true;
      }
      if (
        len < link.source.chiMinLen[1] ||
        link.source.chiMinLen[0] == link._id
      ) {
        link.source.chiMinLen[0] = link._id;
        link.source.chiMinLen[1] = (len * FORCE_CONFIG.LINK_DIST_MULT) / 100;
        link.strong = true;
      }

      // Calculate spring force exactly as in old implementation
      let scale;
      if (link.strong) {
        scale =
          (g / 50) *
          Math.pow(strength, 2) *
          FORCE_CONFIG.LINK_S_STR_INPUT *
          (1 - link.minDist / len);
      } else {
        scale =
          (g / 50) *
          Math.pow(strength, 2) *
          ((strength * FORCE_CONFIG.LINK_STR_INPUT) / len) *
          (1 - link.minDist / len);
      }

      let dx = (delx / len) * scale;
      let dy = (dely / len) * scale;

      // Derivation node special handling
      if (link.source.type === "derivation") {
        const nnScale = (0.5 * (len - link.minDist)) / strength;
        dx *= nnScale;
        dy *= nnScale;
      }

      // Orienting forces for directed links - exact old implementation
      if (link.oriented) {
        let orientScale =
          ((FORCE_CONFIG.LINK_ORT_INPUT * g * Math.pow(strength, 3)) / len) *
          (Math.exp(-delx / len) - 0.367879) *
          Math.sign(dely);

        if (link.strong) {
          orientScale *= 3;
        }

        dx -= dely * orientScale;
        dy += delx * orientScale;
      } else if (link.type === "theorem") {
        let orthScale =
          ((-FORCE_CONFIG.LINK_ORT_INPUT * g * Math.pow(strength, 3)) / len) *
          Math.pow(delx / len, 2) *
          Math.sign(dely) *
          Math.sign(delx);

        if (link.strong) {
          orthScale *= 3;
        }

        dx -= dely * orthScale;
        dy += delx * orthScale;
      }

      // Apply forces to nodes - but don't move dragged nodes
      if (!link.source.dragging) {
        const srcCharge =
          Math.abs(FORCE_CONFIG.CHARGE_INPUT / 2) *
          Math.pow(link.source.importance || 5, 2);
        link.source.x += dx / srcCharge;
        link.source.y += dy / srcCharge;
      }

      if (!link.target.dragging) {
        const trgCharge =
          Math.abs(FORCE_CONFIG.CHARGE_INPUT / 2) *
          Math.pow(link.target.importance || 5, 2);
        link.target.x -= dx / trgCharge;
        link.target.y -= dy / trgCharge;
      }
    });

    // Node forces: gravity and annealing - skip dragged nodes
    nodes.forEach((node) => {
      if (!node.dragging) {
        // Gravity towards center - rectified cubic potential
        const grav = 0.01 * FORCE_CONFIG.GRAV_INPUT;
        const centerX = this.width / 2;
        const centerY = this.height / 2;
        const dxG = node.x - centerX;
        const dyG = node.y - centerY;

        node.x -=
          (grav * alpha * Math.pow(dxG, 2) * Math.sign(dxG)) / this.width;
        node.y -=
          (grav * alpha * Math.pow(dyG, 2) * Math.sign(dyG)) / this.height;

        // Annealing noise (quadratic decay)
        const importance = node.importance || 5;
        node.x += (g * g * (Math.random() - 0.5) * importance) / 100;
        node.y += (g * g * (Math.random() - 0.5) * importance) / 100;

        // Boundary constraints
        this.boundCoordinates(node);
      }
    });
  }

  updateGraph(nodes, links) {
    // Clear previous content but preserve selection state
    const selectedId = this.selectedItem ? this.selectedItem._id : null;

    this.linkGroup.selectAll("*").remove();
    this.nodeGroup.selectAll("*").remove();

    // Setup force simulation if not already done
    if (!this.force) {
      this.setupForceSimulation();
    }

    // Store links for custom force calculation
    this.currentLinks = links;

    this.renderLinks(links, nodes);
    this.renderNodes(nodes);

    // Update force simulation with new data - only nodes since we disabled link force
    this.force.nodes(nodes);

    // Set up link properties for force calculation
    links.forEach((link) => {
      link.strength = link.strength || LINK_DEFAULTS.STRENGTH;
      link.oriented =
        link.oriented !== undefined ? link.oriented : LINK_DEFAULTS.ORIENTED;
      link.minDist = 30 + (link.strength || 3) * 5;

      // Convert string IDs to node objects for custom forces
      if (typeof link.source === "string") {
        link.source = nodes.find((n) => n._id === link.source);
      }
      if (typeof link.target === "string") {
        link.target = nodes.find((n) => n._id === link.target);
      }
    });

    // Set up node properties
    nodes.forEach((node) => {
      node.importance = node.importance || NODE_DEFAULTS.IMPORTANCE;
      node.parMinLen = [null, Infinity];
      node.chiMinLen = [null, Infinity];
    });

    // Only restart if simulation is not already running
    if (this.force.alpha() < 0.005) {
      this.force.alpha(0.3).restart();
    }

    // Restore selection after re-render
    if (selectedId) {
      this.restoreSelection(selectedId, nodes, links);
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
      .attr("x1", (d) => this.getNodeById(d.source, nodes)?.x || 0)
      .attr("y1", (d) => this.getNodeById(d.source, nodes)?.y || 0)
      .attr("x2", (d) => this.getNodeById(d.target, nodes)?.x || 0)
      .attr("y2", (d) => this.getNodeById(d.target, nodes)?.y || 0)
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
    // Render circles
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

    // Render labels
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

    // Create temporary line
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
    // Remove temporary line
    if (this.tempLine) {
      this.tempLine.remove();
      this.tempLine = null;
    }

    // Check if we're over another node
    const targetElement = document.elementFromPoint(
      event.sourceEvent.clientX,
      event.sourceEvent.clientY,
    );
    const targetNode = d3.select(targetElement).datum();

    if (targetNode && targetNode._id !== this.dragStartNode._id) {
      // Link to existing node
      this.onLinkCreate(this.dragStartNode._id, targetNode._id);
    } else {
      // Create new linked node at mouse position
      const mousePos = d3.pointer(event.sourceEvent, this.svg.node());
      this.onEmptySpaceClick(mousePos[0], mousePos[1], this.dragStartNode._id);
    }

    // Reset link creation state
    this.isDraggingForLink = false;
    this.dragStartNode = null;
  }

  // Selection methods
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
    // Clear all selections first
    this.nodeGroup.selectAll("circle").classed("node_selected", false);
    this.linkGroup.selectAll("line").classed("link_selected", false);

    // Apply selection if something is selected
    if (this.selectedItem) {
      if (this.selectedItem.source) {
        // It's a link
        this.linkGroup
          .selectAll("line")
          .classed("link_selected", (d) => d._id === this.selectedItem._id);
      } else {
        // It's a node
        this.nodeGroup
          .selectAll("circle")
          .classed("node_selected", (d) => d._id === this.selectedItem._id);
      }
    }
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
    // Swap source and target
    const temp = linkData.source;
    linkData.source = linkData.target;
    linkData.target = temp;

    // Call server method to persist the change
    if (this.onLinkReverse) {
      this.onLinkReverse(linkData._id);
    }

    // Restart the simulation to update positions
    if (this.force.alpha() < 0.005) {
      this.force.alpha(0.1).restart();
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
  }
}
