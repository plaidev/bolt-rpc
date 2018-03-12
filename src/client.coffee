# event emitter for component and node.js
try
  Emitter = require('component-emitter')
catch
  Emitter = require('events').EventEmitter

{Client} = require('minimum-rpc')
async = require 'async'

__swap_options_and_handler = ({options, handler}) ->
  if typeof options is 'function' or options instanceof Function
    return {handler: options, options: handler ? {}}
  return {handler, options}


# cursor class
class Cursor extends Emitter

  constructor: (@client, @method, @data, @options, handler) ->

    @val = null
    @err = null
    @calling = false

    @context = null

    # @pres -> <client.send> -> @mdls -> @posts
    @_pres = []  # (data, context, next) -> next(null, data, context)
    @_mdls = []  # (val) -> val
    @_posts = [] # (val, next) -> next(null, val)

    if handler
      @on 'error', (err) ->
        handler err
      @on 'end', (val) ->
        handler null, val

  # error handler
  error: (cb) ->
    @on 'error', cb
    return @

  # success handler
  end: (cb) ->
    @on 'end', cb
    return @

  # querying
  update: (data=undefined, context={}) ->
    # update query data if exists
    @data = data if data isnt undefined

    # not update if @data is undefined.
    return @ if @data is undefined

    return @ if context is null

    # reject if now calling, but keep request, data and context.
    if @calling

      # auto_track is week request, don't update non auto_track context.
      if context.auto_track and @context? and not @context.auto_track
        return @

      # keep auto track context
      @context = context

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
      return if not @context?

      context = @context
      @context = null

      setTimeout =>
        @update undefined, context
      , 0

    return @

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
      options.auto_track ?= true if context.auto_track

      @client.send @method, data, options, (err, val) =>
        return cb err if err

        try
          val = mdl(val) for mdl in @_mdls
        catch e
          return cb err

        @_post_methods val, cb

  # sync middlewares
  map: (mdl=(val) -> val) ->
    @_mdls.push(mdl)

  pre: (func=(data, context, next) -> next()) ->
    # for back compatibility. i.e. `(data, context, next) -> next()`
    @_pres.push (data, context, cb) ->
      func data, context, (err, args...) ->
        if args.length is 0
          return cb err, data, context
        cb err, args...
    return @

  post: (func=(val, next) -> next(null, val)) ->
    @_posts.push func
    return @

  isUpdateScheduled: ->
    return @context?


# cursor with track filters
class TrackCursor extends Cursor

  constructor: (client, method, data, options, handler, track_path) ->

    super client, method, data, options, handler

    # enable update by track
    @tracking = false

    # activate tracking
    return if not track_path

    # TODO: support 'room != track_path' case?
    @client.join track_path

    @client._socket.on track_path + '_track', (trackContext) =>
      return if not @tracking
      @update undefined, trackContext

  track: (flag) ->
    old = @tracking
    @tracking = flag
    if not old and @tracking
      @update()
    return @


# client class
# TODO: not 'is a'
class TrackClient extends Client

  constructor: (io_or_socket, options={}, cb=null) ->
    {@track_path} = options

    super io_or_socket, options, cb

  # track api which return cursor.
  track: (method, data=undefined, options={}, handler=null) ->

    {handler, options} = __swap_options_and_handler {options, handler}

    track_path = options.track_path ? @track_path ? method

    cursor = new TrackCursor(@, method, data, options, handler, track_path)

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
