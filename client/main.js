import { Meteor } from "meteor/meteor";
import { Tracker } from "meteor/tracker";
import { Nodes, Links } from "../lib/collections.js";
import * as d3 from "d3";

// Subscribe to data
Meteor.subscribe("nodes", "test");
Meteor.subscribe("links", "test");

// Global variables for link creation
let isDraggingForLink = false;
let tempLine = null;
let dragStartNode = null;

// Mode management
let isAdminMode = false;

// Wait for DOM to be ready
Meteor.startup(() => {
  // Set up mode toggle event listeners
  document.querySelectorAll('input[name="mode"]').forEach((radio) => {
    radio.addEventListener("change", (e) => {
      isAdminMode = e.target.value === "admin";
      updateModeDisplay();
    });
  });

  updateModeDisplay();

  // Set up reactive data tracking
  Tracker.autorun(() => {
    const nodes = Nodes.find({ graph: "test" }).fetch();
    const links = Links.find({ graph: "test" }).fetch();

    if (nodes.length > 0) {
      document.getElementById("status").textContent = "Ready";
      updateGraph(nodes, links);
    }
  });
});

function updateModeDisplay() {
  const modeStatus = document.getElementById("modeStatus");
  const userInstructions = document.getElementById("userInstructions");
  const adminInstructions = document.getElementById("adminInstructions");

  if (isAdminMode) {
    modeStatus.textContent = "(Admin)";
    modeStatus.style.color = "#c0392b";
    userInstructions.style.display = "none";
    adminInstructions.style.display = "block";
  } else {
    modeStatus.textContent = "(User)";
    modeStatus.style.color = "#27ae60";
    userInstructions.style.display = "block";
    adminInstructions.style.display = "none";
  }
}

