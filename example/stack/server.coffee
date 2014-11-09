
{Server} = require('../..')

app = require("http").createServer()
io = require("socket.io")(app)
app.listen 2000, () ->
  console.log 'server listen start'

server = new Server(io)

server.pre (req, res, next) ->
  console.log 'auth'
  next()

server.use 'add'
  , (req, res, next) ->
    console.log 'validate'
    return next(new Error('requied parameter: a')) if not req.data.a?
    next()

server.use 'add'
  , (req, res, next) ->
    a = req.data.a
    b = req.data.b
    res.send a + b
