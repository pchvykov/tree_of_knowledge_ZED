parseMetamath = function(file){
	var reader = new FileReader();
	reader.onload = function(e){ //when text file is read in
		var mmString = reader.result; //the text
		console.log("file length: " + mmString.length);

		var stmtFlag, //flag for in body=1 or proof=2, else =0
			proof='', //temporary proof string
			node={}, //object for thm/axiom/hypothesis node
			thmList=[[]], //parsed list of theorems
			lastToken='', //previous token ( word )
			lastComment='', //previous comment
			mmCode='', //Stores user tokens only (no comments or mm tokens)
			comment=false, //in comment flag
			mmToken=false, //MetaMath command tag
			blkDepth=0; //Command block depth
		for (var i=0; i<mmString.length/5; i++){ //traverse the file char by char
			var char=mmString.charAt(i);
			if(mmToken && (!comment || char==')')){ //MetaMath commands
				switch(char){
					case '(': comment=true; lastComment=''; break;
					case ')': comment=false; break; //store comments
					//store nodes for each level blocks in their own entry 
					//of the thmList until the block ends, at which point we push the 
					//resulting array to the previous entry - at the end only thmList[0] 
					//matters, and is made up of nodes and block sub-arrays
					//This is basically doing recursion manually, with thmList as RAM
					case '{': blkDepth++; 
						thmList[blkDepth] = [];
						break;
					case '}': blkDepth--; lastComment='';
						thmList[blkDepth].push(thmList[blkDepth+1]);
						break;
					//mm main statements saved as objects
					case 'p':
					case 'e':
					case 'f':	
					case 'a': 
						node={};
						node.tok=char;
						node.label=lastToken;
						node.comment=lastComment; lastComment='';
						node.body=''; stmtFlag=1;
						break;
					case '=': //store proof
						proof='';
						stmtFlag=2;
						break;
					case '.': //end statement and store node
						if(stmtFlag==2) { //parse proof string
							proof = proof.split(" ")
								.filter(function(el) {return el.length != 0});
							node.proof=proof.slice(proof.indexOf('(')+1,proof.indexOf(')'));

							var same=thmList[blkDepth].find(nd => 
								nd.body==node.body && nd.tok=='p');
							if(same) node.sameAs=same.label; //label if alternate proof
						}
						if(stmtFlag){ //add node object to array
							thmList[blkDepth].push(node);
						}
						stmtFlag=0;
						break;
				}
			}
			if(!mmToken && char!='$' && char!='\n'){ //skip all control characters
				if(comment) lastComment+=char;
				else {
					mmCode+=char; // list of user tokens only - easy to search
					if(char!=' ') {
						if(mmString.charAt(i-1)==' ') lastToken='';
						lastToken+=char;
					}
				}
				if(stmtFlag==1) node.body+=char;
				if(stmtFlag==2) proof+=char;
			}
			mmToken=false;
			if(mmString.charAt(i)=='$') mmToken=true; //mm command to follow
		}
		// var fileS = new File([mmCode],
		//   'MetaMath_code',
		//   {type: "text/plain;charset=utf-8"});
		// saveAs(fileS);
		Meteor.call("loadMetamath",thmList[0],mmCode);
		$('#availGraphs').append($('<option>', { 
          value: 'MetaMath',
          text : 'MetaMath' 
      	}));
	}
	reader.readAsText(file); //read in the text file
}


isArray = function(a) {
    return (!!a) && (a.constructor === Array);
};
isObject = function(a) {
    return (!!a) && (a.constructor === Object);
};
 
if (Meteor.isServer){ //else runs in parallel on both
Meteor.methods({ //load tree into DB directly on server
loadMetamath : function(thmList, mmCode){
	var ndCount=1;
	console.log("Loading metamath: " + thmList.length + "theorems");
	// var fileS = new File([JSON.stringify(thmList,null,1)],
	//   'parsed_MetaMath',
	//   {type: "application/json"});//"text/plain;charset=utf-8"});
	// saveAs(fileS);
	// console.log(thmList);
	var nodeDic = {}; //Dictionary giving node IDs for every statement label
	//recursively add nodes:
	function readBlock(block, essHyp, stack){ //pass string of essential hypotheses from above
		var essLocal=essHyp;
		for(var ii in block){ //loop over entries of block
			console.log("Loading "+ii+" of "+block.length+" at level "+stack)
			var stmt=block[ii];
			if(isObject(stmt)){ //if it's really a statment (e or p)
				switch(stmt.tok){
					case 'e': 
						essLocal+=(stmt.body+'\\\\'+stmt.comment+'\n');
						continue;
					case 'p':
					case 'a': 
					case 'f':
						var nd={};
						nd.title=stmt.label; //unique - used to identify nodes later 
						nd.number=ndCount;
						nd.text=essLocal+'=>\n'+stmt.body+'\n\%\%'+ndCount+'\%\%\n\\\\'+stmt.comment;
						nd.x=2345;//code for unpositioned node //2500+100*Math.random(); 
						nd.y=2345;//2500+100*Math.random(); //starting node location
						nd.graph='MetaMath';
						nd.importance=1.23456; //dummy importance value
						nd.children =[]; //node children's IDs
						nd.level=1; //axioms start at level 1
						//4*Math.log((mmCode.match(new RegExp(
							// ' '+stmt.label+' ', 'g')).length +1)); //importance proportional to number of references
						var ndID=Nodes.insert(nd);
						ndCount++;
						nodeDic[stmt.label]=ndID;
						
				    	if(stmt.tok=='p'){ //add links to dependencies
				    		var lvl=0;
				    		for(var ix in stmt.proof){
				    			var lk={};
				    			lk.type = 'theorem';
				    			lk.strength=1.23456;//(nd.importance+nodeDic[stmt.proof[ix]].imp)/10;
				    			lk.source = nodeDic[stmt.proof[ix]];
				    			lk.target = ndID;
				    			lk.oriented = true;
				    			lk.level=Nodes.findOne(lk.source).level;
				    			lk.graph = "MetaMath";
				    			Links.insert(lk);
				    			// Nodes.update(lk.source,	{$push:{children:ndID}});
				    			//node level is 1 higher than highest parent level
				    			lvl=Math.max(lvl, lk.level+1);
				    			if(isNaN(lvl) || !lk.source){ console.error("Bad link:", lk, stmt.proof[ix],nodeDic);
				    			 return}
				    		}

				    		Nodes.update(ndID,{$set:{level:lvl}})
				    		Nodes.update({title:{$in:stmt.proof}},
				    			{$push:{children:ndID, chLevel:lvl}},{multi:true});
				    	}
						
			    };
			}
			else if(isArray(stmt)){ //else if array, then read recursively
				readBlock(stmt,essLocal,stack+1);
			}
			else alert("problem with parsed MetaMath");
		}

		return;
	}

	//=================================================================
	readBlock(thmList.slice(0,1000),'',0); //Take first ... nodes
	//=================================================================

	Meteor.call("weighGraph", 'MetaMath')
	
}
})}
