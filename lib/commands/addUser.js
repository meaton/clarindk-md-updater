/** 
 * Show all Session queries for this users
 *
 */
var utils = require('../utils');

var addUser = module.exports = function(app, _handle, _fullname, _email) {
    var Session = app.schema.models.Session;

    var openSession = function(session, callback) {
	app.session = session;
	callback();
    }

    /** Add new User to Session with new handle **/
    var addNewUser = function() {
	if(_handle != null || _handle != undefined)
	    Session.findByHandle(_handle, confirmNewUser);
    }

    var confirmNewUser = function(err, session) {
	if(err) app.log.error("Error: " + err);
	if(session != null)
	    app.log.error("User with same handle already belongs to a Session: " + session._id);	
	else {
	// add new User and save Session
	    app.log.info("Saving new User in Session: " + app.session._id);
	    var fullname = (_fullname != undefined) ? _fullname : app.config.get("fullname");
	    var email = (_email != undefined) ? _email : app.config.get("email");
	    app.session.users.push({ handle: _handle, fullname: fullname, email: email });
	    utils.saveDocument(app.session, updateConfig);
	}
    }

    // Update CLI configuration
    var updateConfig = function(session) {
	//TODO fix config set
	app.log.info("Updating configuration...");
	if(_handle != undefined) app.config.set("escidoc_handle", _handle);
	if(_fullname != undefined) app.config.set("fullname", _fullname);
	if(_email != undefined) app.config.set("email", _email);
	app.log.info("Config set.");
    }

    // check Session exists for User(escidoc_handle)?
    utils.getSession(Session, function(err,res) {
        if(!err)
   	    if(res != null) openSession(res, addNewUser);
 	    else app.log.error("No valid Session exists for set handle: " + handle);
    	else
	    app.log.error("Error opening Session:", err);
    });

}
