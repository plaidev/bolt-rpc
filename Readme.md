# bolt-rpc

rpc module which can be extended by middlewares like express.js.

HOME: http://plaidev.github.io/bolt-rpc/
Performance Comparison: https://github.com/nashibao/node-rpc-test

## Installation

  Install with npm

    $ npm install bolt-rpc

## API

### server example

```coffeescript
{Server} = require('bolt-rpc')

# setup server
app = require("http").createServer()

io = require("socket.io")(app)

app.listen 2000, () ->
  console.log 'server listen start'

server = new Server(io)

# server api
# auth -> validate -> process
server.pre (req, res, next) ->
  console.log 'authentification should be here'


  # use req.end to calc response times
  starttime = #
  req.end () ->
    endtime = #

  next()

server.use 'add', (req, res, next) ->
  return next(new Error('requied parameter: a')) if not req.param('a')?
  next()

server.use 'add', (req, res, next) ->
  a = req.param('a')
  b = req.param('b')
  res.send a + b

```

### client example

```coffeescript
{Client} = require('bolt-rpc')

# setup client in (node|browser)
io = require('socket.io-client')
client = new Client io, {url: 'http://localhost:2000'}

# client api
client.send 'add', {a: 1, b: 2}, (err, val) ->
  assert not err
  assert val is 3

```


## License

  The MIT License (MIT)

  Copyright (c) 2014 <copyright holders>

  Permission is hereby granted, free of charge, to any person obtaining a copy
  of this software and associated documentation files (the "Software"), to deal
  in the Software without restriction, including without limitation the rights
  to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
  copies of the Software, and to permit persons to whom the Software is
  furnished to do so, subject to the following conditions:

  The above copyright notice and this permission notice shall be included in
  all copies or substantial portions of the Software.

  THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
  IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
  FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
  AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
  LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
  OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
  THE SOFTWARE.