var EventEmitter = require('events').EventEmitter;
var util = require('util');
var urlResolve = require('url').resolve;
var _ = require('underscore');
var request = require('superagent');
var ga = require('../lib/googleanalytics.js');

var STORAGE_KEY = 'TEACH_API_LOGIN_INFO';

function generateRandom(charnum) {
  charnum = charnum || 12;
  var character = String.fromCharCode(0x41 + Math.random() * 25);
  var tail = charnum===1 ? '' : generateRandom(charnum-1);
  return (Math.random() > 0.5 ? character.toLowerCase() : character.toUpperCase()) + tail;
};

function autobind(obj) {
  var prototypes = [].slice.call(arguments, 1);
  prototypes.forEach(function(prototype) {
    Object.keys(prototype).filter(function(propName) {
      return typeof obj[propName] == 'function';
    }).forEach(function(methodName) {
      obj[methodName] = obj[methodName].bind(obj);
    });
  });
}

function TeachAPI(options) {
  options = options || {};

  autobind(this, TeachAPI.prototype, EventEmitter.prototype);

  this.baseURL = options.baseURL || TeachAPI.getDefaultURL();
  this.storage = options.storage || (
    process.browser ? window.sessionStorage : {}
  );
  this._clubs = [];
}

TeachAPI.getDefaultURL = function() {
  return process.env.TEACH_API_URL || 'https://teach-api.herokuapp.com';
};

util.inherits(TeachAPI, EventEmitter);

_.extend(TeachAPI.prototype, {
  logout: function() {
    delete this.storage[STORAGE_KEY];
    this.emit('username:change', null);
    this.emit('logout');
  },
  getLoginInfo: function() {
    try {
      return JSON.parse(this.storage[STORAGE_KEY]);
    } catch (e) {
      return null;
    }
  },
  getUsername: function() {
    var info = this.getLoginInfo();
    return info && info.username;
  },

  // The first half of the oauth2 login work flow:
  //
  // Form an oauth2 URL that users can be redirected to, which will eventually
  // lead to continueLogin being called when the oauth2 service is done handling
  // the authentication and remote login of the user.
  startLogin: function() {
    var state = generateRandom();
    window.sessionStorage['oauth2_token'] = state;
    var queryArguments = {
      client_id: "test",
      response_type: "code",
      scopes: "user",
      state: state
    };
    query = Object.keys(queryArguments).map(function(key) {
      return key + '=' + queryArguments[key];
    }).join('&');

    // We redirect the user to the oauth2 login service on id.webmaker.org, which
    // will take care off the magic for us. This will eventually call us back by
    // redirecting the user back to teach.wmo/oauth2/callback, which is a page that
    // can accept login credentials, compare the token to the one we saved to
    // window.sessionStorage['oauth2_token'], and then call the teach-API for local
    // log in to the actual teach-relevant bits of the site.

    var host = 'https://id.webmaker.org/login/oauth/authorize';
    window.location = host + '?' + query;
  },

  // The second half of the oauth2 work flow:
  //
  // This function is used to process the oauth2 login callback, when the login
  // server on id.wmo redirects to teach.wmo/oauth2/callback
  continueLogin: function() {
    // grab the url parameters sent by the oauth2 service
    var params = {};
    window.location.search.replace('?','').split('&').forEach(function(v) {
      var terms = key.split('=');
      params[terms[0]] = terms[1];
    });

    // for the oauth callback, there are three values we are interested in:
    var client_id = params['client_id'];
    var code      = params['code'];
    var state     = params['state'];

    // foremost, the client_id and "state" value (which we invented during startLogin)
    // needs to match. Otherwise, this is not a genuine callback.
    if(client_id === "test" && state === window.sessionStorage['oauth2_token']) {
      
        // genuine call: we now call the teach-api with this information so that
        // it can do server <-> server communication with id.wmo to verify that 
        // the code that we got in the callback is indeed a real auth code.

        request
        .post(this.baseURL + '/auth')
        .type('form')
        .send({ code: code })
        .end(function(err, res) {
          if (err) {
            err.hasNoWebmakerAccount = (
              err.response && err.response.forbidden &&
              err.response.text == 'invalid authorization code'
            );
            return this.emit('login:error', err);
          }
          // TODO: Handle a thrown exception here.
          this.storage[STORAGE_KEY] = JSON.stringify(res.body);
          this.emit('username:change', res.body.username);
          this.emit('login:success', res.body);
        }.bind(this));
    }

    // cleanup after login, regardless of whether it succeeded or not
    window.sessionStorage['oauth2_token'] = false;
    delete window.sessionStorage['oauth2_token'];
  },

  request: function(method, path) {
    var info = this.getLoginInfo();
    var url = urlResolve(this.baseURL, path);
    var req = request(method, url);

    if (info && info.token) {
      if (url.indexOf(this.baseURL + '/') === 0) {
        req.set('Authorization', 'Token ' + info.token);
      } else {
        console.warn('Teach API base URL is ' + this.baseURL +
                     ' which is at a different origin from ' +
                     url + '. Not sending auth token.');
      }
    }

    return req;
  },
  getClubs: function() {
    return this._clubs;
  },
  updateClubs: function(callback) {
    callback = callback || function () {};
    return this.request('get', '/api/clubs/')
      .accept('json')
      .end(function(err, res) {
        if (err) {
          return callback(err);
        }
        this._clubs = res.body;
        this.emit('clubs:change', res.body);
        callback(null, res.body);
      }.bind(this));
  },
  addClub: function(club, callback) {
    callback = callback || function () {};
    return this.request('post', '/api/clubs/')
      .send(club)
      .accept('json')
      .end(function(err, res) {
        if (err) {
          return callback(err);
        }
        this.updateClubs();
        ga.event({ category: 'Clubs', action: 'Added a Club' });
        callback(null, res.body);
      }.bind(this));
  },
  changeClub: function(club, callback) {
    callback = callback || function () {};
    return this.request('put', club.url)
      .send(club)
      .accept('json')
      .end(function(err, res) {
        if (err) {
          return callback(err);
        }
        this.updateClubs();
        ga.event({ category: 'Clubs', action: 'Edited a Club' });
        callback(null, res.body);
      }.bind(this));
  },
  deleteClub: function(url, callback) {
    callback = callback || function () {};
    return this.request('delete', url)
      .accept('json')
      .end(function(err, res) {
        if (err) {
          return callback(err);
        }
        this.updateClubs();
        ga.event({ category: 'Clubs', action: 'Deleted a Club' });
        callback(null);
      }.bind(this));
  }
});

module.exports = TeachAPI;
