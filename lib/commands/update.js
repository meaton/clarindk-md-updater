var utils = require('../utils'), util = require('util'), _u = require('underscore');

var update = module.exports = function(app, queryId, change_json_file) {

    var accepted_change_types = { override: "override" };
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
	//TODO: Define accepted change_types
	switch(rule.change_type) {
	    case accepted_change_types.override: applyChangeOverride(mdrecord, rule); break;
	    default: app.log.info("Illegel change-rule syntax: Change type " + change_type + " unsupported." )
	}
    }

    var applyChangeOverride = function(mdrecord, rule) {
	//TODO: Handle attributes with field selector ie contributor olac-role
	app.log.info("Applying override rule...");
	var d = JSON.parse(mdrecord.data); // parse JSON record

	// find node to edit, check against conditions if they exist in config rules
	findFieldPosition(d, rule.field_position, rule.selector, function(data) {
	    var field, val, cond_pair = (rule.condition != null) ? _u.pairs(rule.condition) : null; 
	    
	    //Expect only single-condition TODO: Enable multi-conditions
	    if(cond_pair != null && util.isArray(cond_pair)) 
		field = cond_pair[0][0], val = cond_pair[0][1];
	    if(field != undefined && val != undefined)
	    	if(data[field] != val) return data[rule.selector]; //unchanged value if condition doesn't match
	    
	    return rule.set_value; // set new value if passes any conditions, if they exist
	});

	process.nextTick(function() { 
	    //app.log.debug(util.inspect(d));
	    //if(mdrecord.type.name == "olac") 
	    //	app.log.debug("OLAC Contributors:" + util.inspect(d['olac:olac']['dc:contributor']));
	    utils.updateMDRecord(d, mdrecord);
	});
    }

    // Use config rule (target, selector) to fine node or attribute for edit
    var findFieldPosition = function(data, target, selector, callback) {
	//app.log.debug("findFieldPos target: " + util.inspect(target));
	//app.log.debug("data target:" + util.inspect(data[target]));
	if(!_u.isObject(target))
	    if(util.isArray(data[target]))
		for(var i=0; i<data[target].length; i++) findFieldPosition(data[target][i], null, selector, callback);
	    else if(data[target] != null) findFieldPosition(data[target], null, selector, callback);
	    else if(data[selector] != null) data[selector] = callback(data);
	    else app.log.error("Invalid change-rule syntax: Invalid selector: " + target);
	else 
	    _u.each(target, function(val, key, list) {
		//app.log.debug("findFieldPos data[" + key + "]: " + data[key]);
		if(data[key] != null)
		    findFieldPosition(data[key], val, selector, callback);
		else if(data[selector] != null) {
		    data[selector] = callback();
		}
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
