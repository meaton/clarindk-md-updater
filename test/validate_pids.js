#!/usr/bin/env node

/*
 * Mocha tests against a Query for valid PIDs
 * Parse an existing Query dump, metadata records, to find any invalid PID refs and fix them.
 * @author seaton
 *
 */

var chai = require('chai'),
  expect = chai.expect;
should = chai.should();

//var request = require('request');
var rp = require('request-promise');
var mg = require('mongoose');

var url = require('url');
var querystring = require('querystring');

var jsonpath = require('jsonpath-plus');
var _ = require('underscore');

var DOMParser = require('xmldom').DOMParser,
  XMLSerializer = require('xmldom').XMLSerializer;

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
    if (!err)
      if (res != null) callback(res);
      else callback(res, new Error("No valid Session exists for set handle: " + handle));
    else
      throw new Error("Error opening Session: " + err);
  });
};

var findQuery = function() {
  var queryId = config.targetQuery;

  describe('check query id', function() {
    it('should match mongoDB id format', function() {
      var test = /^[0-9a-fA-F]{24}$/.test(queryId);
      //throw new Error("Query Id is invalid.");
      expect(test).to.be.true;
    });
  });

  describe('retrieve query results', function() {
    describe('#QueryModel.findById', function() {
      it('should retreive query results without error', function(done) {
        QueryModel.findById(queryId)
          .populate("result_collection")
          .populate({
            path: '_session',
            select: '_id'
          })
          .exec(
            (function(err, query) {
            if (err)
              return done(err);

            query.should.be.an('object');
            expect(query._session._id).to.equal(session._id.toString());

            done();

            if (query != null && query._session._id == session._id.toString()) // Session match
              parseQuery(query); // update content PID with content PID with corrected url ref
            else
              throw new Error("No Query found for Session: " + session._id);
          }).should.not.throw(Error));
      });
    });
  });
};

var updateRecord = function(invalidPID, idRef, refUrl, type, checksum) {
  var pidManagerUri = 'https://' + config.pidmanager_auth_user + ':' + config.pidmanager_auth_pass + '@' + config.pidmanager_host + config.pidmanager_path;
  if (type == "content") {
    console.log('deleting pid: ' + invalidPID);
    // delete existing? use request-promise

    rp({
      method: 'GET', //'DELETE',
      uri: pidManagerUri + invalidPID,
      resolveWithFullResponse: true
    }).then(function(resp) {
      console.log('promise test success: ' + resp.statusCode);
      console.log('create updated PID record: ' + idRef);

      // create <param /> post body
      var post = '<param>';
      if (idRef != undefined) post += '<systemID>' + idRef + '</systemID>';
      if (refUrl != undefined) post += '<url>' + refUrl + '</url>';
      if (checksum != undefined)
        post += '<checksum>' + checksum + '</checksum>';
      post += '</param>';

      console.log('do post update: ' + post);

      /*request({
        method: 'POST',
        uri: pidManagerUri,
        body: post
      }, function(err, resp, body) {
        if(!err && resp.statusCode == 200)
          console.log('body (200): ', body);
        else
          console.error('err: ', resp.statusCode, ' pid: ', invalidPID);
      });*/

    }).catch(function(err) {
      console.error('DEL err: ' + err, ' pid: ', invalidPID, ' id: ' + idRef);
    });
  }
};

var parseQuery = function(queryResult, callback) {
  console.log('result length: ' + queryResult.result_collection.length);
  describe('parse result collection', function() {
    it('should contain some records', function() {
      expect(queryResult).to.exist;
      queryResult.should.have.property('result_collection');
      //assert.lengthOf(queryResult.result_collection, config.expectedQuerySize);

      findInvalidPids(queryResult.result_collection);
    });
  });
};

var findInvalidPids = function(results) {
  describe('find all records with invalid PIDs', function() {
    _.each(results, function(record) {
      var resourceProxyPath = "$.CMD.Resources..ResourceProxy"; //TODO: Validate against versionPID, selfLink

      it('should return a valid record', function() {
        expect(record).to.exist();
        expect(record).to.not.be.empty;
      });

      //console.log('record: ' + require('prettyjson').render(JSON.parse(record.data)));
      it('should return more than 1 PID references', function(done) {
        parseRecord(JSON.parse(record.data), resourceProxyPath, function(pidVal) {
          expect(pidVal).to.have.length.above(1);

          done();

          _.each(pidVal, resolveUrlAndTest);
        });
      });
    });
  });
};

