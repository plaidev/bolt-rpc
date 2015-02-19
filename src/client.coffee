# event emitter for component and node.js
try
  Emitter = require('emitter')
catch
  Emitter = require('events').EventEmitter

{Client} = require('minimum-rpc')

# cursor class
class Cursor extends Emitter

  constructor: (@method, @data, @cb, @client) ->
    @val = null
    @err = null
    @mdls = []

  # error handler
  error: (cb) ->
    @on 'error', cb
    return @

  # success handler
  end: (cb) ->
    @on 'end', cb
    return @

  # querying
  update: (_data) ->
    @data = _data if _data isnt undefined

    @client.send @method, @data, (err, val) =>
      @err = err or null
      @val = val or null
      if err
        @emit 'error', err
      else
        val = mdl(val) for mdl in @mdls
        @emit 'end', val
      @cb(err, val) if @cb

    return @

  # middlewares
  map: (mdl) ->
    @mdls.push(mdl)
    return @

buildChain = (funcs, cb) ->
  err = null
  val = undefined
  _bind = (cur, next) ->
    (_err, _val) ->
      err = _err if _err
      val = _val if _val
      cur err, val, next
  next = (err, val, next) ->
    cb err, val
  for cur in funcs.reverse()
    next = _bind(cur, next)
  next

# cursor with track filters
class TrackCursor extends Cursor

  constructor: (method, data, cb, client) ->
    @pres = []
    @posts = []
    @tracking = false

    _cb = (err, val) =>
      @tracking = false
      next = buildChain(@posts, cb)
      next err, val

    super(method, data, _cb, client)

  pre: (func) ->
    @pres.push func
    return @

  post: (func) ->
    @posts.push func
    return @

  update: (_data, trackContext) ->
    @data = _data if _data isnt undefined
    return if @tracking

    @tracking = true
    next = buildChain @pres, (err, trackContext) =>
      return if err
      super _data
    next(null, trackContext)

# client class
class TrackClient extends Client

  constructor: (io_or_socket, options) ->
    super io_or_socket, options

    @_cursors = []

    @_socket.on @sub_name_space + '_track', (trackContext) =>

      for cursor in @_cursors

        cursor.update(undefined, trackContext)

  # track api which return cursor obj.
  track: (method, data, cb) ->

    cursor = new TrackCursor(method, data, cb, @)

    @_cursors.push(cursor)

    cursor.update()

    return cursor

  # track api which return cursor obj.
  get: (method, data, cb) ->

    res = {
      err: null
      val: null
    }

    cursor = @track method, data, (err, val) ->
      res.err = err
      res.val = val

    return res

module.exports = TrackClient
