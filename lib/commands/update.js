var utils = require('../utils'), util = require('util'), _u = require('underscore');

var update = module.exports = function(app, queryId, change_json_file) {

    var accepted_change_types = { override: "override", addition: "addition" };
    var Query, Rules, current_rule;
    
    /** Open and use existing Session for MD-Record(s) submission */
    var openSession = function(session, callback) {
	app.session = session;
    	//TODO: Add new user if non-existing for session
	app.log.info("Using existing Session-" + app.session._id);

	return callback(queryId); 
    }

    var getQuery = function(queryId) {
	app.schema.models.Query.findById(queryId).populate('_session', null, {_id: {$in: [app.session._id]}}).populate("result_collection").exec(function(err, query) {
	    if(err) console.error(err);
	    if(query != null) {
	        Query = query;
		app.log.info("Found query: " + Query._id);
	        app.log.info("Applying change-rule(s)...");
	        utils.loadJSONFile(change_json_file, function(rules) {
		    if(util.isArray(rules))
	    		app.log.debug('One or more rules to apply.');
		    else 
	    		return app.log.error('Illegal change-rule syntax: Should be Array.');

		    Rules = rules; // set global
		    nextRule(); //exec first rule
		});
	    }
	});
    }

    var nextRule = function() {
	var current_index = (current_rule != null) ? _u.indexOf(Rules, current_rule) : 0;
	if(current_rule != null) current_index++;
	if(current_index < Rules.length) { 
	    app.log.info("Executing rule (" + current_index + ")..."); 
	    applyChangeRules(Rules[current_index]); }
	else
	    utils.updateQuery(Query);
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
	//TODO: Define all accepted change_types
	switch(rule.change_type) {
	    case accepted_change_types.override: applyChangeOverride(mdrecord, rule); break;
	    case accepted_change_types.addition: applyChangeAddition(mdrecord, rule); break;
	    default: app.log.info("Illegel change-rule syntax: Change type " + change_type + " unsupported." )
	}
    }

    var applyChangeAddition = function(mdrecord, rule) {
	app.log.info("Applying addition rule...");
	
	var d = JSON.parse(mdrecord.data); // parse JSON record

	// Add new field to MD-record
	findFieldPosition(d, rule.field_position, null, true, function(data, existingNode) {
	     var newNode;
	     app.log.debug('call callback addition:' + util.inspect(existingNode));
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
	findFieldPosition(d, rule.field_position, rule.selector, false, function(data) {
	    var field, val, cond_pair = (rule.conditions != null) ? _u.pairs(rule.conditions) : null; 
	    
	    //Parse over one or more-conditions
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
	    //app.log.debug(util.inspect(d));
	    //if(mdrecord.type.name == "olac") 
	    //	app.log.debug("OLAC Contributors:" + util.inspect(d['olac:olac']['dc:contributor']));
	    utils.updateMDRecord(d, mdrecord);
	});
    }

    // Use config rule (target, selector) to fine node or attribute for edit
    var findFieldPosition = function(data, target, selector, createNewFields, callback) {
	app.log.debug("findFieldPos target: " + util.inspect(target));
	app.log.debug("data target:" + util.inspect(data[target]));
	if(!_u.isObject(target))
	    if(util.isArray(data[target]))
		if(createNewFields)
		    data[target].push(callback(new Object()));
		else 
		    for(var i=0; i<data[target].length; i++) 
			findFieldPosition(data[target][i], null, selector, createNewFields, callback);
	    else if(data[target] != undefined) 
		if(createNewFields) 
		    data[target] = callback(new Object(), data[target]);
		else 
		    findFieldPosition(data[target], null, selector, createNewFields, callback);
	    else if(data[selector] != undefined) 
		data[selector] = callback(data);
	    else if(createNewFields & data[target] == undefined) // No existing field with name exists
		data[target] = callback(new Object());
	    else 
		app.log.error("Invalid change-rule syntax: Invalid selector: " + target);
	else 
	    _u.each(target, function(val, key, list) {
		app.log.debug("findFieldPos data[" + key + "]: " + data[key]);
		if(data[key] != undefined)
		    findFieldPosition(data[key], val, selector, createNewFields, callback);
		else if(data[selector] != undefined)
		    data[selector] = callback(data);
		else if(createNewFields)
		    data[target] = callback(new Object());
		else
		    app.log.error("Unmatched change-rule config.");
	    });
    }

    // check Session exists for User(escidoc_handle)?
    utils.getSession(app.schema.models.Session, function(err,res) {
        if(!err)
   	    if(res != null) openSession(res, getQuery);
 	    else app.log.error("No valid Session exists"); //TODO: Confirm with user: Update eSciDoc handle for Query's existing Session
    	else
	    app.log.error("Error opening Session:", err);
    });

};