var resolveUrlAndTest = function(ref) {
  describe('validate resources ref ' + ref.id + ' and resolve PID', function() {
    it('should have a valid PID value', function() {
      expect(ref).to.exist();
      expect(ref).to.have.deep.property('ResourceRef.$t');
    });

    it('should resolve', function(done) {
      // REST PID Manager url
      /* var pidUrl = ref['ResourceRef']['$t'].replace('hdl:' + config.pidmanager_prefix + '/', 'https://' + config.pidmanager_host + config.pidmanager_path);
        var hrTime = process.hrtime();
        var timestamp = hrTime[0] * 1000000 + hrTime[1] / 1000;
      */

      // Handle.net API
      var pidUrl = ref['ResourceRef']['$t'].replace('hdl:', 'http://hdl.handle.net/api/handles/');
      var options = {
        method: 'GET',
        uri: pidUrl,
        //url: pidUrl + '/url?ref=' + ref.id + '&token=' + timestamp,  // ref.id pass to request, timestamp milliseconds prevent cached request
        /*auth: {
          'user': config.pidmanager_auth_user,
          'password': config.pidmanager_auth_pass
        },*/
        headers: {
          'Cache-Control': 'no-cache'
        },
        json: true
      };

      rp(options)
        .then(function(body) {
          expect(body).to.exist();

          console.log('received body: ', JSON.stringify(body));

          done();
          //console.log('status:', resp.statusCode);
          //var refID = querystring.parse(resp.request.uri.query).ref;
          //console.log('req url:', resp.request.uri.href);
          //console.log('ref from querystring: ' + refID);

          var refID = ref.id;
          console.log('processing ', refID);

          /* // Handle XML response from REST PID Manager
          var pidUrlBody = new DOMParser().parseFromString(body, 'text/xml');
          var pidRef = _.chain(pidUrlBody.documentElement.getElementsByTagName('data'))
          .filter(function(val) {
            return (val.textContent.indexOf('http') > -1); // url value
          }).pluck('textContent').value();
          var md5checksum = _.chain(pidUrlBody.documentElement.getElementsByTagName('data'))
          .filter(function(val) {
            return /^[0-9a-f]{32}$/.test(val.textContent); // md5 regexp test
          }).pluck('textContent').value();
          */

          // Handle JSON response from Handle API

          describe('check against the PID data properties', function() {
            describe('#parseRecord', function() {
              it('should contain valid property values', function(done) {
                parseRecord(body, '$.values[?(@.type === "URL")].data.value', function(pidRef) {
                  console.log('url prop:', pidRef);
                  expect('pidRef').to.exist();

                  var valUrl = url.parse(pidRef);

                  var isContentRef = (refID.indexOf('_') == 0);
                  refID = refID.substr(refID.indexOf('_') + 1);

                  var refMatch = (valUrl.pathname.substr(valUrl.pathname.lastIndexOf('/') + 1) == refID);
                  console.log('refMatch:' + refMatch, ' path: ' + options.uri, ' ref ID: ' + refID, ' url: ' + valUrl.pathname);

                  expect(refMatch).to.be.true;

                  if (isContentRef) {
                    console.log('content PID: ' + ref['ResourceRef']['$t']);
                    console.log('ref ID: ' + ref.id);

                    //console.log('ref ID (querystring): ' + refID);

                    parseRecord(body, '$.values[?(@.type === "MD5")].data.value', function(checksum) {
                      console.log('url checksum:', checksum);

                      expect(checksum).to.exist;
                      expect(/^[0-9a-f]{32}$/.test(checksum)).to.be.true;

                      if (checksum != null && checksum.length > 0 && /^[0-9a-f]{32}$/.test(checksum))
                        if (callback)
                          callback(ref['ResourceRef']['$t'].replace('hdl:' + config.pidmanager_prefix + '/', ''), "dkclarin:" + refID, val.substr(0, val.lastIndexOf('/') + 1) + refID, "content", checksum);
                        else
                          console.error('err: Illegal or missing checksum value pid: ', refID);

                      done();
                    });
                  } else if (!refMatch) {
                    if (callback)
                      callback(ref['ResourceRef']['$t'].replace('hdl:' + config.pidmanager_prefix + '/', ''), "dkclarin:" + refID, val.substr(0, val.lastIndexOf('/') + 1) + refID, "lp");

                    // landing page ref mismatch
                    console.error('err: LP ref does not match id ', refID);

                    done();
                  }
                });
              });
            });
          });
        })
        .catch(function(err) {
          done(err);
          console.error('error: ' + resp.statusCode, 'ref ID: ', refID, 'record: ', record.dkclarinID);
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
describe('test the Session connection', function() {
  describe('#getSession()', function() {
    it('should open session', function(done) {
      getSession(SessionModel, function(res, err) {
        if (!err)
          openSession(res, function() {
            expect(session).not.equal(null);
            done();

            findQuery();
          });
        else
          throw err;
      });
    });
  });
});
