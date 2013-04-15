var path = require("path"), colors = require('colors');
var app = module.exports = require('./app');
var error = console.error;

app.started = false;
app.config.file({ file: path.join(__dirname, '..', 'data', 'config.json') });

app.use(require('flatiron-cli-config'));

app.start = function(callback) {  
  var useColors = (typeof app.argv.colors == 'undefined' || app.argv.colors);
  useColors || (colors.mode = "none");

  // --no-colors option turns off output coloring, and so does setting
  // colors: false in data/config.json
  // TODO Apply colors setting to all CLI logging and output
  if (!app.config.get('colors') || !useColors)
    colors.mode = "none";

  // init
  app.init(function (err) {
    if (err) {
      app.welcome();
      callback(err);
      return app.log.error('Error running command ' + (app.argv._.join(' ')).magenta); // TODO err handling
    }
    app.welcome();
    return app.exec(app.argv._, callback);
  });

};

app.welcome = function() {
  var fullname = app.config.get('fullname') || '';
  
  app.log.info('Welcome to ' + 'CLARIN-DK MD-Updater'.grey + ' ' + fullname.magenta);
  app.log.info('MD-Updater v' + app.version + ', node ' + process.version);
  //app.log.info('It worked if it ends with ' + 'MD-Updater'.grey + ' ok'.green.bold);

}

app.exec = function(cmd, callback) {
  function execCmd(err) {
    if (err) {
      return callback(err);
    }

    app.log.info('Executing command ' + cmd.join(' ').magenta);
    app.router.dispatch('on', cmd.join(' '), app.log, function (err) {
      if (err) {
        callback(err);
        return app.log.error('Error running command ' + (app.argv._.join(' ')).magenta); // TODO err handling
      }

      callback();
    });
  }

  return !app.started ? app.setup(execCmd) : execCmd();
};

app.setup = function(callback) {
  if(app.started === true) {
    return callback();
  }

  var commands = require('./commands');

  //TODO Fix better routes
  app.cmd(/fetch ([^\s]+) ([^\s]+)/, commands.fetch);
  app.cmd(/update ([^\s]+) ([^\s]+)/, commands.update);
  app.cmd(/submit ([^\s]+) ([^"]+)/, commands.submit); //TODO Mark completed when all items uploaded; If some items fail allow re-submission with submit
  app.cmd(/show/, commands.show); //TODO
  app.cmd(/inspect ([^\s]+)/, commands.inspect); //TODO

  //TODO LOGGING with Winston

  app.started = true;

  callback();
};

/**
 * Handles exceptions.
 */
process.on('uncaughtException', function(err) {
  error(err.message);
  process.exit(1);
});
