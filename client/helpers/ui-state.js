import { ReactiveVar } from "meteor/reactive-var";

// Inline constants to fix import issues
const MODES = {
  USER: "user",
  ADMIN: "admin",
};

/**
 * UI State Management Helper
 * Manages application state including mode, selections, and UI interactions
 */
export class UIState {
  constructor() {
    // Reactive variables for state management
    this.mode = new ReactiveVar(MODES.ADMIN);
    this.selectedNode = new ReactiveVar(null);
    this.selectedLink = new ReactiveVar(null);
    this.status = new ReactiveVar("Loading...");

    // Event listeners
    this.listeners = new Map();

    this.initialize();
  }

  initialize() {
    // Set up mode toggle listeners
    this.setupModeToggle();
    this.updateModeDisplay();
  }

  // Mode Management
  setMode(mode) {
    if (mode === MODES.USER || mode === MODES.ADMIN) {
      this.mode.set(mode);
      this.updateModeDisplay();
      this.clearSelections(); // Clear selections when switching modes
      this.emit("modeChanged", mode);
    }
  }

  getMode() {
    return this.mode.get();
  }

  isAdminMode() {
    return this.mode.get() === MODES.ADMIN;
  }

  isUserMode() {
    return this.mode.get() === MODES.USER;
  }

  // Selection Management
  selectNode(nodeData) {
    if (!this.isAdminMode()) return;

    this.selectedLink.set(null);
    this.selectedNode.set(nodeData);
    this.emit("nodeSelected", nodeData);
  }

  selectLink(linkData) {
    if (!this.isAdminMode()) return;

    this.selectedNode.set(null);
    this.selectedLink.set(linkData);
    this.emit("linkSelected", linkData);
  }

  clearSelections() {
    const hadSelection = this.selectedNode.get() || this.selectedLink.get();

    this.selectedNode.set(null);
    this.selectedLink.set(null);

    if (hadSelection) {
      this.emit("selectionCleared");
    }
  }

  getSelectedNode() {
    return this.selectedNode.get();
  }

  getSelectedLink() {
    return this.selectedLink.get();
  }

  hasSelection() {
    return !!(this.selectedNode.get() || this.selectedLink.get());
  }

  // Status Management
  setStatus(status) {
    this.status.set(status);
    this.updateStatusDisplay();
  }

  getStatus() {
    return this.status.get();
  }

  // DOM Updates
  setupModeToggle() {
    document.querySelectorAll('input[name="mode"]').forEach((radio) => {
      radio.addEventListener("change", (e) => {
        this.setMode(e.target.value);
      });
    });
  }

  updateModeDisplay() {
    const modeStatus = document.getElementById("modeStatus");
    const userInstructions = document.getElementById("userInstructions");
    const adminInstructions = document.getElementById("adminInstructions");

    if (!modeStatus) return; // DOM not ready yet

    if (this.isAdminMode()) {
      modeStatus.textContent = "(Admin)";
      modeStatus.style.color = "#c0392b";
      if (userInstructions) userInstructions.style.display = "none";
      if (adminInstructions) adminInstructions.style.display = "block";
    } else {
      modeStatus.textContent = "(User)";
      modeStatus.style.color = "#27ae60";
      if (userInstructions) userInstructions.style.display = "block";
      if (adminInstructions) adminInstructions.style.display = "none";
    }
  }

  updateStatusDisplay() {
    const statusElement = document.getElementById("status");
    if (statusElement) {
      statusElement.textContent = this.status.get();
    }
  }

  // Event System
  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
  }

  off(event, callback) {
    if (this.listeners.has(event)) {
      const callbacks = this.listeners.get(event);
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    }
  }

  emit(event, data) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).forEach((callback) => {
        try {
          callback(data);
        } catch (error) {
          console.error(`Error in event listener for ${event}:`, error);
        }
      });
    }
  }

  // Keyboard Handling
  setupKeyboardHandlers() {
    document.addEventListener("keydown", (event) => {
      this.handleKeyPress(event);
    });
  }

  handleKeyPress(event) {
    if (!this.isAdminMode()) return;

    // Ctrl+Delete or Cmd+Delete (no confirmation)
    if (
      (event.ctrlKey || event.metaKey) &&
      (event.key === "Delete" || event.key === "Backspace")
    ) {
      event.preventDefault();

      const selectedNode = this.getSelectedNode();
      const selectedLink = this.getSelectedLink();

      if (selectedNode) {
        this.emit("deleteNode", selectedNode);
      } else if (selectedLink) {
        this.emit("deleteLink", selectedLink);
      }
    }

    // Escape key to clear selection
    if (event.key === "Escape") {
      this.clearSelections();
    }
  }

  // Reactive Helpers for Templates
  getReactiveHelpers() {
    return {
      mode: () => this.mode.get(),
      isAdminMode: () => this.isAdminMode(),
      isUserMode: () => this.isUserMode(),
      selectedNode: () => this.selectedNode.get(),
      selectedLink: () => this.selectedLink.get(),
      hasSelection: () => this.hasSelection(),
      status: () => this.status.get(),
    };
  }

  // Cleanup
  destroy() {
    // Remove event listeners
    this.listeners.clear();

    // Remove DOM event listeners
    document.querySelectorAll('input[name="mode"]').forEach((radio) => {
      radio.removeEventListener("change", this.setMode);
    });
  }
}

// Singleton instance
export const uiState = new UIState();
