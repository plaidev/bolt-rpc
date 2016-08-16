
assert = require("assert")
sinon = require('sinon')
app = require("http").createServer()
io = require("socket.io")(app)
io_for_client = require('socket.io-client')
{Server, Client} = require('..')

_ = require 'lodash'

# server
app.listen 2000, () ->
  console.log 'server listen start'
server = new Server(io)

# client
client = new Client io_for_client, {url: 'http://localhost:2000'}

describe "Basic RPC Function", ->

  it "1 + 2 = 3", (done) ->

    pre = sinon.spy (req, res, next) ->
      next()

    validate = sinon.spy (req, res, next) ->
      return next(new Error('requied parameter: a')) if not req.data?.a?
      next()

    # auth
    server.pre pre

    server.pre (req, res, next) ->
      req.end () ->
      next()

    # validate
    server.use 'add', validate

    # procedure
    server.use 'add', (req, res, next) ->
      a = req.data.a
      b = req.data.b
      temp = a + b
      temp += 1 if req.options.plusone
      res.send temp

    # normal api
    client.send 'add', {a: 1, b: 2}, (err, val) ->
      assert not err
      assert val is 3
      assert pre.called
      assert validate.called
      done()

  it 'custom error handling', (done) ->

    success_catch_error = false

    server.use 'customerror', (req, res, next) ->
      next new Error 'custom error'

    server.error (err, req, res, next) ->
      assert err.message is 'custom error'
      success_catch_error = true
      next err

    client.send 'customerror', {}, (err, val) ->
      assert err.message is 'custom error'
      assert success_catch_error is true
      # delete error handler
      server.error null
      done()

describe 'Promise API', ->

  it 'end', (done) ->

    cursor = client.track 'add', {a: 1, b: 2}, {plusone: true}
    assert cursor.val is null
    cursor.end (val) ->
      assert val is 4
      assert cursor.val is val
      done()
    cursor.track true

  it 'error', (done) ->

    cursor = client.track 'add', {b: 2}
    cursor.error (err) ->
      assert err
      assert cursor.err is err
      done()
    cursor.track true

  it 'chainable', (done) ->

    cursor = client.track 'add', {a: 1, b: 2}
    cursor.error((err) ->).end (val) ->
      assert val is 3
      assert cursor.val is val
      done()
    cursor.track true

  it 'update', (done) ->
    updated = false
    cursor = client.track 'add', {a: 1, b: 2}
    cursor.end (val) ->
      if not updated
        cursor.update({a: 2, b: 3})
        updated = true
        return
      assert cursor.val is 5
      done()

    cursor.track true

  it 'map', (done) ->
    cursor = client.track 'add', {a: 1, b: 2}
    cursor.map (val) ->
      return val * 2
    cursor.map (val) ->
      return val - 1
    cursor.end (val) ->
      assert val is 5
      done()
    cursor.track true

  it 'pre', (done) ->
    setuped = false
    called = false
    server.use 'add3', (req, res, next) ->
      a = req.data.a
      b = req.data.b
      res.send a + b
    cursor = client.track 'add3', {a: 1, b: 2}, (err, val) ->
      return if not setuped
      assert val is 5
      assert called
      done()
    cursor.pre (data, context, next) ->
      called = true
      next null, data, context
    cursor.pre (data, context, next) ->
      data = {a: data.a * 2, b: data.b}
      next null, data, context
    cursor.pre (data, context, next) ->
      data = {a: data.a + 1, b: data.b}
      next null, data, context
    cursor.track true
    setTimeout ->
      setuped = true
      server.track 'add3', {}
    , 100

  it 'post', (done) ->
    cursor = client.track 'add', {a: 1, b: 2}
    cursor.track true
    cursor.post (val, next) ->
      next null, val * 2
    cursor.post (val, next) ->
      next null, val - 1
    cursor.end (val) ->
      assert val is 5
      done()

  it 'create heavy task server', (done) ->
    # heavy task. 1sec
    server.use 'heavyTask', (req, res, next) ->
      setTimeout ->
        res.send req.body
      , 200

    done()

  it 'update is reject concurrent calls.', (done) ->
    callCount = 0
    cursor = client.track 'heavyTask', {call: 1}
    cursor.end (val) ->
      assert val.call in [1, 5]
      callCount++
      if callCount >= 2
        done()
    cursor.track true
    cursor.update({call: 2})
    cursor.update({call: 3})
    cursor.update({call: 4})
    cursor.update({call: 5})

  it 'simple track cursor, end after update.', (done) ->
    check = false

    cursor = client.track 'add'
    cursor.end (val) ->
      assert check
      assert val is 3
      done()
    cursor.track true

    setTimeout ->
      check = true
      cursor.update({a: 1, b: 2})
    , 200

  it 'simple track cursor, track after update.', (done) ->
    called = 0

    server.use 'add2', (req, res, next) ->
      a = req.data.a
      b = req.data.b
      res.send a + b

    cursor = client.track 'add2', {a: 1, b: 2}
    cursor.end (val) ->
      called++
      assert called in [1, 2]
      assert val is 3
      if called >= 2
        done()
    cursor.track true

    setTimeout ->
      server.track 'add2', {}
    , 200

  it 'simple track cursor, track after call auto tracked method.', (done) ->
    setuped = false

    server.use 'add_auto_tracked', {track: true}, (req, res, next) ->
      a = req.data.a
      b = req.data.b
      res.send a + b

    cursor = client.track 'add_auto_tracked', {a: 1, b: 2}
    cursor.end (val) ->
      assert val is 3
      if setuped
        done()
    cursor.track true

    setTimeout ->
      setuped = true
      client2 = new Client io_for_client, {url: 'http://localhost:2000'}
      client2.send 'add_auto_tracked', {a: 3, b: 4}, (err, val) ->
        assert not err
        assert val is 7
    , 200

  it 'simple track cursor, track after call named auto tracked method.', (done) ->
    setuped = false

    server.use 'add_auto_tracked', {track: 'track_name'}, (req, res, next) ->
      a = req.data.a
      b = req.data.b
      res.send a + b

    cursor = client.track 'add_auto_tracked', {a: 1, b: 2}, {track_path: 'track_name'}
    cursor.end (val) ->
      assert val is 3
      if setuped
        done()
    cursor.track true

    setTimeout ->
      setuped = true
      client2 = new Client io_for_client, {url: 'http://localhost:2000'}
      client2.send 'add_auto_tracked', {a: 3, b: 4}, (err, val) ->
        assert not err
        assert val is 7
    , 200

  it 'track cursor with track_path, track after update.', (done) ->
    clientOther = new Client io_for_client, {
      url: 'http://localhost:2000'
      track_path: 'track_path'}

    setuped = false

    server.use 'addOther', (req, res, next) ->
      a = req.data.a
      b = req.data.b
      res.send a + b

    cursor = client.track 'addOther', {a: 1, b: 2}
    cursor.end (val) ->
      return if not setuped
      assert false # not called
    cursor.track true

    cursorOther = clientOther.track 'addOther', {a: 1, b: 2}
    cursorOther.end (val) ->
      return if not setuped
      assert val is 3
      done()
    cursorOther.track true

    setTimeout ->
      setuped = true
      server.track 'track_path', {}
    , 200

