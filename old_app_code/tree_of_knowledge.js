// var Graphs = new Meteor.Collection("graphList"); //available graphs
//Client and server Globals:
Nodes = new Meteor.Collection("all_Nodes");
Links = new Meteor.Collection("all_Links");
//Collection to store JSON strings as backups:
Backup = new Meteor.Collection("backups");
//factor by which each zoom step rescales the graph
ZoomStep=1.5; VisNNodes=[20,50];
var db = new treeData();
var graph; var svg;
var currGraph;
notify = function(text){ //notification messages
  // console.log("notify: ",text);
  $('#notifications').text(text);
  // $('#notifications').css({"animation-name":"notify","animation-duration":"6s"})
  $('#notifications').removeClass('notify');
  setTimeout(function() {
      $('#notifications').addClass('notify');
  },1);
}
// Server-side code:============================
if (Meteor.isServer){ 
  Meteor.startup(function(){
    // var allCollections = function () { //return all collections
    //     var Future = Npm.require('fibers/future'),
    //         future = new Future(),
    //         db = MongoInternals.defaultRemoteCollectionDriver().mongo.db;

    //     db.collectionNames( 
    //         function(error, results) {
    //             if (error) throw new Meteor.Error(500, "failed");
    //             future.return(results);
    //         }
    //     );
    //     return future.wait();
    // };
    // var collList=allCollections();
    // console.log("Collections:", collList);

    //direct DB manipulations:
    // db.loadJSON(JSON.parse(Assets.getText("miserables.json")));
    // db.clear(); 
    // Nodes.insert({x: 0.0, y: 0.0});
    // console.log("updated #",
    //   Nodes.update({}, {$set: {graph:"test0"}}, {multi:true}),
    //   Links.update({}, {$set: {graph:"test0"}}, {multi:true}));
    // Nodes.update({importance: {$in:["",null,10]}}, 
    //   {$set: {importance:10}}, {multi:true}));
    // Links.update({strength: {$in:["",null,10]}}, 
    //   {$set: {strength:5}}, {multi:true});
    // Links.update({type: {$in:["connection"]}}, 
    //   {$set: {type:"related"}}, {multi:true});
    // Nodes.update({$and: [{x: NaN}, {graph: "ClassMech"}]}, 
    //   {$set: {x:1000}}, {multi:true}),
    // Nodes.update({$and: [{y: NaN}, {graph: "ClassMech"}]}, 
    //   {$set: {y:1000}}, {multi:true}),
    // Nodes.find({graph:"ClassMech"}).fetch() )
    // Nodes.update({graph:"test1"},{$set:{zoomLvl:0}},{multi:true})
    // return;
    // Graphs.remove({});
    // console.log(
    //   Nodes.remove({graph:{$exists:false}}),
    //   Links.remove({graph:{$exists:false}}))
    // console.log('all',
    //   Nodes.find().fetch(),
    //   Links.find().fetch())
    // console.log(
    //   Nodes.remove({graph:'MetaMath'}),
    //   Links.remove({graph:'MetaMath'})) 
    // Nodes.update({graph:'MetaMath'},{$set:{x:2345,y:2345}},{multi:true}) 
    var mxZm=Math.max(...Nodes.find({graph:'MetaMath'}).map(nd=>nd.zoomLvl));
    Nodes.update({graph:'MetaMath', zoomLvl:mxZm},{$set:{x:2346, y:2346}},{multi:true})
 
    // console.log(
    //   Nodes.remove({graph:'test1'}),
    //   Links.remove({graph:'test1'})) 
    Nodes.update({graph:'test'},{$set:{x:2345,y:2345}},{multi:true}) 
    // Links.find({}).forEach(lk => Links.update(lk._id, 
    //   {$set: {strength:parseFloat(lk.strength)}}));
    console.log(Nodes.update({x:NaN},  
      {$set: {x:1000}}, {multi:true}),
    Nodes.update({y:NaN}, 
      {$set: {y:1000}}, {multi:true}))

    db.publish();
    Meteor.publish("srvBckup", function () {
      return Backup.find();
    });
  })

  Meteor.methods({
    
    listGraphs: function(){ //list all available graphs
      //console.log("graphs!!!",Nodes.rawCollection().distinct("graph"));
      //scan the Nodes collection for unique "graph" values:
      var graphs = _.uniq(Nodes
            .find({}, {fields: {graph: true}, sort:{graph:1}})
            .map(x => x.graph), true);
      return graphs;
    },
    renameGraph: function(oldName, newName){
      Nodes.update({graph:oldName},{$set:{graph:newName}},{multi:true});
      Links.update({graph:oldName},{$set:{graph:newName}},{multi:true});
    },
    deleteGraph: function(name){
      Links.remove({graph: name});
      Nodes.remove({graph: name});
    },
    backupGraph: function(name, note, srv){ 
      var bck={
        nodes: //JSON.stringify(
          Nodes.find({graph:name}).fetch(),
        links: //JSON.stringify(
          Links.find({graph:name}).fetch(),
        date: new Date(),
        graph: name,
        note: note,
        nodeCount: Nodes.find({graph:name}).count(), 
        linkCount: Links.find({graph:name}).count(),
        graphNumber: (Backup.find().count()+1)
      }
      if(srv) return Backup.insert(bck); //server backup
      else return bck; //client backup
    },
    restoreGraph: function(bckCnt, srv){
      if(srv) var grObj=Backup.find({graphNumber:bckCnt}).fetch(); //server restore
      else var grObj = [bckCnt]; //client restore
      // console.log(bckCnt, grObj, grObj.length);
      if(grObj.length==0){return false;}
      var grList=Meteor.call("listGraphs");
      var name=grObj[0].graph;
      //Create new name for the graph:
      while(grList.indexOf(name) >-1){
        name+="~";
      }
      //Insert all nodes and links into their Collections:
      //note: must update link source/target with new node IDs
      var newId={};
      grObj[0].nodes.forEach(function(nd){
        nd.graph=name;
        var oldID=nd._id;
        delete nd._id;
        newId[oldID]=Nodes.insert(nd);
      })
      grObj[0].links.forEach(function(lk){
        lk.graph=name;
        lk.source=newId[lk.source];
        lk.target=newId[lk.target];
        delete lk._id;
        Links.insert(lk);
      })
      return name;
    }
  })
}


