# CLARIN-DK MD-Updater

A Node.js Flatiron-CLI application to retrieve and update eSciDoc Metadata records (MD-Records) in the CLARIN-DK eSciDoc repository. 

Current version: (v. 0.1.0)
Node.js dependencies: See package.json for listed package dependencies
Git repo: https://github.com/meaton/clarindk-md-updater.git

###Requirements
* Node.js >= 0.6 (http://nodejs.org/)
* NPM (http://npmjs.org/) included with Node.js
* eSciDoc MD-Updater (https://github.com/escidoc/escidoc-metadata-updater)
* eSciDoc >= 1.3.x (http://www.escidoc.org)
* MongoDB (http://www.mongodb.org/)

###Installation
See https://github.com/joyent/node/wiki/Installation for installation of Node.js.
*Note NPM is packaged with latest Node.js installation.

###NPM packages install:
``npm install clarindk-md-updater`` or 
``npm install {tarball-address}``

###MongoDB installation
http://docs.mongodb.org/manual/installation/

###Usage
Run ``clarindk-md-updater help`` for usage details.

- - -

##Commands Outline
a. config set/get/clear {field} {value}
Part of flatiron-cli-config plugin for flatiron, enabled setting of config values in config.json. It is required to see escidoc_handle (auth), mongoose_auth (auth), targetUrl, and updaterHost/updaterPort (escidoc-md-updater service). Fullname and email are optional configuration values (currently unused).

b. fetch {md-record-type} {CQL querystring}
Fetches a set of MD-records based on search CQL query. Alternatively, you can fetch MD-records for individual itemIDs using --no-cql param. Records are stored locally by session for review and modification. The CQL querystring can be obtained by a CQL page on clarin.dk and copy-to-clipboard button.

c. show
Shows a table of all Query’s for a user’s session (by current escidoc_handle key in config).

d. inspect {query}
Inspects a valid Query. Shows a table of downloaded Items for the Query, and their statuses. Using --show-data option provides a prompt to view the current locally stored MD-record selected by item ID. 

e. update {query} {change-file}
Updates the set of MD-records for the selected query from a users session, applying a change locally with defined change-rules (JSON format). These changes can be reviewed with inspect (--show-data) before submission. All records that are successfully modified are flagged so. 

f. submit {query} {comment}
Locally modified results from a selected query are uploaded to eSciDoc via the eSciDoc MD-updater service, submitted and released in a completed operation. 
Once submission is completed the query is marked as closed. Comment is required.

g. addUser {escidoc_handle}
Adds a new and valid User to the current Session. fullname and email values are prompted for, if left blank the config values are used. New values for escidoc_handle, fullname and email are automatically set in the config.

h. remove {query}
Removes existing query and md records from session.

- - -

##Deploying eSciDoc MD-Updater
An RESTful updater service to eSciDoc. Additionally provides the service of retrieving MD-records for an item, in XML-format output. The XML can be edited and an updated document can be uploaded to eSciDoc via the service. Handles the authentication process with either eSciDoc handle cookie or Basic auth login method. 
   
See https://github.com/escidoc/escidoc-metadata-updater for further details.

Deploy as locally running Jetty service or as packaged deployed WAR. 

Set CLI configuration appropriately. 
For production use, updaterHost and updaterPort should be set to devtools.clarin.dk and 80 respectively in the updater config.

##Expected CLARIN-DK MD-Updater Workflow Case

a. Login to eScidoc/clarin.dk (normal login), and then obtain handle (token string) from the Tools integration page and integerere væktøj section and select the first url in the paragraph. 
Copy escidoc_handle from the address bar and set in your configuration with config set cmd.

Example escidoc_handle token: ESCIDOC-zm8m7GLKOr1368610629766 
Example url: https://clarin.dk/tools/register?handle=ESCIDOC-zm8m7GLKOr1368610629766

``./updater config set escidoc_handle ESCIDOC-AB7p48kumk1368611407725``

\* handle url parameter value is the eSciDoc user handle

b. Check and confirm other configuration settings: updaterHost, updaterPort, targetUrl, mongoose_auth, etc.
``./updater config set {key} {value}``
``./updater config get {key}``

See default config file below for keys to reference
   path: data/config.json     \* default config for production
``
{
  "directories": {},
  "escidoc_handle": "ESCIDOC-kBwIAYWLh91366106047304",
  "mongoose_auth": "mongodb://localhost/metadata_test",
  "targetUrl": "http://core.clarin.dk",
  "updaterHost": "devtools.clarin.dk",
  "updaterPort": "80",
  "fullname": "Mitchell Seaton",
  "email": "seaton@hum.ku.dk",
  "colors": true
}
``

c. Test a search Query using clarin.dk Web Search* and obtain CQL query with the CQL page (devtools) by changing the address and use the Copy to Clipboard button.

http://devtools.clarin.dk/clarindk/list.jsp?check_list_text=on&check_list_access_public=on&check_list_access_academic=on&check_list_access_restricted=on&fullsearch=&fullsearch-hidden=Title%2CPublisher%2CCreator%2CDescription%2CSource+title%2CSubject&metadata-1=Subject&equals-1=%3D&searchtext-1=Sundhed+og+medicin

Change list.jsp to cql.jsp in the address (location) bar of the browser and keep all url paramaters (ie the part from ‘?’ onwards)

http://devtools.clarin.dk/clarindk/cql.jsp?check_list_text=on&check_list_access_public=on&check_list_access_academic=on&check_list_access_restricted=on&fullsearch=&fullsearch-hidden=Title%2CPublisher%2CCreator%2CDescription%2CSource+title%2CSubject&metadata-1=Subject&equals-1=%3D&searchtext-1=Sundhed+og+medicin

Press the Copy to Clipboard button to put the CQL query string on the computer’s clipboard (same as ctrl-C on the selected text).

Example CQL string:
``(CMD.Components.olac.conformsTo exact TEIP5DKCLARIN OR CMD.Components.olac.conformsTo exact TEIP5) AND (property.context.objid exact dkclarin:8001 OR property.context.objid exact dkclarin:8003 OR property.context.objid exact dkclarin:8002) AND (CMD.Components.olac.subject = "Sundhed+og+medicin" )``

d. Use the updater program to retrieve resources defined by a search CQL query or a set of resource IDs for a defined MD-record types (olac or CMD) using the fetch cmd.

Obtain CQL query string via CQL jsp page on clarin.dk (see the previous step) and paste the query string with the command as below.

Available MD-record types are olac and CMD (case-sensitive).

``./updater fetch olac "(CMD.Components.olac.conformsTo exact TEIP5DKCLARIN OR CMD.Components.olac.conformsTo exact TEIP5) AND (property.context.objid exact dkclarin:8001 OR property.context.objid exact dkclarin:8003 OR property.context.objid exact dkclarin:8002) AND (CMD.Components.olac.subject = "Sundhed+og+medicin" )"``

\* *Important* \* Remember the double-quotes around CQL query string

e. Review downloaded MD-record data with the inspect cmd.

Obtain and copy Query ID (example: 519362503153feda3d000002) from the logging output of fetch cmd or show cmd

``./updater show``

Lists all the Queries for your current Session and if they are modified or completed.

``./updater inspect --show-data 519362503153feda3d000002``

--show-data provides prompt to enter an Item ID for printing the output of the metadata record for the Item.

If using --show-data, enter an item ID from the displayed table and press ENTER to obtain a printout of the metadata record for inspection.
Note: $t means the text node or text value.

f. Apply appropriate changes to the MD-records with the update cmd and JSON change-rules.

``./updater update 519362503153feda3d000002 conf/rules.json``

\* rules.json contains the change rules to be applied

Available change_type values are: “override” and “addition”.

See conf/examples directory for example JSON rule sets.

g. Review local changes with the inspect cmd.

``./updater inspect --show-data 519362503153feda3d000002``

h. Make submission of changes to eSciDoc with the submit cmd and with a submission comment.

\* *Important* \* Remember to save the Query ID and the Session user handle (escidoc_handle) used with any submission in a spreadsheet document. This is useful information to revert errors made.

``./updater submit 519362503153feda3d000002 "Submit comment"``

i. Review released version of an example item(s) on the clarin.dk website; Check for an updated search index.

j. Add a new User to retain the current Session after a User’s escidoc_handle has expired.

``./updater addUser ESCIDOC-9lPyZkVanE1368617267556``

A typically scenario may involve queries being created and some days later an edit and/or submission to be completed. The addUser cmd enabled you to maintain the current session by adding a new valid and logged on eSciDoc/clarin.dk User. 
Final workflow notes:
\* Only CMD metadata record is currently used with most Web Search form and query fields.

- - -

##Appendix A: Default CLI Configuration

Sample config file data/config.JSON:
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

##Appendix B: Change-Rules Configuration 
Available change-rule types include “override” and “addition”.

###Sample Change-rules JSON (override rule):
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

###Sample Change-rules JSON (addition rule):
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
