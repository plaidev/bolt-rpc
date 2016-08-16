(function() {
  var Client, Cursor, Emitter, TrackClient, TrackCursor, async, __swap_options_and_handler,
    __hasProp = {}.hasOwnProperty,
    __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; },
    __slice = [].slice;

  try {
    Emitter = require('component-emitter');
  } catch (_error) {
    Emitter = require('events').EventEmitter;
  }

  Client = require('minimum-rpc').Client;

  async = require('async');

  __swap_options_and_handler = function(_arg) {
    var handler, options;
    options = _arg.options, handler = _arg.handler;
    if ('function' === typeof options) {
      return {
        handler: options,
        options: {}
      };
    }
    return {
      handler: handler,
      options: options
    };
  };

  Cursor = (function(_super) {
    __extends(Cursor, _super);

    function Cursor(client, method, data, options) {
      this.client = client;
      this.method = method;
      this.data = data;
      this.options = options != null ? options : {};
      this.val = null;
      this.err = null;
      this.calling = false;
      this.updateRequest = false;
      this._mdls = [];
      this._pres = [];
      this._posts = [];
    }

    Cursor.prototype.error = function(cb) {
      this.on('error', cb);
      return this;
    };

    Cursor.prototype.end = function(cb) {
      this.on('end', cb);
      return this;
    };

    Cursor.prototype.update = function(data, context) {
      var _base;
      if (data !== void 0) {
        this.data = data;
      }
      if (this.data === void 0) {
        return;
      }
      if (this.calling) {
        this.updateRequest = {};
        if (context != null ? context.auto_track : void 0) {
          if ((_base = this.updateRequest).auto_track == null) {
            _base.auto_track = context.auto_track;
          }
        }
        return this;
      }
      this.calling = true;
      this._query_with_middlewares(this.data, context, (function(_this) {
        return function(err, val) {
          _this.err = err || null;
          _this.val = val || null;
          _this.calling = false;
          if (err) {
            _this.emit('error', err);
          } else {
            _this.emit('end', val);
          }
          if (_this.updateRequest) {
            context = _this.updateRequest;
            _this.updateRequest = false;
            return setTimeout(function() {
              return _this.update(void 0, context);
            }, 0);
          }
        };
      })(this));
      return this;
    };

    Cursor.prototype._pre_methods = function(data, context, cb) {
      return async.waterfall([
        function(next) {
          return next(null, data, context);
        }
      ].concat(this._pres), cb);
    };

    Cursor.prototype._post_methods = function(val, cb) {
      return async.waterfall([
        function(next) {
          return next(null, val);
        }
      ].concat(this._posts), cb);
    };

    Cursor.prototype._query_with_middlewares = function(data, context, cb) {
      return this._pre_methods(data, context, (function(_this) {
        return function(err, data) {
          var k, options, v, _ref;
          if (err) {
            return cb(err);
          }
          options = {};
          _ref = _this.options;
          for (k in _ref) {
            if (!__hasProp.call(_ref, k)) continue;
            v = _ref[k];
            options[k] = v;
          }
          if (context != null ? context.auto_track : void 0) {
            options.auto_tracked_request = true;
          }
          return _this.client.send(_this.method, data, options, function(err, val) {
            var e, mdl, _i, _len, _ref1;
            if (err) {
              return cb(err);
            }
            try {
              _ref1 = _this._mdls;
              for (_i = 0, _len = _ref1.length; _i < _len; _i++) {
                mdl = _ref1[_i];
                val = mdl(val);
              }
            } catch (_error) {
              e = _error;
              return cb(err);
            }
            return _this._post_methods(val, cb);
          });
        };
      })(this));
    };

    Cursor.prototype.map = function(mdl) {
      return this._mdls.push(mdl);
    };

    Cursor.prototype.pre = function(func) {
      this._pres.push(function(data, context, cb) {
        return func(data, context, function() {
          var args, err;
          err = arguments[0], args = 2 <= arguments.length ? __slice.call(arguments, 1) : [];
          if (args.length === 0) {
            return cb(err, data, context);
          }
          return cb.apply(null, [err].concat(__slice.call(args)));
        });
      });
      return this;
    };

    Cursor.prototype.post = function(func) {
      this._posts.push(func);
      return this;
    };

    return Cursor;

  })(Emitter);

  TrackCursor = (function(_super) {
    __extends(TrackCursor, _super);

    function TrackCursor(client, method, data, options, handler) {
      var track_path, _ref;
      _ref = __swap_options_and_handler({
        options: options,
        handler: handler
      }), options = _ref.options, handler = _ref.handler;
      this.tracking = false;
      TrackCursor.__super__.constructor.call(this, client, method, data, options);
      if (handler) {
        this.on('error', function(err) {
          return handler(err);
        });
        this.on('end', function(val) {
          return handler(null, val);
        });
      }
      track_path = this.options.track_path;
      if (track_path == null) {
        track_path = method;
      }
      if (!(track_path instanceof Array)) {
        track_path = typeof track_path.split === "function" ? track_path.split('.') : void 0;
      }
      if (!track_path || track_path.length === 0) {
        return;
      }
      this.client.join(track_path[0]);
      this.client._socket.on(track_path.join('.') + '_track', (function(_this) {
        return function(trackContext) {
          if (!_this.tracking) {
            return;
          }
          return _this.update(void 0, trackContext);
        };
      })(this));
    }

    TrackCursor.prototype.track = function(flag) {
      var old;
      old = this.tracking;
      this.tracking = flag;
      if (!old && this.tracking) {
        this.update();
      }
      return this;
    };

    return TrackCursor;

  })(Cursor);

  TrackClient = (function(_super) {
    __extends(TrackClient, _super);

    function TrackClient(io_or_socket, options) {
      var track_path;
      if (options == null) {
        options = {};
      }
      track_path = options.track_path;
      if (track_path != null) {
        this.default_track_path = track_path;
      }
      TrackClient.__super__.constructor.call(this, io_or_socket, options);
    }

    TrackClient.prototype.track = function(method, data, options, handler) {
      var cursor, _ref;
      if (options == null) {
        options = {};
      }
      if (handler == null) {
        handler = null;
      }
      _ref = __swap_options_and_handler({
        options: options,
        handler: handler
      }), options = _ref.options, handler = _ref.handler;
      if (this.default_track_path != null) {
        if (options.track_path == null) {
          options.track_path = this.default_track_path;
        }
      }
      cursor = new TrackCursor(this, method, data, options, handler);
      return cursor;
    };

    TrackClient.prototype.get = function(method, data, options) {
      var cursor, res;
      if (data == null) {
        data = {};
      }
      if (options == null) {
        options = {};
      }
      res = {
        err: null,
        val: null
      };
      cursor = this.track(method, data, options, function(err, val) {
        res.err = err;
        return res.val = val;
      });
      cursor.track(true);
      return res;
    };

    return TrackClient;

  })(Client);

  module.exports = TrackClient;

}).call(this);
