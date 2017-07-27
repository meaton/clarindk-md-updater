var app = require('./app'),
    http = require('http'),
    xml2js = require('xml2js'),
    util = require('util'),
    path = require('path'),
    error = app.log.error;

var parserDefaults = {
    attrkey: "$",
    charkey: "_",
    explicitArray: true
  };

var attrkey = (app.config.get('parserAttrkey')) ? app.config.get('parserAttrkey') : parserDefaults.attrkey;
var charkey = (app.config.get('parserAttrkey')) ? app.config.get('parserCharkey') : parserDefaults.charkey;
var explicitArray = (app.config.get('parserExplicitArray')) ? app.config.get('parserExplicitArray') : parserDefaults.explicitArray;

module.exports = {
    saveMDRecord: function(record, params, query, callback) {
      //parser options
      var parser = new xml2js.Parser({
          attrkey: attrkey,
          charkey: charkey,
          explicitArray : explicitArray
      });

      parser.parseString(record, function(err, result) {
					if (!err) {
            //app.log.info('result: ' + JSON.stringify(result));
						var mdrecord = app.schema.CreateMDRecord({
		            dkclarinID: params.id,
		            data: JSON.stringify(result),
		            'type.name': params.name,
                reversible: (attrkey === parserDefaults.attrkey && charkey === parserDefaults.charkey && explicitArray === parserDefaults.explicitArray)
		        });

            mdrecord.save();

            app.log.info('mdrecord: ' + mdrecord.id);

						var itemsToAdd = (query.search_ids.length > 0) ? {
		                result_collection: mdrecord.id,
		                search_ids: params.id
		            } :
		            {
		                result_collection: mdrecord.id
		            };

		        app.schema.models.Query.update({
		            _id: query.id
		        }, {
		            $addToSet: itemsToAdd
		        }, function(err) {
		            if (err) return app.log.error("Error on Query update: " + err);

		            app.log.info("Update +Query-" + query.id);
		            query.result_collection.push(mdrecord);

		            if (callback) callback();
		        });
					} else {
						error('Error: ' + err);
					}
				});
    },

    updateMDRecord: function(new_data, mdrecord) {
        app.log.debug("Updating MDRecord: " + mdrecord.id);
        var new_data_str = JSON.stringify(new_data);
        if (mdrecord.data != new_data_str) {
            mdrecord.data = new_data_str;
            mdrecord.set('update', true);
            this.saveDocument(mdrecord);
        }
    },

    updateQuery: function(query, callback) {
        app.log.debug("Updating Query: " + query.id);
        query.set('update', true);
        this.saveDocument(query, callback);
    },

    saveDocument: function(model, callback) {
        model.save(function(err) {
            if (err) error('Error:' + err);
            else app.log.debug('+' + model.constructor.modelName + "-" + model.id);
            if (callback && !err) callback(model);
        });
    },

    removeDocument: function(model, callback) {
        var modelDesc = model.constructor.modelName + "-" + model.id;
        model.remove(function(err, doc) {
            if (err) throw err;
            else app.log.debug('-' + modelDesc);

            if (callback)
                callback(doc);
        });
    },

    rest_options: function(params, isUpload) {
        var path = '/v0.9/items/' + params.id + '/metadata/' + params.name + '?escidocurl=' + params.target + '&d=' + Date.now(),
            updaterHost = (app.config.get('updaterHost') != null) ? app.config.get('updaterHost') : 'localhost',
            updaterPort = (app.config.get('updaterPort') != null) ? app.config.get('updaterPort') : '80';
        if (updaterPort == '80' || updaterPort == '8080') path = '/rest' + path; // expect deployed WAR
        return {
            host: updaterHost,
            port: updaterPort,
            path: path,
            headers: {
                'Cookie': 'escidocCookie=' + params.handle,
                'Cache-Control': 'no-cache, private, no-store, must-revalidate, max-stale=0, post-check=0, pre-check=0'
            },
            method: (!isUpload) ? 'GET' : 'PUT'
        };
    },

    srw_options: function(queryCQL, record_vals) {
        var search_path_limits = "&maximumRecords=" + record_vals.limit + "&startRecord=" + record_vals.start;
        var targetUrl = app.config.get('targetUrl');
        return {
            host: (targetUrl.indexOf('http://') != -1) ? targetUrl.replace('http://', '') : targetUrl,
            path: '/srw/search/escidoc_all?query=' + encodeURIComponent(queryCQL.replace(/\s/g, "%20")) + search_path_limits + '&d=' + Date.now()
        };
    },

    ir_options: function(params) {
        var targetUrl = app.config.get('targetUrl');
        return {
            host: (targetUrl.indexOf('http://') != -1) ? targetUrl.replace('http://', '') : targetUrl,
            path: '/ir/item/' + params.id + '/' + params.method,
            headers: (params.lastModificationDate != null) ? {
                'Content-Type': 'application/xml',
                'Cookie': 'escidocCookie=' + params.handle,
                'Cache-Control': 'no-cache, private, no-store, must-revalidate, max-stale=0, post-check=0, pre-check=0'
            } : null,
            method: (params.lastModificationDate != null) ? 'POST' : 'GET'
        };
    },

    getNamedNS: function(name) {
        switch (name) {
            case "olac":
                return {
                    ns: "http://www.language-archives.org/OLAC/1.1/",
                    nodeName: "olac"
                };
            case "escidoc":
                return {
                    ns: "http://www.openarchives.org/OAI/2.0/oai_dc/",
                    nodeName: "dc"
                };
            case "CMD":
                return {
                    nodeName: "CMD"
                };
            case "TEI":
                return {
                    nodeName: "teiHeader"
                };
            case "dkclarin":
                return {
                    ns: "http://purl.org/dc/elements/1.1/",
                    nodeName: "type"
                };
            default:
                return null;
        }
    },

    getSession: function(sessionModel, callback) {
        var handle = app.config.get('escidoc_handle');
        if (handle == null)
            return null;
        //TODO Config check, warning

        sessionModel.findByHandle(handle, function(err, res) {
            if (!err)
                if (res != null) callback(res);
                else callback(res, new Error("No valid Session exists for set handle: " + handle));
            else
                throw new Error("Error opening Session: " + err);
        });
    },
    getParserDefaults: function() {
      return parserDefaults;
    },
    getParserConfig: function() {
      return {
        attrkey: attrkey,
        charkey: charkey,
        explicitArray: explicitArray
      };
    },
    loadJSONFile: function(rel_filepath, callback) {
        var json = require(path.resolve(process.cwd(), rel_filepath));
        callback(json);
    },

    updateMDRecordREST: function(data, record, params, callback) {
        data = data.replace(/^\uFEFF/, ''); // Strip any potential UTF-8 BOM
        var req = http.request(this.rest_options(params, true), function(res) {
                var str = '';
                res.on('data', function(chunk) {
                    str += chunk;
                });
                res.on('end', function() {
                    // flag completed if successful 200 - comment: handled in callback fn
                    callback(res, str, data, record);
                });
            })
            .on('error', function(e) {
                app.log.error("Error: " + e.message);
                app.log.error("Error code: " + e.code);
            });

        req.end(data);
    },

    execItemREST: function(record, method, emitter, nextEvent, lastModificationDate, handle) {
      var restresp_parser = new xml2js.Parser({
          // options
          //explicitArray : false,
          //ignoreAttrs : false,
          mergeAttrs : true
      });
      var req = http.request(this.ir_options({
                id: record.dkclarinID,
                method: method,
                lastModificationDate: lastModificationDate,
                handle: handle
            }), function(res) {
                var str = '';
                res.on('data', function(chunk) {
                    str += chunk;
                });
                res.on('end', function() {
                    if (res.statusCode == 200 || res.statusCode == 409 || res.statusCode == 450) { //failSafe to release submitted items
                        restresp_parser.parseString(str, function(err, res_data) {
                            var newLastModificationDate = lastModificationDate;
                            if (res.statusCode == 450) {
                                // handle already submitted / released items
                                if (nextEvent == "release")
                                    app.log.warn("Item " + record.dkclarinID + " is already submitted, trying release..");
                                else if (nextEvent == "public") {
                                    app.log.warn("Item " + record.dkclarinID + " is already released, it likely that no new version was made.");
                                    app.log.warn("Marking Item " + record.dkclarinID + " as completed..");
                                    newLastModificationDate = null;
                                } else
                                    error("Unexpected 450 error: " + str);
                            } else if (res.statusCode == 409 && method == "submit") {
                                // handle invalid timestamp (fallback)
                                return emitter.emit("version", record, null);
                            } else {
                                if (method == "resources/version-history") {
                                    app.log.info('Using version timestamp from history');
                                    newLastModificationDate = res_data['escidocVersions:version-history']['escidocVersions:version'][0]['escidocVersions:timestamp']; // Obtain lastModificationDate for Item updated version
                                } else
                                    newLastModificationDate = res_data['result']['last-modification-date'];
                            }
                            emitter.emit(nextEvent, record, newLastModificationDate);
                        });
                    } else {
                        error("Error occurred processing " + method + ": " + res.statusCode + "\n" + str);
                        if (res.statusCode == 503) {
                            setTimeout(function(emitter, method, record, date) {
                                return emitter.emit(method, record, date);
                            }, 300000, emitter, method, record, lastModificationDate);
                            app.log.debug('attempting method call again after error, method: ' + method);
                        }
                    }

                });
            })
            .on('error', function(e) {
                error("Error: " + e.message);
                app.log.error("Error code: " + e.code);
            });

        if (lastModificationDate != "" && lastModificationDate) {
            var comment = "Test submission/release of item.";

            // Allow user to specify submit comment
            if (emitter.submitComment)
                comment = emitter.submitComment;

            app.log.debug("Submission comment: " + comment);
            var post = "<param last-modification-date=\"" + lastModificationDate + "\"><comment>" + comment + "</comment></param>";
            req.write(post);
        }
        req.end();
    },

    tableOutputBoolean: function(value) {
        return (value) ? 'yes'.green : 'no'.red;
    },
    exit: function(exitCode) {
        process.stdout.on('drain', function() {
            process.exit(exitCode);
        });
    },
    util: util

    // Read from Md-Record data file in local dir
    /* readFile: function(file_path) {
        if(!file_path) file_path = 'data/olac-243215.xml';
        fs.readFile(file_path, function(err, data) {
    	if(err) return console.log('Error: ' + err);
    	console.log("Data:" + data);
    	updateMDRecord(data, {})
        });
    };
    */
};
