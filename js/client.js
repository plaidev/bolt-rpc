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
    if (typeof options === 'function' || options instanceof Function) {
      return {
        handler: options,
        options: handler != null ? handler : {}
      };
    }
    return {
      handler: handler,
      options: options
    };
  };

  Cursor = (function(_super) {
    __extends(Cursor, _super);

    function Cursor(client, method, data, options, handler) {
      this.client = client;
      this.method = method;
      this.data = data;
      this.options = options;
      this.val = null;
      this.err = null;
      this.calling = null;
      this.context = null;
      this._pres = [];
      this._mdls = [];
      this._posts = [];
      if (handler) {
        this.on('error', function(err) {
          return handler(err);
        });
        this.on('end', function(val) {
          return handler(null, val);
        });
      }
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
      if (data == null) {
        data = void 0;
      }
      if (context == null) {
        context = {};
      }
      if (data !== void 0) {
        this.data = data;
      }
      if (this.data === void 0) {
        return this;
      }
      if (context === null) {
        return this;
      }
      if (this.calling && !context.reconnect) {
        if ((this.calling.track_id != null) && (context.track_id != null) && context.track_id <= this.calling.track_id) {
          return this;
        }
        if (this.context != null) {
          if (context.auto_track && !this.context.auto_track) {
            return this;
          }
          if ((this.context.track_id != null) && (context.track_id != null) && context.track_id <= this.context.track_id) {
            return this;
          }
        }
        this.context = context;
        return this;
      }
      this.calling = context;
      this._query_with_middlewares(this.data, context, (function(_this) {
        return function(err, val, skip) {
          if (skip == null) {
            skip = false;
          }
          if (!skip) {
            _this.err = err || null;
            _this.val = val || null;
          }
          _this.calling = null;
          if (!skip) {
            if (err) {
              _this.emit('error', err);
            } else {
              _this.emit('end', val);
            }
          }
          if (_this.context == null) {
            return;
          }
          if ((_this.context.track_id != null) && (context.track_id != null) && _this.context.track_id <= context.track_id) {
            return;
          }
          context = _this.context;
          _this.context = null;
          return setTimeout(function() {
            return _this.update(void 0, context);
          }, 0);
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
        return function(err, data, context) {
          var k, options, v, _ref;
          if (err) {
            return cb(err);
          }
          if (context === null) {
            return cb(null, null, true);
          }
          options = {};
          _ref = _this.options;
          for (k in _ref) {
            if (!__hasProp.call(_ref, k)) continue;
            v = _ref[k];
            options[k] = v;
          }
          if (context.auto_track) {
            if (options.auto_track == null) {
              options.auto_track = true;
            }
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
      if (mdl == null) {
        mdl = function(val) {
          return val;
        };
      }
      return this._mdls.push(mdl);
    };

    Cursor.prototype.pre = function(func) {
      if (func == null) {
        func = function(data, context, next) {
          return next();
        };
      }
      this._pres.push(function(data, context, cb) {
        if (context === null) {
          cb(null, null, null);
          return;
        }
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
      if (func == null) {
        func = function(val, next) {
          return next(null, val);
        };
      }
      this._posts.push(func);
      return this;
    };

    Cursor.prototype.isUpdateScheduled = function() {
      return this.context != null;
    };

    return Cursor;

  })(Emitter);

  TrackCursor = (function(_super) {
    __extends(TrackCursor, _super);

    function TrackCursor(client, method, data, options, handler, track_path) {
      TrackCursor.__super__.constructor.call(this, client, method, data, options, handler);
      this.tracking = false;
      if (!track_path) {
        return;
      }
      this.client.join(track_path);
      this.client._socket.on(track_path + '_track', (function(_this) {
        return function(trackContext) {
          if (!_this.tracking) {
            return;
          }
          return _this.update(void 0, trackContext);
        };
      })(this));
      this.client._socket.on('reconnect', (function(_this) {
        return function() {
          if (!_this.tracking) {
            return;
          }
          return setTimeout(function() {
            return _this.update(void 0, {
              auto_track: true,
              reconnect: true,
              track_id: -1
            });
          }, 0);
        };
      })(this));
    }

    TrackCursor.prototype.track = function(flag, context) {
      var old;
      if (context == null) {
        context = void 0;
      }
      old = this.tracking;
      this.tracking = flag;
      if (!old && this.tracking) {
        this.update(void 0, context);
      }
      return this;
    };

    return TrackCursor;

  })(Cursor);

  TrackClient = (function(_super) {
    __extends(TrackClient, _super);

    function TrackClient(io_or_socket, options, cb) {
      if (options == null) {
        options = {};
      }
      if (cb == null) {
        cb = null;
      }
      this.track_path = options.track_path;
      TrackClient.__super__.constructor.call(this, io_or_socket, options, cb);
    }

    TrackClient.prototype.track = function(method, data, options, handler) {
      var cursor, track_path, _ref, _ref1, _ref2;
      if (data == null) {
        data = void 0;
      }
      if (options == null) {
        options = {};
      }
      if (handler == null) {
        handler = null;
      }
      _ref = __swap_options_and_handler({
        options: options,
        handler: handler
      }), handler = _ref.handler, options = _ref.options;
      track_path = (_ref1 = (_ref2 = options.track_path) != null ? _ref2 : this.track_path) != null ? _ref1 : method;
      cursor = new TrackCursor(this, method, data, options, handler, track_path);
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
