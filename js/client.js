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

    function TrackCursor(method, data, cb) {
      this.method = method;
      this.data = data;
      this.cb = cb;
      this.val = null;
      this.err = null;
    }

    TrackCursor.prototype.error = function(cb) {
      this.on('error', cb);
      return this;
    };

    TrackCursor.prototype.end = function(cb) {
      this.on('end', cb);
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
            _results.push(_this.send(cursor.method, cursor.data, cursor.cb));
          }
          return _results;
        };
      })(this));
    }

    TrackClient.prototype.track = function(method, data, cb) {
      var cursor;
      cursor = new TrackCursor(method, data, cb);
      this._cursors.push(cursor);
      this.send(method, data, cb);
      return cursor;
    };

    TrackClient.prototype.get = function(method, data) {
      var cb, cursor;
      cb = function(err, val) {
        cursor.err = err || null;
        cursor.val = val || null;
        if (err) {
          return cursor.emit('error', err);
        } else {
          return cursor.emit('end', val);
        }
      };
      cursor = new TrackCursor(method, data, cb);
      this._cursors.push(cursor);
      this.send(method, data, cb);
      return cursor;
    };

    return TrackClient;

  })(Client);

  module.exports = TrackClient;

}).call(this);
