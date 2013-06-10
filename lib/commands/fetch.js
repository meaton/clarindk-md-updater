var http = require('http'), parser = require('xml2json'), DOMParser = require('xmldom').DOMParser, XMLSerializer = require('xmldom').XMLSerializer, error = console.error, utils = require('../utils');

var fetch = module.exports = function(app, query_param, mdname_param) {
	var useCQL = (typeof app.argv.cql == 'undefined' || app.argv.cql);
	var record_limit = 10, 
	    record_start = 1,
	    targetUrl = app.config.get("targetUrl"),
	    handle = app.config.get("escidoc_handle"),
	    search_cql = (useCQL) ? query_param : null,
	    itemID_list = (!useCQL) ? query_param.split(";") : null, // delimiter default semi-colon
	    metadata_name = mdname_param;

	/** Start and save a new Session */
	var startSession = function() {
	    app.session = app.schema.CreateSession();
	    app.session.users.push({ handle: handle, fullname: app.config.get("fullname"), email: app.config.get("email") });
	    
	    app.log.info("Creating new Session-" + app.session._id);   
	    utils.saveDocument(app.session, newQuery);
	}

	/** Open and use existing Session */
	var openSession = function(session, err) {
		if(session == null) return startSession(); 
		app.session = session;
		app.log.info("Using existing Session-" + app.session._id);
		newQuery(app.session);
	}

	/** Create a new Query for the given session */
	var newQuery = function(session) {
	    var query = app.schema.CreateQuery({ _session: session._id, search_path: search_cql });
	    utils.saveDocument(query, retrieveAllMDRecords);
	}
	
	var retrieveAllMDRecords = function(query) {
	    // 2 options:
	    // - retrieve results with eSciDoc SRW
	    // - retrieve results from ID array
	    //
	    app.query = query;
	    if(useCQL) 
	        return retrieveSRWResult(utils.srw_options(search_cql, {start: record_start, limit: record_limit}), query)
	    else {
	        for(var i=0; i<itemID_list.length; i++) {
	      	    //TODO: Check that config is sane
		    var itemID = itemID_list[i];  //fk. itemID = 'dkclarin:243211';
		    query.search_ids.push(itemID);
		    var params = {id: itemID, name: metadata_name, handle: handle, target: targetUrl};

		    retrieveMDRecord(utils.rest_options(params), params, query, (i==itemID_list.length-1));
		}	
	    }
	}

	var checkRetrievalResults = function() {
	    if(app.query.result_collection.length <= 0)
		utils.removeDocument(app.query, function() { throw new Error('No records founds.') });
	    else utils.exit(0);
	}

	/** Retrieve a MD-Record using eSciDoc MD-Updater middleware */
	var retrieveMDRecord = function(options, params, query, last) {
	    http.get(options, function(res) {
		var str = "";
		res.on('data', function(chunk) {
		    str += chunk;
		});
		res.on('end', function () {
		    if(res.statusCode == 200)
		       utils.saveMDRecord(str, params, query, function() { if(last) checkRetrievalResults(); });
		    else
			app.log.error("Error retrieving MD-record reason:", str);
		    
		});
	    }).on('error', function(e) {
		app.log.error("Error: " + e.message);
		process.nextTick(checkRetrievalResults);
	    });
	
	    return true;
	}
	
	/** SRW Query fetch */
	var retrieveSRWResult = function(options, query) {
	    http.get(options, function(res) {
		var str = "";        
		res.on('data', function(chunk) {
		    str += chunk;
		});
		res.on('end', function() {
		    if(res.statusCode == "200")
			parseSRWQuery(str, query);
		    else
			utils.removeDocument(query, function() { throw new Error("Invalid SRU/W query: " + str); });
		});
	    }).on('error', function(e) {
		utils.removeDocument(query, function() { throw e; } );
	    });

	    return true;
	}

	/** Parse return result from SRW CQL query */
	var parseSRWQuery = function(data, query) {
	    var doc = new DOMParser().parseFromString(data, 'text/xml');
	    var count = doc.documentElement.getElementsByTagNameNS("http://www.loc.gov/zing/srw/", "numberOfRecords");    
	    var mdRecords_res = doc.documentElement.getElementsByTagNameNS("http://www.escidoc.de/schemas/metadatarecords/0.5", "md-record");
	    var metadataName = metadata_name;
	    
	    for(var i=0; i < mdRecords_res.length; i++) {
		var nnode = mdRecords_res.item(i);
		var name = nnode.getAttribute('name');
		
	    	if(name == metadataName) {
		    // Note: Problem with childNodes array,
		    //  	 relying on getElementsByTagName/NS methods to obtain md-record child
		    var nsObj = utils.getNamedNS(metadataName);

		    var mdrecord_data = (nsObj.ns!=null) ? nnode.getElementsByTagNameNS(nsObj.ns, nsObj.nodeName).item(0) : nnode.getElementsByTagName(nsObj.nodeName).item(0);

		    var node_attr_href = nnode.getAttributeNS("http://www.w3.org/1999/xlink", "href"), itemID = /(dkclarin\:)?([0-9]+)/.exec(node_attr_href)[0];

   	            if(mdrecord_data != null) // Save MdRecord if data exists
		    	utils.saveMDRecord(new XMLSerializer().serializeToString(mdrecord_data), { id: itemID, name: metadataName }, query);
		}
	    }

	    // iterate over complete SRW result set
	    if(Number(count[0].textContent) >= (record_limit+record_start)) { 
		record_start += record_limit;
		retrieveSRWResult(utils.srw_options(search_cql, {start: record_start, limit: record_limit}, true), query); 
	    } else if(count[0].textContent <= 0) {
		utils.removeDocument(query, function() { app.log.warn("Your CQL query returned nil results."); process.exit(0); });
	    } else {
		utils.exit(0);
	    }
	}

	// check Session exists for User(escidoc_handle)?
	utils.getSession(app.schema.models.Session, openSession);
}
    
