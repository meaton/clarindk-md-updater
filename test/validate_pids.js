#!/usr/bin/env node

/*
 * Mocha tests against a Query for valid PIDs
 * Parse an existing Query dump, metadata records, to find any invalid PID refs and fix them.
 * @author seaton
 *
 */

var chaiAsPromised = require("chai-as-promised");
var chai = require('chai');
chai.use(chaiAsPromised);

var expect = chai.expect,
  should = chai.should();

var async = require('async');

var request = require('request');
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
    it.only('should match mongoDB id format', function() {
      var test = /^[0-9a-fA-F]{24}$/.test(queryId);
      //throw new Error("Query Id is invalid.");
      expect(test).to.be.true;
    });
  });

  describe('retrieve query results', function() {
    describe('#QueryModel.findById', function() {
      it.only('should retreive query results without error', function(done) {
        QueryModel.findById(queryId)
          .populate("result_collection")
          .populate({
            path: '_session',
            select: '_id'
          })
          .exec(function(err, query) {
            if (err)
              return done(err);

            query.should.be.an('object');
            //expect(query._session._id).to.equal(session._id);

            done();

            if (query != null && query._session._id == session._id.toString()) // Session match
              parseQuery(query); // update content PID with content PID with corrected url ref
            else
              throw new Error("No Query found for Session: " + session._id);
          });
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
  //console.log('result length: ' + queryResult.result_collection.length);
  describe('parse result collection', function() {
    it.only('should contain some records', function() {
      expect(queryResult).to.exist;
      queryResult.should.have.property('result_collection');
      //assert.lengthOf(queryResult.result_collection, config.expectedQuerySize);
    });

    after(function(done) {
      findInvalidPids(queryResult.result_collection);
      done();
    });
  });
};

var findInvalidPids = function(results) {
  describe('find all records with invalid PIDs', function() {
    var records = null;

    before(function(done) {
      var selfLinkHdl = null;
      async.map(results, function(record, callback) {
          var resourceProxyPath = "$.CMD.Resources..ResourceProxy"; //TODO: Validate against versionPID, selfLink
          parseRecord(JSON.parse(record.data), resourceProxyPath, function(pidVal) {
            pidVal = _.map(pidVal, function(val) {
              if(val.id.indexOf('lp') == 0)
                selfLinkHdl = { id: val.id, ref: val['ResourceRef']['$t'] + '@md=cmdi' };
              return {
                id: val.id,
                ref: val['ResourceRef']['$t']
              }
            });
            if(selfLinkHdl != null) {
              //console.log('selfLinkHdl: ' + selfLinkHdl.ref);
              pidVal.push(selfLinkHdl);
            }
            callback(null, pidVal);
          });
        },
        function(err, results) {
          records = results;
          done();
        });
    });

    it('should return a valid set record', function() {
      expect(records).to.exist;
      expect(records).to.not.be.empty;
    });

    it('should return more than 1 PID references for each resource', function() {
      _.each(records, function(pidVal) {
        expect(pidVal).to.have.length.above(1);
      });
    });

    after(function(done) {
      this.timeout(0)
      _.each(records, function(val) {
        _.each(val, function(res) { // utilise tag @ reference and --grep option to control test workflow
          if(res.ref != undefined && res.ref.indexOf('@md=cmdi') != -1)
            resolveUrlAndTest(res, '@resolve');
          else
            resolveUrlAndTest(res, '@validate');
        });
      });

      done();
    });
  });
};

var resolveUrlAndTest = function(res, actionTag) {
  describe('Verify resources ref ' + res.id + ' and ' + actionTag + ' PID ' + res.ref, function() {
    var data = null;

    before(function(done) {
      this.timeout(20000); //TODO: remain issues with timeout for reqs against hdl.handle.net
      var pidUrl, options;

      if(config.pidResolveService == "pidmanager") { // REST PID Manager url
        pidUrl = (res.ref != undefined) ? res.ref.replace('hdl:' + config.pidmanager_prefix + '/', 'https://' + config.pidmanager_host + config.pidmanager_path) : null;

        var hrTime = process.hrtime();
        var timestamp = hrTime[0] * 1000000 + hrTime[1] / 1000;

        options = {
          method: 'GET',
          url: pidUrl + '?ref=' + res.id + '&token=' + timestamp,  // res.id pass to request, timestamp milliseconds prevent cached request
          auth: {
            'user': config.pidmanager_auth_user,
            'password': config.pidmanager_auth_pass
          },
          headers: {
            'Cache-Control': 'max-age=0, no-cache'
          },
          resolveWithFullResponse: true
        };

        //request-promise
        rp(options).then(function(resp) {
          //console.log('received body: ', JSON.stringify(resp.body));
          //console.log('status:', resp.statusCode);

          var refID = querystring.parse(resp.request.uri.query).ref;
          //console.log('refID: ' + refID);

          data = resp.body;
          done();
        }).catch(function(reason) {
          done(reason.cause);
        });
      } else if(config.pidResolveService == "handle") {
        // Handle.net API
        pidUrl = (res.ref != undefined) ? res.ref.replace('hdl:', 'http://' + config.handle_api_host + config.handle_api_path) : null;
        if(config.handle_use_auth) pidUrl += '?auth';

        options = {
          method: 'GET',
          url: pidUrl,
          headers: {
            'Cache-Control': 'max-age=0, no-cache'
          },
          json: true
        };

        // request-promise
        var req = rp(options).then(function(body) {
            data = body;
            done();
          })
          .catch(function(reason) {
            done(reason.cause);
          });
      } else {
        done(new Error('unsupported PID service'));
      }
    });

    it.only('should have a valid PID value ' + res.id, function() {
      expect(res).to.exist;
      expect(res).to.have.property('ref');
    });

    describe('test API response', function() {
      it.only('should have a valid response', function() {
        expect(data).to.not.equal(null);
      });
    });

    describe('check against the PID data properties', function() {
      describe('#parseRecord', function() {
        context('when has body response', function() {
          it.only('should be a valid response', function(done) {
            this.timeout(10000);

            if(config.pidResolveService == "pidmanager")
              handlePIDManagerResponse(res.id, data, function(err) {
                done(err);
              });
            else if(config.pidResolveService == "handle")
              handleAPIResponse(res.id, data, function(err) {
                done(err);
              });
          });
        });
      });
    });
  });
};

var handlePIDManagerResponse = function(refID, body, callback) {
    //console.log('handle PID Manager resp: ' + refID);
    // Handle XML response from REST PID Manager
    expect(body).to.exist;
    var pidUrlBody = new DOMParser().parseFromString(body, 'text/xml');

    var pidRef = _.chain(pidUrlBody.documentElement.getElementsByTagName('data'))
    .filter(function(val) {
      return (val.textContent.indexOf('http') > -1); // url value
    }).pluck('textContent').value();

    var checksum = _.chain(pidUrlBody.documentElement.getElementsByTagName('data'))
    .filter(function(val) {
      return /^[0-9a-f]{32}$/.test(val.textContent); // md5 regexp test
    }).pluck('textContent').value();

    //console.log('pidRef: ', pidRef);
    //console.log('checksum: ', checksum);

    if(pidRef.length == 1) {
      var valUrl = url.parse(pidRef[0]);
      var isContentRef = (refID.indexOf('_') == 0);
      var _id = refID.substr(refID.indexOf('_') + 1);
      var refMatch = isRefMatch(_id, valUrl, isContentRef);
      console.log('refMatch:' + refMatch, ' path: ' + valUrl.href, ' id: ' + _id, ' url: ' + valUrl.pathname);
    }

    expect(pidRef).to.have.length.of.at.least(1);
    expect(refMatch).to.be.true;

    if(isContentRef) {
      expect(checksum).to.have.length.of.at.least(1);
      expect(checksum[0]).to.match(/^[0-9a-f]{32}$/);

      if(callback) callback();
    }  else if (!refMatch) {
      // landing page ref mismatch
      //console.error('err: LP ref does not match id ', refID);
      if(callback) callback(new Error('err: LP ref does not match id ' + refID));
    } else {
      if(callback) callback();
    }
};

var handleAPIResponse = function(refID, body, callback) {
  //console.log('handle API resp: ' + refID);
  //console.log('handle responseCode: ' + body.responseCode);
  parseRecord(body, '$.values[?(@.type === "URL")].data.value', function(pidRef) {
    //console.log('url prop:', pidRef);
    var valUrl = url.parse(pidRef);
    var isContentRef = (refID.indexOf('_') == 0);
    var _id = refID.substr(refID.indexOf('_') + 1);

    var refMatch = isRefMatch(_id, valUrl, isContentRef);
    //console.log('refMatch:' + refMatch, ' path: ' + valUrl.href, ' id: ' + _id, ' url: ' + valUrl.pathname);

    expect(pidRef).to.exist;
    expect(refMatch).to.be.true;

    if(isContentRef) {
      //console.log('content PID: ' + ref['ResourceRef']['$t']);
      //console.log('ref ID: ' + refID);

      parseRecord(body, '$.values[?(@.type === "MD5")].data.value', function(checksum) {
        //console.log('url checksum:', checksum);

        expect(checksum).to.exist;
        expect(checksum).to.match(/^[0-9a-f]{32}$/);

        /*if (checksum != null && checksum.length > 0 && /^[0-9a-f]{32}$/.test(checksum))
          if(callback)
            callback(ref['ResourceRef']['$t'].replace('hdl:' + config.pidmanager_prefix + '/', ''), "dkclarin:" + refID, val.substr(0, val.lastIndexOf('/') + 1) + refID, "content", checksum);
          else
            console.error('err: Illegal or missing checksum value pid: ', refID);
          */
        if(callback) callback();
      });
    } else if (!refMatch) {
      /*if (callback)
        callback(ref['ResourceRef']['$t'].replace('hdl:' + config.pidmanager_prefix + '/', ''), "dkclarin:" + refID, val.substr(0, val.lastIndexOf('/') + 1) + refID, "lp");
      */

      // landing page ref mismatch
      //console.error('err: LP ref does not match id ', refID);
      if(callback) callback(new Error('err: LP ref does not match id ' + refID));
    } else {
      if(callback) callback();
    }
  });
};

var isRefMatch = function(id, valUrl, isContentRef) {
  if(id != null && valUrl != null)
    if(!isContentRef && valUrl.pathname == "/handle/cmdi") {
      var searchPath = url.parse(valUrl.search.substr(1, valUrl.search.length)).pathname;
      console.log('search: ' + valUrl.search);
      console.log('search parse: ' + searchPath);
      return (valUrl.search && valUrl.search.indexOf('http') != -1 && searchPath.substr(searchPath.lastIndexOf('/') + 1) == id)
    } else
      return (valUrl.pathname.substr(valUrl.pathname.lastIndexOf('/') + 1) == id);
  else
    return false;
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
