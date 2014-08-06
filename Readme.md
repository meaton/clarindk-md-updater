## CLARIN-DK MD-Updater

A Node.js Flatiron-CLI application to retrieve and update eSciDoc Metadata records (MD-Records) in the CLARIN-DK eSciDoc repository. 

####Requirements
* Node.js >= 0.6 (http://nodejs.org/)
* NPM (http://npmjs.org/) included with Node.js
* eSciDoc MD-Updater (https://github.com/escidoc/escidoc-metadata-updater)
* eSciDoc >= 1.3.x (http://www.escidoc.org)
* MongoDB (http://www.mongodb.org/)

####Installation
See https://github.com/joyent/node/wiki/Installation for installation of Node.js.
*Note NPM is packaged with latest Node.js installation.

####NPM packages install:
``npm install clarindk-md-updater`` or 
``npm install {tarball-address}``

See package.json for listed Node package dependencies

####MongoDB installation
http://docs.mongodb.org/manual/installation/

####Usage
Run ``clarindk-md-updater help`` for usage details.

- - -

###Commands
**config** [set|get|clear] *{field} {value}*

Part of flatiron-cli-config plugin for flatiron, enabled setting of config values in config.json. It is required to see escidoc_handle (auth), mongoose_auth (auth), targetUrl, and updaterHost/updaterPort (escidoc-md-updater service). Fullname and email are optional configuration values (currently unused).

**fetch** *{md-record-type} {CQL querystring}*

Fetches a set of MD-records based on search CQL query. Alternatively, you can fetch MD-records for individual itemIDs using --no-cql param. Records are stored locally by session for review and modification. The CQL querystring can be obtained by a CQL page on clarin.dk and copy-to-clipboard button.

**show**

Shows a table of all Query’s for a user’s session (by current escidoc_handle key in config).

**inspect** *{query}*

Inspects a valid Query. Shows a table of downloaded Items for the Query, and their statuses. Using --show-data option provides a prompt to view the current locally stored MD-record selected by item ID. 

**update** *{query} {change-file}*

Updates the set of MD-records for the selected query from a users session, applying a change locally with defined change-rules (JSON format). These changes can be reviewed with inspect (--show-data) before submission. All records that are successfully modified are flagged so. 

**submit** *{query} {comment}*

Locally modified results from a selected query are uploaded to eSciDoc via the eSciDoc MD-updater service, submitted and released in a completed operation. 
Once submission is completed the query is marked as closed. Comment is required.

**addUser** *{escidoc_handle}*

Adds a new and valid User to the current Session. fullname and email values are prompted for, if left blank the config values are used. New values for escidoc_handle, fullname and email are automatically set in the config.

**remove** *{query}*

Removes existing query record and associated metadata records from the session.

- - -

###Deploying eSciDoc MD-Updater
An RESTful updater service to eSciDoc. Additionally provides the service of retrieving MD-records for an item, in XML-format output. The XML can be edited and an updated document can be uploaded to eSciDoc via the service. Handles the authentication process with either eSciDoc handle cookie or Basic auth login method. 
   
See https://github.com/escidoc/escidoc-metadata-updater for further details.

Deploy as locally running Jetty service or as a deployed WAR. 

Set CLI configuration appropriately, updaterHost and updaterPort parameters for the deployed MD-Updater service.

- - -

###Appendix A: Default CLI Configuration

#####Sample config file data/config.JSON:
``
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

Available change-rule types include “override”, “addition” and "replace".

#####Sample Change-rules JSON (override rule):
``
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

#####Sample Change-rules JSON (addition rule):
``
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
