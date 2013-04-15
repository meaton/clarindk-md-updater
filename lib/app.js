var flatiron = require('flatiron'), path = require('path');

var app = module.exports = flatiron.app;

require('pkginfo')(module, 'name', 'version');

app.use(flatiron.plugins.cli, {
  version: true,
  usage: require('./usage'),
  source: path.join(__dirname, 'commands'),
  argv: {
    version: {
      alias: 'v',
      description: 'print updater version and exit',
      string: true
    },
    colors: {
      description: '--no-colors will disable output coloring',
      default: true,
      boolean: true
    },
    cql: {
      description: '--no-cql will disable using SRW and take param as ID(s) string',
      default: true,
      boolean: true
    },
    'show-data': {
	description: '--show-data will show the Metadata Record on inspection of a Query',
	default: false,
	boolean: true
    }
  }
});
