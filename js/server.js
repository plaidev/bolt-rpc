(function() {
  var FORCE_STOP, Response, Server, StackServer, TrackServer, async, copy,
    __slice = [].slice,
    __hasProp = {}.hasOwnProperty,
    __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

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

    Response.prototype.track = function() {
      var context, track_path, _i, _ref;
      track_path = 2 <= arguments.length ? __slice.call(arguments, 0, _i = arguments.length - 1) : (_i = 0, []), context = arguments[_i++];
      if (this._tracked) {
        return;
      }
      if ((typeof context === 'string') || (context instanceof String)) {
        track_path.push(context);
        context = {};
      }
      if (track_path.length === 0) {
        return;
      }
      if (context.auto_track == null) {
        context.auto_track = true;
      }
      (_ref = this.server).track.apply(_ref, __slice.call(track_path).concat([context]));
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

    TrackServer.prototype.track = function() {
      var context, track_path, _i;
      track_path = 2 <= arguments.length ? __slice.call(arguments, 0, _i = arguments.length - 1) : (_i = 0, []), context = arguments[_i++];
      if (track_path.length === 0) {
        return;
      }
      this.server.channel.to(track_path[0]).emit(track_path.join(this.path_delimiter) + '_track', context);
    };

    TrackServer.prototype.error = function(_error) {
      this._error = _error;
      return this._error;
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
      var methodHash, path, _results;
      if (options == null) {
        options = {};
      }
      TrackServer.prototype.init.call(this, io, options);
      methodHash = this.settings.methodHash;
      _results = [];
      for (path in methodHash) {
        _results.push(this._update(path));
      }
      return _results;
    };

    StackServer.prototype.extend = function(baseServer, prefix) {
      var methodHash, path, _assign;
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
      methodHash = this.settings.methodHash;
      for (path in methodHash) {
        this._update(path);
      }
      return this;
    };

    StackServer.prototype.pre = function() {
      var args, method, path, _i, _j, _len, _len1, _ref;
      args = 1 <= arguments.length ? __slice.call(arguments, 0) : [];
      for (_i = 0, _len = args.length; _i < _len; _i++) {
        method = args[_i];
        this.settings.pres.push(method);
      }
      _ref = this.settings.methodHash;
      for (_j = 0, _len1 = _ref.length; _j < _len1; _j++) {
        path = _ref[_j];
        this._update(path);
      }
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
          } else {
            if ((_base = this.settings.methodHash)[path] == null) {
              _base[path] = [];
            }
            this.settings.methodHash[path].push(arg);
          }
          this._update(path);
        } else if (typeof arg === 'string' || arg instanceof String) {
          path = arg;
        } else {
          console.log('warning, invalid argument:', arg);
        }
      }
      return this;
    };

    StackServer.prototype._update = function(path) {
      var len, methodHash, paths, posts, pres, _i, _methods, _path, _ref, _ref1;
      paths = path.split(this.path_delimiter);
      _ref = this.settings || {}, pres = _ref.pres, methodHash = _ref.methodHash, posts = _ref.posts;
      if (pres == null) {
        pres = [];
      }
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

    return StackServer;

  })(TrackServer);

  module.exports = StackServer;

}).call(this);
