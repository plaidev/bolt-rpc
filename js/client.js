(function() {
  var Client, Cursor, Emitter, TrackClient, TrackCursor, __build_chain, __swap_options_and_handler,
    __slice = [].slice,
    __hasProp = {}.hasOwnProperty,
    __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

  try {
    Emitter = require('component-emitter');
  } catch (_error) {
    Emitter = require('events').EventEmitter;
  }

  Client = require('minimum-rpc').Client;

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

  __build_chain = function(funcs) {
    var cb, cur, next, _bind, _i, _len, _ref;
    _bind = function(cur, next) {
      return function() {
        var args, err;
        err = arguments[0], args = 2 <= arguments.length ? __slice.call(arguments, 1) : [];
        if (err) {
          return next(err);
        }
        return cur.apply(null, __slice.call(args).concat([next]));
      };
    };
    cb = null;
    next = function() {
      var args, err;
      err = arguments[0], args = 2 <= arguments.length ? __slice.call(arguments, 1) : [];
      return cb.apply(null, [err].concat(__slice.call(args)));
    };
    _ref = Array.prototype.concat(funcs).reverse();
    for (_i = 0, _len = _ref.length; _i < _len; _i++) {
      cur = _ref[_i];
      next = _bind(cur, next);
    }
    return function() {
      var args, _cb, _j;
      args = 2 <= arguments.length ? __slice.call(arguments, 0, _j = arguments.length - 1) : (_j = 0, []), _cb = arguments[_j++];
      cb = _cb;
      return next.apply(null, [null].concat(__slice.call(args)));
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
      this.mdls = [];
      this._pres = [];
      this._posts = [];
      this._preMethods = function(data, context, next) {
        return next(null, data, context);
      };
      this._postMethods = function(val, next) {
        return next(null, val);
      };
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
      if (data !== void 0) {
        this.data = data;
      }
      if (this.data === void 0) {
        return;
      }
      if (this.calling) {
        this.updateRequest = true;
        return this;
      }
      this.calling = true;
      return this._query_with_middlewares(this.data, context, (function(_this) {
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
            _this.updateRequest = false;
            return setTimeout(function() {
              return _this.update();
            }, 0);
          }
        };
      })(this));
    };

    Cursor.prototype._query_with_middlewares = function(data, context, cb) {
      return this._preMethods(data, context, (function(_this) {
        return function(err, data) {
          if (err) {
            return cb(err);
          }
          return _this.client.send(_this.method, data, _this.options, function(err, val) {
            var e, mdl, _i, _len, _ref;
            if (err) {
              return cb(err);
            }
            try {
              _ref = _this.mdls;
              for (_i = 0, _len = _ref.length; _i < _len; _i++) {
                mdl = _ref[_i];
                val = mdl(val);
              }
            } catch (_error) {
              e = _error;
              return cb(err);
            }
            return _this._postMethods(val, cb);
          });
        };
      })(this));
    };

    Cursor.prototype.map = function(mdl) {
      return this.mdls.push(mdl);
    };

    Cursor.prototype.pre = function(func) {
      this._pres.push(func);
      this._preMethods = __build_chain(this._pres);
      return this;
    };

    Cursor.prototype.post = function(func) {
      this._posts.push(func);
      this._postMethods = __build_chain(this._posts);
      return this;
    };

    return Cursor;

  })(Emitter);

  TrackCursor = (function(_super) {
    __extends(TrackCursor, _super);

    function TrackCursor(client, method, data, options, handler) {
      var sub_name_space, track_name_space, track_path, _ref, _ref1;
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
      sub_name_space = this.client.sub_name_space;
      _ref1 = this.options, track_name_space = _ref1.track_name_space, track_path = _ref1.track_path;
      if ((track_name_space != null) && track_name_space !== '__' && track_name_space !== sub_name_space) {
        this.client.join(track_name_space);
      }
      if (track_name_space == null) {
        track_name_space = sub_name_space || '__';
      }
      if (track_path == null) {
        track_path = method;
      }
      this.client._socket.on(track_name_space + '.' + track_path + '_track', (function(_this) {
        return function(trackContext) {
          if (_this.tracking === false) {
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
      var track_name_space;
      if (options == null) {
        options = {};
      }
      track_name_space = options.track_name_space;
      if (track_name_space != null) {
        this.default_track_name_space = track_name_space;
      }
      TrackClient.__super__.constructor.call(this, io_or_socket, options);
    }

    TrackClient.prototype.track = function(method, data, options, handler) {
      var cursor, _ref;
      if (data == null) {
        data = null;
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
      }), options = _ref.options, handler = _ref.handler;
      if (this.default_track_name_space != null) {
        if (options.track_name_space == null) {
          options.track_name_space = this.default_track_name_space;
        }
      }
      cursor = new TrackCursor(this, method, data, options, handler);
      return cursor;
    };

    TrackClient.prototype.get = function(method, data, options) {
      var cursor, res;
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
