(function() {
  var FORCE_STOP, Response, Server, StackServer, TrackServer, async, copy,
    __hasProp = {}.hasOwnProperty,
    __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; },
    __slice = [].slice;

  async = require('async');

  Server = require('minimum-rpc').Server;

  copy = require('shallow-copy');

  FORCE_STOP = "FORCE_STOP";

  Response = (function() {
    function Response(server, options, _cb) {
      this.server = server;
      this.options = options;
      this._cb = _cb;
      this._tracked = this.options.disable_track ? true : false;
    }

    Response.prototype.send = function(val) {
      this.val = val;
      return this._cb(FORCE_STOP, val);
    };

    Response.prototype.json = function(val) {
      this.val = val;
      return this._cb(FORCE_STOP, val);
    };

    Response.prototype.track = function(track_path, context) {
      if (context == null) {
        context = {};
      }
      if (this._tracked) {
        return;
      }
      if (!track_path) {
        return;
      }
      if (context.auto_track == null) {
        context.auto_track = true;
      }
      this.server.track(track_path, context);
      return this._tracked = true;
    };

    return Response;

  })();

  TrackServer = (function() {
    function TrackServer(io, options) {
      var path_delimiter;
      this.io = io;
      path_delimiter = options.path_delimiter;
      this.path_delimiter = path_delimiter || '.';
      this._methods = {};
      if (this.io != null) {
        this.init(this.io, options);
      }
    }

    TrackServer.prototype.init = function(io, options) {
      var method, path, _ref, _results;
      if (options == null) {
        options = {};
      }
      if (this.io == null) {
        this.io = io;
      }
      this.server = new Server(this.io, {}, options);
      _ref = this._methods;
      _results = [];
      for (path in _ref) {
        method = _ref[path];
        _results.push(this.server.set(path, method));
      }
      return _results;
    };

    TrackServer.prototype.track = function(track_path, context) {
      if (context == null) {
        context = {};
      }
      if (!track_path) {
        return;
      }
      this.server.channel.to(track_path).emit(track_path + '_track', context);
    };

    TrackServer.prototype.set = function(path, method) {
      var self, _m;
      self = this;
      _m = function(data, options, next, socket) {
        var cb, req, res, responseOptions;
        if ('function' === typeof options) {
          socket = next;
          next = options;
          options = {};
        }
        req = copy(socket.request);
        req.end = function(cb) {
          if (!req.__ends__) {
            req.__ends__ = [];
          }
          return req.__ends__.push(cb);
        };
        req.body = req.data = data;
        req.path = path;
        req.options = options != null ? options : {};
        responseOptions = {
          disable_track: options.auto_tracked_request ? true : false
        };
        res = new Response(self, responseOptions, null);
        cb = function(err, val) {
          if (req.__ends__) {
            req.__ends__.map(function(end) {
              return end();
            });
          }
          if (err === FORCE_STOP) {
            err = null;
          }
          if (err instanceof Error) {
            if (self._error) {
              self._error(err, req, res, function(err) {
                if (err instanceof Error) {
                  err = {
                    message: err.message
                  };
                }
                return next(err, res.val);
              });
              return;
            }
            err = {
              message: err.message
            };
          }
          return next(err, res.val);
        };
        return method(req, res, cb, socket);
      };
      this._methods[path] = _m;
      if (this.server != null) {
        return this.server.set(path, _m);
      }
    };

    TrackServer.prototype.error = function(_error) {
      this._error = _error;
      return this._error;
    };

    return TrackServer;

  })();

  StackServer = (function(_super) {
    __extends(StackServer, _super);

    function StackServer(io, options) {
      this.io = io != null ? io : void 0;
      if (options == null) {
        options = {};
      }
      this.settings = {
        pres: [],
        methodHash: {},
        posts: []
      };
      StackServer.__super__.constructor.call(this, this.io, options);
    }

    StackServer.prototype.init = function(io, options) {
      if (options == null) {
        options = {};
      }
      TrackServer.prototype.init.call(this, io, options);
      return this._updateAll();
    };

    StackServer.prototype.extend = function(baseServer, prefix) {
      var _assign;
      if (prefix == null) {
        prefix = null;
      }
      if (baseServer == null) {
        return this;
      }
      _assign = (function(_this) {
        return function(self, base) {
          var methods, path, paths, _base, _ref, _results;
          self.pres = self.pres.concat(base.pres);
          _ref = base.methodHash;
          _results = [];
          for (path in _ref) {
            methods = _ref[path];
            paths = [];
            if (prefix) {
              paths.push(prefix);
            }
            if (path) {
              paths.push(path);
            }
            path = paths.join(_this.path_delimiter);
            if ((_base = self.methodHash)[path] == null) {
              _base[path] = [];
            }
            _results.push(self.methodHash[path] = self.methodHash[path].concat(methods));
          }
          return _results;
        };
      })(this);
      _assign(this.settings, baseServer.settings);
      this._updateAll();
      return this;
    };

    StackServer.prototype.use = function() {
      var arg, args, path, _base, _i, _len;
      args = 1 <= arguments.length ? __slice.call(arguments, 0) : [];
      path = '';
      for (_i = 0, _len = args.length; _i < _len; _i++) {
        arg = args[_i];
        if (arg instanceof StackServer) {
          this.extend(arg, path);
        } else if (arg instanceof Function) {
          if (arg.length === 5) {
            this.settings.posts.push(arg);
            this._updateAll();
          } else {
            if ((_base = this.settings.methodHash)[path] == null) {
              _base[path] = [];
            }
            this.settings.methodHash[path].push(arg);
            this._update(path);
          }
        } else if (typeof arg === 'string' || arg instanceof String) {
          path = arg;
        } else {
          console.log('warning, invalid argument:', arg);
        }
      }
      return this;
    };

    StackServer.prototype._updateAll = function() {
      var methodHash, path, _results;
      methodHash = this.settings.methodHash;
      _results = [];
      for (path in methodHash) {
        _results.push(this._update(path));
      }
      return _results;
    };

    StackServer.prototype._update = function(path) {
      var len, methodHash, paths, posts, pres, _i, _methods, _path, _ref, _ref1;
      paths = path.split(this.path_delimiter);
      _ref = this.settings, pres = _ref.pres, methodHash = _ref.methodHash, posts = _ref.posts;
      _methods = pres.concat((methodHash != null ? methodHash[''] : void 0) || []);
      for (len = _i = 0, _ref1 = paths.length; 0 <= _ref1 ? _i < _ref1 : _i > _ref1; len = 0 <= _ref1 ? ++_i : --_i) {
        _path = paths.slice(0, +len + 1 || 9e9).join(this.path_delimiter);
        _methods = _methods.concat((methodHash != null ? methodHash[_path] : void 0) || []);
      }
      _methods = _methods.concat(posts || []);
      return this.set(path, function(req, res, cb, socket) {
        return async.eachSeries(_methods, function(method, cb) {
          res._cb = cb;
          return method(req, res, cb, socket);
        }, cb);
      });
    };

    StackServer.prototype.pre = function() {
      var args, method, _i, _len;
      args = 1 <= arguments.length ? __slice.call(arguments, 0) : [];
      for (_i = 0, _len = args.length; _i < _len; _i++) {
        method = args[_i];
        this.settings.pres.push(method);
      }
      this._updateAll();
      return this;
    };

    return StackServer;

  })(TrackServer);

  module.exports = StackServer;

}).call(this);
