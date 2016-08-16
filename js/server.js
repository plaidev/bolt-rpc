(function() {
  var FORCE_STOP, Response, Server, StackServer, async, copy,
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

  StackServer = (function() {
    function StackServer(io, options) {
      var path_delimiter;
      this.io = io != null ? io : void 0;
      if (options == null) {
        options = {};
      }
      path_delimiter = options.path_delimiter;
      this.path_delimiter = path_delimiter || '.';
      this.settings = {
        pres: [],
        methodHash: {},
        posts: []
      };
      if (this.io != null) {
        this.init(this.io, options);
      }
    }

    StackServer.prototype.init = function(io, options) {
      var methodHash, path, _results;
      this.io = io;
      if (options == null) {
        options = {};
      }
      this.server = new Server(this.io, {}, options);
      methodHash = this.settings.methodHash;
      _results = [];
      for (path in methodHash) {
        _results.push(this._update(path));
      }
      return _results;
    };

    StackServer.prototype.extend = function(baseServer, prefix) {
      var methodHash, path, _assign, _results;
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
      this._error = null;
      methodHash = this.settings.methodHash;
      _results = [];
      for (path in methodHash) {
        _results.push(this._update(path));
      }
      return _results;
    };

    StackServer.prototype.track = function() {
      var context, track_path, _i;
      track_path = 2 <= arguments.length ? __slice.call(arguments, 0, _i = arguments.length - 1) : (_i = 0, []), context = arguments[_i++];
      if (track_path.length === 0) {
        return;
      }
      return this.server.channel.to(track_path[0]).emit(track_path.join(this.path_delimiter) + '_track', context);
    };

    StackServer.prototype.error = function(_error) {
      this._error = _error;
      return this._error;
    };

    StackServer.prototype.pre = function() {
      var args, method, path, _i, _j, _len, _len1, _ref, _results;
      args = 1 <= arguments.length ? __slice.call(arguments, 0) : [];
      for (_i = 0, _len = args.length; _i < _len; _i++) {
        method = args[_i];
        this.settings.pres.push(method);
      }
      _ref = this.settings.methodHash;
      _results = [];
      for (_j = 0, _len1 = _ref.length; _j < _len1; _j++) {
        path = _ref[_j];
        _results.push(this._update(path));
      }
      return _results;
    };

    StackServer.prototype.use = function() {
      var arg, args, path, _base, _i, _len, _results;
      args = 1 <= arguments.length ? __slice.call(arguments, 0) : [];
      path = '';
      _results = [];
      for (_i = 0, _len = args.length; _i < _len; _i++) {
        arg = args[_i];
        if (arg instanceof StackServer) {
          _results.push(this.extend(arg, path));
        } else if (arg instanceof Function) {
          if (arg.length === 5) {
            this.settings.posts.push(arg);
          } else {
            if ((_base = this.settings.methodHash)[path] == null) {
              _base[path] = [];
            }
            this.settings.methodHash[path].push(arg);
          }
          _results.push(this._update(path));
        } else if (typeof arg === 'string' || arg instanceof String) {
          _results.push(path = arg);
        } else {
          _results.push(console.log('warning, invalid argument:', arg));
        }
      }
      return _results;
    };

    StackServer.prototype._update = function(path) {
      var paths, self, _m;
      if (this.server == null) {
        return;
      }
      self = this;
      paths = path.split(this.path_delimiter);
      _m = (function(_this) {
        return function(data, options, next, socket) {
          var len, methodHash, posts, pres, req, res, responseOptions, series, _i, _methods, _path, _ref, _ref1;
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
          series = [];
          _ref = _this.settings || {}, pres = _ref.pres, methodHash = _ref.methodHash, posts = _ref.posts;
          if (pres == null) {
            pres = [];
          }
          _methods = pres.concat((methodHash != null ? methodHash[''] : void 0) || []);
          for (len = _i = 0, _ref1 = paths.length; 0 <= _ref1 ? _i < _ref1 : _i > _ref1; len = 0 <= _ref1 ? ++_i : --_i) {
            _path = paths.slice(0, +len + 1 || 9e9).join(_this.path_delimiter);
            _methods = _methods.concat((methodHash != null ? methodHash[_path] : void 0) || []);
          }
          _methods = _methods.concat(posts || []);
          return async.eachSeries(_methods, function(method, cb) {
            res._cb = cb;
            return method(req, res, cb, socket);
          }, function(err, val) {
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
          });
        };
      })(this);
      return this.server.set(path, _m);
    };

    StackServer.prototype.setupServer = function() {
      var args;
      args = 1 <= arguments.length ? __slice.call(arguments, 0) : [];
      return this.init.apply(this, args);
    };

    return StackServer;

  })();

  module.exports = StackServer;

}).call(this);
