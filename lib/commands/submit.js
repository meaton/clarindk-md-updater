/** 
 * Upload, submit and release the Md-Record updates for this Query.
 *
 */
var util = require('util'), http = require('http'), parser = require('xml2json'), utils = require('../utils');

var submit = module.exports = function(app, queryId, comment) {
    
    var Session = app.schema.models.Session, 
        Query = app.schema.models.Query; 
        MDRecord = app.schema.models.MDRecord;

    //config	
    var targetUrl = app.config.get('targetUrl'),
	userHandle = app.config.get('escidoc_handle');
 
    // eSciDoc Item Service and Task event handling
    var EventEmitter = require('events').EventEmitter;
    
    var Submission = function(comment) {
	this.submitComment = comment;
    }

    util.inherits(Submission, EventEmitter);
    var submission = new Submission(comment);
    
    submission.on('update', function(record, data) {
    	app.log.info("Received update event following MDRecord update.");
    	//TODO Comment: 
    	// 	Should data in future contains lastModificationDate of Item version.
    	// 	We wont need the following version-history step.
    	
	//Obtain lastModificationDate from eSciDoc Item Service handler: retrieveVersionHistory
    	utils.execItemREST(record, "resources/version-history", this, "submit");
    });

    submission.on('submit', function(record, lastModificationDate) {
    	app.log.info("Received submit event following MDRecord update.");
     	utils.execItemREST(record, "submit", this, "release", lastModificationDate, userHandle);
    });

    submission.on('release', function(record, lastModificationDate) {
        app.log.info("Received release event following MDRecord update.");
	utils.execItemREST(record, "release", this, "public", lastModificationDate, userHandle);
    });

    submission.on('public', function(record, lastModificationDate) { 
	// If lastModificationDate is null, we know that we received a 450 error, and no new version was made.
	// TODO Should we note this for the query? Reset Query flags for Item.
	if(lastModificationDate != null) app.log.info("Item " + record.dkclarinID + " is now released.");
        record.set('complete', true); // Mark item as completed in query submission
        record.save(function(err) { if(err) app.log.error('Saving completed flag unsuccessful: ' + err); });
	
	// Flag Query as completed if all Items are completed (uploaded)
	Query.findById(queryId).populate('_session', null, {_id: {$in: [app.session._id]}})
	     .populate("result_collection", null, {'status.completed':false})
	     .exec(function(err, query) { 
		if(query.result_collection.length <= 0 && query._session != null) { 
		    query.set('complete', true); 
		    utils.saveDocument(query, function(err) { 
			app.log.debug('Query +' + query._id + ' marked as completed.');
		    }); 
		} else 
		    app.log.debug('Not all records have finished being submitted.'); 
	});
    });
    
    /** Open and use existing Session for MD-Record(s) submission */
    var openSession = function(session, callback) {
	app.session = session;

    	//TODO: Add new user if non-existing for session
    	//If non-matching handle, add new user to Session

	app.log.info("Using existing Session-" + app.session._id);

	return callback(queryId); 
    }

    /** Update MDRecord to eSciDoc repository via REST service
      * Send Events to submit/release new Item version.
      */
    var updateMDRecord = function(data, record) {
	if(!record.complete) {
	    var params =  {id: record.dkclarinID, name: record.type.name, handle: userHandle, target: targetUrl};
	    utils.updateMDRecordREST(data, params, function(res, res_data) {
	    	if(res.statusCode == 200) submission.emit('update', record, res_data);
		else app.log.error('Failed.');
	    });
	} else {
	    app.log.warn("MD-Record already marked as completed: " + record._id);
	}
    };

    // Read from local MongoDB
    var readDatastore = function(queryId) {
	app.log.debug("Searching for Query: " + queryId);
	if(queryId.length != 24) return app.log.error("Query Id is invalid."); 
	if(app.session != null) {
	    Query.findById(queryId)
		 .populate({path:'_session', select:'_id'})
		 .populate("result_collection")
		 .exec(function(err, query) {
	    	if(err) console.error(err);
	   	if(query != null && query._session == app.session._id.toString() && !query.complete) {                    
	    	    var results = query.result_collection;
		    for(var i=0; i < results.length; i++) {
		    	var record = results[i];
		    	if(record != null && record.data != null) {
		            var d = JSON.parse(record.data);
 
			//TODO: (Validate) Check record.data
			//
			// change-rules previously applied by `update` cmd 
		        // Get data and convert back to XML for transfer to REST Updater service
		       	    var data = parser.toXml(d); 
	   	    	    app.log.info("Updating local record " + record._id + " for item " + record.dkclarinID);
		    	    updateMDRecord(data, record);
		        } else {
		  	    if(record != null) app.log.error("Empty record data for MD-Record:" + record._id);
			    else app.log.error("No results found for Query:" + query._id);
		        }
		    }
	    	} else {
		    if(!query || query._session != app.session._id.toString())
		    	app.log.error("Could not find query for session_id: " + app.session._id);
		    else
		    	app.log.warn("Query already marked completed.");
	    	}
	    });
        } else {
	    app.log.error("Could not find session for user handle: " + userHandle);
       	}
    };
   
    // check Session exists for User(escidoc_handle)?
    utils.getSession(Session, function(err,res) {
	if(!err)
   	    if(res != null) openSession(res, readDatastore);
 	    else app.log.error("No valid Session exists");
	    //TODO: Confirm with user: Update eSciDoc handle for Query's existing Session
    	else
	    app.log.error("Error opening Session:", err);
    });

    /** //TODO: Should it be possible to pull Query(s) by participant IDs 
    var findBySearchId = function(id) {
	Query.findOne({"search_ids": {$in: [id]}}).populate("_session", null, {_id: {$in: [session._id]}}).populate("result_collection").exec(function(err, query) {
	    if(query != null) {
		var results = query.result_collection;
		if(results[0].dkclarinID == id) {		
		} else {
		    app.log.error("Non-matching itemID found: " + results[0].dkclarinID);
		}
	    }  
	});
    }*/ 
    
}
