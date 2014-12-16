try
  Emitter = require('emitter')
catch
  Emitter = require('events').EventEmitter
{Client} = require('minimum-rpc')

class TrackCursor extends Emitter
  constructor: (@method, @data, @cb) ->
    @val = null
    @err = null

  error: (cb) ->
    @on 'error', cb
    return @
  end: (cb) ->
    @on 'end', cb
    return @

class TrackClient extends Client
  constructor: (io_or_socket, options) ->
    super io_or_socket, options

    @_cursors = []

    @_socket.on @sub_name_space + '_track', (data) =>

      @send cursor.method, cursor.data, cursor.cb for cursor in @_cursors

  track: (method, data, cb) ->

    cursor = new TrackCursor(method, data, cb)

    @_cursors.push(cursor)

    @send method, data, cb

    return cursor

  get: (method, data) ->

    cursor = new TrackCursor(method, data)

    @send method, data, (err, val) ->
      cursor.err = err or null
      cursor.val = val or null
      if err
        cursor.emit 'error', err
      else
        cursor.emit 'end', val

    return cursor



module.exports = TrackClient
