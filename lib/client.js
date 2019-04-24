/*
 * decaffeinate suggestions:
 * DS001: Remove Babel/TypeScript constructor workaround
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS104: Avoid inline assignments
 * DS203: Remove `|| {}` from converted for-own loops
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
// event emitter for component and node.js

const Emitter = require('events').EventEmitter;

const {Client} = require('minimum-rpc');
const async = require('async');

const __swap_options_and_handler = function({options, handler}) {
  if ((typeof options === 'function') || options instanceof Function) {
    return {handler: options, options: handler != null ? handler : {}};
  }
  return {handler, options};
};


// cursor class
class Cursor extends Emitter {

  constructor(client, method, data, options, handler) {

    super();
    this.client = client;
    this.method = method;
    this.data = data;
    this.options = options;
    this.val = null;
    this.err = null;
    this.calling = null;

    this.context = null;

    // @pres -> <client.send> -> @mdls -> @posts
    this._pres = [];  // (data, context, next) -> next(null, data, context)
    this._mdls = [];  // (val) -> val
    this._posts = []; // (val, next) -> next(null, val)

    if (handler) {
      this.on('error', err => handler(err));
      this.on('end', val => handler(null, val));
    }
  }

  // error handler
  error(cb) {
    this.on('error', cb);
    return this;
  }

  // success handler
  end(cb) {
    this.on('end', cb);
    return this;
  }

  // querying
  update(data, context) {
    // update query data if exists
    if (data == null) { data = undefined; }
    if (context == null) { context = {}; }
    if (data !== undefined) { this.data = data; }

    // not update if @data is undefined.
    if (this.data === undefined) { return this; }

    if (context === null) { return this; }

    // reject if now calling, but keep request, data and context.
    if (this.calling && !context.reconnect) {

      // skip if context.track_id less than @calling.track_id
      if ((this.calling.track_id != null) && (context.track_id != null) && (context.track_id <= this.calling.track_id)) {
        return this;
      }

      // auto_track is week request, don't update non auto_track context.
      if (this.context != null) {
        if (context.auto_track && !this.context.auto_track) {
          return this;
        }

        if ((this.context.track_id != null) && (context.track_id != null) && (context.track_id <= this.context.track_id)) {
          return this;
        }
      }

      // keep auto track context
      this.context = context;

      return this;
    }

    this.calling = context;

    this._query_with_middlewares(this.data, context, (err, val, skip) => {

      // update results
      if (skip == null) { skip = false; }
      if (!skip) {
        this.err = err || null;
        this.val = val || null;
      }

      this.calling = null;

      if (!skip) {
        if (err) {
          this.emit('error', err);
        } else {
          this.emit('end', val);
        }
      }

      // update more once if requested
      if ((this.context == null)) { return; }

      // return if next request is old tracking request
      if ((this.context.track_id != null) && (context.track_id != null) && (this.context.track_id <= context.track_id)) { return; }

      ({ context } = this);
      this.context = null;

      return setTimeout(() => {
        return this.update(undefined, context);
      }
      , 0);
    });

    return this;
  }

  _pre_methods(data, context, cb) {
    return async.waterfall([
      next => next(null, data, context)
    ].concat(this._pres), cb);
  }

  _post_methods(val, cb) {
    return async.waterfall([
      next => next(null, val)
    ].concat(this._posts), cb);
  }

  _query_with_middlewares(data, context, cb) {

    return this._pre_methods(data, context, (err, data, context) => {
      if (err) { return cb(err); }
      if (context === null) { return cb(null, null, true); }

      const options = {};
      for (let k of Object.keys(this.options || {})) { const v = this.options[k]; options[k] = v; }
      if (context.auto_track) { if (options.auto_track == null) { options.auto_track = true; } }

      return this.client.send(this.method, data, options, (err, val) => {
        if (err) { return cb(err); }

        try {
          for (let mdl of Array.from(this._mdls)) { val = mdl(val); }
        } catch (e) {
          return cb(err);
        }

        return this._post_methods(val, cb);
      });
    });
  }

  // sync middlewares
  map(mdl) {
    if (mdl == null) { mdl = val => val; }
    return this._mdls.push(mdl);
  }

  pre(func) {
    // for back compatibility. i.e. `(data, context, next) -> next()`
    if (func == null) { func = (data, context, next) => next(); }
    this._pres.push(function(data, context, cb) {

      // If the content is null, skip the call
      if (context === null) {
        cb(null, null, null);
        return;
      }

      return func(data, context, function(err, ...args) {
        if (args.length === 0) {
          return cb(err, data, context);
        }
        return cb(err, ...Array.from(args));
      });
    });

    return this;
  }

  post(func) {
    if (func == null) { func = (val, next) => next(null, val); }
    this._posts.push(func);
    return this;
  }

  isUpdateScheduled() {
    return (this.context != null);
  }
}


// cursor with track filters
class TrackCursor extends Cursor {

  constructor(client, method, data, options, handler, track_path) {

    super(client, method, data, options, handler);

    // enable update by track
    this.tracking = false;

    // activate tracking
    if (!track_path) { return; }

    // TODO: support 'room != track_path' case?
    this.client.join(track_path);

    this.client._socket.on(track_path + '_track', trackContext => {
      if (!this.tracking) { return; }
      return this.update(undefined, trackContext);
    });

    this.client._socket.on('reconnect', () => {
      if (!this.tracking) { return; }
      return setTimeout(() => {
        return this.update(undefined, {auto_track: true, reconnect: true, track_id: -1});
      }
      , 0);
    });
  }

  track(flag, context) {
    if (context == null) { context = undefined; }
    const old = this.tracking;
    this.tracking = flag;
    if (!old && this.tracking) {
      this.update(undefined, context);
    }
    return this;
  }
}


// client class
// TODO: not 'is a'
class TrackClient extends Client {

  constructor(io_or_socket, options, cb=null) {

    if (options == null) { options = {}; }

    super(io_or_socket, options, cb);

    ({track_path: this.track_path} = options);

  }

  // track api which return cursor.
  track(method, data, options, handler=null) {

    let left;
    if (data == null) { data = undefined; }
    if (options == null) { options = {}; }
    ({handler, options} = __swap_options_and_handler({options, handler}));

    const track_path = (left = options.track_path != null ? options.track_path : this.track_path) != null ? left : method;

    const cursor = new TrackCursor(this, method, data, options, handler, track_path);

    return cursor;
  }

  // track api which return cursor obj.
  get(method, data, options) {

    if (data == null) { data = {}; }
    if (options == null) { options = {}; }
    const res = {
      err: null,
      val: null
    };

    const cursor = this.track(method, data, options, function(err, val) {
      res.err = err;
      return res.val = val;
    });

    cursor.track(true);

    return res;
  }
}

module.exports = TrackClient;
