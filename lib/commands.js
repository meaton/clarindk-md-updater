var commands = module.exports;
var app = require('./app');
app.mg = require('mongoose');

// TODO: test for mg auth in config
var db = app.mg.connect(app.config.get('mongoose_auth'));
app.schema = require('./schema');

/**
 * Makes a request to eSciDoc to fetch MD Record(s) 
 * 
 * @param {string} CQL query string
 * @param {string} Metadata Record name 
 *
 */

// TODO: test for escidoc handle in config
commands.handle = app.config.get('escidoc_handle');

commands.fetch = function(metadata_name, search_query) {
    app.log.info("Running fetch..."); 
    app.log.info("Using query: " + search_query);
    app.log.info("Using Metadata Record type: " + metadata_name);
    var fetch = require('./commands/fetch')(app, search_query, metadata_name);
};

/**
 * Perform an update on a set of records
 *
 * @param {string} Query identifier
 * @param {string} Path to JSON change rule file
 *
 */
commands.update = function(query, change_json_file) {
    app.log.info("Running update...");
    //TODO: Error handling when no query param
    var update = require('./commands/update')(app, query, change_json_file);
};

/**
 * Submit and release changes made to a Query result-set.
 * 
 * @param {string} Query identifier
 */
commands.submit = function(query, comment) {
    app.log.info("Preparing to upload and submit changes...");
    //TODO: Error handling when no query param
    var submit = require('./commands/submit')(app, query, comment);
};

/**
 * Show for my session what queries I have made
 *
 * TODO: Show by email address? or just for escidoc_handle
 * TODO: Switch to another Session based on user.email auth
 * 
 */
commands.show = function() {
    app.log.info("Showing current Queries for user session: " + commands.handle.magenta);
    var update = require('./commands/show')(app);
};

/**
 * Inspect or view a Query and its result set (MdRecords).
 * 
 * @param {string} Query identifier
 * 
 */
commands.inspect = function(query) {
    //TODO: Error handling when no query param
    var inspect = require('./commands/inspect')(app, query);
};

/**
 * 
 * @param {string} Query identifier
 * 
 */
commands.addUser = function(escidoc_handle, fullname, email) {
    //TODO: Error handling when no query param
    app.log.debug("addUser handle: " + escidoc_handle);
    app.log.debug("addUser fullname: " + fullname);
    app.log.debug("addUser email: " + email);
    var addUser = require('./commands/addUser')(app, escidoc_handle, fullname, email);
};