function updateGraph(nodes, links) {
  console.log(
    "Updating graph with",
    nodes.length,
    "nodes and",
    links.length,
    "links",
  );

  const svg = d3.select("#graphSVG");
  const width = +svg.attr("width");
  const height = +svg.attr("height");

  // Clear previous content
  svg.selectAll("*").remove();

  // Add click handler for creating new nodes (admin only)
  svg.on("click", function (event) {
    // Check if click was on empty space (not on a node) and admin mode
    if (event.target === this && isAdminMode) {
      const mousePos = d3.pointer(event);
      createNewNode(mousePos[0], mousePos[1]);
    }
  });

  // Create groups for links and nodes
  const linkGroup = svg.append("g").attr("class", "links");
  const nodeGroup = svg.append("g").attr("class", "nodes");

  // Draw links
  linkGroup
    .selectAll("line")
    .data(links)
    .enter()
    .append("line")
    .attr("x1", (d) => {
      const sourceNode = nodes.find((n) => n._id === d.source);
      return sourceNode ? sourceNode.x : 0;
    })
    .attr("y1", (d) => {
      const sourceNode = nodes.find((n) => n._id === d.source);
      return sourceNode ? sourceNode.y : 0;
    })
    .attr("x2", (d) => {
      const targetNode = nodes.find((n) => n._id === d.target);
      return targetNode ? targetNode.x : 0;
    })
    .attr("y2", (d) => {
      const targetNode = nodes.find((n) => n._id === d.target);
      return targetNode ? targetNode.y : 0;
    })
    .attr("stroke", "#999")
    .attr("stroke-width", 2);

  // Draw nodes using database coordinates
  const nodeCircles = nodeGroup
    .selectAll("circle")
    .data(nodes)
    .enter()
    .append("circle")
    .attr("cx", (d) => d.x)
    .attr("cy", (d) => d.y)
    .attr("r", (d) => Math.sqrt(d.importance) * 3)
    .attr("fill", "steelblue")
    .style("cursor", "move")
    .call(
      d3
        .drag()
        .on("start", dragstarted)
        .on("drag", dragged)
        .on("end", dragended),
    )
    .on("dblclick", isAdminMode ? handleEdit : handleView);

  // Add labels
  nodeGroup
    .selectAll("text")
    .data(nodes)
    .enter()
    .append("text")
    .attr("x", (d) => d.x)
    .attr("y", (d) => d.y + 5)
    .attr("text-anchor", "middle")
    .attr("fill", "white")
    .attr("font-size", "12px")
    .text((d) => d.content);

  // Drag event handlers
  function dragstarted(event, d) {
    // Check if Ctrl key is held for link creation (admin only)
    if (
      isAdminMode &&
      (event.sourceEvent.ctrlKey || event.sourceEvent.metaKey)
    ) {
      isDraggingForLink = true;
      dragStartNode = d;
      d3.select(this).attr("stroke", "red").attr("stroke-width", 3);

      // Create temporary line
      tempLine = svg
        .append("line")
        .attr("x1", d.x)
        .attr("y1", d.y)
        .attr("x2", d.x)
        .attr("y2", d.y)
        .attr("stroke", "red")
        .attr("stroke-width", 2)
        .attr("stroke-dasharray", "5,5");
    } else {
      isDraggingForLink = false;
      dragStartNode = null;
      d3.select(this).attr("stroke", "black").attr("stroke-width", 2);
    }
  }

  function dragged(event, d) {
    if (isDraggingForLink) {
      // Update temporary line while dragging for link creation
      if (tempLine) {
        tempLine.attr("x2", event.x).attr("y2", event.y);
      }
    } else {
      // Normal node dragging
      // Update node position
      d.x = event.x;
      d.y = event.y;

      // Update visual position
      d3.select(this).attr("cx", d.x).attr("cy", d.y);

      // Update label position
      nodeGroup
        .selectAll("text")
        .filter((textData) => textData._id === d._id)
        .attr("x", d.x)
        .attr("y", d.y + 5);

      // Update connected links
      linkGroup
        .selectAll("line")
        .filter(
          (linkData) => linkData.source === d._id || linkData.target === d._id,
        )
        .attr("x1", (linkData) => {
          const sourceNode = nodes.find((n) => n._id === linkData.source);
          return sourceNode ? sourceNode.x : 0;
        })
        .attr("y1", (linkData) => {
          const sourceNode = nodes.find((n) => n._id === linkData.source);
          return sourceNode ? sourceNode.y : 0;
        })
        .attr("x2", (linkData) => {
          const targetNode = nodes.find((n) => n._id === linkData.target);
          return targetNode ? targetNode.x : 0;
        })
        .attr("y2", (linkData) => {
          const targetNode = nodes.find((n) => n._id === linkData.target);
          return targetNode ? targetNode.y : 0;
        });
    }
  }

  function dragended(event, d) {
    d3.select(this).attr("stroke", null).attr("stroke-width", null);

    if (isDraggingForLink) {
      // Remove temporary line
      if (tempLine) {
        tempLine.remove();
        tempLine = null;
      }

      // Check if we're over another node
      const targetElement = document.elementFromPoint(
        event.sourceEvent.clientX,
        event.sourceEvent.clientY,
      );
      const targetNode = d3.select(targetElement).datum();

      if (targetNode && targetNode._id !== dragStartNode._id) {
        // Create link in database
        Meteor.call(
          "createLink",
          dragStartNode._id,
          targetNode._id,
          (error) => {
            if (error) {
              console.error("Error creating link:", error);
            }
          },
        );
      }

      // Reset link creation state
      isDraggingForLink = false;
      dragStartNode = null;
    } else {
      // Normal drag end - update position only in admin mode
      if (isAdminMode) {
        Meteor.call("updateNodePosition", d._id, d.x, d.y, (error) => {
          if (error) {
            console.error("Error updating node position:", error);
          }
        });
      }
    }
  }

  function handleEdit(event, d) {
    // Prevent drag from starting
    event.stopPropagation();

    // Get new content from user
    const newContent = prompt("Edit node content:", d.content);

    if (newContent !== null && newContent !== d.content) {
      // Update database with new content
      Meteor.call("updateNodeContent", d._id, newContent, (error) => {
        if (error) {
          console.error("Error updating node content:", error);
        }
      });
    }
  }

  function handleView(event, d) {
    // Prevent drag from starting
    event.stopPropagation();

    // Show content in read-only alert
    alert("Node content: " + d.content);
  }

  function createNewNode(x, y) {
    // Get content from user
    const content = prompt("Enter content for new node:");

    if (content !== null && content.trim() !== "") {
      // Create new node in database
      Meteor.call("createNode", x, y, content.trim(), (error) => {
        if (error) {
          console.error("Error creating node:", error);
        }
      });
    }
  }
}
