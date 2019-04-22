/*
 * decaffeinate suggestions:
 * DS001: Remove Babel/TypeScript constructor workaround
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS205: Consider reworking code to avoid use of IIFEs
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */

const async = require('async');
const {Server} = require('minimum-rpc');
const copy = require('shallow-copy');

// for stopping in async flow
const FORCE_STOP = "FORCE_STOP";

// mock response object like express
class Response {
  constructor(server, options, _cb) {
    // already tracked, if requested by auto track.
    this.server = server;
    this.options = options;
    this._cb = _cb;
    this._tracked = this.options.auto_track === true;
  }

  send(val) {
    this.val = val;
    return this._cb(FORCE_STOP, val);
  }

  json(val) {
    this.val = val;
    return this._cb(FORCE_STOP, val);
  }

  track(track_path, context) {
    if (context == null) { context = {}; }
    if (this._tracked) { return; }

    if (!track_path) { return; }

    if (context.auto_track == null) { context.auto_track = true; }

    this.server.track(track_path, context);

    return this._tracked = true;
  }
}


class TrackServer {

  constructor(io, options) {

    this.io = io;
    this._methods = {};

    this._track_id = 0;

    if (this.io != null) { this.init(this.io, options); }
  }

  init(io, options) {

    if (options == null) { options = {}; }
    if (this.io == null) { this.io = io; }

    this.server = new Server(this.io, {}, options);

    return (() => {
      const result = [];
      for (let path in this._methods) {

        const method = this._methods[path];
        result.push(this.server.set(path, method));
      }
      return result;
    })();
  }

  track(track_path, context) {

    if (!track_path) { return; }

    if (!(context instanceof Object)) { context = {}; }

    if (context.track_id == null) { context.track_id = this._track_id + 1; }
    this._track_id = context.track_id;

    // TODO: support 'room != track_path' case?
    this.server.channel.to(track_path).emit(track_path + '_track', context);

  }

  // method = (req, res, cb, socket) ->
  set(path, method) {

    const self = this;

    const _m = function(data, options, next, socket) {

      // swaps
      if ('function' === typeof options) {
        socket = next;
        next = options;
        options = {};
      }

      // request: clone and setup
      const req = copy(socket.request);

      req.end = function(cb) {
        if (!req.__ends__) { req.__ends__ = []; }
        return req.__ends__.push(cb);
      };

      req.body = (req.data = data);
      req.path = path;
      req.options = options != null ? options : {};

      const responseOptions =
        {auto_track: (options != null ? options.auto_track : undefined)};

      // response: create
      const res = new Response(self, responseOptions, null);

      // build callback: error handling, force_stop
      const cb = function(err, val) {

        if (req.__ends__) {
          req.__ends__.map(end => end());
        }

        if (err === FORCE_STOP) { err = null; }

        // custom error handling
        if (err instanceof Error) {

          if (self._error) {

            self._error(err, req, res, function(err) {
              if (err === FORCE_STOP) { err = null; }
              if (err instanceof Error) { err = {message: err.message}; }
              return next(err, res.val);
            }
            , socket);

            return;
          }

          err = {message: err.message};
        }

        return next(err, res.val);
      };

      // method apply
      return method(req, res, cb, socket);
    };

    this._methods[path] = _m;

    if (this.server != null) { return this.server.set(path, _m); }
  }

  // deprecated, use `app.use (err, req, res, next, socket) ->`
  error(_error) {
    if (_error != null) { this._error = _error; }

    return this._error;
  }
}


// server which can handle middlewares like express
class StackServer extends TrackServer {

  constructor(io, options) {

    if (io == null) { io = undefined; }
    if (options == null) { options = {}; }
    
    super(io, options);

    this.io = io;
    const {path_delimiter} = options;
    this.path_delimiter = path_delimiter || '/';

    this._nodes = [];

    // deprecated
    this.settings = {
      pres: []
    };

    this._errorHandlers = [];

    this.error((err, req, res, cb, socket) => {

      if (this._errorHandlers.length === 0) { return cb(err); }

      return async.eachSeries(this._errorHandlers, function(method, next) {

        res._cb = next;

        return method(err, req, res, next, socket);
      }

      , cb);
    });
  }

  init(io, options) {

    if (options == null) { options = {}; }
    TrackServer.prototype.init.call(this, io, options);

    return this._update();
  }

  // add default middleware ... `(req, res, next, socket) ->`
  // > app.use method
  // add method ... `(req, res, next, socket) ->`
  // > app.use 'method', method
  // add named middleware and method
  // > app.use 'method', middleware, method
  // extend app.
  // > app.use subApp
  // add subApp with prefix
  // > app.use 'submodule', subApp
  // add error handler ... `(err, req, res, next, socket) ->`
  // > app.use handler
  // ... see unit test cases.
  use(...args) {
    let path = '';

    for (let arg of Array.from(args)) {

      var name;
      if (arg instanceof StackServer) {
        // deprecated
        this.settings.pres = this.settings.pres.concat(arg.settings.pres);

        this._errorHandlers = this._errorHandlers.concat(arg._errorHandlers);

        this._nodes.push({name: path, nodes: arg._nodes});

        for (name in arg._methods) {
          const _path = [];
          if (path) { _path.push(path); }
          if (name) { _path.push(name); }
          this._update(_path.join('/'));
        }

      } else if (arg instanceof Function) {

        if (arg.length === 5) { // (err, req, res, next, socket) ->
          this._errorHandlers.push(arg);
          this._update();

        } else {
          this._nodes.push({name: path, method: arg});

          this._update(path);
        }

      } else if ((typeof(arg) === 'string') || arg instanceof String) {
        path = arg;

      } else {
        console.log('warning, invalid argument:', arg);
      }
    }

    return this;
  }

  _update(path) {

    const paths = path ? [path] : Object.keys(this._methods);

    return paths.forEach(path => {

      const _methods = this._traverse(`/${path}`, this._nodes);

      const {pres} = this.settings;
      const methods = pres.concat(_methods);

      return this.set(path, (req, res, cb, socket) =>

        async.eachSeries(methods, function(method, next) {

          res._cb = next;

          return method(req, res, next, socket);
        }

        , cb)
      );
    });
  }

  // nodes = [
  //   {name: '', method: ->}
  //   {name: '', nodes: [
  //     {name: 'module', nodes: [
  //       {name: 'method', method: ->}
  //     ]}
  //   ]}
  //   {name: 'module', nodes: [
  //     {name: '', method: ->}
  //   ]}
  //   {name: 'methodA', nodes: [
  //     {name: '', method: ->}
  //     {name: '', method: ->}
  //   ]}
  //   {name: '', method: ->}
  // ]
  _traverse(path, nodes, basePath) {
    if (basePath == null) { basePath = ''; }
    let methods = [];

    for (let node of Array.from(nodes)) {

      let currentPath = basePath;
      if (node.name) { currentPath += this.path_delimiter + node.name; }

      if ((path !== currentPath) && !path.startsWith(currentPath+'/')) { continue; }

      if ('nodes' in node) {
        const _methods =  this._traverse(path, node.nodes, currentPath);
        methods = methods.concat(_methods);

      } else if ('method' in node) {
        methods.push(node.method);
      }
    }

    return methods;
  }

  // deprecated
  pre(...args) {

    for (let method of Array.from(args)) { this.settings.pres.push(method); }

    this._update();

    return this;
  }
}


module.exports = StackServer;