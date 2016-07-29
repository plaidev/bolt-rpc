(function() {
  var Client, Cursor, Emitter, TrackClient, TrackCursor, __build_chain, __swap_options_and_handler,
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

  __build_chain = function(funcs, cb) {
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

  Cursor = (function(_super) {
    __extends(Cursor, _super);

    function Cursor(client, method, data, options, handler) {
      this.client = client;
      this.method = method;
      this.data = data;
      this.options = options != null ? options : {};
      this.handler = handler;
      this.val = null;
      this.err = null;
      this.mdls = [];
      this.calling = false;
      this.updateRequest = false;
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
          if (_this.handler) {
            _this.handler(err, val);
          }
          if (_this.updateRequest) {
            _this.updateRequest = false;
            return setTimeout(function() {
              return _this.update();
            }, 0);
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

  TrackCursor = (function(_super) {
    __extends(TrackCursor, _super);

    function TrackCursor(client, method, data, options, handler) {
      var sub_name_space, track_name_space, track_path, _handler, _ref;
      if (typeof options === 'function') {
        client = handler;
        handler = options;
        options = {};
      }
      this.tracking = true;
      this.pres = [];
      this.posts = [];
      _handler = null;
      if (handler != null) {
        _handler = (function(_this) {
          return function(err, val) {
            var next;
            next = __build_chain(_this.posts, handler);
            return next(err, val);
          };
        })(this);
      }
      TrackCursor.__super__.constructor.call(this, client, method, data, options, handler);
      sub_name_space = this.client.sub_name_space;
      _ref = this.options, track_name_space = _ref.track_name_space, track_path = _ref.track_path;
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
          return _this._update_by_track(trackContext);
        };
      })(this));
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
      this.tracking = flag;
      return this;
    };

    TrackCursor.prototype._update_by_track = function(trackContext) {
      var next;
      if (this.tracking === false) {
        return;
      }
      next = __build_chain(this.pres, (function(_this) {
        return function(err, trackContext) {
          if (err) {
            return;
          }
          return _this.update();
        };
      })(this));
      return next(null, trackContext);
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
      cursor.update();
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
      return res;
    };

    return TrackClient;

  })(Client);

  module.exports = TrackClient;

}).call(this);
