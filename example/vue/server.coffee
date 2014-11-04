
_ = require('lodash')

{Server} = require('../..')

app = require("http").createServer()
io = require("socket.io")(app)
app.listen 2000, () ->
  console.log 'server listen start'

todo = new Server(io, {sub_name_space: 'todo'})

data = [
  {
    name: 'buy milk'
  }
  {
    name: 'run 100m'
  }
]

todo.pre (req, res, next) ->
  console.log 'auth and validate'
  next()

# find
todo.use 'find'
  , (req, res, next) ->
    res.json data

# create
todo.use 'create'
  , {track: true}
  , (req, res, next) ->
    data.push(req.data)
    res.json {status: 202}

# remove
todo.use 'remove'
  , {track: true}
  , (req, res, next) ->
    _.remove data, (d) ->
      return d.name == req.data.name
    res.json {status: 202}
