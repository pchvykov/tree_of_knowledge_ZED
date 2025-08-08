import { Meteor } from "meteor/meteor";
import { Nodes, Links } from "../lib/collections.js";
import { GRAPH_CONFIG } from "../lib/constants.js";

// Data publications for Tree of Knowledge application

Meteor.publish("nodes", function (graphName) {
  return Nodes.find({ graph: graphName || GRAPH_CONFIG.DEFAULT_GRAPH });
});

Meteor.publish("links", function (graphName) {
  return Links.find({ graph: graphName || GRAPH_CONFIG.DEFAULT_GRAPH });
});
