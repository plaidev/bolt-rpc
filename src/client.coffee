
{Client} = require('minimum-rpc')

class TrackCursor
  constructor: (@method, @data, @cb) ->

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


module.exports = TrackClient
