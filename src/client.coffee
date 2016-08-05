# event emitter for component and node.js
try
  Emitter = require('component-emitter')
catch
  Emitter = require('events').EventEmitter

{Client} = require('minimum-rpc')
async = require 'async'

__swap_options_and_handler = ({options, handler}) ->
  if 'function' is typeof options
    return {handler: options, options: {}}
  return {handler, options}


# cursor class
class Cursor extends Emitter

  constructor: (@client, @method, @data, @options={}) ->

    @val = null
    @err = null
    @calling = false
    @updateRequest = false

    # @pres and @posts are async methods
    # @pres -> <client.send> -> @mdls -> @postsの順に実行
    @_mdls = []
    @_pres = []
    @_posts = []

  # error handler
  error: (cb) ->
    @on 'error', cb
    return @

  # success handler
  end: (cb) ->
    @on 'end', cb
    return @

  # querying
  update: (data, context) ->
    # update query data
    @data = data if data isnt undefined
    return if @data is undefined

    # reject if now calling, but keep data and request.
    if @calling
      @updateRequest = {}
      if context?.auto_track
        @updateRequest.auto_track ?= context.auto_track
      return @

    @calling = true

    @_query_with_middlewares @data, context, (err, val) =>

      # update results
      @err = err or null
      @val = val or null

      @calling = false

      if err
        @emit 'error', err
      else
        @emit 'end', val

      # update more once if requested
      if @updateRequest
        context = @updateRequest
        @updateRequest = false
        setTimeout =>
          @update undefined, context
        , 0

  _pre_methods: (data, context, cb) ->
    async.waterfall [
      (next) -> next null, data, context
    ].concat(@_pres), cb

  _post_methods: (val, cb) ->
    async.waterfall [
      (next) -> next null, val
    ].concat(@_posts), cb

  _query_with_middlewares: (data, context, cb) ->

    @_pre_methods data, context, (err, data) =>
      return cb err if err

      options = {}
      options[k] = v for own k, v of @options
      options.auto_tracked_request = true if context?.auto_track

      @client.send @method, data, options, (err, val) =>
        return cb err if err

        try
          val = mdl(val) for mdl in @_mdls
        catch e
          return cb err

        @_post_methods val, cb

  # sync middlewares
  map: (mdl) ->
    @_mdls.push(mdl)

  pre: (func) ->
    @_pres.push (data, context, cb) ->
      func data, context, (err, args...) ->
        if args.length is 0
          return cb err, data, context
        cb err, args...
    return @

  post: (func) ->
    @_posts.push func
    return @


# cursor with track filters
class TrackCursor extends Cursor

  # options.name_space
  # options.sub_name_space
  # options.track_name_space
  # options.track_path
  constructor: (client, method, data, options, handler) ->

    # swaps
    {options, handler} = __swap_options_and_handler {options, handler}

    # enable update by track
    @tracking = false

    super(client, method, data, options)

    if handler
      @on 'error', (err) ->
        handler err
      @on 'end', (val) ->
        handler null, val

    # activate tracking
    sub_name_space = @client.sub_name_space
    {track_name_space, track_path} = @options

    if track_name_space? and track_name_space isnt '__' and track_name_space isnt sub_name_space
      @client.join track_name_space

    track_name_space ?= sub_name_space or '__'
    track_path ?= method

    @client._socket.on track_name_space + '.' + track_path + '_track', (trackContext) =>
      return if @tracking is false

      @update undefined, trackContext

  track: (flag) ->
    old = @tracking
    @tracking = flag
    if not old and @tracking
      @update()
    return @


# client class
class TrackClient extends Client

  constructor: (io_or_socket, options={}) ->
    {track_name_space} = options
    @default_track_name_space = track_name_space if track_name_space?

    super io_or_socket, options

  # track api which return cursor.
  track: (method, data={}, options={}, handler=null) ->

    {options, handler} = __swap_options_and_handler {options, handler}
    options.track_name_space ?= @default_track_name_space if @default_track_name_space?

    cursor = new TrackCursor(@, method, data, options, handler)

    return cursor

  # track api which return cursor obj.
  get: (method, data={}, options={}) ->

    res = {
      err: null
      val: null
    }

    cursor = @track method, data, options, (err, val) ->
      res.err = err
      res.val = val

    cursor.track true

    return res

module.exports = TrackClient
