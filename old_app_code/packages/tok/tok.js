//This bit handles all the tree operations with d3
//d3.force is their force-directed graph
//Links and Nodes are database arrays
//links and nodes are arrays in the d3.force
//and link and node are visualized d3 object arrays (almost SVGs)

//Globals: list of node and link types
nodeTypes={'assumption':'Assumption',
           'definition':'Definition',
           'theorem':'Theorem',
           'hypothesis': 'Hypothesis',
           'example':'Example',
           'empirical':'Empirical',
           'concept':'Concept',
           'method': 'Method',
           'derivation':'Derivation'};
linkTypes={'used': 'Used in',
           'implies':'Implies',
           'supports': 'Supports',
           'conjecture':'Conjecture',
           'related':'Related',
           'specialCase':'Special Case'};
marker_spacing = 6; // only for the "supports" links styling
  //Hierarchy of objects:
  //svg > outer > vis > bckgnd,drag_line,node,link
// Meteor.call('renameTypes', {
//   'nodes':{
//     'null': 'theorem'},
//   'links':{'theorem': 'implies'}
// });

ToK = function(svg, db) {

  var tree=this;
  this.svg=svg;

  var forceRun=false;
  var color = d3.scale.category20();
  //size of the displayed portion:
  var width = svg.attr("width"),
      height = svg.attr("height");
  this.canvasSize=[width, height];
  //size of the entire tree page:
  var treeDim = [5000, 5000];

  function bound_crd(nd) {
    // Bound coordinates:
    if(!isFinite(nd.x) || !isFinite(nd.y)){
      console.error("non-finite coordinates, randomizing, for node: ", nd);
      nd.x = treeDim[0]/2 + Math.random()*100;
      nd.y = treeDim[1]/2 + Math.random()*100;
    }
    if(nd.x>treeDim[0]) nd.x = treeDim[0];
    if(nd.y>treeDim[1]) nd.y = treeDim[1];
    if(nd.x<0) nd.x = 0;
    if(nd.y<0) nd.y = 0;

    // Also bound distance from px (if exists)
    if (nd.hasOwnProperty('px')) {
      // if(!isFinite(nd.px) || !isFinite(nd.py)){
      //   console.error("non-finite p coordinates, randomizing, for node: ", nd);
      //   nd.px = treeDim[0]/2 + Math.random()*100;
      //   nd.py = treeDim[1]/2 + Math.random()*100;
      // }
      // if(nd.px>treeDim[0]) nd.px = treeDim[0];
      // if(nd.py>treeDim[1]) nd.py = treeDim[1];
      // if(nd.px<0) nd.px = 0;
      // if(nd.py<0) nd.py = 0;

      max_step = 10;
      nd.x = nd.px + Math.max(-max_step, Math.min(max_step, nd.x - nd.px));
      nd.y = nd.py + Math.max(-max_step, Math.min(max_step, nd.y - nd.py));
    }
  }

  // init svg, registers events:
  var outer = svg.append("svg:svg")
      .attr("pointer-events", "all");

  //visualized picture, moves with pan/zoom:
  //initialize the starting offset to center tree:
  var zm=d3.behavior.zoom().on("zoom", rescale);
  //initial window scaling and translation
  var initScale=0.5;
  var initTransl=[(width/initScale-treeDim[0])/2, (height/initScale-treeDim[1])/2];
  var vis = outer
  .append('svg:g')
    .attr("transform", 
      "scale("+ initScale + ")" + 
      " translate(" + initTransl + ")")
    .call(zm)
    .on("dblclick.zoom", null)
  .append('svg:g');
  // zm.scale(0.5);
  //coordinates of the visible region
  var visWindowInit = [(treeDim[0]-width/initScale)/2, 
                  (treeDim[1]-height/initScale)/2,
                   (treeDim[0]+width/initScale)/2,
                  (treeDim[1]+height/initScale)/2];
  var visWindow=visWindowInit;
  var currScale=1;
  this.gravTo = [treeDim[0]/2, treeDim[1]/2];
  this.gravStrength = [visWindow[2]-visWindow[0],visWindow[3]-visWindow[1]];
// vis.attr("width",treeWidth)
//    .attr("height",treeHeight);
//    .attr("transform",
//        "translate(" + transl0 + ")");
vis.append('svg:rect')
    .attr('width', treeDim[0])
    .attr('height', treeDim[1])
    .attr('fill', '#EEE'); //make slightly grey s.t. it's visible

  // init force layout
  var nodeData, linkData;
  var force = d3.layout.force()
      .size(treeDim)
      .gravity(0)
      // .nodes(nodeData)
      // .links(linkData)
      // .linkDistance(5)
      // .charge(-80)
      // .chargeDistance(250) //change with rescaling!
      .friction(0.9)
      .on("tick", tick)
      .on("end", function(){
          Meteor.call("updateCoord",force.nodes());
          notify('coordinates fixed');
        });

    // console.log("chdist",force.chargeDistance());

  // var bckgnd = vis.append('svg:g');
  this.drag_line = vis.append('svg:g');

/////// SVG shapes definitions //////////////
  //Arrowhead markers definition:
  svg.append("defs").append("marker")
    .attr("id", "arrowHead")
    .attr("viewBox", "0 0 10 10")
    .attr("refX", 1)
    .attr("refY", 5)
    .attr("markerWidth", 3)
    .attr("markerHeight", 3)
    .attr("orient", "auto")
  .append("path")
    .attr("d", "M 0 0 L 7 5 L 0 10 z")
    .attr("fill", "context-stroke")
    // .style("fill", "#999")
    .style("opacity", "0.5")
    // .style("pointer-events", "all")     // Make markers clickable - doesn't work
    // .style("cursor", "crosshair");  

  ////// Define possible node shapes ///////////////////
  var defs = svg.select("defs");
  defs.append("circle")
      .attr("id", "circleNode")
      .attr("r",1)
  // Arrowhead triangle   
  defs.append("polygon")
      .attr("id", "andNode")
      .attr("points","-1,-0.2 0,0.8 1,-0.2")  
  // Square
  defs.append("polygon")
      .attr("id", "squareNode")
      .attr("points","-0.9,-0.9 -0.9,0.9 0.9,0.9 0.9,-0.9")  
  // Rectangle
  defs.append("polygon")
      .attr("id", "rectangleNode")
      .attr("points","-1.6,-0.7 0.5,-0.7 1.6,0.7 -0.5,0.7")  
  // Diamond (using polygon)
  defs.append("polygon")
      .attr("id", "diamondNode")
      .attr("points", "0,-1.2 0.9,0 0,1.2 -0.9,0");
  // Triangle
  defs.append("polygon")
      .attr("id", "triangleNode")
      .attr("points","-1,0.4 0,-1.33 1,0.4")  
  // Star (5-pointed)
  defs.append("polygon")
      .attr("id", "starNode")
      .attr("points", "0.0,-1.2 0.3527,-0.4854 1.1413,-0.3708 0.5706,0.1854 0.7053,0.9708 0.0,0.6 -0.7053,0.9708 -0.5706,0.1854 -1.1413,-0.3708 -0.3527,-0.4854")
// "0,-1.2 0.3,-0.4 1.2,-0.4 0.6,0 0.9,0.8 0,0.4 -0.9,0.8 -0.6,0 -1.2,-0.4 -0.3,-0.4");
  // Cross (using path)
  // defs.append("path")
  //   .attr("id", "crossNode")
  //   .attr("d", "M-1.2,0 L1.2,0 M0,-1.2 L0,1.2")
  //   .attr("stroke-width", 0.6)
  defs.append("polygon")
  .attr("id", "crossNode")
  .attr("points", `
    -1.2,-0.3  -0.3,-0.3  -0.3,-1.2  0.3,-1.2  0.3,-0.3
     1.2,-0.3   1.2,0.3   0.3,0.3    0.3,1.2  -0.3,1.2
    -0.3,0.3   -1.2,0.3
  `)
    // .attr('stroke', "#000")
  // Hexagon
  defs.append("polygon")
      .attr("id", "hexagonNode")
      .attr("points", "1,0 0.5,0.866 -0.5,0.866 -1,0 -0.5,-0.866 0.5,-0.866");
  ///////////////////////////////////////////

  //function to select node shape:
  var nodeShape = function(ndType){
    switch(ndType){
    case "derivation": return "#andNode";
    case 'assumption': return "#circleNode"
    case 'definition': return "#triangleNode"
    case 'theorem': return "#squareNode"
    case 'hypothesis': return "#diamondNode"
    case 'example': return "#crossNode"
    case 'empirical': return "#hexagonNode"
    case 'concept': return "#starNode"
    case 'method': return "#rectangleNode"
    default: 
      console.error("unrecognized node type: ", ndType);
      return "#circleNode"
    }
  }
///////////////////////////////////////////////

  //export local variables:
  this.force = force;
  this.vis = vis;
  var gui = new GUI(this); this.gui=gui;
  vis.on("mousemove", gui.mousemove)
    .on("mouseup", gui.mouseup, false)
    .on("dblclick", gui.dblclick, false)
    .on('click', gui.background_click, false);

  // get existing layout properties (enpty at start)
  var node = vis.selectAll(".node"),
      link = vis.selectAll(".link");

  
  // add keyboard callback
  d3.select(window)
      .on("keydown", gui.keydown);

//==================== REDRAW =============================================================
  // pull data from server and redraw force layout
  var visSubscr, phantSubscr;
  this.redraw = function(postScript) { //execte postScrip() at the end
  //store current node coordinates to restart from same position:
  if(force.nodes().length >0) Meteor.call("updateCoord",force.nodes())
  // tree.gravTo = [(visWindow[0]+visWindow[2])/2, (visWindow[1]+visWindow[3])/2]; //gravity center
  // tree.gravStrength =[visWindow[2]-visWindow[0],visWindow[3]-visWindow[1]];
  tree.gravTo = [treeDim[0]/2., treeDim[1]/2.];
  tree.gravStrength = treeDim;
  db.subscribe(visWindow, function(){ //parseInt($('#nnodesInput').val())
    console.log("redrawing");
    //this can access only published data - current graph:
    nodeData=Nodes.find().fetch(); 
    linkData=Links.find().fetch();
    console.log(nodeData)//.length);
    // console.log('tst',Nodes.find({text:{$exists:false}}).count())

    // Find max and min zoomLvl:
    // var maxZoom = -Infinity;
    var minZoom = Infinity;
    nodeData.forEach(node => {
      // if (node.zoomLvl > maxZoom) maxZoom = node.zoomLvl;
      if (node.zoomLvl < minZoom) minZoom = node.zoomLvl;
    });

    nodeData.forEach(function(nd){
      if(nd.x==2345 || nd.y==2345) console.error("unpositioned node: ", nd);
      bound_crd(nd); // Bound coordinates

      nd.phantom = !nd.hasOwnProperty('text'); //identify phantom nodes
      // Only allow minimum zoom level or unplaced nodes to move:
      // nd.fixed=nd.phantom || nd.fixed || (nd.zoomLvl!=minZoom && nd.x!=2346); 
      nd.permFixed=nd.phantom || nd.permFixed || (nd.zoomLvl!=minZoom && nd.x!=2346);
      nd.fixed = nd.permFixed;

      //initialize all node velocities to 0:
      // nd.x=treeDim[0]/2; nd.y=treeDim[1]/2;
      nd.x+=(Math.random()-0.5)*nd.importance/3; //randomize initial coordinates
      nd.y+=(Math.random()-0.5)*nd.importance/3; //to avoid overlaps
      nd.px=nd.x; nd.py=nd.y;

      //indices of parent nodes in nodeData (for oriented links only)
      nd.parentsIx = linkData //used to orient "derivation" triangles
          .filter(lk => nd._id==lk.target && lk.oriented)
          .map(lk => 
            nodeData.findIndex(ndDat => ndDat._id==lk.source));
      nd.childrenIx = linkData 
          .filter(lk => nd._id==lk.source && lk.oriented)
          .map(lk => 
            nodeData.findIndex(ndDat => ndDat._id==lk.target));
      nd.chiMinLen=["id",Infinity]; nd.parMinLen=["id",Infinity]; //for percolating springs model
    });

    //replace node id-s in links with pointers to nodes
    //note: link.source prop used to distinguish links and nodes
    linkData.reduceRight(function(tmp, lk, idx, arr){ //a hack to get forEach runningh from the end (in reverse)
      lk.source = nodeData.find(function(nd){return nd._id == lk.source});
      lk.target = nodeData.find(function(nd){return nd._id == lk.target});
      if(!lk.source || !lk.target) arr.splice(idx,1); //remove orphaned links
        // console.error("orphaned link! ", lk._id);}
      var strKey, ttZm=Session.get('currZmLvl');
      // do{
        strKey = 'strength'+(ttZm==0? '':ttZm);
      //   ttZm++;
      //  } while(!(strKey in lk))
       lk.strength = lk[strKey]; //set displayed weight to that at current zoom
      // console.log("lk", lk._id, lk.source, lk.target);
    },[]);

    // console.log("links here", linkData)    

    //update data on d3 objects (SVGs), bind using _id:
    //node.enter() is a selection of all the new nodes
    node = node.data(nodeData, function(d){return d._id});
        
    //create group for each node:
    var newNodes = node.enter().append("svg:g")
        .attr("class","node-outer")
        // .attr("id",function(d){return d._id}) //for selection
        .call(gui.nodeDrag);

    //choose node shape:
    newNodes.append("use")//append("circle").attr("r",1)
        .attr("class", "node") //styling
        .on("mouseover", gui.nodeMouseover)
        .on("mouseout", gui.nodeMouseout)
        .on("mousedown",gui.nodeMousedown, false) //callbacks
        .on("mouseup", gui.nodeMouseup, false) //bubble event propagation
        .on("click", gui.nodeClick,false)
        .on("contextmenu", gui.nodeRightClick, false)
        // .on("dblclick", gui.nodeDblClick, false) //implemented in click callback
        .transition()
        .duration(750)
        .ease("elastic")
        // using lookback/meteor-tooltips library:
        // .attr("data-tooltip", function(d){return d.title})
        // .attr("data-tooltip-top", function(d){
        //   return 10 + parseFloat(this.getAttribute("r"));
        // });

    //Tooltips as divs in the body, with reference to node SVG:
    newNodes.each(function(d, idx){
      if(d.type == "derivation") return; //no tooltips for derivations
      var newTT=d3.select('#allTooltips')
          .append("xhtml:div")
          .attr("class",'tooltipO');
      newTT.datum(this) //store node DOM el't in datum
          .append("xhtml:span") 
          .attr("class",'inner');
      this.tooltip=newTT; //newTT - d3 elt, this - DOM elt
    })

    d3.selectAll('.tooltipO .inner')
          .text(function(d){return d3.select(d).datum().title});

    node.exit().each(function(){if(this.tooltip) this.tooltip.remove();})
    node.exit().select('.node')
        .transition()
        .attr("transform","scale(0)")
        // .attr("r", 0);
    node.exit().remove();
    //Formatting interactions:
    node.select('.node')
        .attr("xlink:href", d => nodeShape(d.type))
        // .attr("width", d => d.importance)
        // .attr("height", d=> d.importance)
        .attr("transform", d => "scale("+d.importance*$('#sizeInput').val()+")")
        //work-around to keep stroke-width independent of size:
        .attr("stroke-width",d => Math.min(5/d.importance,0.3))
        // .attr("r", function(d){return d.importance}) //radius
        .classed("phantom",d=>d.phantom)
        .classed("fixed",d=>d.fixed)
    force.charge(function(d){ return -$('#ChargeInput').val()/2*
      Math.pow(d.importance,2)}) //*((d.phantom)?3:1) *((d.phantom)?0:1)
        //charge up phantom nodes to account for the charge of removed nodes
    // force.chargeDistance($('#chrgDistInput').val())
  
    //re-render all math - in the entire page!
    if(typeof MathJax !== 'undefined') MathJax.Hub.Queue(["Typeset", MathJax.Hub]); 
    Session.set('lastUpdate', new Date() );

    //For links-----------------------

    link = link.data(linkData, function(d){return d._id});
    //show new SVG-s for new links
    link.enter()
        .insert("polyline", ".node-outer")
        .attr("class", "link")
        // .style("marker-mid",  "url(#arrowHead)")
        .on("mouseover", gui.linkMouseover)
        .on("mouseout",gui.linkMouseout)
        .on("mousedown", gui.linkMousedown)
        .on("mouseup", gui.linkMouseup, false) //bubble event propagation
        .on('click', function(d){d3.event.stopPropagation();}, false)
        .on("dblclick", gui.linkDblClick,false);//bubble events
        // .each(function(d){
        //   console.log(d);
        //   d.source = d3.select("#"+d.source);
        //   d.target = d3.select("#"+d.target);
        // })
         
    //delete SVG-s for deleted links
    link.exit().remove();
    // console.log('link',gui.selected_link);
    // console.log('node',gui.selected_node);

    //style and behavrior according to datum:
    link.style({
      "stroke-width":function(d){
        return d.strength*$('#sizeInput').val()+'px';
      },
      "marker-mid":function(d){
        return (d.oriented && d.source.type!="derivation" && d.type!="used" && d.type!="specialCase"
           ?  "url(#arrowHead)" : null) //Arrow heads
      }
    })
    
    link.each(function(d){
      var w = d.strength * $('#sizeInput').val();
      switch(d.type){
        //other line options: polyline coord to make double line;
        //polyline with many segments and different shape markers 
        //at each junction, then remove backgnd line;
        //polyline to make long narrow triangle line
        // but then need to draw this line each tick
        case "specialCase": 
        case "used":
          $(this).css("stroke-width", (w * 0.)); break;
        case "supports":
          // remove the stroke but keep the markers
          $(this).css("stroke-dasharray",w*2+','+w*(marker_spacing-2)); break;
          // $(this).css({"stroke":"transparent",
          //   "marker-mid": function(d){
          //     return (d.oriented && d.source.type!="derivation"
          //         ?  "url(#arrowHead)" : null) }
          // })
        case "implies": 
          $(this).css("stroke-dasharray","none");
          break;
        case "conjecture": 
          $(this).css("stroke-dasharray", w*4+","+w*2);break;
        case "related": 
          $(this).css("stroke-dasharray", w+","+w*2); break;
        default: console.log("unrecognized link type:", d.type, d);
      }
    })
    // force.linkDistance(function(d){ //ensure that links are visible
    //   return (parseFloat(d.source.importance)+
    //     parseFloat(d.target.importance))*1.2;
    // })
    //   .linkStrength(function(d){
    //     return 0;//d.strength/10;
    //   })
    linkData.forEach(function(lk){ //ensure that links are visible
      lk.minDist = (parseFloat(lk.source.importance)+
        parseFloat(lk.target.importance))*2;
      if(lk.source.type=="derivation") lk.minDist/=8;
      // switch(lk.type){ //set the transition distances
      //   case 'theorem': lk.transDist=150; break;
      //   case 'conjecture': lk.transDist=100; break;
      //   case 'related': lk.transDist=70; break;
      // }
    })

    //show the selection correctly:
    tree.updateSelection();

    if (d3.event) {
      // prevent browser's default behavior
      d3.event.preventDefault();
    }

    //Update the force graph:
    force.nodes(nodeData)
        // .links(linkData); //implemented by hand
    force.start();
    force.alpha(0.06);

    if(postScript){postScript();
      console.log('redraw passed postScript function');} //run the passed function
  })
  }

  // this.redraw();

  //Make a "RUN" button (to keep relaxing the graph while held down):
  var runBt= svg.append('svg:g')
      .attr('id','runButton')
      .attr("transform",
        "translate("+(width-50)+','+2.5+')')
      .on('mousedown',()=>{
        forceRun=true;
        force.alpha(0.1);
        // force.restart();
      },true)
      .on('mouseup',()=>{forceRun=false;},true)
      // .attr("x",width-50).attr("y",10)
  runBt.append('rect')
      .attr("width",40).attr("height",30)
      
  runBt.append('svg:text').text('>>>')
      .attr('x',3).attr('y',"1em")

  //Position tooltip divs next to their nodes:
  function positionTooltips(){
    d3.selectAll('.tooltipO').each(function(d,idx){
      // var bbox=this.parentNode.parentNode.getBoundingClientRect();
      var bbox=d.getBoundingClientRect(); //node bbox
      this.style.left=(bbox.left+bbox.right-
        this.firstChild.offsetWidth)/2 -8
            +window.scrollX+'px';
      this.style.top=bbox.top
            +window.scrollY+'px';
        // this.firstChild.offsetHeight -16+'px';
    })
  }

  this.addLink = function(lk){
    // Modal.show('linkOptions',{
    //   link: {source: lk.source._id, target: lk.target._id},
    //   tree: tree
    // }); 
    gui.showEditor({source: lk.source._id, target: lk.target._id});
    //   function(error, result){
    //   if(error){
    //     console.log(error.reason);
    //     return;
    //   }
    //   newId=result;
    //   //Assign the DB id to the link 
    //   links[links.length-1]._id = newId;
    //   console.log("added link ID:", links[links.length-1]._id);
    // })
    // console.log("added link:", lk);
  }
  this.addLinkedNode = function(lk){
    // Modal.show('nodeOptions',{
    //   node: lk.target,
    //   sourceID: lk.source._id,
    //   tree: tree
    // }); 
    // lk.target.title='...';
    gui.showEditor(lk.target, lk.source._id);
  }
  this.addNode = function(nd){
    // Modal.show('nodeOptions',{
    //   node: nd,
    //   tree: tree
    // }); 
    // nd.title='...';
    gui.showEditor(nd);
  }
  this.deleteNode = function(nd){
    Meteor.call("deleteNode",nd._id);
    // spliceLinksForNode(nd);
    tree.redraw();
  }
  this.deleteLink = function(lk){
    // links.splice(links.indexOf(lk), 1);
    Meteor.call("deleteLink",lk._id);
    tree.redraw();
  }
  this.updateSelection = function(){ //update the CSS classes appropriately
    if(gui.selected){
      link
        .classed("link_selected", function(d) { 
          return d._id == gui.selected._id;
          });
      node.select('.node')
        .classed("node_selected", function(d) { 
          return d._id == gui.selected._id;
         });
    }
    else{
      link.classed("link_selected", false);
      node.select('.node').classed("node_selected", false);
    }
    if(gui.editPopup){
      var editID = Blaze.getData(gui.editPopup);
      if(editID.node) editID=editID.node._id;
      else editID=editID.link._id;
      // console.log(editID)
      link
        .classed("link_edited", function(d) { 
          return d._id == editID;
          });
      node.select('.node')
        .classed("node_edited", function(d) { 
          return d._id == editID;
         });
    }
    else{
      link.classed("link_edited", false);
      node.select('.node').classed("node_edited", false);
      }
  }

  //Some buttons functionality
  $('#randomize').click(function(){
    nodeData.forEach(function(nd){
      nd.x = treeDim[0]/2 + Math.random()*100;
      nd.y = treeDim[1]/2 + Math.random()*100;
    });
    // if (force && force.alpha) force.start();//alpha(1).restart(); // For D3 v4+
    // For D3 v3, use force.start();
    // if (typeof tree.redraw === "function") tree.redraw();
    // Meteor.call("updateCoord", nodeData); // <-- ADD THIS LINE
  });

  $('#calcZoom').click(function(){ //recalculate the effective connectivit matrices on the server
    Meteor.call("calcEffConn",Session.get("currGraph"),function(err,res){
      console.log(res)
      // tree.redraw();
    })
  })
  $('#calcGrWeights').click(function(){ //recalculate the effective connectivit matrices on the server
    Meteor.call("weighGraph",Session.get("currGraph"))
  })

  $('#zmLvlInput').change(function(){
    Session.set('currZmLvl', parseInt($('#zmLvlInput').val()));
    console.log("current zoom:", Session.get('currZmLvl'))
    tree.redraw();
  })

  // }); });
  //Each time-step of graph evolution
  function tick(e) {
    //keep running while RUN is held down:
    if(forceRun) force.alpha(0.1);
    
    //create custom forces:
    
    var g = 30 * e.alpha; //e.alpha = 0.1 maximum filter(nd=>!nd.phantom).
    

    //Link forces:----------------------------
    linkData.forEach(function(lk){
      
      var delx=(lk.target.x - lk.source.x);
      var dely=(lk.target.y - lk.source.y);
      // var len = Math.sqrt(delx*delx + dely*dely);
      var len = math.norm([delx, dely]) +lk.strength/4, scale; //ensure denomenators >0
      //////////////////////////////////////////////////////////
      ////non-linear springs:---
      // var transDist = $('#linkDistInput').val();
      // var lkStr= $('#linkStrInput').val();
      // var scale=g/50 * Math.pow(lk.strength,2)*(len>transDist*lk.strength ? lk.strength*lkStr/len : $('#linkSStrInput').val())*
      //   (1 - lk.minDist / len);
      // d3.selectAll('.link').filter(d => d._id==lk._id)
      //   .classed('long',len>transDist*lk.strength);

      ////Percolating springs model:---------
      lk.strong=false;
      if(len < lk.target.parMinLen[1] || lk.target.parMinLen[0]==lk._id){ //Short spring
        lk.target.parMinLen[0]=lk._id; lk.target.parMinLen[1]=len*$('#linkDistMult').val();
        lk.strong=true;
      }
      if(len < lk.source.chiMinLen[1] || lk.source.chiMinLen[0]==lk._id){
        lk.source.chiMinLen[0]=lk._id; lk.source.chiMinLen[1]=len*$('#linkDistMult').val();;
        lk.strong=true;
      }
      if(lk.strong){
        scale = g/50 * Math.pow(lk.strength,2)*($('#linkSStrInput').val())*
          (1 - lk.minDist / len);
      }
      else{ //Long spring
        scale = g/50 * Math.pow(lk.strength,2)*(lk.strength*$('#linkStrInput').val()/len)*
          (1 - lk.minDist / len);
      }
      ////Linear springs:---------
      // var scale=g/50 * Math.pow(lk.strength,2)*($('#linkSStrInput').val())*
      //   (1 - lk.minDist / len); 
      /////////////////////////////////////////////////////
      // if(scale < -1) scale=-1;
      // if(scale >0.3) scale=0.3;
      // console.log('scale',scale);
      // if(len < lk.minDist) scale = scale*$('#hardCoreInput').val(); //to avoid collisions;
      var dx=delx*scale, dy=dely*scale;
      if(lk.source.type=="derivation"){ //make derivation node close to target node
        var nnScale=0.5*(len-lk.minDist)/lk.strength; 
        dx*=nnScale; dy*=nnScale; //non-linear springs
      }

      if(lk.oriented){ //orienting forces
        // var dy=g * Math.max(-2, Math.min(2,
        //   Math.exp((lk.source.y-lk.target.y)/100.)
        //   ));
        scale = $('#linkOrtInput').val()*g*Math.pow(lk.strength,3)/len*(Math.exp(-delx/len)-0.367879)*Math.sign(dely);
        if(lk.strong){scale*=3;}
        // scale = Math.min(scale, 0.5*lk.strength*lk.strength); //cap rotation at 30deg per tick
        dx -= dely*scale; dy += delx*scale;
      }
      else if (lk.type == 'theorem'){ //orient orthogonal to flow
        scale = -$('#linkOrtInput').val()*g*Math.pow(lk.strength,3)/len*(Math.pow(delx/len,2))*Math.sign(dely)*Math.sign(delx);
        if(lk.strong){scale*=3;}
        // scale = Math.min(scale, 0.5*lk.strength*lk.strength); //cap rotation at 30deg per tick
        dx -= dely*scale; dy += delx*scale;
      }
      // console.log('chrg', force.charge()(lk.source))
      // var chrgCorr=lk.strength*lk.strength/4*0;
      var srcChrg=-force.charge()(lk.source);//-chrgCorr, 
          trgChrg=-force.charge()(lk.target);//-chrgCorr; //ensure denomenator >0
      if(!lk.source.fixed){ 
      lk.source.x+=dx/srcChrg; lk.source.y+=dy/srcChrg;} //divide by charge=mass to get acceleration
      if(!lk.target.fixed){ 
      lk.target.x-=dx/trgChrg; lk.target.y-=dy/trgChrg;}
      //Collision detection for the linked nodes:
      // if(Math.abs(lk.source.x-lk.target.x) + Math.abs(lk.source.y-lk.target.y) < lk.minDist/2){ //faster than math.norm([srcX-trgX,srcY-trgY])
      //   lk.source.x=srcX; lk.source.y = srcY;
      //   lk.target.x=trgX; lk.target.y = trgY;
      // }
    })
    d3.selectAll('.link').classed('long',d=>!d.strong); //for percolating springs
 

    //Node forces:--------------------------
    nodeData.forEach(function(nd, idx){
      // nd.parMinLen+=nd.importance/2; nd.chiMinLen+=nd.importance/2; //for percolating springs
      if(!nd.fixed){
      //include gravity (charge-independent):
      //gravitate towards center of window at last reload, rectified cubic potential:
      var grav=0.01*$('#gravInput').val(); //strength of the centering gravity force
      var dxG=nd.x-tree.gravTo[0]; dyG=nd.y-tree.gravTo[1];
      nd.x -= grav*e.alpha*Math.pow(dxG,2)*Math.sign(dxG)/tree.gravStrength[0];//treeDim[0]/2);
      nd.y -= grav*e.alpha*Math.pow(dyG,2)*Math.sign(dyG)/tree.gravStrength[1];//treeDim[1]/2);

      //Add noise for annealing (quadratic s.t. dies faster than motion stops):
      nd.x +=g*g*(Math.random()-0.5)*nd.importance/100;
      nd.y +=g*g*(Math.random()-0.5)*nd.importance/100;

      bound_crd(nd); // Bound coordinates
    }
    })

    // link.attr("x1", function(d) { return d.source.x; })
    //     .attr("y1", function(d) { return d.source.y; })
    //     .attr("x2", function(d) { return d.target.x; })
    //     .attr("y2", function(d) { return d.target.y; });

    //Poistion all points on the links:
    link.attr("points", function(d){
      if(d.type == 'used' || d.type=='specialCase'){
        // Draw a long narrow triangle, always using data coords
        const dx = d.target.x - d.source.x, dy = d.target.y - d.source.y;
        const len = Math.sqrt(dx*dx + dy*dy);
        const ux = dx/len, uy = dy/len;
        const perpX = -uy, perpY = ux;
        const width = 3*d.strength;
        if (d.type == 'used'){ // triangle from source into target
          base = d.source; tip = d.target;
        }
        else { // triangle from target into source
          base = d.target; tip = d.source;
        }
        const p1 = [base.x + perpX*width/2, base.y + perpY*width/2];
        const p2 = [base.x - perpX*width/2, base.y - perpY*width/2];
        const p3 = [tip.x, tip.y];
        return [p1, p3, p2].map(p => p.join(',')).join(' ')
      }
      else if(d.type == 'supports'){
        var points = [d.source.x+','+d.source.y]; 
        var w = d.strength * $('#sizeInput').val();
        const dx = d.target.x - d.source.x, dy = d.target.y - d.source.y;
        const len = Math.sqrt(dx*dx + dy*dy);
        // Generate n+1 points evenly spaced from source to target
        var t = (marker_spacing + 1) *w / len; 
        while (t<1) {
            var x = d.source.x + t * dx;
            var y = d.source.y + t * dy;
            points.push(x + ',' + y);
            t += marker_spacing *w / len;  // Parameter from 0 to 1
        }
        return points.join(' ');
      }
      else {
        return d.source.x+','+d.source.y+' '+
            (d.source.x+d.target.x)/2+','+ //where to put the arrowhead
            (d.source.y+d.target.y)/2+' '+
               d.target.x+','+d.target.y;
      }
    })

    //position the node group:
    node.attr("transform",function(d){
      //translate and Rotate the "derivation" triangles along the flow:
      if(d.type == "derivation" && d.parentsIx.length>0 && d.childrenIx.length>0){
        var rot = 180/Math.PI*Math.atan2((d.parentsIx.reduce((prev,idx) => 
          prev+nodeData[idx].x, 0.)/d.parentsIx.length - //average x of parents
        d.childrenIx.reduce((prev,idx) => 
          prev+nodeData[idx].x, 0.)/d.childrenIx.length), //average x of children
        -(d.parentsIx.reduce((prev,idx) => 
          prev+nodeData[idx].y, 0.)/d.parentsIx.length -
        d.childrenIx.reduce((prev,idx) => 
          prev+nodeData[idx].y, 0.)/d.childrenIx.length)) //y between parents and children c.o.m.
        // console.log(d._id,rot);
        return ("translate("+d.x+','+d.y+
          ') rotate('+rot+')')
      }
      //just translate everything else
      else  return ("translate("+d.x+','+d.y+')')
    });
    // attr("x", function(d) { return d.x; })
    //     .attr("y", function(d) { return d.y; });
    positionTooltips();

  }

  // var ctrlDn=false;
  // d3.select("body").on("keydown", function () {
  //     ctrlDn = d3.event.ctrlKey;
  // });

  // d3.select("body").on("keyup", function () {
  //     ctrlDn = false;
  // });

  // var throttRedraw=throttle(function(){tree.redraw()},800,{leading:false});
  // var zoomScale=1, prevScale=1;
  // rescale g (pan and zoom)
  function rescale() {
    var transl=d3.event.translate;
    var scale = d3.event.scale;
    // dScale=scale-prevScale; prevScale=scale;
    // console.log(scale, dScale)
    // //change node/link size instead if ctrl is held down:
    // //save to database on force.end, along with positions
    // if(ctrlDn && gui.selected){
    //   if(!gui.selected.source){//if not a link (so a node)
    //   gui.selected.importance=parseFloat(gui.selected.importance,10)*(1+dScale);
    //   console.log("importance",gui.selected.importance,dScale);
    //   node.select('.node_selected')
    //       //contingent on the size = importance field:
    //       .attr("transform", d => "scale("+gui.selected.importance+")")
    //       //work-around to keep stroke-width independent of size:
    //       .attr("stroke-width",d => 3/d.importance)
    //   force.charge(function(d){return -Math.pow(d.importance/2,3)})
    //   }
    //   else { //a link then

    //   }

    // }
    // else{ //else, zoom and pan:
      // zoomScale+=dScale;
      // console.log("zoomscale",zoomScale)
      vis.attr("transform",
          "translate(" + transl + ")"
          + " scale(" + scale + ")");
      // console.log(scale)
      positionTooltips();
      //currently visible window coordinates
      visWindow = [(visWindowInit[0]-transl[0])/scale, //x-left
                   (visWindowInit[1]-transl[1])/scale, //y-top
                   (visWindowInit[2]-transl[0])/scale, //x-right
                   (visWindowInit[3]-transl[1])/scale];//y-bottom
      currScale=scale;
      // tree.redraw();
      // throttRedraw();
    // }
  }
  //------------Throttling function (from Underscore_ package)--------------
  // Returns a function, that, when invoked, will only be triggered at most once
  // during a given window of time. Normally, the throttled function will run
  // as much as it can, without ever going more than once per `wait` duration;
  // but if you'd like to disable the execution on the leading edge, pass
  // `{leading: false}`. To disable execution on the trailing edge, ditto.
  // function throttle(func, wait, options) {
  //   var context, args, result;
  //   var timeout = null;
  //   var previous = 0;
  //   if (!options) options = {};
  //   var later = function() {
  //     previous = options.leading === false ? 0 : Date.now();
  //     timeout = null;
  //     result = func.apply(context, args);
  //     if (!timeout) context = args = null;
  //   };
  //   return function() {
  //     var now = Date.now();
  //     if (!previous && options.leading === false) previous = now;
  //     var remaining = wait - (now - previous);
  //     context = this;
  //     args = arguments;
  //     if (remaining <= 0 || remaining > wait) {
  //       if (timeout) {
  //         clearTimeout(timeout);
  //         timeout = null;
  //       }
  //       previous = now;
  //       result = func.apply(context, args);
  //       if (!timeout) context = args = null;
  //     } else if (!timeout && options.trailing !== false) {
  //       timeout = setTimeout(later, remaining);
  //     }
  //     return result;
  //   };
  // };

}



