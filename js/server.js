(function() {
  var FORCE_STOP, Response, Server, StackServer, async, copy;

  async = require('async');

  Server = require('minimum-rpc').Server;

  copy = require('shallow-copy');

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
      this.io = io != null ? io : void 0;
      if (options == null) {
        options = {};
      }
      if (this.io != null) {
        this.server = new Server(this.io, {}, options);
      }
      this.pres = [];
      this.methods = {};
    }

    StackServer.prototype.extend = function(baseServer) {
      var method, methods, name, _ref, _ref1;
      if (baseServer == null) {
        return this;
      }
      this.pres = baseServer.pres.concat(this.pres);
      methods = {};
      _ref = baseServer.methods;
      for (name in _ref) {
        method = _ref[name];
        methods[name] = method;
      }
      _ref1 = this.methods;
      for (name in _ref1) {
        method = _ref1[name];
        methods[name] = method;
      }
      return this.methods = methods;
    };

    StackServer.prototype.setupServer = function(io, options) {
      var methods, path, _ref, _results;
      this.io = io;
      if (options == null) {
        options = {};
      }
      this.server = new Server(this.io, {}, options);
      _ref = this.methods;
      _results = [];
      for (path in _ref) {
        methods = _ref[path];
        _results.push(this._update(path));
      }
      return _results;
    };

    StackServer.prototype.pre = function() {
      var method, methods, options, _i, _len, _results;
      methods = [].slice.call(arguments, 0);
      options = {};
      _results = [];
      for (_i = 0, _len = methods.length; _i < _len; _i++) {
        method = methods[_i];
        _results.push(this.pres.push({
          method: method,
          options: options
        }));
      }
      return _results;
    };

    StackServer.prototype.get_namespace = function(path) {
      return '_';
    };

    StackServer.prototype.track = function(ns, data) {
      return this.server.channel.emit(ns + '.' + this.server.sub_name_space + '_track', data);
    };

    StackServer.prototype.use = function() {
      var args, method, methods, options, path, _base, _i, _len;
      args = [].slice.call(arguments);
      if (typeof args[0] === 'string' || args[0] instanceof String) {
        path = args[0];
        if ((_base = this.methods)[path] == null) {
          _base[path] = [];
        }
        methods = this.methods[path];
        args = args.slice(1);
      } else {
        path = null;
        methods = [];
      }
      if (!(args[0] instanceof Function)) {
        options = args[0];
        args = args.slice(1);
      } else {
        options = {};
      }
      for (_i = 0, _len = args.length; _i < _len; _i++) {
        method = args[_i];
        methods.push({
          method: method,
          options: options
        });
      }
      if (path != null) {
        return this._update(path);
      }
    };

    StackServer.prototype._update = function(path) {
      var self, _m, _methods;
      if (this.server == null) {
        return;
      }
      self = this;
      _methods = this.pres.concat(this.methods[path]);
      _m = function(data, options, next, socket) {
        var req, res, series, track;
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
        track = false;
        return async.eachSeries(_methods, function(_arg, cb) {
          var method, options;
          method = _arg.method, options = _arg.options;
          res._cb = cb;
          if (options.track) {
            track = true;
          }
          return method(req, res, cb, socket);
        }, function(err, val) {
          var ns;
          if (err === FORCE_STOP) {
            err = null;
          }
          if (err instanceof Error) {
            err = {
              message: err.message
            };
          }
          ns = self.get_namespace(path);
          if (track) {
            self.track.call(self, ns, res.val);
          }
          if (req.__ends__) {
            req.__ends__.map(function(end) {
              return end();
            });
          }
          return next(err, res.val);
        });
      };
      return this.server.set(path, _m);
    };

    return StackServer;

  })();

  module.exports = StackServer;

}).call(this);
