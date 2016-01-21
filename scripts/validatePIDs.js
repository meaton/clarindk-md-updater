#!/usr/bin/env node

/*
* Parse an existing Query dump, metadata records, to find any invalid PID refs and fix them.
* @author seaton
*
*/
var url = require('url');
var mg = require('mongoose');
var jsonpath = require('jsonpath-plus');
var request = require('request');
var _ = require('underscore');

var DOMParser = require('xmldom').DOMParser, XMLSerializer = require('xmldom').XMLSerializer;

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
        parseQuery(query, function(idRef, refUrl, type, checksum) {
          // update content PID with content PID with corrected url ref
          if(type == "content") {
            // create <param /> post body
            var post = '<param>';
            if (idRef != undefined) post += '<systemID>' + idRef + '</systemID>';
            if (refUrl != undefined) post += '<url>' + refUrl + '</url>';
            if (checksum != undefined)
                post += '<checksum>' + checksum + '</checksum>';
            post += '</param>';
            console.log('post update: ' + post);
          }
        });
      } else {
        throw new Error("No Query found for Session: " + session._id);
      }
    });
};

var parseQuery = function(queryResult, callback) {
  console.log('result length: ' + queryResult.result_collection.length);
  _.each(queryResult.result_collection, function(record) {
      var resourceProxyPath = "$.CMD.Resources..ResourceProxy";
      //console.log('record: ' + require('prettyjson').render(JSON.parse(record.data)));
      parseRecord(JSON.parse(record.data), resourceProxyPath, function(val) {
          _.each(val, function(ref) {
            var pidUrl = ref['ResourceRef']['$t'].replace('hdl:' + config.pidmanager_prefix + '/', 'https://' + config.pidmanager_host + config.pidmanager_path);
            request.get(pidUrl + '/url',
              {
                'auth': {
                  'user': config.pidmanager_auth_user,
                  'password': config.pidmanager_auth_pass
                }
              }, function(err, resp, body) {
                console.log('status:', resp.statusCode);
                if(err) console.error('err: ' + err);
                else {
                  //console.log('body resp:', body);
                  var pidUrlBody = new DOMParser().parseFromString(body, 'text/xml');

                  var pidRef = _.chain(pidUrlBody.documentElement.getElementsByTagName('data'))
                  .filter(function(val) {
                    return (val.textContent.indexOf('http') > -1); // url value
                  }).pluck('textContent').value();

                  var md5checksum = _.chain(pidUrlBody.documentElement.getElementsByTagName('data'))
                  .filter(function(val) {
                    return /^[0-9a-f]{32}$/.test(val.textContent); // md5 regexp test
                  }).pluck('textContent').value();

                  console.log('url prop:', pidRef);
                  console.log('url checksum:', md5checksum);

                  _.each(pidRef, function(val) {
                      var valUrl = url.parse(val);
                      var refID = ref.id.substr(ref.id.indexOf('_') + 1);
                      var refMatch = (valUrl.pathname.substr(valUrl.pathname.lastIndexOf('/') + 1) == refID);
                      console.log('refMatch:', refMatch);

                      if(!refMatch && ref.id.indexOf('_') == 0 && md5checksum.length > 0) {
                        console.log('content PID: ' + ref['ResourceRef']['$t']);
                        console.log('ref ID: ' + ref.id);
                        callback("dkclarin:" + refID, val.substr(0, val.lastIndexOf('/') + 1) + refID, "content", md5checksum[0]);
                      }
                  });
                }
              }
            );
          });
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
