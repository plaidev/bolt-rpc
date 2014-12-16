
assert = require("assert")
sinon = require('sinon')
app = require("http").createServer()
io = require("socket.io")(app)
io_for_client = require('socket.io-client')
{Server, Client} = require('..')

# server
app.listen 2000, () ->
  console.log 'server listen start'
server = new Server(io)

# client
client = new Client io_for_client, {url: 'http://localhost:2000'}

describe "Basic RPC Function", ->

  it "1 + 2 = 3", (done) ->

    pre = sinon.spy ({}, {_cb}) ->
      _cb()

    validate = sinon.spy (req, {_cb}, next) ->
      return next(new Error('requied parameter: a')) if not req.data.a?
      _cb()

    # auth
    server.pre pre

    # validate
    server.use 'add', validate

    # procedure
    server.use 'add'
    , (req, res, next) ->
      a = req.data.a
      b = req.data.b
      res.send a + b

    # normal api
    client.send 'add', {a: 1, b: 2}, (err, val) ->
      assert not err
      assert val is 3
      assert pre.called
      assert validate.called
      done()

describe "Promise API", ->

  it "end", (done) ->

    cursor = client.get 'add', {a: 1, b: 2}
    assert cursor.val is null
    cursor.on 'end', (val) ->
      assert val is 3
      assert cursor.val is val
      done()

  it "error", (done) ->

    cursor = client.get 'add', {b: 2}
    cursor.on 'error', (err) ->
      assert err
      assert cursor.err is err
      done()

  it "chainable", (done) ->

    cursor = client.get 'add', {a: 1, b: 2}
    cursor.error((err) ->).end (val) ->
      assert val is 3
      assert cursor.val is val
      done()
