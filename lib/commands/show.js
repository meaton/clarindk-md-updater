/** 
 * Show all Session queries for this users
 *
 */
var utils = require('../utils'), Table = require('cli-table');
var show = module.exports = function(app) {
    var handle = app.config.get('escidoc_handle');
    var Query = app.schema.models.Query;
    var Session = app.schema.models.Session;

    var openSession = function(session, callback) {
	app.session = session;
	callback();
    }

    /** Find all Queries for Session handle **/
    var findAllQueries = function() {
	var table = new Table({head: ['Query ID'.green.bold, 'Modified'.green.bold, 'Completed'.green.bold], colWidths: [30, 15, 15]});
	//TODO Sort list by user param ie. updated, completed, new
	var query_stream = Query.find({_session: app.session._id}).stream();
	query_stream.on('data', function(query) {
	    if(query.result_collection.length > 0) 
		table.push([query._id,  utils.tableOutputBoolean(query.update), utils.tableOutputBoolean(query.complete)]);
	});
	query_stream.on('error', function(err) {
	    app.log.error("No Queries found for Session: " + session._id);
	});
	query_stream.on('close', function() {
	    app.log.info('Queries listed\n'.blue.bold + table.toString());
	    process.exit(0);
	});
    }

    // check Session exists for User(escidoc_handle)?
    utils.getSession(app.schema.models.Session, function(res, err) { if(!err) openSession(res, findAllQueries); else throw err; });

}
