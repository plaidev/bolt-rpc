/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */

const _ = require('lodash');

const {Server} = require('../..');

const app = require("http").createServer();
const io = require("socket.io")(app);
app.listen(2000, () => console.log('server listen start'));

const todo = new Server(io, {sub_name_space: 'todo'});

const data = [
  {
    name: 'buy milk'
  },
  {
    name: 'run 100m'
  }
];

todo.pre(function(req, res, next) {
  console.log('auth and validate');
  return next();
});

// find
todo.use('find'
  , (req, res, next) => res.json(data));

// create
todo.use('create'
  , {track: true}
  , function(req, res, next) {
    data.push(req.data);
    return res.json({status: 202});
});

// remove
todo.use('remove'
  , {track: true}
  , function(req, res, next) {
    _.remove(data, d => d.name === req.data.name);
    return res.json({status: 202});
});
