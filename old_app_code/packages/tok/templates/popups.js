// Template.nodeOptions.helpers({
//   select: function(){
//     $("#type").val("example");
//   }
// });
///// Markdown library //////
const showdown  = require('showdown');
const converter = new showdown.Converter();
// Workaround so Markdown doesn't process math symbols:
function protectMath(text) {
  // Replace all $...$ and $$...$$ with unique placeholders
  // and store the math segments in an array.
  let mathSegments = [];
  let unique = "MATHJAXPRAAATECT"; //shoud never appear in the actual content
  let counter = 0;
  // Protect display math first
  text = text.replace(/\$\$([\s\S]+?)\$\$/g, function(match, m1) {
    mathSegments.push("$$" + m1 + "$$");
    return unique + (counter++) + unique;
  });
  // Then inline math
  text = text.replace(/\$([^\$]+?)\$/g, function(match, m1) {
    mathSegments.push("$" + m1 + "$");
    return unique + (counter++) + unique;
  });
  return {text, mathSegments, unique};
}
function restoreMath(html, mathSegments, unique) {
  let counter = 0;
  while (html.indexOf(unique) >= 0 && counter < mathSegments.length) {
    html = html.replace(unique + counter + unique, mathSegments[counter]);
    counter++;
  }
  return html;
}

Template.nodeContent.helpers({
  formattedText() {
    const rawText = this.text || "";
    const {text, mathSegments, unique} = protectMath(rawText);
    let html = converter.makeHtml(text);
    html = restoreMath(html, mathSegments, unique);
    return html;
  }
});
// Template.nodeContent.helpers({
//   formattedText() {
//     // makeHtml is the showdown method, this.text is the node's content
//     return converter.makeHtml(this.text || "");
//   }
// });
// Template.nodeContent.onRendered(function() {
//   if(typeof MathJax !== "undefined") {
//     MathJax.Hub.Queue(["Typeset", MathJax.Hub, this.find(".nodeText")]);
//   }
// });

//update the database for dat.node according to current 
//form field values; redraw tree and redesplay content
var updateDB = function(dat){
  // console.log("in helper", dat.node);
  //if adding a node:
  if(dat.node){
    var obj = {};//dat.node;
    obj.title = $('#title').val();
    obj.type = $('#type').val();
    obj.importance = $('#importance').val();
    obj.text = $('#content').val();
    obj.x=dat.node.x; obj.y=dat.node.y;
    obj._id=dat.node._id;
    obj.graph=Session.get('currGraph');
    // console.log("sourceID", this.sourceID);
    //if adding a new linked node:
    if (dat.sourceID){
      //create defaults for link type:
      var lkType = function(ndType){
          switch(ndType){
              case "assumption": return "related";
              case "definition": return "related";
              case "statement": return "theorem";
              case "example": return "specialCase";
              case "empirical": return "connection";
              case "derivation": return "theorem";
          }
        };
      var link = {
        type: lkType(obj.type),
        strength: obj.importance/2,
        graph: Session.get('currGraph'),
        oriented: true //(obj.type=='derivation' || obj.type=='example')
      };
    };
    dat.node=obj;
    //update the database entry:
    Meteor.call("updateNode",
      obj, dat.sourceID, link,
      function(err,res){
        if(err) alert(err);
        if(res){ dat.node._id=res[0];}
        dat.gui.showContent(dat.node);
      });
  }
  //if adding a link:
  else if(dat.link){
    var obj = {};//dat.link;
    obj.type = $('#type').val();
    obj.strength = $('#importance').val();
    obj.text = $('#content').val();
    obj.oriented = $('#oriented').is(":checked");
    obj._id=dat.link._id;
    obj.graph=Session.get('currGraph');
    if($('#flip').is(":checked")){
      obj.source=dat.link.target;
      obj.target=dat.link.source;
      dat.link.source=obj.source;
      dat.link.target=obj.target;
      $('#flip').prop("checked",false);
    }
    else{
      obj.source=dat.link.source;
      obj.target=dat.link.target;
    }

    //check for new circular references:
    if(obj.oriented){
      var nodeData = dat.gui.tree.force.nodes();
      var src = nodeData.find(function(nd){return nd._id == obj.source});
      var trg = nodeData.find(function(nd){return nd._id == obj.target});
      if(trg){
      var checkChildren = function(nd){
        return nd.childrenIx.reduce(
          function(prev,ix){
            if(prev) return true;
            else if(nd===trg && src===nodeData[ix]) return false;
            else return (src===nodeData[ix]) ||
            (checkChildren(nodeData[ix]))
          }, false)
      }
      if(checkChildren(trg)){
        notify("circular reference detected!");
        // return "fail"; //disallow circular references
      }
      }
    }
    dat.link=obj;
    //update the database entry:
    Meteor.call("updateLink", obj,
      function(err,res){
        if(err) alert(err);
        if(res){ dat.link._id=res;}
        dat.gui.showContent(dat.link)
      });
  }
  else console.error("failed to update DB: no data given");
  dat.gui.tree.redraw();
  // dat.gui.tree.updateSelection();
  dat.gui.drag_line.attr("class", "drag_line_hidden");
}

