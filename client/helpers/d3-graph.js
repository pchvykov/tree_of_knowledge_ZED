import * as d3 from "d3";

// Inline constants to fix import issues
const COLORS = {
  NODE_DEFAULT: "steelblue",
  NODE_SELECTED: "orange",
  NODE_DRAG_LINK: "red",
  LINK_DEFAULT: "#999",
  LINK_SELECTED: "orange",
  LINK_TEMP: "red",
  STROKE_DEFAULT: "black",
};

const STROKE_WIDTHS = {
  DEFAULT: 2,
  SELECTED: 3,
  LINK_SELECTED: 4,
  DRAG_HIGHLIGHT: 3,
};

const NODE_DEFAULTS = {
  TYPE: "concept",
  IMPORTANCE: 5,
  ZOOM_LEVEL: 0,
  RADIUS_MULTIPLIER: 3,
};

const UI = {
  FONT_SIZE: "12px",
  LABEL_OFFSET: {
    X: 0,
    Y: 5,
  },
  TEMP_LINE_DASH: "5,5",
};

const GRAPH_CONFIG = {
  DEFAULT_GRAPH: "test",
  SVG_DIMENSIONS: {
    WIDTH: 800,
    HEIGHT: 600,
  },
};

// Add CSS styles for selection (like the old app)
const CSS_STYLES = `
  .node_selected {
    stroke: orange !important;
    stroke-width: 4px !important;
  }
  .link_selected {
    stroke: orange !important;
    stroke-width: 4px !important;
  }
  .node {
    stroke: black;
    stroke-width: 2px;
  }
  .link {
    stroke: #999;
    stroke-width: 2px;
  }
`;

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

    this.isAdminMode = options.isAdminMode || false;

    this.initialize();
  }

  initialize() {
    this.svg = d3.select(this.svgSelector);

    // Add CSS styles to page
    this.addStyles();

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
  }

  addStyles() {
    // Add CSS styles for selection
    let styleElement = document.getElementById("graph-styles");
    if (!styleElement) {
      styleElement = document.createElement("style");
      styleElement.id = "graph-styles";
      styleElement.innerHTML = CSS_STYLES;
      document.head.appendChild(styleElement);
    }
  }

  setupForceSimulation() {
    // Create force simulation like old app
    this.force = d3
      .forceSimulation()
      .force("charge", d3.forceManyBody().strength(-200))
      .force("center", d3.forceCenter(this.width / 2, this.height / 2))
      .force(
        "link",
        d3
          .forceLink()
          .id((d) => d._id)
          .distance(80),
      )
      .alphaTarget(0.01)
      .alphaDecay(0.02)
      .velocityDecay(0.4)
      .on("tick", () => this.onTick());

    // Create drag behavior from force simulation (like old app)
    this.forceDrag = d3
      .drag()
      .on("start", (event, d) => {
        // Handle link creation
        if (
          this.isAdminMode &&
          (event.sourceEvent.ctrlKey || event.sourceEvent.metaKey)
        ) {
          event.sourceEvent.stopPropagation();
          event.sourceEvent.preventDefault();
          this.startLinkCreation(event, d);
          // Don't set fx/fy when creating links - we want the source node to stay put
          return;
        }

        // Mark that we've started dragging, but don't restart simulation yet
        this.isDraggingNode = false;
      })
      .on("drag", (event, d) => {
        if (this.isDraggingForLink) {
          // When creating a link, don't move the source node, just update the temp line
          this.updateTempLine(event.x, event.y);
        } else {
          // Only restart simulation and fix position on actual drag movement
          if (!this.isDraggingNode) {
            this.isDraggingNode = true;
            if (!event.active) this.force.alphaTarget(0.1).restart();
            d.fx = d.x;
            d.fy = d.y;
          }
          // Update node position during drag
          d.fx = event.x;
          d.fy = event.y;
        }
      })
      .on("end", (event, d) => {
        if (this.isDraggingForLink) {
          this.finishLinkCreation(event);
          // Don't change fx/fy - leave the source node where it was
        } else if (this.isDraggingNode) {
          // Only handle end if we actually dragged
          if (!event.active) this.force.alphaTarget(0.01);

          if (this.isAdminMode) {
            // Save position to database
            this.onNodeDragEnd(d._id, d.x, d.y);
          }
          d.fx = null;
          d.fy = null;
        }

        // Reset dragging state
        this.isDraggingNode = false;
      });
  }

  onTick() {
    if (this.nodeGroup && this.linkGroup) {
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

  updateGraph(nodes, links) {
    // Clear previous content but preserve selection state
    const selectedId = this.selectedItem ? this.selectedItem._id : null;

    this.linkGroup.selectAll("*").remove();
    this.nodeGroup.selectAll("*").remove();

    // Setup force simulation if not done yet
    if (!this.force) {
      this.setupForceSimulation();
    }

    this.renderLinks(links, nodes);
    this.renderNodes(nodes);

    // Update force simulation with new data
    this.force.nodes(nodes);
    this.force.force("link").links(links);
    this.force.alpha(1).restart();

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
      this.updateSelectionDisplay();
    } else if (selectedLink) {
      this.selectedItem = selectedLink;
      this.updateSelectionDisplay();
    }
  }

  renderLinks(links, nodes) {
    this.linkGroup
      .selectAll("line")
      .data(links)
      .enter()
      .append("line")
      .attr("class", "link")
      .attr("x1", (d) => this.getNodeById(d.source, nodes)?.x || 0)
      .attr("y1", (d) => this.getNodeById(d.source, nodes)?.y || 0)
      .attr("x2", (d) => this.getNodeById(d.target, nodes)?.x || 0)
      .attr("y2", (d) => this.getNodeById(d.target, nodes)?.y || 0)
      .style("cursor", "pointer")
      .on("click", (event, d) => {
        event.stopPropagation();
        this.selectItem(d);
        this.onLinkClick(d);
      });
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
    // Use the force simulation drag behavior (like old app)
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

  // Selection methods using CSS classes like the old app
  selectItem(itemData) {
    this.selectedItem = itemData;
    this.updateSelectionDisplay();
  }

  selectNode(nodeData) {
    this.selectItem(nodeData);
  }

  selectLink(linkData) {
    this.selectItem(linkData);
  }

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

  // Utility methods
  getNodeById(nodeId, nodesList = null) {
    if (nodesList) {
      return nodesList.find((n) => n._id === nodeId);
    }
    // If no nodes list provided, try to get from current data
    const nodeData = this.nodeGroup.selectAll("circle").data();
    return nodeData.find((n) => n._id === nodeId);
  }

  setAdminMode(isAdmin) {
    this.isAdminMode = isAdmin;

    // Update cursor styles
    this.nodeGroup
      .selectAll("circle")
      .style("cursor", isAdmin ? "move" : "pointer");
  }

  destroy() {
    if (this.svg) {
      this.svg.selectAll("*").remove();
      this.svg.on("click", null);
    }
  }
}