//Client-side code:============================
if (Meteor.isClient) {
  //Once the SVG is rendered:
  Template.graph.onRendered(function(){
    //Dropdown for available graphs:
    Meteor.call("listGraphs", function(err, list){
      $.each(list, function (i, item) {
          $('#availGraphs').append($('<option>', { 
              value: item,
              text : item 
          }));
      });
    currGraph=list[0]; //First graph to show
    $('#availGraphs').val(currGraph);


    //Create canvas:
    Session.set('lastUpdate', new Date() );
    var width = $(window).innerWidth()-35,//$("body").prop("clientWidth"),
    height = 500;//$(window).height(); //SVG size
    console.log('width: ', width);

    svg = d3.select("#graphSVG")
        .attr("width", width)
        .attr("height", height); //Set SVG attributes
    $(".canvas").width(width);

    // showGraph("test0");
    graph = new ToK(svg, db);
    showGraph(currGraph)

    });
  });

  Template.graph.helpers({
    lastUpdate(){return Session.get('lastUpdate');}
  });

  Template.graph.events({
    'change #availGraphs': function(e){
      if(graph.gui.editPopup){
        notify("finish editing first");
        return;}
      var newValue = $('#availGraphs').val();
      var oldValue = Session.get("currGraph");
      if (newValue != oldValue) { // value changed, let's do something
        showGraph(newValue);
      }
    },
    'click #new': function(e){
      if(graph.gui.editPopup){
        notify("finish editing first");
        return;}
      var name=prompt("New graph name (no spaces)", "test1");
      var newFl=true; //check if name already exists:
      $("#availGraphs option").each(function(d){
        newFl=newFl && (name!=$(this).val());
      });
      if(name){
        if(newFl){
          $('#availGraphs').append($('<option>', {
              value: name,
              text: name,
              selected: 'selected'
          }));
          showGraph(name);
          notify("created new graph");
        }
        else {
          $('#availGraphs').val(name);
          showGraph(name);}
      }
    },
    'click #rename': function(e){
      if(graph.gui.editPopup){
        notify("finish editing first");
        return;}
      var newName = prompt("Enter new graph name:",Session.get("currGraph"));
      Meteor.call("listGraphs", function(err, list){
        if(list.indexOf(newName)>-1){notify("name already exists");
         return;}
        Meteor.call("renameGraph",Session.get("currGraph"),newName,
          function(){
            notify("Graph renamed, refresh the page to finish");
            Session.set("currGraph",newName);
          });
      });
    },
    'click #delete': function(e){
      var result = confirm("Delete the entire current graph?");
      if (result) {
          Meteor.call('deleteGraph',Session.get("currGraph"))
          notify("graph deleted - switch to another graph")
      }
    },
    'click #srvBckup': function(e){
      e.preventDefault();
      var note=prompt("Backup note:");
      if(!note){notify("backup cancelled"); return}
      Meteor.call("backupGraph",Session.get("currGraph"),note,true);     
    },
    'click #srvRestore': function(e){
      e.preventDefault();
      if(graph.gui.editPopup){
        notify("finish editing first");
        return;}
      Meteor.subscribe("srvBckup",function(){ //backup DB
        //show the backup collection and and 
        //ask user for graphNumber in Backup collection:
        console.log("Backups collection:",Backup.find().fetch())
        var list=Backup.find({},{fields: {
          graph: true, date:true, note:true, graphNumber:true, 
          nodeCount:true, _id:false //, linkCount:true
        }}).fetch();
        var restID=prompt(JSON.stringify(list,null,2)+
          "\n enter graphNumber of graph to restore:");
        if(!restID) return;
          // "Backup ID of graph to restore (check console for list)");
        //copy backup into Nodes and Links collections and show:
        Meteor.call("restoreGraph",Number(restID),true,function(err,name){
          if(!name){ alert("Invalid backup number"); return;}
          $('#availGraphs').append($('<option>', {
              value: name,
              text: name,
              selected: 'selected'
          }));
          showGraph(name);
          notify("restored graph "+name);
        })
      })     
    },
    'click #cltBckup': function(e){
      e.preventDefault();
      var note=prompt("Backup note (included in filename):");
      if(!note){notify("backup cancelled"); return}
      Meteor.call("backupGraph",Session.get("currGraph"),note,false,
        function(err, bckObj){
          var date = new Date();
          var file = new File([JSON.stringify(bckObj,null,2)],
            date.getFullYear().toString()+(date.getMonth()+1)+date.getDate()+
            '-'+date.getHours()+';'+date.getMinutes()+';'+date.getSeconds()+
            '-'+bckObj.graph+'-'+bckObj.note,
            {type: "application/json"});//"text/plain;charset=utf-8"});
          saveAs(file);
        });  
    },
    'change #cltRestore': function(event){
      // var tmppath = URL.createObjectURL(event.target.files[0]);
      // console.log(tmppath, event.target.files);
      // $("img").fadeIn("fast").attr('src',tmppath);
      if(graph.gui.editPopup){
        notify("finish editing first");
        return;}
      var r = new FileReader();
      //register callback on file load:
      r.onload = function(e){
        var bckObj = JSON.parse(e.target.result);
        // console.log(bckObj);
        Meteor.call("restoreGraph",bckObj,false,function(err,name){
          if(!name){ alert("Invalid file chosen"); return;}
          $('#availGraphs').append($('<option>', {
              value: name,
              text: name,
              selected: 'selected'
          }));
          showGraph(name);
          notify("restored graph "+name);
        })
      }
      //trigger file load:
      r.readAsText(event.target.files[0]);
    },
    'change #loadMetamath': function(event){
      //trigger file load:
      parseMetamath(event.target.files[0]);
    },
    'click #resetCrds': function(e) {
      e.preventDefault();
      
      // Get current graph name from session
      const currentGraph = Session.get("currGraph");
      
      // Call the server method
      Meteor.call("resetNodeCoords", currentGraph, function(error) {
        if (error) {
          notify("Error resetting coordinates: " + error.reason);
        } else {
          notify("Node coordinates reset");
          graph.redraw(); // Refresh the visualization
        }
      });
    }
  });

  function showGraph(name){
    Session.set("currGraph",name);
    if(graph.gui.contentPopup){
      Blaze.remove(graph.gui.contentPopup);
      graph.gui.contentPopup=null;
    }
    Meteor.call('maxZoomLvl',name,function(err,res){
      Session.set("currZmLvl", res); //Set zoom level
      console.log("Max zoom level here:", res);
      graph.redraw();//subscribe to and show the "currGraph"
    }); 
    $('#pgTitle').text("Graph "+name);
  }

};