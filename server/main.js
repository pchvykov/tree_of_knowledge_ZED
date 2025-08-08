import { Meteor } from "meteor/meteor";
import { Nodes, Links, Backup } from "../lib/collections.js";
import { NODE_DEFAULTS, GRAPH_CONFIG } from "../lib/constants.js";
import "./methods.js";
import "./publications.js";

Meteor.startup(async () => {
  console.log("Tree of Knowledge server starting...");

  // Initialize test data if collections are empty
  if ((await Nodes.find().countAsync()) === 0) {
    console.log("Adding test data...");

    // Create some test nodes
    const node1 = await Nodes.insertAsync({
      x: 100,
      y: 100,
      graph: GRAPH_CONFIG.DEFAULT_GRAPH,
      content: "Mathematics",
      type: NODE_DEFAULTS.TYPE,
      importance: 10,
      zoomLvl: NODE_DEFAULTS.ZOOM_LEVEL,
    });

    const node2 = await Nodes.insertAsync({
      x: 200,
      y: 150,
      graph: GRAPH_CONFIG.DEFAULT_GRAPH,
      content: "Algebra",
      type: NODE_DEFAULTS.TYPE,
      importance: 8,
      zoomLvl: NODE_DEFAULTS.ZOOM_LEVEL,
    });

    const node3 = await Nodes.insertAsync({
      x: 300,
      y: 200,
      graph: GRAPH_CONFIG.DEFAULT_GRAPH,
      content: "Linear Equations",
      type: "definition",
      importance: 6,
      zoomLvl: NODE_DEFAULTS.ZOOM_LEVEL,
    });

    // Create test links
    await Links.insertAsync({
      source: node1,
      target: node2,
      graph: GRAPH_CONFIG.DEFAULT_GRAPH,
      type: "implies",
      strength: 5,
    });

    await Links.insertAsync({
      source: node2,
      target: node3,
      graph: GRAPH_CONFIG.DEFAULT_GRAPH,
      type: "implies",
      strength: 4,
    });

    console.log("Test data added successfully");
  }
});
