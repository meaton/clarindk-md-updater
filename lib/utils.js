var app = require('./app'), http = require('http'), parser = require('xml2json'), util = require('util'), path = require('path'), error = app.log.error;

module.exports = {	
	saveMDRecord: function(record, params, query) {
	    var doc = parser.toJson(record, {reversible: true, coerce: false});    
	    var mdrecord = app.schema.CreateMDRecord({ dkclarinID: params.id, data: doc, 'type.name': params.name });
	    //query.result_collection.push(mdrecord);
	    this.saveDocument(mdrecord);
	    var itemsToAdd = (query.search_ids.length > 0) ? { result_collection: mdrecord._id, search_ids: params.id }
							    :  { result_collection: mdrecord._id };
	    app.schema.models.Query.update({_id: query._id}, { $addToSet: itemsToAdd }, function(err) {
		if(err) app.log.error("Error on Query update: " + err);
		else app.log.info("Update +Query-" + query._id);
	    });
	},

	updateMDRecord: function(new_data, mdrecord) {
	    app.log.debug("Updating MDRecord: " + mdrecord._id);
	    mdrecord.data = JSON.stringify(new_data);
	    mdrecord.set('update', true);
	    this.saveDocument(mdrecord);
	},

	updateQuery: function(query) {
	    app.log.debug("Updating Query: " + query._id);
	    query.set('update', true);
	    this.saveDocument(query);
	},

	saveDocument: function(model, callback) {
	    model.save(function(err) { 
		if(err) error('Error:'+err);
		else app.log.debug('+' + model.constructor.modelName + "-" + model._id); 
		if(callback && !err) callback(model);
	    });
	},

	rest_options: function(params, isUpload) {
	    return { 
		host: (app.config.get('updaterHost') != null) ? app.config.get('updaterHost') : 'localhost',
		port: (app.config.get('updaterPort') != null) ? app.config.get('updaterPort') : '80',
		path: '/v0.9/items/'+params.id+'/metadata/'+params.name+'?escidocurl='+params.target+'&d='+Date.now(),
		headers: {'Cookie': 'escidocCookie='+params.handle, 'Cache-Control': 'no-cache, private, no-store, must-revalidate, max-stale=0, post-check=0, pre-check=0'},
		method: (!isUpload) ? 'GET' : 'PUT'
	    };
	},

	srw_options: function(queryCQL, record_vals) {
	    var search_path_limits = "&maximumRecords="+record_vals.limit+"&startRecord="+record_vals.start;
	    var targetUrl = app.config.get('targetUrl');
	    return { 
		host: (targetUrl.indexOf('http://') != -1) ? targetUrl.replace('http://', '') : targetUrl,
		path: '/srw/search/escidoc_all?query='+queryCQL.replace(/\s/g,"%20")+search_path_limits+'&d='+Date.now()
	    };
	},

	ir_options: function(params) {
	    var targetUrl = app.config.get('targetUrl');
	    return {
		host: (targetUrl.indexOf('http://') != -1) ? targetUrl.replace('http://', '') : targetUrl,
		path: '/ir/item/' + params.id + '/' + params.method,
		headers: (params.lastModificationDate != null) ? {'Content-Type': 'application/xml', 'Cookie': 'escidocCookie='+params.handle, 'Cache-Control':'no-cache, private, no-store, must-revalidate, max-stale=0, post-check=0, pre-check=0'} : null,
		method: (params.lastModificationDate != null) ? 'POST' : 'GET'
	    };
	},

	getNamedNS: function(name) {
		switch(name) {
			case "olac": return {ns: "http://www.language-archives.org/OLAC/1.1/", nodeName: "olac"};
			case "escidoc": return {ns: "http://www.openarchives.org/OAI/2.0/oai_dc/", nodeName: "dc"};
			case "CMD": return {nodeName: "CMD"};
			case "TEI": return {nodeName: "teiHeader"};
			case "dkclarin": return {ns: "http://purl.org/dc/elements/1.1/", nodeName: "type"};
			default: return null;
		}
	},

	getSession: function(sessionModel, callback) {
	    var handle = app.config.get('escidoc_handle');
	    if(handle == null)
		return null;
	    //TODO Config check, warning

	    sessionModel.findByHandle(handle, callback);
	},

	loadJSONFile: function(rel_filepath, callback) {
	    var json = require(path.join(__dirname, '..', rel_filepath));
	    callback(json);
        },

	updateMDRecordREST: function(data, params, callback) {
	    data = data.replace(/^\uFEFF/, ''); // Strip any potential UTF-8 BOM

	    //app.log.debug("data length: " + data.length);
	    //app.log.debug("path: " + options.path);
	    //app.log.debug("handle: " + params.handle);

	    var req = http.request(this.rest_options(params, true), function(res) {
		var str = '';
		//app.log.debug("response code: ", res.statusCode);
		//app.log.debug("headers: ", JSON.stringify(res.headers));
		res.on('data', function(chunk) {
		    str += chunk;
		});
		res.on('end', function () {
		    //app.log.debug(str);
		    //app.log.debug(data);
		    
		    // flag completed if successful 200 - comment: handled in callback fn
		    callback(res, str);
		});
	    })
	    .on('error', function(e) {
		app.log.error("Error: " + e.message);
	    });

	    req.end(data);
	},

	execItemREST: function(record, method, emitter, nextEvent, lastModificationDate, handle) {
	    var req = http.request(this.ir_options({id: record.dkclarinID, method: method, lastModificationDate: lastModificationDate, handle: handle}), function(res) {
	        var str = '';
		//app.log.debug("response code: ", res.statusCode);
		//app.log.debug("headers: ", JSON.stringify(res.headers));
		res.on('data', function(chunk) {
		    str += chunk;
		});
		res.on('end', function () {
		    //app.log.debug(str);
		    if(res.statusCode == 200 || res.statusCode == 450) { //failSafe to release submitted items

			var res_data = parser.toJson(str, {object: true});
		    	var newLastModificationDate = lastModificationDate;

			if(res.statusCode == 450) { 
			    if(nextEvent == "release")
				app.log.warn("Item " + record.dkclarinID + " is already submitted, trying release..");
			    else if(nextEvent == "public") {
				app.log.warn("Item " + record.dkclarinID + " is already released, it likely that no new version was made."); app.log.warn("Marking Item " + record.dkclarinID + " as completed..");
			    	newLastModificationDate = null;
			    } else
				app.log.error("Unexpected 450 error: " + str);
			} else { 
			    if(method == "resources/version-history") newLastModificationDate = res_data['escidocVersions:version-history']['escidocVersions:version'][0]['escidocVersions:timestamp']; // Obtain lastModificationDate for Item updated version
		    	    else newLastModificationDate = res_data['result']['last-modification-date'];
			}

			setTimeout(function() { 
				emitter.emit(nextEvent, record, newLastModificationDate) 
			}, 1000);
		    } else {
			error("Error occurred processing " + method + ": " + res.statusCode + "\n" + str);
		    }
		    
		});
	    })
	    .on('error', function(e) {
		app.log.error("Error: " + e.message);
	    });

	    if(lastModificationDate != "" && lastModificationDate) {
		var comment = "Test submission/release of item.";

		// Allow user to specify submit comment
		if(emitter.submitComment) 
		    comment = emitter.submitComment;

		app.log.debug("Submission comment: " + comment);
		var post = "<param last-modification-date=\"" + lastModificationDate + "\"><comment>" + comment + "</comment></param>";
	 	req.write(post);
	    }
	    req.end();
	},

	tableOutputBoolean: function(value) {
	    return (value) ? 'yes'.green : 'no'.red;
    	}
	
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
