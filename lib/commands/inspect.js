/** 
 * Show all Query details, optionally print JSON formatted data for a result MD-Record
 *
 */
var utils = require('../utils'), Table = require('cli-table'), _u = require('underscore');
var util = require('util');
var show = module.exports = function(app, queryId) {
    var handle = app.config.get('escidoc_handle');
    var Query = app.schema.models.Query;
    var Session = app.schema.models.Session;

    var openSession = function(session, callback) {
	app.session = session;
	callback(queryId);
    }

    var findQuery = function(queryId) {
	//TODO Mongoose Query.population match: not working on _id, not a major problem since we are dealing with one Model instance
	if(queryId.length != 24) return app.log.error("Query Id is invalid."); 
    	Query.findById(queryId).populate("result_collection").populate({path:'_session', select:'_id'}).exec(function(err, query) {
	    if(query != null && query._session == app.session._id.toString()) {
		prettyPrintQuery(query);
		//If show-data (true), then prompt for itemID and prettyprint json data on lookup success.
		var showData = (typeof app.argv['show-data'] == 'undefined' || app.argv['show-data']);
		if(showData)
		    promptForItemID(query);
	    } else {
		app.log.error("No Query found for Session: " + app.session._id);
	    }
	});
    }

    var prettyPrintQuery = function(query) {
	var results = query.result_collection;
	app.log.info('Found your Query: ' + query._id);
	app.log.info('Expanding the Query result details...');

	var sQuery =  (query.search_path != null) ? query.search_path : 'none';
	app.log.info('CQL query: '.blue + sQuery);

	var sIds = (query.search_ids != null && query.search_ids.length > 0) ? query.search_ids.join(',') : 'none';
	app.log.info('Search IDs: '.blue + sIds);
	
	//Table layout of results and query details
	var table = new Table({head: ['DK-CLARIN ID'.green.bold, 'Modified'.green.bold, 'Completed'.green.bold], colWidths: [30, 15, 15], style: {compact: true, 'padding-left': 1}});
	for(var i=0; i < results.length; i++) {
	    var record = results[i];
	    if(record != null) 
    		table.push([record.dkclarinID, utils.tableOutputBoolean(record.update), utils.tableOutputBoolean(record.complete)]);
	}

	app.log.info('Result collection\n'.blue.bold + table.toString());
    }

    var promptForItemID = function(query, err) {
	if(err) app.log.error(err.message.red);
	
	var prompt = require('prompt');
	var description = "Enter DKCLARIN-ID";

	if(app.colors.mode == "none") 
	    prompt.colors = false;

	prompt.message = "Print MD-Record data";
   	prompt.delimiter = " >> ";

	if(prompt.colors) {
	    description = description.green;
	    prompt.message = prompt.message.magenta;
	}

 	prompt.start();
  	prompt.get({
   	    properties: {
     		itemID: {
        	description: description
     	    	}
   	    }
    	}, function (err, result) {
    	    if(result) app.log.debug("You entered: ".magenta + result.itemID.green);
	    if(err) app.log.error("Error: " + err);

	    //Check that itemID exists in result_collection
	    var findResult = _u.find(query.result_collection, function(record) {
		return record.dkclarinID == result.itemID;
	    });
 
	    if(findResult) 
		prettyjson(findResult, function() { promptForItemID(query); });
	    else 
		promptForItemID(query, new Error("Could not find result with ID: " + result.itemID));
		
    	});
    }

    // Pretty print JSON formatted data
    var prettyjson = function(result, callback) {
	var prettyj = require('prettyjson');
	var data = JSON.parse(result.data);
	
	app.log.info('Printing ' + result.type.name.green.bold + ' MD-record data:');
	app.log.info(prettyj.render(data));

	// show prompt again
	process.nextTick(callback);
    }

    // check Session exists for User(escidoc_handle)?
    utils.getSession(app.schema.models.Session, function(err,res) {
        if(!err)
   	    if(res != null) openSession(res, findQuery);
 	    else app.log.error("No valid Session exists for set handle: " + handle);
    	else
	    app.log.error("Error opening Session:", err);
    });

}