describe 'advanced', ->

  describe 'namespace', ->
    clientOtherNS = null

    before ->
      # server
      serverOther = new Server(io, {name_space: 'other'})

      # client
      clientOtherNS = new Client io_for_client, {url: 'http://localhost:2000', name_space: 'other'}

      serverOther.use 'method', (req, res) ->
        res.json {success: true}

    it 'other namespace method callable by namespaced client', (done) ->
      clientOtherNS.send 'method', {}, (err, val) ->
        assert val.success
        done()

  describe 'extend', ->

    before (done) ->

      pre = (req, res, next) =>
        @_order 'pre', req.body
        next()

      middleware1 = (req, res, next) =>
        @_order 'middleware1', req.body
        next()

      middleware2 = (req, res, next) =>
        @_order 'middleware2', req.body
        next()

      middleware3 = (req, res, next) =>
        @_order 'middleware3', req.body
        next()

      method = (req, res) =>
        @_order 'method', req.body
        res.json({success: true, data: req.data})

      subserver = new Server()
      subserver.pre pre
      subserver.use middleware2
      subserver.use 'method', middleware3, method

      # extend
      server.use 'submodule', middleware1, subserver

      rootserver = new Server()
      rootserver.use 'root_method', middleware1, method

      # extend
      server.use rootserver

      done()

    beforeEach (done) ->
      @sandbox = sinon.sandbox.create()
      @_order = @sandbox.spy (name) -> name
      done()

    afterEach (done) ->
      @sandbox.restore()
      done()

    it 'sub module callable', (done) ->

      client.send 'submodule.method', {a: 'A'}, (err, val) ->
        assert not err
        assert val.success
        assert val.data.a is 'A'
        done()

    it 'root_method call order', (done) ->

      client.send 'root_method', {}, (err, val) =>
        # !: pre belongs to 'root' as well as 'submodule'.
        assert _.isEqual @_order.returnValues, ['pre', 'middleware1', 'method']
        done()

    it 'submodule.method call order', (done) ->

      client.send 'submodule.method', {}, (err, val) =>
        assert _.isEqual @_order.returnValues, ['pre', 'middleware1', 'middleware2', 'middleware3', 'method']
        done()


describe 'track cursor', ->

  NS = 'track_auth'
  ACCEPT_ROOM = 'accept_room'
  REJECT_ROOM = 'reject_room'

  before (done) ->

    @server = new Server(io, {
      name_space: NS
      join: (socket, room, cb) ->
        if room is 'accept_room'
          cb() # accept
        else
          cb new Error 'security error' # reject
    })

    @server.use 'test', (req, res, next) ->
      res.json {success: true, method: 'test'}

    @server.use 'test_with_auto_track', (req, res, next) ->
      res.track ACCEPT_ROOM
      res.json {success: true}

    @clientModuleTrack = new Client io_for_client, {
      name_space: NS
      url: 'http://localhost:2000'
      track_path: ACCEPT_ROOM
    }

    done()

  it 'can join accept room', (done) ->

    cursor = @clientModuleTrack.track 'test_with_auto_track'

    called = 0

    cursor
      .error (err) ->
        console.log err
        assert false
      .end ({success}) ->
        assert success
        called++
        assert called < 2
        if called is 1
          cursor.track false
          done()
      .track true
      .update {}

  it 'cannot join reject room', (done) ->

    cursor = @clientModuleTrack.track 'test_with_auto_track', undefined, {
      track_path: REJECT_ROOM
    }

    called = 0

    cursor
      .error (err) ->
        console.log err
        assert false
      .end ({success}) ->
        assert success
        called++
        assert called < 2
        if called is 1
          cursor.track false
          done()
      .track true
      .update {}

    @server.track REJECT_ROOM

  it 'can update by accept room track', (done) ->

    cursor = @clientModuleTrack.track 'test', undefined, {
      track_path: ACCEPT_ROOM
    }

    called = 0

    cursor
      .error (err) ->
        console.log err
        assert false
      .end ({success, method}) ->
        assert method is 'test'
        assert success
        called++
        assert called < 3
        if called is 2
          cursor.track false
          done()
      .track true
      .update {}

    @clientModuleTrack.send 'test_with_auto_track', {}, (err, {success}) ->
      assert not err
      assert success
