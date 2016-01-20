#!/usr/bin/env node

/*
* Parse an existing Query dump, metadata records, to find any invalid PID refs and fix them.
* @author seaton
*
*/

var mg = require('mongoose');
var jsonpath = require('jsonpath-plus');
var _ = require('underscore');

var config = require('../data/config.json');
var utils = require('../lib/utils.js');

var handle = config.get('escidoc_handle');
var queryTarget = config.get('targetQuery');
var session = null;

var db = mg.connect(config.get('mongoose_auth'));

var schema = require('../lib/schema.js');
var QueryModel = schema.models.Query;
var SessionModel = schema.models.Session;

var openSession = function(session, callback) {
  session = session;
  callback(queryId);
};

var findQuery = function(queryId) {
  if(!mg.Types.ObjectId.isValid(queryId))
    throw new Error("Query Id is invalid.");

  Query.findById(queryId)
    .populate("result_collection")
    .populate({
      path: '_session',
      select: '_id'
    })
    .exec(function(err, query) {
      if (query != null && query._session == session._id.toString()) { // Session match
        parseQuery(query, function(invalidPID, idRef, type) {
          // match id ref with content PID refs url (resolve)
          // if true
          // skip over
          // otherwise
          // update PID with content PID with corrected url ref
          // PID-manager POST
        });
      } else {
        throw new Error("No Query found for Session: " + session._id);
      }
    });
};

var parseQuery = function(queryResult, callback) {
  _u.each(query.result_collection, function(record) {
      var resourceProxyPath = "/CMD/Resources/ResourceProxyList/ResourceProxy"
      parseRecord(record, resourceProxyPath, function(val) {
          console.log('result:: ' + val.id, val.ResourceRef['$t']);
      });
  });
};

// parse records, iterate over resource proxies (pid refs)
var parseRecord = function(record, callback) {
  JSONPath({
    json: record,
    path: path,
    callback: callback
  });
};

// Use existing user session (escidoc_handle)
utils.getSession(schema.models.Session, function(res, err) { if(!err) openSession(res, queryTarget); else throw err; });