
async = require('async')
{Server} = require('minimum-rpc')
copy = require('shallow-copy')

# for stopping in async flow
FORCE_STOP = "FORCE_STOP"

# mock response object like express
class Response
  constructor: (@server, @options, @_cb) ->
    @_tracked = if @options.disable_track then true else false

  send: (val) ->
    @val = val
    @_cb(FORCE_STOP, val)

  json: (val) ->
    @val = val
    @_cb(FORCE_STOP, val)

  track: (track_path, context={}) ->
    return if @_tracked

    return if not track_path

    context.auto_track ?= true

    @server.track track_path, context

    @_tracked = true


class TrackServer

  constructor: (@io, options) ->
    {path_delimiter} = options
    @path_delimiter = path_delimiter or '.'

    @_methods = {}

    @init(@io, options) if @io?

  init: (io, options={}) ->

    @io ?= io

    @server = new Server(@io, {}, options)

    for path, method of @_methods

      @server.set path, method

  track: (track_path, context={}) ->

    return if not track_path

    # TODO: support 'room != track_path' case?
    @server.channel.to(track_path).emit track_path + '_track', context

    return

  # method = (req, res, cb, socket) ->
  set: (path, method) ->

    self = @

    _m = (data, options, next, socket) ->

      # swaps
      if 'function' is typeof options
        socket = next
        next = options
        options = {}

      # request: clone and setup
      req = copy(socket.request)

      req.end = (cb) ->
        req.__ends__ = [] if not req.__ends__
        req.__ends__.push cb

      req.body = req.data = data
      req.path = path
      req.options = options ? {}

      responseOptions =
        disable_track: if options.auto_tracked_request then true else false

      # response: create
      res = new Response(self, responseOptions, null)

      # build callback: error handling, force_stop
      cb = (err, val) ->

        if req.__ends__
          req.__ends__.map (end) -> end()

        err = null if err is FORCE_STOP

        # custom error handling
        if err instanceof Error

          # obsolute
          if self._error
            self._error err, req, res, (err) ->
              err = {message: err.message} if err instanceof Error
              next err, res.val
            return

          err = {message: err.message}

        next err, res.val

      # method apply
      method req, res, cb, socket

    @_methods[path] = _m

    @server.set path, _m if @server?

  # obsolute
  # replace `app.use (err, req, res, next, socket) ->`
  error: (@_error) ->

    return @_error


# server which can handle middlewares like express
class StackServer extends TrackServer

  constructor: (@io=undefined, options={}) ->

    @settings = {
      pres: [] # obsolete
      methodHash: {}
      posts: []
    }

    super @io, options

  init: (io, options={}) ->

    TrackServer.prototype.init.call @, io, options

    @_updateAll()

  extend: (baseServer, prefix=null) ->

    return @ if not baseServer?

    _assign = (self, base) =>
      self.pres = self.pres.concat base.pres

      for path, methods of base.methodHash

        paths = []
        paths.push prefix if prefix
        paths.push path if path
        path = paths.join(@path_delimiter)

        self.methodHash[path] ?= []
        self.methodHash[path] = self.methodHash[path].concat methods

    _assign @settings, baseServer.settings

    @_updateAll()

    return @

  # add default middleware ... `(req, res, next, socket) ->`
  # > app.use method
  # add method ... `(req, res, next, socket) ->`
  # > app.use 'method', method
  # add named middleware and method
  # > app.use 'method', middleware, method
  # extend app.
  # > app.use subApp
  # add subApp with prefix
  # > app.use 'submodule', subApp
  # add error handler ... `(err, req, res, next, socket) ->`
  # > app.use handler
  # ... see unit test cases.
  use: (args...) ->
    path = ''

    for arg in args

      if arg instanceof StackServer
        @extend arg, path

      else if arg instanceof Function

        if arg.length is 5 # (err, req, res, next, socket) ->
          @settings.posts.push arg
          @_updateAll()

        else
          @settings.methodHash[path] ?= []
          @settings.methodHash[path].push arg
          @_update(path)

      else if typeof(arg) is 'string' or arg instanceof String
        path = arg

      else
        console.log 'warning, invalid argument:', arg

    return @

  _updateAll: ->
    {methodHash} = @settings

    for path of methodHash

      @_update(path)

  _update: (path) ->

    paths = path.split @path_delimiter

    {pres, methodHash, posts} = @settings

    _methods = pres.concat(methodHash?[''] or [])

    for len in [0...paths.length]
      _path = paths[0..len].join(@path_delimiter)
      _methods = _methods.concat(methodHash?[_path] or [])

    _methods = _methods.concat posts or []

    @set path, (req, res, cb, socket) ->

      async.eachSeries _methods, (method, cb) ->

        res._cb = cb

        method(req, res, cb, socket)

      , cb

  # obsolete
  pre: (args...) ->

    @settings.pres.push method for method in args

    @_updateAll()

    return @


module.exports = StackServer