# Tree of Knowledge

An interactive graph visualization application for knowledge representation, built with Meteor.js and D3.js.

## Overview

Tree of Knowledge allows users to create and explore knowledge graphs where:
- **Nodes** represent concepts, definitions, theorems, or ideas
- **Links** represent relationships between concepts (implies, related, etc.)
- **Interactive visualization** enables dynamic exploration and editing

## Features

### Current Implementation
- ✅ **Interactive Graph Visualization** - Force-directed graph using D3.js
- ✅ **Node Management** - Create, edit, and move knowledge nodes
- ✅ **Link Creation** - Connect nodes by dragging between them
- ✅ **Real-time Updates** - All changes reflect immediately across sessions
- ✅ **Admin/User Modes** - Separate read-only and edit permissions
- ✅ **Persistent Storage** - MongoDB backend with reactive updates

### User Mode Features
- View and explore knowledge graphs
- Drag nodes to examine relationships (visual only)
- Double-click nodes to view content
- Real-time updates when others make changes

### Admin Mode Features
- Create new nodes by clicking empty space
- Edit node content by double-clicking
- Move nodes (saves position to database)
- Create links by Ctrl+dragging between nodes
- Full database modification permissions

## Installation

### Prerequisites
- Node.js (v14 or higher)
- Meteor.js

### Setup
```bash
# Clone the repository
git clone https://github.com/pchvykov/tree_of_knowledge_ZED.git
cd tree_of_knowledge_ZED

# Install dependencies
meteor npm install

# Run the application
meteor run
```

The app will be available at `http://localhost:3000`

## Usage

### Basic Interaction
1. **Switch modes** using the radio buttons at the top
2. **View nodes** by double-clicking (User mode) or hover for details
3. **Navigate** by dragging the view or individual nodes

### Admin Operations
1. **Create nodes**: Click on empty space, enter content
2. **Edit nodes**: Double-click any node, modify content
3. **Move nodes**: Drag nodes to reposition (saves automatically)
4. **Create links**: Hold Ctrl and drag from one node to another

## Technical Architecture

### Stack
- **Frontend**: Meteor.js + D3.js for visualization
- **Backend**: Meteor.js with MongoDB
- **Real-time**: Meteor's reactive data system
- **Styling**: CSS3 with responsive design

### Collections
- `Nodes`: Knowledge concepts with position, content, type, importance
- `Links`: Relationships between nodes with type and strength
- `Backup`: Backup storage for data export/import

### Key Components
- `client/main.js`: D3.js visualization and interaction logic
- `server/main.js`: Database operations and method definitions
- `lib/collections.js`: Shared data schema definitions

## Development Status

This is a rebuilt version of the original Tree of Knowledge application, modernized for Meteor 3.3. 

### Completed Core Features
- [x] Basic graph visualization
- [x] Node creation and editing
- [x] Link creation and display
- [x] User/Admin mode separation
- [x] Real-time collaborative updates
- [x] Persistent data storage

### Planned Features
- [ ] User authentication and permissions
- [ ] Multiple graph support
- [ ] Force simulation with physics
- [ ] MathJax integration for mathematical notation
- [ ] Import/export functionality
- [ ] Advanced node types and styling
- [ ] Zoom and pan controls
- [ ] Node categorization and filtering

## Contributing

This is currently a personal project. Future contributions welcome as the project develops.

## License

MIT License - see LICENSE file for details.

## Original Project

Based on the original Tree of Knowledge application, reimagined with modern web technologies and improved user experience.