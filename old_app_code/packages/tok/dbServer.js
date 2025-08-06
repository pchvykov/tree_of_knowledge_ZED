treeData = function(){
  // this.Nodes=Nodes;
  // this.Links=Links;
	console.log("nodes count:", Nodes.find({}).count());
	console.log("links count:", Links.find({}).count());
  db=this;

  this.loadJSON = function(graph){
      console.log("loading collection from json")
      //Clear all entries in current collection:
      // Nodes.remove({});
      // Links.remove({});
      // var graph = JSON.parse(Assets.getText(fileName));
      graph.nodes.forEach(function (item, index, array) {
        Nodes.insert(item);
      });
      graph.links.forEach(function (item, index, array) {
        Links.insert(item);
      });
      console.log("nodes count:", Nodes.find({}).count());
      console.log("links count:", Links.find({}).count());
    };
  this.saveJSON = function(path){
    var bckup={
      nodes: Nodes.find().fetch(),
      links: Links.find().fetch()
    };
    console.log(bckup);
  }
  this.clear = function(){
    alert("deleting everything!")
    //Clear all entries in current collection:
    Nodes.remove({});
    Links.remove({});
  }

  this.publish = function(){
    //publish entire current graph:
  	Meteor.publish("allNodes", function (name,tmp,tm) {
      // console.log("publish", Nodes.find({graph:name}).count());
  	  return [Nodes.find({graph:name}), 
      Links.find({graph:name, strength:{$exists:true}})];
  	});
    var tmpZmLvl; //store current zoom level temporarily on server
    //publish visible portion of the graph:
    Meteor.publish("visNodes", function (Gname,visWindow,zmLvl) {
      // console.log("publish", Nodes.find({graph:Gname}).count());
      tmpZmLvl = zmLvl; 
      var visNodes, ndCount, ndCountLast=NaN, zmLvlLast=NaN;
      var first=true;
      do{ //loop to set the appropriate zoom level
      if(zmLvlLast > tmpZmLvl) { //if zooming in, find the dominant subtrees connected to visible ones
        var visNodesNew = visNodes.map(nd=>nd._id), prevNodes=visNodesNew;
        if(first){ //always start building sub-trees from largest node levels
          tmpZmLvl=Math.max(0,visNodes.map(nd=>nd.zoomLvl) //else might get only nodes at levels 6 and 0
            .reduce((max,now)=>Math.max(max,now),0)-1);
          first=false;
        } 
        do{
          var newNodes=[];
          prevNodes.forEach(function(visNd){ //for each node found last iteration
            // Links.find({$or:[{source:nd._id}, {target:nd._id}]})
            var coord=Nodes.find(visNd).map(nd => [nd.x,nd.y,2*nd.importance])[0];//for new node positioning 
            var srt={}; 
            if(tmpZmLvl==0) {srt['strength']=-1;}// exst['strength']={$exists:true}}
            else {srt['strength'+tmpZmLvl]=-1;}// exst['strength'+tmpZmLvl]={$exists:true}}}
            var chNodes = Links.find({source:visNd, target:{$nin:visNodesNew}}) 
            .map(lk=>lk.target) //find all the children not already selected
              .filter(chNd => //take only the children at the new zoom level
              Nodes.findOne(chNd).zoomLvl==tmpZmLvl) 
              .filter(chNd => //take only the children whose most important parent is visNd
              Links.find({target:chNd},{sort:srt,limit:1}) //find child's most important parent
                .map(lk=>lk.source)[0] == visNd) //and see if it's the visible node
            Nodes.update({$and:[{_id:{$in:chNodes}}, {x:2345}]},
              {$set:{x:coord[0]+coord[2],y:coord[1]+Math.random()*coord[2]*4}},{multi:true})//position node near the visible one if not alrady
            Array.prototype.push.apply(newNodes, chNodes);//to push multiple elements
            
            var parNodes = Links.find({target:visNd, source:{$nin:visNodesNew}})
            .map(lk=>lk.source) //same thing for parents
              .filter(parNd => //take only the children at the new zoom level
              Nodes.findOne(parNd).zoomLvl==tmpZmLvl)
              .filter(parNd => //take only the parents whose most important child is visNd
              Links.find({source:parNd},{sort:srt,limit:1}) 
                .map(lk=>lk.target)[0] == visNd)
            Nodes.update({$and:[{_id:{$in:parNodes}}, {x:2345}]},
              {$set:{x:coord[0]-coord[2],y:coord[1]-Math.random()*coord[2]*4}},{multi:true})
            Array.prototype.push.apply(newNodes, parNodes); //to push multiple elements
          // console.log('...', visNd, newNodes)
          })
          prevNodes=newNodes; //set up for the next iteration
          Array.prototype.push.apply(visNodesNew,newNodes); //add the found nodes to the array
          // console.log("building subtree, added ", newNodes.length, ' nodes')
        } while(prevNodes.length > 0)
        visNodes = Nodes.find({_id:{$in:visNodesNew}}); //get the cursor for the found array
      }
      else{ //if zooming out or staying const, then use node coordinates to determin what's visible
      visNodes = Nodes.find({graph:Gname, //all positioned nodes within visible window
        zoomLvl:{$gte: tmpZmLvl},
        x:{$gt: visWindow[0], $lt: visWindow[2], $ne: 2345},
        y:{$gt: visWindow[1], $lt: visWindow[3], $ne: 2345}})  
        // {sort:{importance: -1}, limit:nnds});
      }
      // console.log("visNd", visWindow, Gname, visNodes.count())
      //---------Automatic Zoom Level--------------------------------
      ndCount=visNodes.count();
      console.log('zmLvl',tmpZmLvl, 'ndCnt', ndCount);
      zmLvlLast=tmpZmLvl;
      if(ndCount < VisNNodes[0]){ //if too few nodes, show more detail
        if(ndCountLast>VisNNodes[1]){console.error("can't get the right zoom -"); break;} 
        if(tmpZmLvl==0){break;} //if fully zoomed in, break
        tmpZmLvl--;} 
      else if(ndCount > VisNNodes[1]){ //if too many nodes, coarsen
        if(ndCountLast<VisNNodes[0]){console.error("can't get the right zoom +"); break;} 
        if(tmpZmLvl==visNodes.map(nd=>nd.zoomLvl)
            .reduce((max,now)=>Math.max(max,now),0)){break;} //if fully zoomed out, break
        tmpZmLvl++;} 
      ndCountLast=ndCount;
      } while(ndCount < VisNNodes[0] || ndCount > VisNNodes[1])

      var visNdID = visNodes.map(nd => nd._id);
      var select={graph:Gname, //selector for links between these nodes at current zoom lvl
          $and:[{source:{$in: visNdID}}, {target:{$in: visNdID}}]};
      if(tmpZmLvl==0){tmpZmLvl=''}
      select['strength'+tmpZmLvl]={$exists:true};
      var visLinks= Links.find(select);
      // if (visLinks.count()==0){ //if zmLvl is higher than maximum zoom
      //   delete select['strength'+tmpZmLvl];
      //   select['strength']={$exists:true}; //then use the micorscopic connectivity
      //   visLinks= Links.find(select);
      //   tmpZmLvl = ''; //so that phantNodes uses microscopic connectivity
      // }
      return [visNodes, visLinks];
    });
    Meteor.publish("phantNodes", function(Gname, visWindow, visNdID, phChConst){//visWindow, minImportance){
      //----------Select 20 most important phantom links-------------------
      //Select links that connect to visNd on one side by implementing XOR: 
      // var select={$or:[{source:{$in: visNdID}, target:{$nin: visNdID}}, 
      //                  {source:{$nin: visNdID}, target:{$in: visNdID}}]};
      // select['strength'+tmpZmLvl]={$exists:true}; //select links at the right zoom     
      var srt={}; srt['strength'+tmpZmLvl]=-1;
      // var connLk= Links.find(select,{sort:srt, limit:100}); //limit number of phantom nodes loaded
      //---------Or select two most important per node----------------------
      var connLkIDs=[];
      visNdID.forEach(function(nd){
        // var ttZm=tmpZmLvl, newPhLk=[], lpCnt=0;
        // do{ lpCnt++;
        var select={$or:[{source:nd, target:{$nin: visNdID}}, 
                         {source:{$nin: visNdID}, target:nd}]};
        select['strength'+tmpZmLvl]={$exists:true}; //select links at the right zoom 
        var newPhLk=Links.find(select,{sort:srt, limit:2}).map(lk=>lk._id);//take 2 strongest phantLinks per node
        //   .forEach(function(lk){
        //     if(Nodes.find({_id:{$in:[lk.source,lk.target]},//filter out unpositioned links
        //       x:{$eq:2345}}).count()==0) newPhLk.push(lk._id);
        //   });
        // ttZm = (ttZm==''? 1 : ttZm+1); //increment local zoom level
        // } while(lpCnt<0 && newPhLk.length==0) //in case none of the phantLinks are positioned 
        Array.prototype.push.apply(connLkIDs, newPhLk);
      })
      var connLk = Links.find({_id:{$in:connLkIDs}});
      // var connLk= Links.find({
      //     $or:[{source:{$in: visNdID}}, {target:{$in: visNdID}}]});
      // console.log('MI',minImportance)

      //Find the nodes to create the right electric potential:
      // if(tmpZmLvl=='') tmpZmLvl=0;
      // var scrCent = [(visWindow[0]+visWindow[2])/2, (visWindow[1]+visWindow[3])/2];
      // var phChNodes=[];
      // Nodes.find({graph:Gname, zoomLvl:{$gte: tmpZmLvl}, x:{$ne:2345}}).forEach(function(nd){
      //     if(nd.importance*nd.importance > 
      //         phChConst*(visWindow[3]-visWindow[1])/50 *
      //         math.norm([nd.x-scrCent[0], nd.y-scrCent[1]])) phChNodes.push(nd._id);
      //   })

      var fixNodes = Nodes.find(
        {_id:{$in: connLk.map(lk=>lk.source).concat(connLk.map(lk=>lk.target)),
              $nin:visNdID}, x:{$ne:2345}}, //filter out unpositioned nodes - connecting links will be removed in tok.js, redraw()
              // {_id:{$in: phChNodes}}]}, //add nodes needed to get the right electric field
        {fields:{text:0}}); //use this to flag phantom nodes (for now)
        // {transform: function(nd){
        //   nd.phant=true; return nd;
        // }});
      // console.log('fixNd',fixNodes.fetch())
      // var fixNdID=fixNodes.map(nd=>nd._id);
      return [fixNodes, connLk]
      // Links.find({
      //   $or:[{
      //     source:{$in: fixNdID},
      //     target:{$in: visNdID}
      //   },{
      //     source:{$in: visNdID},
      //     target:{$in: fixNdID}
      //   }]
      // })];
    });
  }; 

  this.subscribe = function(visWindow, onReady){ //the 1 client method here
    if(db.visSubscr){
      db.visSubscr.stop(); //clear client collections
      db.phantSubscr.stop();
    }
    //only published nodes/links appear in Nodes/Links collections:
    db.visSubscr=Meteor.subscribe("visNodes",Session.get("currGraph"),
      visWindow, Session.get('currZmLvl'), function(){
      var ndLvls=Nodes.find().map(nd=>nd.zoomLvl);
      Session.set('currZmLvl', //set to new level as found in the publish function
        (ndLvls.length > 0)? ndLvls.reduce((min,now)=>Math.min(min,now)) : 0)
    // db.phantSubscr=Meteor.subscribe("phantNodes", Nodes.find().map(nd=>nd._id), 
    // // Links.find().map(lk=>lk.source).concat(Links.find().map(lk=>lk.target)), 
    // visWindow, 
    // Nodes.find().map(nd=>nd.importance).reduce((min,now)=>Math.min(min,now)), //smallest visible node
    //  function(){
    db.phantSubscr=Meteor.subscribe("phantNodes",Session.get("currGraph"),
      visWindow, Nodes.find().map(nd=>nd._id), $('#phChInput').val(),function(){ 
      onReady();
    })})
  }
}

