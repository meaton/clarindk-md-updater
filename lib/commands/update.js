var utils = require('../utils'), util = utils.util, _u = require('underscore');

var update = module.exports = function(app, queryId, change_json_file) {

    var accepted_change_types = { override: "override", addition: "addition" };
    var Query, Rules, current_rule;
    
    /** Open and use existing Session for MD-Record(s) submission */
    var openSession = function(session, callback) {
	app.session = session;
	app.log.info("Using existing Session-" + app.session._id);

	return callback(queryId); 
    }

    var getQuery = function(queryId) {
	if(queryId.length != 24) throw new Error("Query Id is invalid."); 
	app.schema.models.Query.findById(queryId).populate({path:'_session', select:'_id'}).populate("result_collection").exec(function(err, query) {
	    if(err) throw err;
	    if(query != null && query._session == app.session._id.toString()) {
	        Query = query;
		app.log.info("Found query: " + Query._id);
	        app.log.info("Applying change-rule(s)...");
	        utils.loadJSONFile(change_json_file, function(rules) {
		    if(util.isArray(rules))
	    		app.log.debug('One or more rules to apply.');
		    else 
	    		throw new Error('Illegal change-rule syntax: Should be Array.');

		    Rules = rules; // set global
		    nextRule(); //exec first rule
		});
	    } else {
		throw new Error("No Query found for Session: " + app.session._id);
	    }
	});
    }

    var nextRule = function() {
	var current_index = (current_rule != null) ? _u.indexOf(Rules, current_rule) : 0;
	if(current_rule != null) current_index++;
	if(current_index < Rules.length) { 
	    app.log.info("Executing rule (" + current_index + ")..."); 
	    applyChangeRules(Rules[current_index]); }
	else {
	    utils.updateQuery(Query, function() { process.nextTick(function() { process.exit(0); }); });
	}
    }    

    var applyChangeRules = function(rule) {
	    current_rule = rule;
	    //For each rule apply to query.result_collection
 	    var results = Query.result_collection;
	    for(var i=0; i<results.length; i++) {
	        var mdrecord = results[i];
	        if(mdrecord != null) {
		    applyChangeRule(mdrecord, rule);
	        }
   	    }

	    process.nextTick(nextRule);
    }

    var applyChangeRule = function(mdrecord, rule) {
	switch(rule.change_type) {
	    case accepted_change_types.override: applyChangeOverride(mdrecord, rule); break;
	    case accepted_change_types.addition: applyChangeAddition(mdrecord, rule); break;
	    //TODO define deletion rule
	    default: app.log.warn("Illegel change-rule syntax: Change type " + change_type + " unsupported." )
	}
    }

    var applyChangeAddition = function(mdrecord, rule) {
	app.log.info("Applying addition rule...");
	
	var d = JSON.parse(mdrecord.data); // parse JSON record

	// Add new field to MD-record
	findFieldPosition(d, rule.field_position, null, true, false, function(data, existingNode) {
	     var newNode;
	     //app.log.debug('call callback addition:' + util.inspect(existingNode));
	     if(existingNode != null) {
		newNode = new Array(2);
		newNode[0] = existingNode;
		newNode[1] = _u.extend(data, rule.properties);
	     } else
		newNode = _u.extend(data, rule.properties);

	     return newNode;
	});

	process.nextTick(function() {
	   utils.updateMDRecord(d, mdrecord);
	});
    }

    var applyChangeOverride = function(mdrecord, rule) {
	app.log.info("Applying override rule...");
	
	var d = JSON.parse(mdrecord.data); // parse JSON record

	// find node to edit, check against conditions if they exist in config rules
	var newAttr = (rule.add_attr != undefined) ? rule.add_attr : false;
	findFieldPosition(d, rule.field_position, rule.selector, false, newAttr, function(data) {
	    var field, val, cond_pair = (rule.conditions != null) ? _u.pairs(rule.conditions) : null; 
	    
	    //Parse over one or more-conditions
	    //Note: Better validation if conditions value exists
	    if(cond_pair != null && util.isArray(cond_pair)) {
		for(var i=0; i<cond_pair.length; i++) {
		    field = cond_pair[i][0], val = cond_pair[i][1];
	   	    if(field != undefined && val != undefined)
	    		if(data[field] != val) return data[rule.selector]; //unchanged value if condition doesn't match
	   	}
	    }

	    return rule.set_value; // set new value if passes all conditions, if the field exists in change config file
	});

	process.nextTick(function() { 
	    utils.updateMDRecord(d, mdrecord);
	});
    }

    // Use config rule (target, selector) to fine node or attribute for edit
    var findFieldPosition = function(data, target, selector, createNewFields, createNewAttr, callback) {
	if(!_u.isObject(target))
	    if(util.isArray(data[target]))
		if(createNewFields)
		    data[target].push(callback(new Object()));
		else 
		    for(var i=0; i<data[target].length; i++) 
			findFieldPosition(data[target][i], null, selector, createNewFields, createNewAttr, callback);
	    else if(data[target] != undefined) 
		if(createNewFields) 
		    data[target] = callback(new Object(), data[target]);
		else 
		    findFieldPosition(data[target], null, selector, createNewFields, createNewAttr, callback);
	    else if(data[selector] != undefined) 
		data[selector] = callback(data);
	    else if(createNewFields && data[target] == undefined) // No existing field with name exists
		data[target] = callback(new Object());
	    else if(createNewAttr && data[selector] == undefined)
		data[selector] = callback(data);
	    else 
		app.log.error("Invalid change-rule syntax: Invalid selector: " + target);
	else 
	    _u.each(target, function(val, key, list) {
		if(data[key] != undefined)
		    findFieldPosition(data[key], val, selector, createNewFields, createNewAttr, callback);
		else if(data[selector] != undefined)
		    data[selector] = callback(data);
		else if(createNewFields)
		    data[target] = callback(new Object());
		else if(createNewAttr)
		    data[selector] = callback(data);
		else
		    app.log.error("Unmatched change-rule config.");
	    });
    }

    // check Session exists for User(escidoc_handle)?
    utils.getSession(app.schema.models.Session, function(res, err) { if(!err) openSession(res, getQuery); else throw err; });

};
