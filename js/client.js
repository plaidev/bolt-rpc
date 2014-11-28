(function() {
  var Client, TrackClient, TrackCursor,
    __hasProp = {}.hasOwnProperty,
    __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; },
    __indexOf = [].indexOf || function(item) { for (var i = 0, l = this.length; i < l; i++) { if (i in this && this[i] === item) return i; } return -1; };

  Client = require('minimum-rpc').Client;

  TrackCursor = (function() {
    function TrackCursor(method, data, cb) {
      this.method = method;
      this.data = data;
      this.cb = cb;
    }

    return TrackCursor;

  })();

  TrackClient = (function(_super) {
    __extends(TrackClient, _super);

    function TrackClient(io_or_socket, options) {
      TrackClient.__super__.constructor.call(this, io_or_socket, options);
      this._cursors = {};
      this._socket.on(this.sub_name_space + '_track', (function(_this) {
        return function(data) {
          var cursor, cursors, method, _ref, _results;
          _ref = _this._cursors;
          _results = [];
          for (method in _ref) {
            cursors = _ref[method];
            if ((data.methods == null) || __indexOf.call(data.methods, method) >= 0) {
              _results.push((function() {
                var _i, _len, _results1;
                _results1 = [];
                for (_i = 0, _len = cursors.length; _i < _len; _i++) {
                  cursor = cursors[_i];
                  _results1.push(this.send(cursor.method, cursor.data, cursor.cb));
                }
                return _results1;
              }).call(_this));
            } else {
              _results.push(void 0);
            }
          }
          return _results;
        };
      })(this));
    }

    TrackClient.prototype.track = function(method, data, cb) {
      var cursor;
      cursor = new TrackCursor(method, data, cb);
      if (this._cursors[method] != null) {
        this._cursors[method].push(cursor);
      } else {
        this._cursors[method] = [cursor];
      }
      this.send(method, data, cb);
      return cursor;
    };

    return TrackClient;

  })(Client);

  module.exports = TrackClient;

}).call(this);
