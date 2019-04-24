/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */

const {Server} = require('../..');

const app = require("http").createServer();
const io = require("socket.io")(app);
app.listen(2000, () => console.log('server listen start'));

const server = new Server(io);

server.pre(function(req, res, next) {
  console.log('auth');
  return next();
});

server.use('add'
  , function(req, res, next) {
    console.log('validate');
    if ((req.data.a == null)) { return next(new Error('requied parameter: a')); }
    return next();
});

server.use('add'
  , function(req, res, next) {
    const { a } = req.data;
    const { b } = req.data;
    return res.send(a + b);
});
