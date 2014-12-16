
assert = require('assert')

{Client} = require('../..')

io = require('socket.io-client')

client = new Client io, {url: 'http://localhost:2000'}

client.send 'add', {a: 1, b: 2}, (err, val) ->
  return console.log 'Error:', err.stack if err
  console.log '1 + 2 = ', val
  assert(val is 3)

cursor = client.get 'add', {a: 1, b: 2}

cursor.error((err) ->
  console.log err if err
).end((val) ->
  console.log '1 + 2 = ', val
  assert(cursor.val is 3)
)
