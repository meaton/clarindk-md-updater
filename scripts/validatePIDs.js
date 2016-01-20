#!/usr/bin/env node

/*
* Parse an existing Query dump, metadata records, to find any invalid PID refs and fix them.
* @author seaton
*
*/

var mg = require('mongoose');
var jsonpath = require('jsonpath-plus');
var _ = require('underscore');

var session = null;
var config = require('../data/config.json');
var handle = config['escidoc_handle'];

var db = mg.connect(config['mongoose_auth']);

var schema = require('../lib/schema.js');
var QueryModel = schema.models.Query;
var SessionModel = schema.models.Session;

var openSession = function(sessionObj, callback) {
  session = sessionObj;
  callback();
};

var getSession = function(sessionModel, callback) {
  sessionModel.findByHandle(handle, function(err, res) {
    if(!err)
        if(res != null) callback(res);
        else callback(res, new Error("No valid Session exists for set handle: " + handle));
    else
        throw new Error("Error opening Session: " + err);
  });
};

var findQuery = function() {
  var queryId = config.targetQuery;
  var checkHexRep = /^[0-9a-fA-F]{24}$/;

  if(!checkHexRep.test(queryId))
    throw new Error("Query Id is invalid.");

  QueryModel.findById(queryId)
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
  console.log('result length: ' + queryResult.result_collection.length);
  _.each(queryResult.result_collection, function(record) {
      var resourceProxyPath = "/CMD/Resources/ResourceProxyList/ResourceProxy"
      console.log('record: ' + record.data.length);
      parseRecord(JSON.parse(record.data), resourceProxyPath, function(val) {
          console.log('result:: ', val.id, val.ResourceRef['$t']);
      });
  });
};

// parse records, iterate over resource proxies (pid refs)
var parseRecord = function(record, path, callback) {
  jsonpath({
    json: record,
    path: path,
    callback: callback
  });
};

// Use existing user session (escidoc_handle)
getSession(SessionModel, function(res, err) { if(!err) openSession(res, findQuery); else throw err; });
