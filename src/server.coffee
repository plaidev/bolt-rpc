
async = require('async')
{Server} = require('minimum-rpc')
copy = require('shallow-copy')

# for stopping in async flow
FORCE_STOP = "FORCE_STOP"

# mock response object like express
class Response
  constructor: (@server, @options, @_cb) ->
    # already tracked, if requested by auto track.
    @_tracked = @options.auto_track is true

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
        auto_track: options?.auto_track

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

    {path_delimiter} = options
    @path_delimiter = path_delimiter or '/'

    @_nodes = []

    @settings = {
      pres: [] # obsolete
      posts: []
    }

    super @io, options

  init: (io, options={}) ->

    TrackServer.prototype.init.call @, io, options

    @_update()

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
        @settings.pres = @settings.pres.concat arg.settings.pres
        @settings.posts = arg.settings.posts.concat @settings.posts

        @_nodes.push {name: path, nodes: arg._nodes}

        for name of arg._methods
          _path = []
          _path.push path if path
          _path.push name if name
          @_update _path.join('/')

      else if arg instanceof Function

        if arg.length is 5 # (err, req, res, next, socket) ->
          @settings.posts.push arg
          @_update()

        else
          @_nodes.push {name: path, method: arg}

          @_update(path)

      else if typeof(arg) is 'string' or arg instanceof String
        path = arg

      else
        console.log 'warning, invalid argument:', arg

    return @

  _update: (path) ->

    paths = if path then [path] else Object.keys(@_methods)

    paths.forEach (path) =>

      _methods = @_traverse '/'+path, @_nodes

      {pres, posts} = @settings
      methods = pres.concat(_methods).concat(posts)

      @set path, (req, res, cb, socket) ->

        async.eachSeries methods, (method, cb) ->

          res._cb = cb

          method(req, res, cb, socket)

        , cb

  # nodes = [
  #   {name: '', method: ->}
  #   {name: '', nodes: [
  #     {name: 'module', nodes: [
  #       {name: 'method', method: ->}
  #     ]}
  #   ]}
  #   {name: 'module', nodes: [
  #     {name: '', method: ->}
  #   ]}
  #   {name: 'methodA', nodes: [
  #     {name: '', method: ->}
  #     {name: '', method: ->}
  #   ]}
  #   {name: '', method: ->}
  # ]
  _traverse: (path, nodes, basePath='') ->
    methods = []

    for node in nodes

      currentPath = basePath
      currentPath += @path_delimiter + node.name if node.name

      continue if path isnt currentPath and not path.startsWith(currentPath+'/')

      if 'nodes' of node
        _methods =  @_traverse path, node.nodes, currentPath
        methods = methods.concat _methods

      else if 'method' of node
        methods.push node.method

    return methods

  # deprecated
  pre: (args...) ->

    @settings.pres.push method for method in args

    @_update()

    return @


module.exports = StackServer