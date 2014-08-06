## CLARIN-DK MD-Updater

A Node.js Flatiron-CLI application to retrieve and update eSciDoc Metadata records (MD-Records) in the CLARIN-DK eSciDoc repository. 

####Requirements
* Node.js >= 0.6 (http://nodejs.org/)
* NPM (http://npmjs.org/) included with Node.js
* eSciDoc Metadata-Updater (https://github.com/escidoc/escidoc-metadata-updater)
* eSciDoc >= 1.3.x (http://www.escidoc.org)
* MongoDB (http://www.mongodb.org/)

####Installation
See https://github.com/joyent/node/wiki/Installation for installation of Node.js.
*Note NPM is packaged with latest Node.js installation.

####NPM packages install:
``npm install clarindk-md-updater`` or 
``npm install {tarball-address}``

See package.json for listed Node package dependencies.

####MongoDB installation
http://docs.mongodb.org/manual/installation/

####Usage
Run ``clarindk-md-updater help`` for usage details.

- - -

###Commands

**config** [set|get|clear] *{field} {value}*

Part of [flatiron-cli-config plugin] (https://github.com/flatiron/cli-config), enabled setting of config values in config.json. It is required to set escidoc_handle (auth), mongoose_auth (auth), targetUrl, and updaterHost/updaterPort (escidoc-metadata-updater service). Fullname and email are optional configuration settings.

**fetch** *{md-record-type} {CQL querystring}*

Fetches a set of metadata records based on a search CQL query. Alternatively, you can fetch metadata records for individual repository items using the *--no-cql* param, by ID reference. Records are stored locally in the MongoDB database by session for review and offline modification.

**show**

Shows a table of all Query’s for a user’s Session (by current *escidoc_handle* key in config).

**inspect** *{query}*

Inspects a valid Query. Shows a table of downloaded Items for the Query, and their statuses. Using --show-data option provides a prompt to view the current locally stored MD-record selected by item ID. 

**update** *{query} {change-file}*

Updates the set of metadata records for the selected query from a users session, applying a modificatin to the offline records with defined change-rules (JSON format). These changes can be reviewed with using the *inspect* command (with *--show-data* parameter) before upload and submission. All records that are successfully modified from their original are flagged. 

**submit** *{query} {comment}*

Modified results from a selected query are uploaded to eSciDoc via the eSciDoc metadata-updater service, submitted and released in a completed operation. 
Once submission is completed the query is marked as closed. Comment is required.

**addUser** *{escidoc_handle}*

Adds a new and valid User to the current Session. fullname and email values are prompted for, if left blank the current config values are used and not overwritten. New values for escidoc_handle, fullname and email are automatically set in the config.

**remove** *{query}*

Removes existing Query record and associated metadata records from the session.

- - -

###Deploying eSciDoc Metadata-Updater

An RESTful updater service to eSciDoc. Additionally provides the service of retrieving metadata records for an item, in XML-format output. The XML can be edited and an updated document can be uploaded to eSciDoc via the service. Handles the authentication process with either eSciDoc handle cookie or Basic auth login method. 
   
See https://github.com/escidoc/escidoc-metadata-updater for further details.

Deploy as locally running Jetty service or as a deployed WAR. 

Set CLI configuration appropriately, updaterHost and updaterPort parameters for the deployed MD-Updater service.

- - -

###Appendix A: Default CLI Configuration

#####Sample config file data/config.JSON:
>``
{
  "directories": {},
  "escidoc_handle": "ESCIDOC-XXXXXXX",
  "mongoose_auth": "mongodb://localhost/metadata_test",
  "targetUrl": "http://core.clarin.dk",
  “updaterHost”: “devtools.clarin.dk”,
  “updaterPort”: “80”,
  "fullname": "Mitchell Seaton",
  "email": "seaton@hum.ku.dk"
}
``

###Appendix B: Change-Rules Configuration

#####Example Change-rules JSON (override rule):
Replace the entire value selected with a new value.
>``
[{
  "change_type": "override",
  "field_position": { "olac:olac": "dc:contributor" },
  "conditions": { "olac:code": "sponsor" },
  "selector": "$t",
  "set_value": "DK-CLARIN"
},
{
  "change_type": "override",
  "field_position": { "olac:olac": "dc:subject" },
  "selector": "$t",
  "set_value": "unspecified"
}]
``

#####Example Change-rules JSON (addition rule):
Add a new Metadata element to the record, including defined attributes and text value.
>``
[{
  "change_type":"addition",
  "field_position":{
     "olac:olac":"dc:contributor"
  },
  "properties":{
     "xmlns:dc":"http://purl.org/dc/elements/1.1/",
     "olac:code":"depositor",
     "xsi:type":"olac:role",
     "$t":"dsn.dk"
  }
}]
``

#####Example Change-rules JSON (replace rule):
Match and replace a string from the selected value and replace the first match found with the new value. Regular Expressions may be used also, and for global replacement.

>``
[{ 
  "change_type":"addition",
  "field_position":{
     "olac:olac":"dc:contributor"
  },
  "conditions": {
     "olac:code": "sponsor", 
     "$match": "DK-CLARIN" 
  }, 
  "selector": "$t", 
  "set_value": "cst.ku.dk"
}]
``
