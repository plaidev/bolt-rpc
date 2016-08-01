# event emitter for component and node.js
try
  Emitter = require('component-emitter')
catch
  Emitter = require('events').EventEmitter

{Client} = require('minimum-rpc')


__swap_options_and_handler = ({options, handler}) ->
  if 'function' is typeof options
    return {handler: options, options: {}}
  return {handler, options}

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

  constructor: (@client, @method, @data, @options={}, @handler) ->

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
        @updateRequest = false
        setTimeout =>
          @update()
        , 0

    return @

  # middlewares
  map: (mdl) ->
    @mdls.push(mdl)
    return @

# cursor with track filters
class TrackCursor extends Cursor

  # options.name_space
  # options.sub_name_space
  # options.track_name_space
  # options.track_path
  constructor: (client, method, data, options, handler) ->

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

    super(client, method, data, options, handler)

    # activate tracking
    sub_name_space = @client.sub_name_space
    {track_name_space, track_path} = @options

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

  constructor: (io_or_socket, options={}) ->
    {track_name_space} = options
    @default_track_name_space = track_name_space if track_name_space?

    super io_or_socket, options

  # track api which return cursor.
  track: (method, data=null, options={}, handler=null) ->

    {options, handler} = __swap_options_and_handler {options, handler}
    options.track_name_space ?= @default_track_name_space if @default_track_name_space?

    cursor = new TrackCursor(@, method, data, options, handler)

    cursor.update()

    return cursor

  # track api which return cursor obj.
  get: (method, data, options) ->

    res = {
      err: null
      val: null
    }

    cursor = @track method, data, options, (err, val) ->
      res.err = err
      res.val = val

    return res

module.exports = TrackClient
