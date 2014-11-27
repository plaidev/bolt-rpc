
{Client} = require('minimum-rpc')

class TrackCursor
  constructor: (@method, @data, @cb) ->

class TrackClient extends Client
  constructor: (io_or_socket, options) ->
    super io_or_socket, options

    @_cursors = {}

    @_socket.on @sub_name_space + '_track', (data) =>

      for method, cursors of @_cursors
        if not data.methods? or method in data.methods
          @send cursor.method, cursor.data, cursor.cb for cursor in cursors

  track: (method, data, cb) ->

    cursor = new TrackCursor(method, data, cb)

    if @_cursors[method]?
      @_cursors[method].push cursor
    else
      @_cursors[method] = [cursor]

    @send method, data, cb

    return cursor


module.exports = TrackClient
