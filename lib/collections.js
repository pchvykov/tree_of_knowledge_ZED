import { Mongo } from "meteor/mongo";

// Shared MongoDB collections for Tree of Knowledge app

// Collection for knowledge nodes (concepts, definitions, theorems, etc.)
export const Nodes = new Mongo.Collection("all_Nodes");

// Collection for relationships between nodes
export const Links = new Mongo.Collection("all_Links");

// Collection for storing backup data
export const Backup = new Mongo.Collection("backups");
