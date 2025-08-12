import { Meteor } from "meteor/meteor";
import { Tracker } from "meteor/tracker";
import { Nodes, Links } from "../lib/collections.js";
import { GRAPH_CONFIG } from "../lib/constants.js";
import { GraphRenderer } from "./helpers/d3-graph.js";
import { uiState } from "./helpers/ui-state.js";

/**
 * Tree of Knowledge - Main Client Application
 * Orchestrates the graph visualization and UI state management
 */
class TreeOfKnowledgeApp {
  constructor() {
    this.graphRenderer = null;
    this.isReady = false;

    this.initializeSubscriptions();
    this.setupEventHandlers();
  }

  initializeSubscriptions() {
    // Subscribe to data
    Meteor.subscribe("nodes", GRAPH_CONFIG.DEFAULT_GRAPH);
    Meteor.subscribe("links", GRAPH_CONFIG.DEFAULT_GRAPH);
  }

  setupEventHandlers() {
    // UI State event handlers with direct method references
    uiState.on("modeChanged", () =>
      this.graphRenderer?.setAdminMode(uiState.isAdminMode()),
    );
    uiState.on("nodeSelected", (nodeData) =>
      this.graphRenderer?.selectNode(nodeData),
    );
    uiState.on("linkSelected", (linkData) =>
      this.graphRenderer?.selectLink(linkData),
    );
    uiState.on("selectionCleared", () =>
      this.graphRenderer?.clearAllSelections(),
    );
    uiState.on("deleteNode", this.deleteNode.bind(this));
    uiState.on("deleteLink", this.deleteLink.bind(this));

    uiState.setupKeyboardHandlers();
  }

  initializeRenderer() {
    this.graphRenderer?.destroy();

    this.graphRenderer = new GraphRenderer("#graphSVG", {
      isAdminMode: uiState.isAdminMode(),
      onNodeClick: uiState.selectNode.bind(uiState),
      onLinkClick: uiState.selectLink.bind(uiState),
      onNodeDoubleClick: this.handleNodeDoubleClick.bind(this),
      onEmptySpaceClick: this.handleEmptySpaceClick.bind(this),
      onNodeDragEnd: this.updateNodePosition.bind(this),
      onLinkCreate: this.createLink.bind(this),
      onLinkOrient: this.orientLink.bind(this),
      onLinkReverse: this.reverseLink.bind(this),
    });
  }

  startReactiveDataTracking() {
    Tracker.autorun(() => {
      const nodes = Nodes.find({ graph: GRAPH_CONFIG.DEFAULT_GRAPH }).fetch();
      const links = Links.find({ graph: GRAPH_CONFIG.DEFAULT_GRAPH }).fetch();

      if (nodes.length > 0 && !this.isReady) {
        this.isReady = true;
        uiState.setStatus("Ready");
        this.initializeRenderer();
      }

      if (this.isReady && this.graphRenderer) {
        this.graphRenderer.updateGraph(nodes, links);
      }
    });
  }

  // Event Handlers
  handleNodeDoubleClick(nodeData) {
    if (uiState.isAdminMode()) {
      this.editNode(nodeData);
    } else {
      alert("Node content: " + nodeData.content);
    }
  }

  handleEmptySpaceClick(x, y, sourceNodeId) {
    if (uiState.isAdminMode()) {
      sourceNodeId
        ? this.createLinkedNode(x, y, sourceNodeId)
        : this.createNode(x, y);
    } else {
      uiState.clearSelections();
    }
  }

  // Database Operations
  createNode(x, y) {
    const content = prompt("Enter content for new node:");
    if (content?.trim()) {
      this.callMethod("createNode", x, y, content.trim());
    }
  }

  createLinkedNode(x, y, sourceNodeId) {
    const content = prompt("Enter content for new linked node:");
    if (content?.trim()) {
      this.callMethod("createLinkedNode", x, y, content.trim(), sourceNodeId);
    }
  }

  editNode(nodeData) {
    const newContent = prompt("Edit node content:", nodeData.content);
    if (newContent !== null && newContent !== nodeData.content) {
      this.callMethod("updateNodeContent", nodeData._id, newContent);
    }
  }

  updateNodePosition(nodeId, x, y) {
    this.callMethod("updateNodePosition", nodeId, x, y);
  }

  createLink(sourceId, targetId) {
    this.callMethod("createLink", sourceId, targetId);
  }

  deleteNode(nodeData) {
    this.callMethod("deleteNode", nodeData._id, () =>
      uiState.clearSelections(),
    );
  }

  deleteLink(linkData) {
    this.callMethod("deleteLink", linkData._id, () =>
      uiState.clearSelections(),
    );
  }

  orientLink(linkId, oriented) {
    this.callMethod("updateLinkOrientation", linkId, oriented);
  }

  reverseLink(linkId) {
    this.callMethod("reverseLinkDirection", linkId);
  }

  // Utility method for Meteor calls
  callMethod(methodName, ...args) {
    const callback =
      typeof args[args.length - 1] === "function" ? args.pop() : null;

    Meteor.call(methodName, ...args, (error) => {
      if (error) {
        console.error(`Error with ${methodName}:`, error);
      } else if (callback) {
        callback();
      }
    });
  }

  destroy() {
    this.graphRenderer?.destroy();
    uiState.destroy();
  }
}

// Initialize application when DOM is ready
Meteor.startup(() => {
  const app = new TreeOfKnowledgeApp();
  app.startReactiveDataTracking();

  // Make app available globally for debugging
  window.TreeOfKnowledgeApp = app;
});
