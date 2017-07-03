/**
 * Upload, submit and release the Md-Record updates for this Query.
 *
 */
var utils = require('../utils'),
    fs = require('fs'),
    util = utils.util,
    http = require('http'),
    xml2js = require('xml2js');

var submit = module.exports = function(app, queryId, comment) {

    var Session = app.schema.models.Session,
        Query = app.schema.models.Query;
    MDRecord = app.schema.models.MDRecord;

    // Batch processing values from config
    app.batch = (!app.config.get('useBatch')) ? false : app.config.get('useBatch');
    app.batchLimit = (app.config.get('batchLimit') == undefined) ? 50 : app.config.get('batchLimit');

    // batch collections
    var batchList = [],
        batchCollection = [];
    http.globalAgent.maxSockets = 3; // determine limit for eSciDoc middleware/md-updater, node default 5

    // service config
    var targetUrl = app.config.get('targetUrl'),
        userHandle = app.config.get('escidoc_handle');

    // eSciDoc Item Service and Task event handling
    var EventEmitter = require('events').EventEmitter;

    var Batch = function(batchNo) {
        this.batchNo = batchNo;
        this.currentProgressCount = 0;
        this.batchTotal = 0;
    }

    var Submission = function(comment, batch) {
        this.submitComment = comment;
        this.batch = batch;
    }

    util.inherits(Submission, EventEmitter);
    util.inherits(Batch, EventEmitter);

    var batch = new Batch(0);

    // Batch updates
    batch.on('start', function() {
        if (batchList.length > 0) {
            batchCollection.push(batchList);
            batchList = [];
        }

        if (this.batchTotal == 0) this.batchTotal = batchCollection.length;

        this.currentProgressCount = 0;

        app.log.debug('Processing batch ' + Math.floor(this.batchNo + 1) + '/' + this.batchTotal);

        var batchProcess = batchCollection[this.batchNo];
        this.batchNo += 1;

        if (batchProcess != null) {
            app.log.debug('batchProcess length: ' + batchProcess.length);
            batchProcess.forEach(function(update) {
                updateMDRecord(update.data, update.record);
            });
        } else {
            throw new Error('Error: empty batch ' + this.batch + 1);
        }
    });

    batch.on('nextBatch', function() {
        app.log.debug('next batch called');
        if (this.batchNo < this.batchTotal) {
            batch.emit('start', this.batchNo + 1);
        } else {
            app.log.warn('No more batches left in collection (total:' + this.batchTotal + ')');
        }
    });

    var submission = new Submission(comment, batch);

    submission.on('update', function(record, data) {
        app.log.info("Received update event following MDRecord update.");
        //Obtain lastModificationDate from eSciDoc Item Service handler: retrieveVersionHistory
        parseString(data, function(err, result) {
          if (!err) submission.emit("submit", record, result['result']['last-modification-date']);
          else app.log.err("Failed handing update response: "err);
        });
    });

    submission.on('version', function(record, data) {
        app.log.warn('Invalid version timestamp match, obtaining data from version-history..');
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
        if (lastModificationDate != null)
            app.log.info("Item " + record.dkclarinID + " is now released.");

        record.set('complete', true); // Mark item as completed in query submission
        record.save(function(err) {
            if (err) app.log.error('Saving completed flag unsuccessful: ' + err);
        });

        setTimeout(checkQueryCompletion, 200);

        if (app.batch)
            checkBatchProgress(this.batch);

    });

    /** Open and use existing Session for MD-Record(s) submission */
    var openSession = function(session, callback) {
        app.session = session;

        app.log.info("Using existing Session-" + app.session._id);

        return callback(queryId);
    }

    /** Check current batch */
    var checkBatchProgress = function(batch) {
        batch.currentProgressCount += 1;

        if (app.batchLimit <= 0 || app.batchLimit == null)
            throw new Error('Invalid config value for batchLimit: ' + app.batchLimit);
        else if (batch.currentProgressCount == app.batchLimit)
            batch.emit('nextBatch', batch.batchTotal); // process next batch
    }

    var checkQueryCompletion = function() {
        // Flag Query as completed if all Items are completed (uploaded)
        app.log.debug('Checking completion...');
        Query.findById(queryId).populate('_session', null, {
                _id: {
                    $in: [app.session._id]
                }
            })
            .populate("result_collection", null, {
                "status.completed": false,
                "status.updated": true
            })
            .exec(function(err, query) {
                if (err) console.error(err);
                if (query != null && query.result_collection.length <= 0) {
                    query.set('complete', true);
                    utils.saveDocument(query, function(err) {
                        utils.exit(0);
                        app.log.info('Query +' + query._id + ' marked as completed.');
                        console.log('Exiting..');
                    });
                } else app.log.debug('Not all records have finished being submitted.');
            });
    }

    /** Setup update batches */
    var updateMDRecordBatch = function(data, record) {
        var limit = app.batchLimit;

        if (batchList.length == limit) {
            batchCollection.push(batchList);
            batchList = []; // clear holder
        }

        batchList.push({
            data: data,
            record: record
        });

        app.log.debug('Adding record ' + record.dkclarinID + ' to batch ' + batchCollection.length);
    }


    /** Update MDRecord to eSciDoc repository via REST service
     * Send Events to submit/release new Item version.
     */
    var updateMDRecord = function(data, record) {
        if (!record.complete) {
            var params = {
                id: record.dkclarinID,
                name: record.type.name,
                handle: userHandle,
                target: targetUrl
            };
            utils.updateMDRecordREST(data, record, params, updateMDRecordCallback);
        } else {
            app.log.warn("MD-Record already marked as completed: " + record._id);

            setTimeout(checkQueryCompletion, 200); // required? fallback when completed all record updates but for some reason didnt mark query as completed

            if (app.batch)
                checkBatchProgress(batch);
        }
    };

    var updateMDRecordCallback = function(res, res_data, data, record) {
        if (res.statusCode == 200) {
            submission.emit('update', record, res_data);
            //} else if(res.statusCode != 200 && res.statusCode == 500) { // TODO: handle for remove items
            //    app.log.error('Update Failed on Item: ' + record.dkclarinID + '  Reason: ' + res_data);
            //    app.log.debug('Response code: ' + res.statusCode);
            //    setTimeout(updateMDRecord, 300000, data, record);
        } else {
            app.log.error('Update Fail on Item: ' + record.dkclarinID + ' Reason: ' + res_data);
            app.log.debug('Response code: ' + res.statusCode);
            if (app.batch && (res.statusCode == 400 || res.statusCode == 500))
                //if(res.statusCode == 500) fs.appendFile('delete.xml', '<id>' + record.dkclarinID + '</id>\n', function(e) { if(e) console.error('Error writing to file: ' + e); });
                checkBatchProgress(batch); // continue batch process if bad request on update()
        }
    };

    // Read from local MongoDB
    var readDatastore = function(queryId) {
        app.log.debug("Searching for Query: " + queryId);

        if (queryId.length != 24)
            return app.log.error("Query Id is invalid.");

        if (app.session != null)
            Query.findById(queryId)
            .populate({
                path: '_session',
                select: '_id'
            })
            .populate("result_collection", null, {
                "status.completed": false,
                "status.updated": true
            })
            .exec(function(err, query) {
                if (err) console.error(err);
                if (query != null && query._session.id == app.session._id.toString() && !query.complete) {
                    var results = query.result_collection;
                    results.forEach(function(result) {
                        var record = result;
                        if (record != null && record.data != null) {
                            var d = JSON.parse(record.data);

                            //TODO: (Validate) Check parsed JSON/record.data
                            //
                            // change-rules previously applied by `update` cmd
                            // Get data and convert back to XML for transfer to REST Updater service
                            // Sanitize to escape illegal chars
                            var builder = new xml2js.Builder({});
                            var data = builder.buildObject(d);

                            app.log.info("Record XML data: " + data);
                            app.log.info("Updating local record " + record._id + " for item " + record.dkclarinID);

                            if (!app.batch)
                                updateMDRecord(data, record);
                            else {
                                app.log.debug('Batching updates...');
                                updateMDRecordBatch(data, record);
                            }
                        } else {
                            if (record != null) app.log.error("Empty record data for MD-Record:" + record._id);
                            else app.log.error("No results found for Query:" + query._id);
                        }
                    });

                    if (app.batch && results.length > 0)
                        batch.emit('start');
                    else checkQueryCompletion();
                } else {
                    if (!query || query._session != app.session._id.toString())
                        throw new Error("Could not find query for session_id: " + app.session._id);
                    else
                        app.log.warn("Query already marked completed.");
                }
            });
        else
            throw new Error("Could not find session for user handle: " + userHandle);
    };

    // check Session exists for User(escidoc_handle)?
    utils.getSession(Session, function(res, err) {
        if (!err) openSession(res, readDatastore);
        else throw err;
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
