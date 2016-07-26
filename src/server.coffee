
async = require('async')
{Server} = require('minimum-rpc')
copy = require('shallow-copy')

# for stopping in async flow
FORCE_STOP = "FORCE_STOP"

# mock response object like express
class Response
  constructor: (@_cb) ->
  send: (val) ->
    @val = val
    @_cb(FORCE_STOP, val)
  json: (val) ->
    @val = val
    @_cb(FORCE_STOP, val)

# server which can handle middlewares like express
class StackServer

  constructor: (@io=undefined, options={}) ->

    @server = new Server(@io, {}, options) if @io?

    @pres = []

    @methods = {}

  extend: (baseServer) ->

    return @ if not baseServer?

    @pres = baseServer.pres.concat @pres

    methods = {}

    methods[name] = method for name, method of baseServer.methods

    methods[name] = method for name, method of @methods

    @methods = methods

    @_error = null

  setupServer: (@io, options={}) ->

    @server = new Server(@io, {}, options)

    for path, methods of @methods

      @_update(path)

  pre: (args...) ->

    methods = args

    options = {}

    @pres.push {method, options} for method in methods

  get_sub_name_space: (path, req) ->
    return '__'

  track: (path, data, sub_name_space='__') ->

    @server.channel.to(sub_name_space).emit sub_name_space + '.' + path + '_track', data

  error: (@_error) ->

  use: (args...) ->

    if typeof(args[0]) is 'string' or args[0] instanceof String
      path = args[0]
      @methods[path] ?= []
      methods = @methods[path]
      args = args[1..]
    else
      path = null
      methods = []

    if not (args[0] instanceof Function)
      options = args[0]
      args = args[1..]
    else
      options = {}

    methods.push {method, options} for method in args

    @_update(path) if path?

  _update: (path) ->

    return if not @server?

    self = @

    _methods = @pres.concat(@methods[path])

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

      res = new Response()

      series = []

      track = false

      async.eachSeries _methods, ({method, options}, cb) ->

        res._cb = cb
        track = true if options.track
        method(req, res, cb, socket)

      , (err, val) ->

        if track
          sub_name_space = self.get_sub_name_space(path, req)
          moduleName = path.split('.')[0]
          self.track.call(self, moduleName, res.val, sub_name_space)

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

    # minimum-rpcのデフォルトsub name spaceに対して追加している
    # trackイベントはsub name spaceを使うが、メソッドの実行自体はdefault sub name spaceを使う
    @server.set path, _m


module.exports = StackServer
