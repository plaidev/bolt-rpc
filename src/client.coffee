# event emitter for component and node.js
try
  Emitter = require('emitter')
catch
  Emitter = require('events').EventEmitter

{Client} = require('minimum-rpc')

# cursor class
class TrackCursor extends Emitter

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

# client class
class TrackClient extends Client

  constructor: (io_or_socket, options) ->
    super io_or_socket, options

    @_cursors = []

    @_socket.on @sub_name_space + '_track', (data) =>

      cursor.update() for cursor in @_cursors

  # track api which return cursor obj.
  track: (method, data, cb) ->

    cursor = new TrackCursor(method, data, cb, @)

    @_cursors.push(cursor)

    cursor.update()

    return cursor



module.exports = TrackClient