var editorEvents = {
  'click #save': function(e) {
    e.preventDefault();
    // console.log(this);
    // node = Session.get('newNode');
    if(updateDB(this)=="fail") return;
    // Modal.hide('nodeOptions');
    Blaze.remove(this.gui.editPopup);
    this.gui.editPopup=null;
    this.gui.drag_line.attr("class", "drag_line_hidden");
    // this.gui.tree.updateSelection();
  },
  'click #cancel':function(e){
    Blaze.remove(this.gui.editPopup);
    this.gui.editPopup=null;
    this.gui.drag_line.attr("class", "drag_line_hidden");
    this.gui.tree.updateSelection();
  }
};

//initialize all boxes with node/link data:
var rendered = function(){
  var dat= this.data;
  if(dat.node) {
    $.each(nodeTypes, function(key, value) {   
         $('#type')
             .append($("<option></option>")
                        .attr("value",key)
                        .text(value)); 
    });
    if(dat.node.type){ $("#type").val(dat.node.type) }
    else{ //defaults
      $('#type').val('statement');
      $('#importance').val(1);
    }
    $('#title').focus();
  };
  if(dat.link){
    $.each(linkTypes, function(key, value) {   
         $('#type')
             .append($("<option></option>")
                        .attr("value",key)
                        .text(value)); 
    });
    if(dat.link.type){
      $("#type").val(dat.link.type);
      $("#oriented").prop("checked",dat.link.oriented);
    }
    else{ //defaults
      $('#type').val('theorem');
      $('#importance').val(0.5);
      $('#oriented').prop("checked",true);
    }
    $('#save').focus();
  }
  // if(node.importance) $("#importance").val(node.importance);
  // $("#content").val(node.text);
  //Shift+Enter updates the DB and content popup:
  $('#content').keydown(function (event) {
    if (event.keyCode == 13 && event.shiftKey) {
      event.preventDefault();
      // console.log("event", event);
      // var cont_scroll = $('#contentPopup #popupBody').scrollTop();
      //match content scroll fraction to edit scroll:
      var containeR = document.getElementById('editPopup');
      var cont_scroll = containeR.scrollTop / (containeR.scrollHeight - containeR.clientHeight);
      updateDB(dat);
      if(document.getElementById('nodeBody')){
        $('#contentPopup #nodeBody')
          .scrollTop(cont_scroll*document.getElementById('nodeBody').scrollHeight);
      }
      else if(document.getElementById('linkBody')){
        $('#contentPopup #linkBody')
          .scrollTop(cont_scroll*document.getElementById('linkBody').scrollHeight);
      }
    }
  });
  //Click save on "enter"
  $("#title").keyup(function(event) {
    if (event.keyCode === 13) {
        $("#save").click();
    }
  });
};

Template.nodeOptions.onRendered(rendered);
Template.nodeOptions.events(editorEvents);
Template.linkOptions.onRendered(rendered);
Template.linkOptions.events(editorEvents);


var contentEvents={
  "click #close": function(e){
    this.hideContent();
    this.selected=null;
    this.tree.updateSelection();
  },
  "click #contentPopup": function(e) { // avoid propagating to background to close it
    e.stopPropagation();
  }
};
Template.nodeContent.events(contentEvents)
Template.linkContent.events(contentEvents)


