/** 
 * Show all Query details, optionally print JSON formatted data for a result MD-Record
 *
 */
var utils = require('../utils');

var remove = module.exports = function(app, queryId) {
    var Query = app.schema.models.Query;
    var MDRecord = app.schema.models.MDRecord;
    var Session = app.schema.models.Session;

    var openSession = function(session, callback) {
        app.session = session;
        callback(queryId);
    }

    var removeQuery = function(queryId) {
        if (queryId.length != 24)
            throw new Error("Query Id is invalid.");

        Query.findById(queryId)
            .populate("result_collection")
            .populate({
                path: '_session',
                select: '_id'
            })
            .exec(function(err, query) {
                if (query != null && query._session.id == app.session._id.toString()) { // Session match
                    var results = query.result_collection;
                    Query.update({
                        _id: queryId
                    }, {
                        '$pullAll': {
                            result_collection: results
                        }
                    }).exec(function(err) {
                        if (err) throw err;
                        MDRecord.remove({
                            _id: {
                                $in: results
                            }
                        }, function(err, noRemoved) {
                            if (err) throw err;
                            app.log.debug('Records removed: ' + noRemoved);
                            utils.removeDocument(query, function() {
                                app.log.info('Query ' + queryId + ' is now removed.');
                            });
                        });
                    });
                } else {
                    throw new Error("No Query found for Session: " + app.session._id);
                }
            });
    }

    // check Session exists for User(escidoc_handle)?
    utils.getSession(app.schema.models.Session, function(res, err) {
        if (!err) openSession(res, removeQuery);
        else throw err;
    });

}
