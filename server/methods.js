import { Meteor } from "meteor/meteor";
import { Nodes, Links } from "../lib/collections.js";
import {
  NODE_DEFAULTS,
  LINK_DEFAULTS,
  GRAPH_CONFIG,
} from "../lib/constants.js";

// Meteor methods for Tree of Knowledge application
Meteor.methods({
  listGraphs: function () {
    const graphs = _.uniq(
      Nodes.find({}, { fields: { graph: true } }).map((x) => x.graph),
    );
    return graphs;
  },

  updateNodePosition: async function (nodeId, x, y) {
    console.log("Updating node position:", nodeId, "to", x, y);
    const result = await Nodes.updateAsync(nodeId, {
      $set: { x: x, y: y },
    });
    return result;
  },

  updateNodeContent: async function (nodeId, content) {
    console.log("Updating node content:", nodeId, "to", content);
    const result = await Nodes.updateAsync(nodeId, {
      $set: { content: content },
    });
    return result;
  },

  createNode: async function (x, y, content) {
    console.log("Creating new node:", content, "at", x, y);
    const nodeId = await Nodes.insertAsync({
      x: x,
      y: y,
      graph: GRAPH_CONFIG.DEFAULT_GRAPH,
      content: content,
      type: NODE_DEFAULTS.TYPE,
      importance: NODE_DEFAULTS.IMPORTANCE,
      zoomLvl: NODE_DEFAULTS.ZOOM_LEVEL,
    });
    return nodeId;
  },

  createLink: async function (sourceId, targetId) {
    console.log("Creating new link from", sourceId, "to", targetId);
    const linkId = await Links.insertAsync({
      source: sourceId,
      target: targetId,
      graph: GRAPH_CONFIG.DEFAULT_GRAPH,
      type: LINK_DEFAULTS.TYPE,
      strength: LINK_DEFAULTS.STRENGTH,
    });
    return linkId;
  },

  createLinkedNode: async function (x, y, content, sourceId) {
    console.log(
      "Creating new linked node:",
      content,
      "at",
      x,
      y,
      "linked to",
      sourceId,
    );

    // First create the new node
    const nodeId = await Nodes.insertAsync({
      x: x,
      y: y,
      graph: GRAPH_CONFIG.DEFAULT_GRAPH,
      content: content,
      type: NODE_DEFAULTS.TYPE,
      importance: NODE_DEFAULTS.IMPORTANCE,
      zoomLvl: NODE_DEFAULTS.ZOOM_LEVEL,
    });

    // Then create the link from source to new node
    const linkId = await Links.insertAsync({
      source: sourceId,
      target: nodeId,
      graph: GRAPH_CONFIG.DEFAULT_GRAPH,
      type: LINK_DEFAULTS.TYPE,
      strength: LINK_DEFAULTS.STRENGTH,
    });

    return { nodeId, linkId };
  },

  deleteNode: async function (nodeId) {
    console.log("Deleting node:", nodeId);

    // First delete all links connected to this node
    const deletedLinks = await Links.removeAsync({
      $or: [{ source: nodeId }, { target: nodeId }],
    });
    console.log("Deleted", deletedLinks, "connected links");

    // Then delete the node itself
    const result = await Nodes.removeAsync(nodeId);
    return result;
  },

  deleteLink: async function (linkId) {
    console.log("Deleting link:", linkId);
    const result = await Links.removeAsync(linkId);
    return result;
  },
});
