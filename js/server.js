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
      this._tracked = this.options.auto_track === true;
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
      this.io = io;
      this._methods = {};
      this._track_id = 0;
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
      if (!track_path) {
        return;
      }
      if (!(context instanceof Object)) {
        context = {};
      }
      if (context.track_id == null) {
        context.track_id = this._track_id + 1;
      }
      this._track_id = context.track_id;
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
          auto_track: options != null ? options.auto_track : void 0
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
                if (err === FORCE_STOP) {
                  err = null;
                }
                if (err instanceof Error) {
                  err = {
                    message: err.message
                  };
                }
                return next(err, res.val);
              }, socket);
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
      if (_error != null) {
        this._error = _error;
      }
      return this._error;
    };

    return TrackServer;

  })();

  StackServer = (function(_super) {
    __extends(StackServer, _super);

    function StackServer(io, options) {
      var path_delimiter;
      this.io = io != null ? io : void 0;
      if (options == null) {
        options = {};
      }
      path_delimiter = options.path_delimiter;
      this.path_delimiter = path_delimiter || '/';
      this._nodes = [];
      this.settings = {
        pres: []
      };
      this._errorHandlers = [];
      StackServer.__super__.constructor.call(this, this.io, options);
      this.error((function(_this) {
        return function(err, req, res, cb, socket) {
          if (_this._errorHandlers.length === 0) {
            return cb(err);
          }
          return async.eachSeries(_this._errorHandlers, function(method, next) {
            res._cb = next;
            return method(err, req, res, next, socket);
          }, cb);
        };
      })(this));
    }

    StackServer.prototype.init = function(io, options) {
      if (options == null) {
        options = {};
      }
      TrackServer.prototype.init.call(this, io, options);
      return this._update();
    };

    StackServer.prototype.use = function() {
      var arg, args, name, path, _i, _len, _path;
      args = 1 <= arguments.length ? __slice.call(arguments, 0) : [];
      path = '';
      for (_i = 0, _len = args.length; _i < _len; _i++) {
        arg = args[_i];
        if (arg instanceof StackServer) {
          this.settings.pres = this.settings.pres.concat(arg.settings.pres);
          this._errorHandlers = this._errorHandlers.concat(arg._errorHandlers);
          this._nodes.push({
            name: path,
            nodes: arg._nodes
          });
          for (name in arg._methods) {
            _path = [];
            if (path) {
              _path.push(path);
            }
            if (name) {
              _path.push(name);
            }
            this._update(_path.join('/'));
          }
        } else if (arg instanceof Function) {
          if (arg.length === 5) {
            this._errorHandlers.push(arg);
            this._update();
          } else {
            this._nodes.push({
              name: path,
              method: arg
            });
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

    StackServer.prototype._update = function(path) {
      var paths;
      paths = path ? [path] : Object.keys(this._methods);
      return paths.forEach((function(_this) {
        return function(path) {
          var methods, pres, _methods;
          _methods = _this._traverse('/' + path, _this._nodes);
          pres = _this.settings.pres;
          methods = pres.concat(_methods);
          return _this.set(path, function(req, res, cb, socket) {
            return async.eachSeries(methods, function(method, next) {
              res._cb = next;
              return method(req, res, next, socket);
            }, cb);
          });
        };
      })(this));
    };

    StackServer.prototype._traverse = function(path, nodes, basePath) {
      var currentPath, methods, node, _i, _len, _methods;
      if (basePath == null) {
        basePath = '';
      }
      methods = [];
      for (_i = 0, _len = nodes.length; _i < _len; _i++) {
        node = nodes[_i];
        currentPath = basePath;
        if (node.name) {
          currentPath += this.path_delimiter + node.name;
        }
        if (path !== currentPath && !path.startsWith(currentPath + '/')) {
          continue;
        }
        if ('nodes' in node) {
          _methods = this._traverse(path, node.nodes, currentPath);
          methods = methods.concat(_methods);
        } else if ('method' in node) {
          methods.push(node.method);
        }
      }
      return methods;
    };

    StackServer.prototype.pre = function() {
      var args, method, _i, _len;
      args = 1 <= arguments.length ? __slice.call(arguments, 0) : [];
      for (_i = 0, _len = args.length; _i < _len; _i++) {
        method = args[_i];
        this.settings.pres.push(method);
      }
      this._update();
      return this;
    };

    return StackServer;

  })(TrackServer);

  module.exports = StackServer;

}).call(this);
