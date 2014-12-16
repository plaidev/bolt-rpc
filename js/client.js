(function() {
  var Client, Emitter, TrackClient, TrackCursor,
    __hasProp = {}.hasOwnProperty,
    __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

  try {
    Emitter = require('emitter');
  } catch (_error) {
    Emitter = require('events').EventEmitter;
  }

  Client = require('minimum-rpc').Client;

  TrackCursor = (function(_super) {
    __extends(TrackCursor, _super);

    function TrackCursor(method, data, cb, client) {
      this.method = method;
      this.data = data;
      this.cb = cb;
      this.client = client;
      this.val = null;
      this.err = null;
      this.mdls = [];
    }

    TrackCursor.prototype.error = function(cb) {
      this.on('error', cb);
      return this;
    };

    TrackCursor.prototype.end = function(cb) {
      this.on('end', cb);
      return this;
    };

    TrackCursor.prototype.update = function(_data) {
      if (_data !== void 0) {
        this.data = _data;
      }
      this.client.send(this.method, this.data, (function(_this) {
        return function(err, val) {
          var mdl, _i, _len, _ref;
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
            return _this.cb(err, val);
          }
        };
      })(this));
      return this;
    };

    TrackCursor.prototype.map = function(mdl) {
      this.mdls.push(mdl);
      return this;
    };

    return TrackCursor;

  })(Emitter);

  TrackClient = (function(_super) {
    __extends(TrackClient, _super);

    function TrackClient(io_or_socket, options) {
      TrackClient.__super__.constructor.call(this, io_or_socket, options);
      this._cursors = [];
      this._socket.on(this.sub_name_space + '_track', (function(_this) {
        return function(data) {
          var cursor, _i, _len, _ref, _results;
          _ref = _this._cursors;
          _results = [];
          for (_i = 0, _len = _ref.length; _i < _len; _i++) {
            cursor = _ref[_i];
            _results.push(cursor.update());
          }
          return _results;
        };
      })(this));
    }

    TrackClient.prototype.track = function(method, data, cb) {
      var cursor;
      cursor = new TrackCursor(method, data, cb, this);
      this._cursors.push(cursor);
      cursor.update();
      return cursor;
    };

    return TrackClient;

  })(Client);

  module.exports = TrackClient;

}).call(this);
