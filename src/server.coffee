
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

    @posts = []

    @methods = {}

  extend: (baseServer) ->

    return @ if not baseServer?

    @pres = baseServer.pres.concat @pres

    @posts = baseServer.posts.concat @posts

    methods = {}

    methods[name] = method for name, method of baseServer.methods

    methods[name] = method for name, method of @methods

    @methods = methods

  setupServer: (@io, options={}) ->

    @server = new Server(@io, {}, options)

    for path, methods of @methods

      @_update(path)

  pre: () ->

    methods = [].slice.call(arguments, 0)

    options = {}

    @pres.push {method, options} for method in methods

  track: (data) ->

    @server.channel.emit @server.sub_name_space + '_track', {data}

  use: ->

    args = [].slice.call(arguments)

    if args[0] instanceof String
      path = args[0]
      @methods[path] ?= []
      methods = @methods[path]
      args = args[1..]
    else
      path = null
      methods = @posts

    if not args[0] instanceof Function
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

    _m = (data, next, socket) ->

      req = copy(socket.request)

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
        if err?
          async.eachSeries self.posts, ({method, options}, cb) ->
            res._cb = cb
            method err, req, res, cb
          , (_err, _val) ->
            next err, res.val
        else
          next null, res.val

    @server.set path, _m


module.exports = StackServer
