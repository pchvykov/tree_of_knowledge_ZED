import { Meteor } from "meteor/meteor";
import { Tracker } from "meteor/tracker";
import { Nodes, Links } from "../lib/collections.js";
// Inline constants to fix import issues
const GRAPH_CONFIG = {
  DEFAULT_GRAPH: "test",
};
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
    // UI State event handlers
    uiState.on("modeChanged", (mode) => {
      if (this.graphRenderer) {
        this.graphRenderer.setAdminMode(uiState.isAdminMode());
      }
    });

    uiState.on("nodeSelected", (nodeData) => {
      if (this.graphRenderer) {
        this.graphRenderer.selectNode(nodeData);
      }
    });

    uiState.on("linkSelected", (linkData) => {
      if (this.graphRenderer) {
        this.graphRenderer.selectLink(linkData);
      }
    });

    uiState.on("selectionCleared", () => {
      if (this.graphRenderer) {
        this.graphRenderer.clearAllSelections();
      }
    });

    uiState.on("deleteNode", (nodeData) => {
      this.deleteNode(nodeData);
    });

    uiState.on("deleteLink", (linkData) => {
      this.deleteLink(linkData);
    });

    // Set up keyboard handlers
    uiState.setupKeyboardHandlers();
  }

  initializeRenderer() {
    if (this.graphRenderer) {
      this.graphRenderer.destroy();
    }

    this.graphRenderer = new GraphRenderer("#graphSVG", {
      isAdminMode: uiState.isAdminMode(),
      onNodeClick: (nodeData) => uiState.selectNode(nodeData),
      onLinkClick: (linkData) => uiState.selectLink(linkData),
      onNodeDoubleClick: (nodeData) => {
        if (uiState.isAdminMode()) {
          this.editNode(nodeData);
        } else {
          this.viewNode(nodeData);
        }
      },
      onEmptySpaceClick: (x, y, sourceNodeId) => {
        if (uiState.isAdminMode()) {
          if (sourceNodeId) {
            this.createLinkedNode(x, y, sourceNodeId);
          } else {
            this.createNode(x, y);
          }
        } else {
          uiState.clearSelections();
        }
      },
      onNodeDragEnd: (nodeId, x, y) => {
        this.updateNodePosition(nodeId, x, y);
      },
      onLinkCreate: (sourceId, targetId) => {
        this.createLink(sourceId, targetId);
      },
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

  // Database Operations
  createNode(x, y) {
    const content = prompt("Enter content for new node:");
    if (content !== null && content.trim() !== "") {
      Meteor.call("createNode", x, y, content.trim(), (error) => {
        if (error) {
          console.error("Error creating node:", error);
        }
      });
    }
  }

  createLinkedNode(x, y, sourceNodeId) {
    const content = prompt("Enter content for new linked node:");
    if (content !== null && content.trim() !== "") {
      Meteor.call(
        "createLinkedNode",
        x,
        y,
        content.trim(),
        sourceNodeId,
        (error) => {
          if (error) {
            console.error("Error creating linked node:", error);
          }
        },
      );
    }
  }

  editNode(nodeData) {
    const newContent = prompt("Edit node content:", nodeData.content);
    if (newContent !== null && newContent !== nodeData.content) {
      Meteor.call("updateNodeContent", nodeData._id, newContent, (error) => {
        if (error) {
          console.error("Error updating node content:", error);
        }
      });
    }
  }

  viewNode(nodeData) {
    alert("Node content: " + nodeData.content);
  }

  updateNodePosition(nodeId, x, y) {
    Meteor.call("updateNodePosition", nodeId, x, y, (error) => {
      if (error) {
        console.error("Error updating node position:", error);
      }
    });
  }

  createLink(sourceId, targetId) {
    Meteor.call("createLink", sourceId, targetId, (error) => {
      if (error) {
        console.error("Error creating link:", error);
      }
    });
  }

  deleteNode(nodeData) {
    Meteor.call("deleteNode", nodeData._id, (error) => {
      if (error) {
        console.error("Error deleting node:", error);
      } else {
        uiState.clearSelections();
      }
    });
  }

  deleteLink(linkData) {
    Meteor.call("deleteLink", linkData._id, (error) => {
      if (error) {
        console.error("Error deleting link:", error);
      } else {
        uiState.clearSelections();
      }
    });
  }

  // Cleanup
  destroy() {
    if (this.graphRenderer) {
      this.graphRenderer.destroy();
    }
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
