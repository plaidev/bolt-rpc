
async = require('async')
{Server} = require('minimum-rpc')
copy = require('shallow-copy')

DEFAULT_SUB_NAME_SPACE = '__'

# for stopping in async flow
FORCE_STOP = "FORCE_STOP"

# mock response object like express
class Response
  constructor: (@server, @options, @_cb) ->
  send: (val) ->
    @val = val
    @_cb(FORCE_STOP, val)
  json: (val) ->
    @val = val
    @_cb(FORCE_STOP, val)
  track: (track_path, context, track_name_space) ->
    track_path ?= @options.track_path or ''
    context ?= {}
    track_name_space ?= @options.track_name_path or DEFAULT_SUB_NAME_SPACE
    @server.track track_path, context, track_name_space

# server which can handle middlewares like express
class StackServer

  constructor: (@io=undefined, options={}) ->
    {path_delimiter} = options
    @path_delimiter = path_delimiter or '.'

    @settings = {
      DEFAULT_SUB_NAME_SPACE: {
        pres: []
        methodHash: {}
        posts: []
      }
    }

    @init(@io, options) if @io?

  init: (@io, options={}) ->

    @server = new Server(@io, {}, options)

    for sub_name_space, {pres, methodHash} of @settings

      for path of methodHash

        @_update(sub_name_space, path)

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

    for sub_name_space, base of baseServer.settings
      @settings[sub_name_space] ?= {pres: [], methodHash: {}, posts: []}
      _assign @settings[sub_name_space], base

    @_error = null

    for sub_name_space, {methodHash} of @settings

      for path of methodHash

        @_update(sub_name_space, path)

  get_track_name_space: (path, req) ->
    return '__'

  get_track_path: (path, req) ->
    return path

  track: (track_path, context, track_name_space=DEFAULT_SUB_NAME_SPACE) ->

    @server.channel.to(track_name_space).emit track_name_space + '.' + track_path + '_track', context

  error: (@_error) ->
    return @_error

  ns: (sub_name_space) ->
    return {
      pre: (args...) =>
        @pre {sub_name_space}, args...
      use: (args...) =>
        @use {sub_name_space}, args...
    }

  pre: (args...) ->
    sub_name_space = null

    if not (args[0] instanceof Function)
      {sub_name_space} = args[0] if args[0]
      args = args[1..]

    sub_name_space ?= DEFAULT_SUB_NAME_SPACE

    @settings[sub_name_space] ?= {pres: [], methodHash: {}, posts: []}
    @settings[sub_name_space].pres.push method for method in args

    for path in @settings[sub_name_space].methodHash

      @_update(sub_name_space, path)

  use: (args...) ->
    sub_name_space = DEFAULT_SUB_NAME_SPACE
    path = ''
    track = false

    for arg in args

      if arg instanceof StackServer
        @extend arg, path

      else if arg instanceof Function

        @settings[sub_name_space] ?= {pres: [], methodHash: {}, posts: []}

        if arg.length is 5 # (err, req, res, next, socket) ->
          @settings[sub_name_space].posts.push arg

        else
          @settings[sub_name_space].methodHash[path] ?= []
          @settings[sub_name_space].methodHash[path].push arg

        @_update(sub_name_space, path, track)

      else if typeof(arg) is 'string' or arg instanceof String
        path = arg

      else
        sub_name_space = arg.sub_name_space if arg.sub_name_space?
        track = arg.track if arg.track?

  _update: (sub_name_space, path, track=false) ->
    return if not @server?

    self = @

    {pres, methodHash, posts} = @settings[sub_name_space]
    paths = path.split @path_delimiter

    _methods = pres.concat(methodHash[''] or [])
    for len in [0...paths.length]
      _path = paths[0..len].join(@path_delimiter)
      _methods = _methods.concat(methodHash[_path] or [])

    _methods = _methods.concat posts

    _m = (data, options, next, socket) ->

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
        track_name_space: self.get_track_name_space(path, req)
        track_path: self.get_track_path(path, req)

      res = new Response(self, responseOptions, null)

      if track and not options.auto_tracked_request
        req.__ends__ = [] if not req.__ends__
        req.__ends__.push ->
          res.track(undefined, {auto_track: true})

      series = []

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

    @server.set path, _m, sub_name_space

  # obsolete
  setupServer: (args...) ->
    @init args...


module.exports = StackServer
