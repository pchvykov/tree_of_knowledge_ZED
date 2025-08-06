import { Meteor } from "meteor/meteor";
import { Nodes, Links, Backup } from "../lib/collections.js";

Meteor.startup(async () => {
  console.log("Tree of Knowledge server starting...");

  // Initialize test data if collections are empty
  if ((await Nodes.find().countAsync()) === 0) {
    console.log("Adding test data...");

    // Create some test nodes
    const node1 = await Nodes.insertAsync({
      x: 100,
      y: 100,
      graph: "test",
      content: "Mathematics",
      type: "concept",
      importance: 10,
      zoomLvl: 0,
    });

    const node2 = await Nodes.insertAsync({
      x: 200,
      y: 150,
      graph: "test",
      content: "Algebra",
      type: "concept",
      importance: 8,
      zoomLvl: 0,
    });

    const node3 = await Nodes.insertAsync({
      x: 300,
      y: 200,
      graph: "test",
      content: "Linear Equations",
      type: "definition",
      importance: 6,
      zoomLvl: 0,
    });

    // Create test links
    await Links.insertAsync({
      source: node1,
      target: node2,
      graph: "test",
      type: "implies",
      strength: 5,
    });

    await Links.insertAsync({
      source: node2,
      target: node3,
      graph: "test",
      type: "implies",
      strength: 4,
    });

    console.log("Test data added successfully");
  }
});

// Publications
Meteor.publish("nodes", function (graphName) {
  return Nodes.find({ graph: graphName || "test" });
});

Meteor.publish("links", function (graphName) {
  return Links.find({ graph: graphName || "test" });
});

// Methods
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
      graph: "test",
      content: content,
      type: "concept",
      importance: 5,
      zoomLvl: 0,
    });
    return nodeId;
  },

  createLink: async function (sourceId, targetId) {
    console.log("Creating new link from", sourceId, "to", targetId);
    const linkId = await Links.insertAsync({
      source: sourceId,
      target: targetId,
      graph: "test",
      type: "implies",
      strength: 3,
    });
    return linkId;
  },
});
