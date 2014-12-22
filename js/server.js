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

    StackServer.prototype.track = function(data) {
      return this.server.channel.emit(this.server.sub_name_space + '_track', {
        data: data
      });
    };

    StackServer.prototype.use = function() {
      var method, methods, options, path, _i, _len;
      path = arguments[0];
      options = arguments[1];
      methods = [].slice.call(arguments, 1);
      if (options.constructor.name === "Function") {
        options = {};
      } else {
        methods = [].slice.call(arguments, 2);
      }
      if (!(path in this.methods)) {
        this.methods[path] = [];
      }
      for (_i = 0, _len = methods.length; _i < _len; _i++) {
        method = methods[_i];
        this.methods[path].push({
          method: method,
          options: options
        });
      }
      return this._update(path);
    };

    StackServer.prototype._update = function(path) {
      var self, _m, _methods;
      if (this.server == null) {
        return;
      }
      self = this;
      _methods = this.pres.concat(this.methods[path]);
      _m = function(data, next, socket) {
        var req, res, series, track;
        req = copy(socket.request);
        req.data = data;
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
          if (err === FORCE_STOP) {
            err = null;
          }
          if (err instanceof Error) {
            err = {
              message: err.message
            };
          }
          if (track) {
            self.track.call(self, res.val);
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