//Node and Link methods for calls from the client:
Meteor.methods({
//update db to node locations sent from the client
  updateCoord: function(nodes){
    // if (Meteor.isClient) {notify("storing node locations");}
    nodes.forEach(function(nd, ix){
      // console.log(nd._id, nd.x);
      Nodes.update( { _id: nd._id }, { $set: { 
        x: nd.x,
        y: nd.y 
      } } );
    })
  },
  //replace data entries in DB with ones provided 
  //(leave others unchanged), or create new:
  updateNode: function(node, fromID, link){
    console.log("add node:",node);
    //Check that node has the crucial properties:
    if(!node.importance || !node.x || !node.y){
      alert("failed to update node: missing info");
      return null;
    }
    delete node.px // don't store any speed
    delete node.py

    if(!node._id){ //add new node
      delete node._id;
      if(!('zoomLvl' in node)) node.zoomLvl=0;
      var ndID = Nodes.insert(node);
      // console.log(Nodes.find().fetch())
      if(fromID){ //if linked node, also insert link
        link.source=fromID; link.target=ndID;
        var lkID = Links.insert(link);
        return [ndID, lkID];
      }
      return [ndID];
    }
    else{ //update existing node
      var attr = {};
      for (var attrname in node) { 
        if(attrname!="_id") attr[attrname] = node[attrname]; 
      };
      var num = Nodes.update( { _id: node._id }, { $set: attr } );
      if(num!=1) alert("failed to update a document!");
      return null;
    }
  },
  updateLink: function (link) {
    console.log("add link:", link);
    //Check that link has the crucial properties:
    if(!link.strength || !link.source || !link.target){
      alert("failed to update link: missing info");
      return null;
    }

    // console.log("added link in method!", link);
    if(!link._id){ //new link
      delete link._id;
      var tarLk=Links.findOne(link.target);
      if(tarLk){ //if targeting another link, add "derivation" node
        var tarNd=Nodes.findOne(tarLk.target);
        var derNdID=Nodes.insert({
          importance: tarNd.importance,
          x: tarNd.x-tarNd.importance,
          y: tarNd.y,
          graph: link.graph,
          type: "derivation",
          text: "",
          zoomLvl:0
        });
        Links.update(link.target,{$set: {target:derNdID}});
        Links.insert({
          source:derNdID,
          target:tarNd._id,
          strength:tarLk.strength,
          type:tarLk.type,
          graph:link.graph,
          oriented:true,
          text:""
        });
        link.target=derNdID;
        link.oriented=true; link.type="theorem";
      }
      return Links.insert(link);
    }
    else{ //update link
      var attr = {};
      for (var attrname in link) { 
        if(attrname=="_id") continue;
        if((attrname=="source" || attrname=="target") && 
          typeof link[attrname] !== 'string'){ //allow objects as source/target
          attr[attrname]=link[attrname]._id; continue;
        }
        attr[attrname] = link[attrname]; 
      };
      // console.log("attr",attr);
      var num = Links.update( { _id: link._id }, { $set: attr } );
      if(num!=1) alert("failed to update a document!");
      return null;
    }
  },
  // addNode: function (nd) {
  //   var newId= Nodes.insert(nd);
  //   // console.log("added node in method!", newId);
  //   return newId;
  // },

  resetNodeCoords: function(graphName) {
    check(graphName, String); // Validate input
    
    // Update all nodes in the specified graph to have initial coordinates
    return Nodes.update(
      { graph: graphName },
      { $set: { x: 2346, y: 2346 } },
      { multi: true }
    );
  },

  renameTypes: function(map){
    // Iterate through each old_type -> new_type mapping
    Object.keys(map['nodes']).forEach(function(oldType) {
        // Update all nodes with the old type
        if (oldType === null || oldType === "null") {
            query = { $or: [{ type: null }, { type: { $exists: false } }] };
        } else {
            query = { type: oldType };
        }
        Nodes.update(
            query, 
            { $set: { type: map['nodes'][oldType]} }, 
            { multi: true }
        );
    });
    Object.keys(map['links']).forEach(function(oldType) {
        // Update all links with the old type
        if (oldType === null || oldType === "null") {
            query = { $or: [{ type: null }, { type: { $exists: false } }] };
        } else {
            query = { type: oldType };
        }
        Links.update(
            query, 
            { $set: { type: map['links'][oldType]} }, 
            { multi: true }
        );
    });
    
    console.log('Type renaming complete:', map);
  },


  deleteNode: function(nd){
    //Remove node and all connected links:
    Links.remove({$or: [{source: nd}, {target: nd}]});
    Nodes.remove(nd);
  },
  deleteLink: function(lk){
    Links.remove(lk);
  },
  weighGraph: function(graph){ //calculate node and link weights 
    if(Meteor.isServer){
    //after the tree has been created No
    //Back-propagate importance values from leaves throughout the tree
    // create some useful indexes:
    // Links.rawCollection().createIndex({source:1,target:1});
    // Links.rawCollection().createIndex({target:1,source:1});
    // Links._ensureIndex({source:1,target:1})
    // Links._ensureIndex({target:1,source:1}) 
    // Nodes._ensureIndex({importance:1})  
    // console.log("MMnodes",Nodes.find({graph:'MetaMath'}).fetch())
    //nodes that are not yet weighted:
    Links.remove({graph:graph, strength:{$exists:false}}); //remove old effective links
    var nds=Nodes.find({graph:graph});//, level:lev});
//===========Propagate weights from leafs===========================
if(false){ 
    var unweighted = nds.map(nd=>nd._id);//Object.keys(nodeDic).map((k) => nodeDic[k]);
    //Find average child to parent ratio:
    // var nnLev=1, lev=1; var ch2parRat=[];
    // while(nnLev>0){
      // nnLev=nds.count();
      // var aveNchildren = nds.map(nd=>nd.children.length)//.filter(nCh=>nCh>0);
      //   .reduce((tot,nCh)=>[tot[0]+nCh,tot[1]+(nCh>0)],[0,0]);
      // aveNchildren=(aveNchildren[0]/aveNchildren[1]); //average number of children (non-leaf nodes only)
      // // aveNchildren=math.median(aveNchildren); 
      // var aveNparents = nds.map(nd=>Links.find({target:nd._id}).count())
      //   .reduce((tot,nCh)=>[tot[0]+nCh,tot[1]+(nCh>0)],[0,0]);
      // aveNparents=(aveNparents[0]/aveNparents[1]);
      // // aveNparents=math.median(aveNparents);
      // var ch2parRat = ((aveNchildren+1)/(aveNparents)); 
      // // ch2parRat.push((aveNchildren+1)/(1+aveNparents)); 
      // console.log("aveNchildren",aveNchildren,"aveNparent",aveNparents,"ratio",ch2parRat);
      // lev++;
    // }
    // aveNchildren=(aveNchildren[0]/aveNchildren[1]); //average number of children (non-leaf nodes only)
    //Save connectivity matrix for analysis:----------
    // var connMx=[];
    // for(iu in unweighted){
    //  var chi=Nodes.find(unweighted[iu]).map(nd=>nd.children)[0];
    //  for(ic in chi){ //construct sparse matrix
    //    connMx.push([iu,unweighted.indexOf(chi[ic]),'1\n']);
    //  }
    // }
    // connMx.push([unweighted.length-1, unweighted.length-1, 0])
    // saveAs(new File(connMx,"conn_matrix",{type: "text/plain"}));
    // return;
    //-------------------------------------------------
    var leafImp=0.01; //the "unit" of node importance
    // var remaining = Nodes.find({graph:'MetaMath',importance:1.23456}).count();
    while(unweighted.length >0){   //iterate through all nodes 
    // console.log("Weighing nodes: "+unweighted.length+" remaining")
    //for each node whose children are already weighted:
    Nodes.find({$and:[{_id:{$in:unweighted}},{children:{ $nin: unweighted }}]},
      // {graph:'MetaMath',importance:1.23456},
      {fields:{level:1,number:1}}).forEach(function(nd, idx){ //take only level field
      // if(Links.find({source:nd._id, strength:1.23456}).count()>0) return;
      console.log("weigh node "+idx+" of "+unweighted.length)
      //set importance to sum of all child link strengths:
      var ndImp=(Links.find({source : nd._id},{fields:{strength:1,target:1}})
        // .count()); /Nodes.findOne(lk.target).importance
        .map(lk => lk.strength).reduce((sum, value) => sum + value,0));
      // var ndImp=Links.aggregate([{$match:{source : nd._id}},])
      // ndImp/=ch2parRat; //to balance out average sizes of early and late nodes
      ndImp+=(leafImp);///(1+ndImp/leafImp)); //source importance from nodes/leafs
      // ndImp=Math.sqrt(ndImp);
      //Math.exp(-ndImp); //decaying influence of possible new nodes
      var parLk = Links.find({target : nd._id},{fields:{source:1}});
      // keep this fraction of weight, pass on the rest:
      // var keepFrac=0.5; //parLk.count()+1; keepFrac=1/(keepFrac*Math.log(keepFrac));
      // keepFrac=(keepFrac==Infinity)? 0:keepFrac;
      Nodes.update(nd._id, {$set:{importance : ndImp}});
      // nd.importance = (Links.find({source : nd._id})
      //  .map(lk => lk.strength).reduce((sum, value) => sum + value,2));
      //set strengths of all parent links according to their level:
      var parLk = Links.find({target : nd._id},{fields:{source:1}});
      //============== Weigh parent links ==================
      // //according to parent level
      // var parLev = parLk.map(lk=> lk.level);
      // //to avoid huge exponents that cancel out:
      // var parWt = parLev.map(lv => Math.exp((lv-parLev[0])/2));
      //-----------------------
      //according to parent's number of children of lower level (how many times parent has already been used)
      var parNChild = parLk.map(function(lk){ //for each parent link, take
        return Nodes.findOne(lk.source).chLevel.filter(lvl=>lvl<nd.level).length;
        // return Links.find({source: lk.source},{target:1,_id:0}) //all links with same parent,
        //   .map(lk1 => Nodes.find({_id:lk1.target,level:{$lt:nd.level}}).count()) //their child nodes 
        //   // .map(nd1 => nd1.level<nd.level)[0]) //with level lower than current
        //   .filter(use => use==1).length
        });
          // .reduce((tot,val)=>val?tot+1:tot, 0)); //count their number
      var parWt = parNChild.map(Nch => 1/(Nch+1)); //parent link relative weight
      //==================================
      var parWtTot=parWt.reduce((sum, value) => sum + value,0); //normalization
      // var pfI = parLk.count()+1; pfI = pfI*Math.log(pfI)*leafImp/5; //info content of the proof itself
      // parWtTot*=(1+Math.log(parLk.count()+1)); //include proof info as another ghost-node
      parLk.forEach(function(lk,ip){
        Links.update(lk._id,{$set:{strength: parWt[ip]/parWtTot*ndImp}});// ndImp/(1+pfI)}});
          // *Math.max(ndImp-pfI,leafImp)}}); 
      })
   
      //remove current node from unweighted list:
      unweighted.splice(unweighted.indexOf(nd._id),1);
      // remaining--;
    })
    }
    //Compensate nodes found later in DB: (first node left as is, last node squared)
    // Nodes.find({graph:graph}).forEach(function(nd){
    //   // var currScale = (nd.number+1)/(nds.count()-nd.number+1);
    //   var currScale = Math.pow(nd.importance/leafImp,1/(2*nds.count()/nd.number -1));
    //   Nodes.update(nd._id,{$mul:{importance:currScale}});
    //   Links.update({target:nd._id},{$mul:{strength:currScale}});
    // })
    // Links.find({graph:graph}).forEach(function(lk){
    //   Links.update(lk._id,{$set:{strength: 
    //     lk.strength*Math.sqrt(Nodes.findOne(lk.target).importance*Nodes.findOne(lk.source).importance)}})
    // })
}//=====================================================================
//==============Weight using random walker==============================
else {
  var iMax=20*nds.count(); //Math.exp(0.002*nds.count())
  var di=nds.count()/iMax;
  var wlkID=nds.map(nd=>nd._id);//Nodes.findOne({graph:graph, children:{size}})._id;
  wlkID=wlkID[Math.floor(Math.random()*wlkID.length)]; //random initial node
  Links.update({graph:graph},{$set:{strength:di}},{multi:true});
  Nodes.update({graph:graph},{$set:{importance:di}},{multi:true}); //initialize
  for(var i=0; i<iMax; i++){
    // var connLk=Links.find({$or:[{source:wlkID},{target:wlkID}]}).map(lk=>lk._id); //find all connected links (make array of IDs)
    // var lkID=connLk[Math.floor(Math.random()*connLk.length)]; //choose a random one
    // Links.update(lkID,{$inc:{strength:di}});
    // var lk=Links.findOne(lkID);
    // if(lk.source==wlkID){wlkID = lk.target;}
    // else {wlkID = lk.source}
    // Nodes.update(wlkID,{$inc:{importance:di}});
    chiLk=Links.find({source:wlkID}).map(lk=>lk._id);
    parLk=Links.find({target:wlkID}).map(lk=>lk._id);
    if(Math.random()<chiLk.length/(chiLk.length+parLk.length)){
      connLk=chiLk;
      if(connLk.length>0){
      lkID=connLk[Math.floor(Math.random()*connLk.length)];
      wlkID=Links.findOne(lkID).target;}
    }
    else {
      connLk=parLk;
      if(connLk.length>0){
      lkID=connLk[Math.floor(Math.random()*connLk.length)]; 
      wlkID=Links.findOne(lkID).source;}
    }
    var incr=di;//*Math.exp(-Nodes.findOne(wlkID).importance/di);
    Links.update(lkID,{$inc:{strength:incr}});
    Nodes.update(wlkID,{$inc:{importance:incr}});
    if(i%1000==0){console.log('weighting: step ',i,' of ',iMax)}//show progress
  }  
}
//======================================================================
    Meteor.call("calcEffConn", graph,function(err,res){
      // console.log("effective connectivities ",res)
      // tree.redraw();
    })

  }},
  calcEffConn: function(graph){ //calculate the effective connectivit matrices
    if(Meteor.isServer){ 
      //remove old effective links:-----
    Links.remove({graph:graph, strength:{$exists:false}}); 
    Links.find({graph:graph}).forEach(function(lk){
      var del={}, delFl=false;
      for(var prop in lk){ //remove old effective links
          if(prop.substring(0,8)=='strength' && prop.length>8){
            del[prop]=""; //delete lk[prop];
            delFl=true;
          }
      }
      if(delFl){Links.update(lk._id,{$unset:del});} //delete those fields from DB
    })
    //Generate connectivity matrix-----------------------------------
    var connMx=math.sparse(); //initialize connectivity matrix
    var allNodes = Nodes.find({graph:graph},{sort:{importance: -1}}) // take all nodes, from most to least important
    var ndID = allNodes.map(nd => nd._id); //make a dictionary array storing node ids
    var ndImp = allNodes.map(nd => nd.importance);
    var mxN=allNodes.count(); connMx.set([mxN,mxN],0);
    //build the sparse matrix row-by-row:
    ndID.forEach(function(nd, idx, arr){ //for each node
      Links.find({source:nd}).forEach(function(lk){  //for each child Links
        connMx.set([idx, //set the matrix element in that row
          ndID.indexOf(lk.target)], //and find column from dictionary
          lk.strength/ndImp[idx]) //set mx element to link weight normalized by parent nd weight
      });
    })
    console.log("built "+mxN+" sparse connectivity matrix");

    //Calculate effective connectivity one level out-------------------------
    var connMxPS = math.multiply(0.9,connMx);
    // var connMxPS = math.add(math.multiply(0.95,connMx), //partly symmetrized connectivity matrix
      // math.multiply(0.1,math.transpose(connMx)));
    var zmIx = 1;  
    while (mxN > VisNNodes[1]){
      var splitN=Math.round(mxN / (ZoomStep*ZoomStep)); //hide all nodes after this idx
      var rg1=math.range(0,splitN), rg2=math.range(splitN,mxN);

      var mxB = connMxPS.subset(math.index(rg1,rg2)),
          mxC = connMxPS.subset(math.index(rg2,rg1)),
          mxD = connMxPS.subset(math.index(rg2,rg2));
      connMxPS = math.add(connMxPS.subset(math.index(rg1,rg1)), //add actual connections to effectve ones
        math.multiply(
          math.divide(mxB,
            math.subtract(math.eye(mxN-splitN), 
              math.add(mxD, math.multiply(mxC,mxB)))),
          mxC)); //calculate effective connectivity according to total flow between nodes
 
      //Store effective connectivities in Links DB-------------------------------
      // connMxPS=connMxPS.map(wt => parseFloat(wt.toFixed(1)),true);//(wt>0.05 ? wt : 0),)
      ndID.slice(splitN,mxN).forEach(function(id){
        Nodes.update(id,{$set:{zoomLvl:zmIx-1}}) //store zoom level for each node
      }) 
      connMxPS.forEach(function(effWt, idx){ //for each non-zero entry of connMx
        if(idx[0]==idx[1] || //ignore self-links
        (effWt<0.05 && effWt*ndImp[idx[0]]<ndImp[idx[1]]*0.05) || //ignore weak effective links
          effWt < connMxPS.subset(math.index(idx[1],idx[0]))) {return} //and reversed links
        var temp = {}; temp["strength" + zmIx] = effWt*ndImp[idx[0]];
        Links.upsert({source:ndID[idx[0]], target:ndID[idx[1]]}, //find the corresponding link
          {$set:temp, //add a strength field for the current zoom level
            $setOnInsert: {type:"theorem", oriented:true, graph:graph}}) //if the link did not exist before, insert it
        // console.log(Links.find(updLk.insertedId).fetch())
        // var src=Nodes.findOne(ndID[idx[0]]), trg=Nodes.findOne(ndID[idx[1]]);
        // if(src.zoomLvl || trg.zoomLvl) console.error(src,trg);
        },true)
      
      mxN = splitN; // prepare for next iteration
      zmIx++; console.log("Calculating effective conn mx: " + splitN + " remaining");
    }
    ndID.slice(0,splitN).forEach(function(id){
      Nodes.update(id,{$set:{zoomLvl:zmIx-1, x:2346, y:2346}}) //store zoom level for last block, and designate nodes as "positioned"
    })
    console.log("Everything is loaded!")
    return connMxPS;
    }
  },
  maxZoomLvl: function(graph){
    return Nodes.find({graph:graph})
      .map(nd=>(('zoomLvl' in nd)? nd.zoomLvl : 0))
      .reduce((max,now)=>Math.max(max,now),0);
  }
}); 
   
