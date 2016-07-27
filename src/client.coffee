# event emitter for component and node.js
try
  Emitter = require('component-emitter')
catch
  Emitter = require('events').EventEmitter

{Client} = require('minimum-rpc')


__swap_options_and_cb = ({options, cb}) ->
  if 'function' is typeof options
    return {cb: options, options: {}}
  return {cb, options}

__build_chain = (funcs, cb) ->
  err = null
  val = undefined
  _bind = (cur, next) ->
    (_err, _val) ->
      err = _err if _err
      val = _val if _val
      cur err, val, next
  next = (err, val, next) ->
    cb err, val if cb
  for cur in Array.prototype.concat(funcs).reverse()
    next = _bind(cur, next)
  next


# cursor class
class Cursor extends Emitter

  constructor: (@method, @data, @options, @handler, @client) ->

    # swaps
    if 'function' is typeof @options
      @client = @handler
      @handler = @options
      @options = {}

    @val = null
    @err = null
    @mdls = []
    @calling = false
    @updateRequest = false

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
    return if not @data?

    if @calling
      @updateRequest = true
      return @

    @calling = true
    @updateRequest = false
    @client.send @method, @data, @options, (err, val) =>
      @calling = false
      @err = err or null
      @val = val or null
      if err
        @emit 'error', err
      else
        val = mdl(val) for mdl in @mdls
        @emit 'end', val

      # TODO: @cb must be sync method
      @handler(err, val) if @handler

      if @updateRequest
        setTimeout @update, 0

    return @

  # middlewares
  map: (mdl) ->
    @mdls.push(mdl)
    return @

# cursor with track filters
class TrackCursor extends Cursor

  constructor: (method, data, options, handler, client) ->

    # swaps
    if typeof options is 'function'
      client = handler
      handler = options
      options = {}

    # enable update by track
    @tracking = true

    # @pres and @posts are async methods
    # @pres -> <client.send> -> @mdls -> (@emit 'end') -> @posts -> @handlerの順に実行
    # FIXME: presはtrackからupdateされるケースでしか実行されない
    # FIXME: postsはendイベントで飛ぶデータに掛かっていない
    @pres = []
    @posts = []

    _handler = null
    if handler?
      # FIXME: handlerがなくてもpostsは実行されるべき?
      _handler = (err, val) =>
        next = __build_chain(@posts, handler)
        next err, val

    super(method, data, options, _handler, client)

    # activate tracking
    {track_name_space, sub_name_space, track_path} = @options

    if track_name_space? and track_name_space isnt '__' and track_name_space isnt sub_name_space
      @client.join track_name_space

    track_name_space ?= sub_name_space or '__'
    track_path ?= method

    @client._socket.on track_name_space + '.' + track_path + '_track', (trackContext) =>

      @_update_by_track(trackContext)

  pre: (func) ->
    @pres.push func
    return @

  post: (func) ->
    @posts.push func
    return @

  track: (flag) ->
    @tracking = flag
    return @

  _update_by_track: (trackContext) ->
    return if @tracking is false

    next = __build_chain @pres, (err, trackContext) =>
      return if err
      @update()

    next(null, trackContext)

# client class
class TrackClient extends Client

  constructor: (io_or_socket, options) ->
    super io_or_socket, options

  # track api which return cursor obj.
  track: (method, data=null, options=null, handler=null) ->

    {options, handler} = __swap_options_and_cb {options, handler}

    cursor = new TrackCursor(method, data, options, handler, @)

    cursor.update()

    return cursor

  # track api which return cursor obj.
  get: (method, data, options...) ->

    res = {
      err: null
      val: null
    }

    cursor = @track method, data, options, (err, val) ->
      res.err = err
      res.val = val

    return res

module.exports = TrackClient
