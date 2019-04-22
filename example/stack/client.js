/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */

const assert = require('assert');

const {Client} = require('../..');

const io = require('socket.io-client');

const client = new Client(io, {url: 'http://localhost:2000'});

client.send('add', {a: 1, b: 2}, function(err, val) {
  if (err) { return console.log('Error:', err.stack); }
  console.log('1 + 2 = ', val);
  return assert(val === 3);
});

const cursor = client.track('add', {a: 1, b: 2});

cursor.error(function(err) {
  if (err) { return console.log(err); }
}).end(function(val) {
  console.log('1 + 2 = ', val);
  return assert(cursor.val === 3);
});
