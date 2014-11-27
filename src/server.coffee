
async = require('async')
{Server} = require('minimum-rpc')

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

  constructor: (@io, options={}) ->

    @server = new Server(@io, {}, options)

    @pres = []

    @methods = {}

  pre: () ->

    methods = [].slice.call(arguments, 0)

    options = {}

    @pres.push {method, options} for method in methods

  track: (data) ->

    @server.channel.emit @server.sub_name_space + '_track', {data}

  trackBy: (methods, data) ->

    methods = [] if not methods?

    methods = [methods] if not Array.isArray(methods)

    @server.channel.emit @server.sub_name_space + '_track', {methods: methods, data: data}

  use: () ->

    path = arguments[0]

    options = arguments[1]

    methods = [].slice.call(arguments, 1)

    if options.constructor.name is "Function"
      options = {}
    else
      methods = [].slice.call(arguments, 2)

    @methods[path] = [] if not (path of @methods)

    @methods[path].push {method, options} for method in methods

    @_update(path)

  _update: (path) ->

    self = @

    _methods = @pres.concat(@methods[path])

    _m = (data, next, socket) ->

      req = socket.request

      req.data = data

      res = new Response()

      series = []

      track = false

      async.eachSeries _methods, ({method, options}, cb) ->
        res._cb = cb
        track = true if options.track
        method(req, res, cb, socket)
      , (err, val) ->
        err = null if err is FORCE_STOP
        err = {message: err.message} if err instanceof Error
        self.track.call(self, res.val) if track
        next(err, res.val)

    @server.set path, _m


module.exports = StackServer
