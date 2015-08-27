(function() {
  var Client, Cursor, Emitter, TrackClient, TrackCursor, buildChain, __swap_options_and_cb,
    __hasProp = {}.hasOwnProperty,
    __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

  try {
    Emitter = require('component-emitter');
  } catch (_error) {
    Emitter = require('events').EventEmitter;
  }

  Client = require('minimum-rpc').Client;

  __swap_options_and_cb = function(_arg) {
    var cb, options;
    options = _arg.options, cb = _arg.cb;
    if ('function' === typeof options) {
      return {
        cb: options,
        options: {}
      };
    }
    return {
      cb: cb,
      options: options
    };
  };

  Cursor = (function(_super) {
    __extends(Cursor, _super);

    function Cursor(method, data, options, cb, client) {
      var track_namespace, _ref;
      this.method = method;
      this.data = data;
      this.options = options;
      this.cb = cb;
      this.client = client;
      if ('function' === typeof this.options) {
        this.client = this.cb;
        this.cb = this.options;
        this.options = {};
      }
      this.val = null;
      this.err = null;
      this.mdls = [];
      this.calling = false;
      this.updateRequest = false;
      if ((_ref = this.options) != null ? _ref.track : void 0) {
        track_namespace = this.options.track_namespace || '_';
        this.client._socket.on(this.track_namespace + '_track', (function(_this) {
          return function(data) {
            return _this.update(void 0, data);
          };
        })(this));
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

    Cursor.prototype.update = function(_data) {
      if (_data !== void 0) {
        this.data = _data;
      }
      if (this.data == null) {
        return;
      }
      if (this.calling) {
        this.updateRequest = true;
        return this;
      }
      this.calling = true;
      this.updateRequest = false;
      this.client.send(this.method, this.data, this.options, (function(_this) {
        return function(err, val) {
          var mdl, _i, _len, _ref;
          _this.calling = false;
          _this.err = err || null;
          _this.val = val || null;
          if (err) {
            _this.emit('error', err);
          } else {
            _ref = _this.mdls;
            for (_i = 0, _len = _ref.length; _i < _len; _i++) {
              mdl = _ref[_i];
              val = mdl(val);
            }
            _this.emit('end', val);
          }
          if (_this.cb) {
            _this.cb(err, val);
          }
          if (_this.updateRequest) {
            return _this.update();
          }
        };
      })(this));
      return this;
    };

    Cursor.prototype.map = function(mdl) {
      this.mdls.push(mdl);
      return this;
    };

    return Cursor;

  })(Emitter);

  buildChain = function(funcs, cb) {
    var cur, err, next, val, _bind, _i, _len, _ref;
    err = null;
    val = void 0;
    _bind = function(cur, next) {
      return function(_err, _val) {
        if (_err) {
          err = _err;
        }
        if (_val) {
          val = _val;
        }
        return cur(err, val, next);
      };
    };
    next = function(err, val, next) {
      if (cb) {
        return cb(err, val);
      }
    };
    _ref = Array.prototype.concat(funcs).reverse();
    for (_i = 0, _len = _ref.length; _i < _len; _i++) {
      cur = _ref[_i];
      next = _bind(cur, next);
    }
    return next;
  };

  TrackCursor = (function(_super) {
    __extends(TrackCursor, _super);

    function TrackCursor(method, data, options, cb, client) {
      var _cb;
      if ('function' === typeof options) {
        client = cb;
        cb = options;
        options = {};
      }
      this.pres = [];
      this.posts = [];
      this.tracking = true;
      _cb = null;
      if (cb != null) {
        _cb = (function(_this) {
          return function(err, val) {
            var next;
            next = buildChain(_this.posts, cb);
            return next(err, val);
          };
        })(this);
      }
      TrackCursor.__super__.constructor.call(this, method, data, options, _cb, client);
    }

    TrackCursor.prototype.pre = function(func) {
      this.pres.push(func);
      return this;
    };

    TrackCursor.prototype.post = function(func) {
      this.posts.push(func);
      return this;
    };

    TrackCursor.prototype.track = function(flag) {
      return this.tracking = flag;
    };

    TrackCursor.prototype.update = function(_data, trackContext) {
      var next;
      if (trackContext === void 0) {
        return TrackCursor.__super__.update.call(this, _data);
      }
      if (this.tracking === false) {
        return;
      }
      next = buildChain(this.pres, (function(_this) {
        return function(err, trackContext) {
          if (err) {
            return;
          }
          return TrackCursor.__super__.update.call(_this, _data);
        };
      })(this));
      return next(null, trackContext);
    };

    return TrackCursor;

  })(Cursor);

  TrackClient = (function(_super) {
    __extends(TrackClient, _super);

    function TrackClient(io_or_socket, options) {
      TrackClient.__super__.constructor.call(this, io_or_socket, options);
    }

    TrackClient.prototype.track = function(method, data, options, cb) {
      var cursor, _ref;
      if (data == null) {
        data = null;
      }
      if (options == null) {
        options = null;
      }
      if (cb == null) {
        cb = null;
      }
      _ref = __swap_options_and_cb({
        options: options,
        cb: cb
      }), options = _ref.options, cb = _ref.cb;
      cursor = new TrackCursor(method, data, options, cb, this);
      cursor.update();
      return cursor;
    };

    TrackClient.prototype.get = function(method, data, options, cb) {
      var cursor, res, _ref;
      _ref = __swap_options_and_cb({
        options: options,
        cb: cb
      }), options = _ref.options, cb = _ref.cb;
      res = {
        err: null,
        val: null
      };
      cursor = this.track(method, data, options, function(err, val) {
        res.err = err;
        return res.val = val;
      });
      return res;
    };

    return TrackClient;

  })(Client);

  module.exports = TrackClient;

}).call(this);
