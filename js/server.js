(function() {
  var DEFAULT_SUB_NAME_SPACE, FORCE_STOP, Response, Server, StackServer, async, copy,
    __slice = [].slice;

  async = require('async');

  Server = require('minimum-rpc').Server;

  copy = require('shallow-copy');

  DEFAULT_SUB_NAME_SPACE = '__';

  FORCE_STOP = "FORCE_STOP";

  Response = (function() {
    function Response(_cb) {
      this._cb = _cb;
    }

    Response.prototype.send = function(val) {
      this.val = val;
      return this._cb(FORCE_STOP, val);
    };

    Response.prototype.json = function(val) {
      this.val = val;
      return this._cb(FORCE_STOP, val);
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
        DEFAULT_SUB_NAME_SPACE: {
          pres: [],
          methodHash: {},
          posts: []
        }
      };
      if (this.io != null) {
        this.init(this.io, options);
      }
    }

    StackServer.prototype.init = function(io, options) {
      var methodHash, path, pres, sub_name_space, _ref, _ref1, _results;
      this.io = io;
      if (options == null) {
        options = {};
      }
      this.server = new Server(this.io, {}, options);
      _ref = this.settings;
      _results = [];
      for (sub_name_space in _ref) {
        _ref1 = _ref[sub_name_space], pres = _ref1.pres, methodHash = _ref1.methodHash;
        _results.push((function() {
          var _results1;
          _results1 = [];
          for (path in methodHash) {
            _results1.push(this._update(sub_name_space, path));
          }
          return _results1;
        }).call(this));
      }
      return _results;
    };

    StackServer.prototype.extend = function(baseServer, prefix) {
      var base, methodHash, path, sub_name_space, _assign, _base, _ref, _ref1, _results;
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
      _ref = baseServer.settings;
      for (sub_name_space in _ref) {
        base = _ref[sub_name_space];
        if ((_base = this.settings)[sub_name_space] == null) {
          _base[sub_name_space] = {
            pres: [],
            methodHash: {},
            posts: []
          };
        }
        _assign(this.settings[sub_name_space], base);
      }
      this._error = null;
      _ref1 = this.settings;
      _results = [];
      for (sub_name_space in _ref1) {
        methodHash = _ref1[sub_name_space].methodHash;
        _results.push((function() {
          var _results1;
          _results1 = [];
          for (path in methodHash) {
            _results1.push(this._update(sub_name_space, path));
          }
          return _results1;
        }).call(this));
      }
      return _results;
    };

    StackServer.prototype.track = function(track_path, data, track_name_space) {
      if (track_name_space == null) {
        track_name_space = DEFAULT_SUB_NAME_SPACE;
      }
      return this.server.channel.to(track_name_space).emit(track_name_space + '.' + track_path + '_track', data);
    };

    StackServer.prototype.error = function(_error) {
      this._error = _error;
      return this._error;
    };

    StackServer.prototype.ns = function(sub_name_space) {
      return {
        pre: (function(_this) {
          return function() {
            var args;
            args = 1 <= arguments.length ? __slice.call(arguments, 0) : [];
            return _this.pre.apply(_this, [{
              sub_name_space: sub_name_space
            }].concat(__slice.call(args)));
          };
        })(this),
        use: (function(_this) {
          return function() {
            var args;
            args = 1 <= arguments.length ? __slice.call(arguments, 0) : [];
            return _this.use.apply(_this, [{
              sub_name_space: sub_name_space
            }].concat(__slice.call(args)));
          };
        })(this)
      };
    };

    StackServer.prototype.pre = function() {
      var args, method, path, sub_name_space, _base, _i, _j, _len, _len1, _ref, _results;
      args = 1 <= arguments.length ? __slice.call(arguments, 0) : [];
      sub_name_space = null;
      if (!(args[0] instanceof Function)) {
        if (args[0]) {
          sub_name_space = args[0].sub_name_space;
        }
        args = args.slice(1);
      }
      if (sub_name_space == null) {
        sub_name_space = DEFAULT_SUB_NAME_SPACE;
      }
      if ((_base = this.settings)[sub_name_space] == null) {
        _base[sub_name_space] = {
          pres: [],
          methodHash: {},
          posts: []
        };
      }
      for (_i = 0, _len = args.length; _i < _len; _i++) {
        method = args[_i];
        this.settings[sub_name_space].pres.push(method);
      }
      _ref = this.settings[sub_name_space].methodHash;
      _results = [];
      for (_j = 0, _len1 = _ref.length; _j < _len1; _j++) {
        path = _ref[_j];
        _results.push(this._update(sub_name_space, path));
      }
      return _results;
    };

    StackServer.prototype.use = function() {
      var args, method, path, sub_name_space, _base, _base1, _i, _len;
      args = 1 <= arguments.length ? __slice.call(arguments, 0) : [];
      sub_name_space = null;
      path = null;
      if (!(args[0] instanceof StackServer) && !(args[0] instanceof Function) && !(typeof args[0] === 'string' || args[0] instanceof String)) {
        if (args[0]) {
          sub_name_space = args[0].sub_name_space;
        }
        args = args.slice(1);
      }
      if (typeof args[0] === 'string' || args[0] instanceof String) {
        if (args[0]) {
          path = args[0];
        }
        args = args.slice(1);
      }
      if (sub_name_space == null) {
        sub_name_space = DEFAULT_SUB_NAME_SPACE;
      }
      if (path == null) {
        path = '';
      }
      if ((_base = this.settings)[sub_name_space] == null) {
        _base[sub_name_space] = {
          pres: [],
          methodHash: {},
          posts: []
        };
      }
      for (_i = 0, _len = args.length; _i < _len; _i++) {
        method = args[_i];
        if (method instanceof StackServer) {
          this.extend(method, path);
        } else if (method.length === 5) {
          this.settings[sub_name_space].posts.push(method);
        } else {
          if ((_base1 = this.settings[sub_name_space].methodHash)[path] == null) {
            _base1[path] = [];
          }
          this.settings[sub_name_space].methodHash[path].push(method);
        }
      }
      return this._update(sub_name_space, path);
    };

    StackServer.prototype._update = function(sub_name_space, path) {
      var len, methodHash, paths, posts, pres, self, _i, _m, _methods, _path, _ref, _ref1;
      if (this.server == null) {
        return;
      }
      self = this;
      _ref = this.settings[sub_name_space], pres = _ref.pres, methodHash = _ref.methodHash, posts = _ref.posts;
      paths = path.split(this.path_delimiter);
      _methods = pres.concat(methodHash[''] || []);
      for (len = _i = 0, _ref1 = paths.length; 0 <= _ref1 ? _i < _ref1 : _i > _ref1; len = 0 <= _ref1 ? ++_i : --_i) {
        _path = paths.slice(0, +len + 1 || 9e9).join(this.path_delimiter);
        _methods = _methods.concat(methodHash[_path] || []);
      }
      _methods = _methods.concat(posts);
      _m = function(data, options, next, socket) {
        var req, res, series;
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
        res = new Response();
        series = [];
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
      return this.server.set(path, _m, sub_name_space);
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
