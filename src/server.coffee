
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

  track: (track_path..., context) ->
    return if @_tracked

    if (typeof context is 'string') or (context instanceof String)
      track_path.push context
      context = {}

    return if track_path.length is 0

    context.auto_track ?= true

    @server.track track_path..., context

    @_tracked = true

# server which can handle middlewares like express
class StackServer

  constructor: (@io=undefined, options={}) ->
    {path_delimiter} = options
    @path_delimiter = path_delimiter or '.'

    @settings = {
      pres: []
      methodHash: {}
      posts: []
    }

    @init(@io, options) if @io?

  init: (@io, options={}) ->

    @server = new Server(@io, {}, options)

    {methodHash} = @settings

    for path of methodHash

      @_update(path)

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

    @_error = null

    {methodHash} = @settings

    for path of methodHash

      @_update(path)

  track: (track_path..., context) ->

    return if track_path.length is 0

    @server.channel.to(track_path[0]).emit track_path.join(@path_delimiter) + '_track', context

  error: (@_error) ->
    return @_error

  pre: (args...) ->

    @settings.pres.push method for method in args

    for path in @settings.methodHash

      @_update(path)

  use: (args...) ->
    path = ''

    for arg in args

      if arg instanceof StackServer
        @extend arg, path

      else if arg instanceof Function

        if arg.length is 5 # (err, req, res, next, socket) ->
          @settings.posts.push arg

        else
          @settings.methodHash[path] ?= []
          @settings.methodHash[path].push arg

        @_update(path)

      else if typeof(arg) is 'string' or arg instanceof String
        path = arg

      else
        console.log 'warning, invalid argument:', arg

  _update: (path) ->
    return if not @server?

    self = @

    paths = path.split @path_delimiter

    _m = (data, options, next, socket) =>

      # swaps
      if 'function' is typeof options
        socket = next
        next = options
        options = {}

      req = copy(socket.request)

      req.end = (cb) ->
        req.__ends__ = [] if not req.__ends__
        req.__ends__.push cb

      req.body = req.data = data
      req.path = path
      req.options = options ? {}

      responseOptions =
        disable_track: if options.auto_tracked_request then true else false

      res = new Response(self, responseOptions, null)

      series = []

      {pres, methodHash, posts} = @settings or {}
      pres ?= []
      _methods = pres.concat(methodHash?[''] or [])
      for len in [0...paths.length]
        _path = paths[0..len].join(@path_delimiter)
        _methods = _methods.concat(methodHash?[_path] or [])

      _methods = _methods.concat posts or []

      async.eachSeries _methods, (method, cb) ->

        res._cb = cb

        method(req, res, cb, socket)

      , (err, val) ->

        if req.__ends__
          req.__ends__.map (end) -> end()

        err = null if err is FORCE_STOP

        # custom error handling
        if err instanceof Error
          if self._error
            self._error err, req, res, (err) ->
              err = {message: err.message} if err instanceof Error
              next err, res.val
            return

          err = {message: err.message}

        next err, res.val

    @server.set path, _m

  # obsolete
  setupServer: (args...) ->
    @init args...


module.exports = StackServer
