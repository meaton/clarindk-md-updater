/** 
 * Show all Session queries for this users
 *
 */
var utils = require('../utils');

var addUser = module.exports = function(app, _handle) {
    var Session = app.schema.models.Session;
    var handle = _handle, fullname = null, email = null;
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
	    app.log.error("User with same handle already belongs to Session: " + session._id);	
	else {
	    confirmNameEmail(function(_fullname, _email) { 
		// add new User and save Session
	    	app.log.info("Saving new User in Session: " + app.session._id);
	    	fullname = (_fullname != null && _fullname != "") ? _fullname : app.config.get("fullname");
	   	email = (_email != null && _email != "") ? _email : app.config.get("email");
	    	app.session.users.push({ handle: _handle, fullname: fullname, email: email });
	   	utils.saveDocument(app.session, updateConfig);
	    });	    
	}
    }

    var confirmNameEmail = function(callback) {
	// prompt for Name
	var prompt = require('prompt');

	if(app.colors.mode == "none") 
	    prompt.colors = false;

   	prompt.delimiter = " >> ";
	var description1 = "fullname:";
	var description2 = "email:";

	if(prompt.colors) {
	    description1 = description1.green;
	    description2 = description2.green;
	    prompt.message = prompt.message.magenta;
	}

 	prompt.start();
  	prompt.get({
   	    properties: {
     		fullname: {
        		description: description1 
     	    	},
		email: {
			description: description2
		}
   	    }
    	}, function (err, result) {
    	    if(result) app.log.debug("You entered: \n".magenta + "fullname: " + result.fullname.green + "\nemail: " + result.email.green);
	    if(err) app.log.error("Error: " + err);
	    callback(result.fullname, result.email);
    	});

    }

    // Update CLI configuration
    var updateConfig = function(session) {
	//TODO fix config set, use Flatiron cmd config 
	app.log.info("Updating configuration...");
	if(handle != undefined) app.config.set("escidoc_handle", handle);
	if(fullname != null) app.config.set("fullname", fullname);
	if(email != null) app.config.set("email", email);
	app.config.save(function() { app.log.info("Config set.") } );
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
