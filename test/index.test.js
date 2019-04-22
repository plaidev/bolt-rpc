/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */

const assert = require("assert");
const sinon = require('sinon');
const app = require("http").createServer();
const io = require("socket.io")(app);
const io_for_client = require('socket.io-client');
const {Server, Client} = require('..');

const _ = require('lodash');

// server
app.listen(2000, () => console.log('server listen start'));
const server = new Server(io);

// client
const client = new Client(io_for_client, {url: 'http://localhost:2000'});

describe("Basic RPC Function", function() {

  it("1 + 2 = 3", function(done) {

    const pre = sinon.spy((req, res, next) => next());

    const end = sinon.spy(function() {});

    const validate = sinon.spy(function(req, res, next) {
      if (((req.data != null ? req.data.a : undefined) == null)) { return next(new Error('requied parameter: a')); }
      return next();
    });

    // auth
    server.pre(pre);

    server.pre(function(req, res, next) {
      req.end(end);
      return next();
    });

    // validate
    server.use('add', validate);

    // procedure
    server.use('add', function(req, res, next) {
      const { a } = req.data;
      const { b } = req.data;
      let temp = a + b;
      if (req.options.plusone) { temp += 1; }
      return res.send(temp);
    });

    // normal api
    return client.send('add', {a: 1, b: 2}, function(err, val) {
      assert(!err);
      assert(val === 3);
      assert(pre.called);
      assert(end.called);
      assert(validate.called);
      return done();
    });
  });

  return it('custom error handling', function(done) {

    let success_catch_error = false;

    server.use('customerror', (req, res, next) => next(new Error('custom error')));

    server.use(function(err, req, res, next, socket) {
      assert(err.message === 'custom error');
      success_catch_error = true;
      return next(err);
    });

    return client.send('customerror', {}, function(err, val) {
      assert(err.message === 'custom error');
      assert(success_catch_error === true);

      // delete error handler
      // umm.
      server._errorHandlers = [];

      return done();
    });
  });
});

describe('Promise API', function() {

  it('end', function(done) {

    const cursor = client.track('add', {a: 1, b: 2}, {plusone: true});
    assert(cursor.val === null);
    cursor.end(function(val) {
      assert(val === 4);
      assert(cursor.val === val);
      return done();
    });
    return cursor.track(true);
  });

  it('error', function(done) {

    const cursor = client.track('add', {b: 2});
    cursor.error(function(err) {
      assert(err);
      assert(cursor.err === err);
      return done();
    });
    return cursor.track(true);
  });

  it('chainable', function(done) {

    const cursor = client.track('add', {a: 1, b: 2});
    cursor.error(function(err) {}).end(function(val) {
      assert(val === 3);
      assert(cursor.val === val);
      return done();
    });
    return cursor.track(true);
  });

  it('update', function(done) {
    let updated = false;
    const cursor = client.track('add', {a: 1, b: 2});
    cursor.end(function(val) {
      if (!updated) {
        cursor.update({a: 2, b: 3});
        updated = true;
        return;
      }
      assert(cursor.val === 5);
      return done();
    });

    return cursor.track(true);
  });

  it('map', function(done) {
    const cursor = client.track('add', {a: 1, b: 2});
    cursor.map(val => val * 2);
    cursor.map(val => val - 1);
    cursor.end(function(val) {
      assert(val === 5);
      return done();
    });
    return cursor.track(true);
  });

  it('pre', function(done) {
    let setuped = false;
    let called = false;
    server.use('add3', function(req, res, next) {
      const { a } = req.data;
      const { b } = req.data;
      return res.send(a + b);
    });
    const cursor = client.track('add3', {a: 1, b: 2}, function(err, val) {
      if (!setuped) { return; }
      assert(val === 5);
      assert(called);
      return done();
    });
    cursor.pre(function(data, context, next) {
      called = true;
      return next(null, data, context);
    });
    cursor.pre(function(data, context, next) {
      data = {a: data.a * 2, b: data.b};
      return next(null, data, context);
    });
    cursor.pre(function(data, context, next) {
      data = {a: data.a + 1, b: data.b};
      return next(null, data, context);
    });
    cursor.track(true);
    return setTimeout(function() {
      setuped = true;
      return server.track('add3', {});
    }
    , 100);
  });

  it('post', function(done) {
    const cursor = client.track('add', {a: 1, b: 2});
    cursor.track(true);
    cursor.post((val, next) => next(null, val * 2));
    cursor.post((val, next) => next(null, val - 1));
    return cursor.end(function(val) {
      assert(val === 5);
      return done();
    });
  });

  it('create heavy task server', function(done) {
    // heavy task. 1sec
    server.use('heavyTask', (req, res, next) =>
      setTimeout(() => res.send(req.body)
      , 200)
    );

    return done();
  });

  return it('update is reject concurrent calls.', function(done) {
    let callCount = 0;
    const cursor = client.track('heavyTask', {call: 1});
    cursor.end(function(val) {
      assert([1, 5].includes(val.call));
      callCount++;
      if (callCount >= 2) {
        return done();
      }
    });
    cursor.track(true);
    cursor.update({call: 2});
    cursor.update({call: 3});
    cursor.update({call: 4});
    return cursor.update({call: 5});
  });
});

describe('simple track cursor,', function() {

  const _auto_track_middleware = name =>
    function(req, res, next) {
      if (!name) { name = req.path; }
      req.end(() => res.track(name));
      return next();
    }
  ;

  it('end after update.', function(done) {
    let check = false;

    const cursor = client.track('add');
    cursor.end(function(val) {
      assert(check);
      assert(val === 3);
      return done();
    });
    cursor.track(true);

    return setTimeout(function() {
      check = true;
      return cursor.update({a: 1, b: 2});
    }
    , 200);
  });

  it('track after update.', function(done) {
    let called = 0;

    server.use('add2', function(req, res, next) {
      const { a } = req.data;
      const { b } = req.data;
      return res.send(a + b);
    });

    const cursor = client.track('add2', {a: 1, b: 2});
    cursor.end(function(val) {
      called++;
      assert([1, 2].includes(called));
      assert(val === 3);
      if (called >= 2) {
        return done();
      }
    });
    cursor.track(true);

    return setTimeout(() => server.track('add2', {})
    , 200);
  });

  it('track after call auto tracked method.', function(done) {
    let setuped = false;

    server.use('add_auto_tracked', _auto_track_middleware(), function(req, res, next) {
      const { a } = req.data;
      const { b } = req.data;
      return res.send(a + b);
    });

    const cursor = client.track('add_auto_tracked', {a: 1, b: 2});
    cursor.end(function(val) {
      assert(val === 3);
      if (setuped) {
        return done();
      }
    });
    cursor.track(true);

    return setTimeout(function() {
      setuped = true;
      const client2 = new Client(io_for_client, {url: 'http://localhost:2000'});
      return client2.send('add_auto_tracked', {a: 3, b: 4}, function(err, val) {
        assert(!err);
        return assert(val === 7);
      });
    }
    , 200);
  });

  it('track after call named auto tracked method.', function(done) {
    let setuped = false;

    server.use('add_named_auto_tracked', _auto_track_middleware('track_name'), function(req, res, next) {
      const { a } = req.data;
      const { b } = req.data;
      return res.send(a + b);
    });

    const cursor = client.track('add_named_auto_tracked', {a: 1, b: 2}, {track_path: 'track_name'});
    cursor.end(function(val) {
      assert(val === 3);
      if (setuped) {
        return done();
      }
    });
    cursor.track(true);

    return setTimeout(function() {
      setuped = true;
      const client2 = new Client(io_for_client, {url: 'http://localhost:2000'});
      return client2.send('add_named_auto_tracked', {a: 3, b: 4}, function(err, val) {
        assert(!err);
        return assert(val === 7);
      });
    }
    , 200);
  });

  return it('track cursor with track_path, track after update.', function(done) {
    const clientOther = new Client(io_for_client, {
      url: 'http://localhost:2000',
      track_path: 'track_path'});

    let setuped = false;

    server.use('addOther', function(req, res, next) {
      const { a } = req.data;
      const { b } = req.data;
      return res.send(a + b);
    });

    const cursor = client.track('addOther', {a: 1, b: 2});
    cursor.end(function(val) {
      if (!setuped) { return; }
      return assert(false);
    }); // not called
    cursor.track(true);

    const cursorOther = clientOther.track('addOther', {a: 1, b: 2});
    cursorOther.end(function(val) {
      if (!setuped) { return; }
      assert(val === 3);
      return done();
    });
    cursorOther.track(true);

    return setTimeout(function() {
      setuped = true;
      return server.track('track_path', {});
    }
    , 200);
  });
});

describe('advanced', function() {

  describe('namespace', function() {
    let clientOtherNS = null;

    before(function() {
      // server
      const serverOther = new Server(io, {name_space: 'other'});

      // client
      clientOtherNS = new Client(io_for_client, {url: 'http://localhost:2000', name_space: 'other'});

      return serverOther.use('method', (req, res) => res.json({success: true}));});

    return it('other namespace method callable by namespaced client', done =>
      clientOtherNS.send('method', {}, function(err, val) {
        assert(val.success);
        return done();
      })
    );
  });

  return describe('extend', function() {

    before(function(done) {

      const pre = (req, res, next) => {
        this._order('pre', req.body);
        return next();
      };

      const middleware1 = (req, res, next) => {
        this._order('middleware1', req.body);
        return next();
      };

      const middleware2 = (req, res, next) => {
        this._order('middleware2', req.body);
        if (req.body.throw_error) {
          return next(new Error('error!'));
        }
        return next();
      };

      const middleware3 = (req, res, next) => {
        this._order('middleware3', req.body);
        return next();
      };

      const method = (req, res) => {
        this._order('method', req.body);
        return res.json({success: true, data: req.data});
      };

      const defaultMethod = (req, res, next) => {
        this._order('default', req.body);
        return next(new Error('method not found'));
      };

      const errorHandler = (err, req, res, next, socket) => {
        this._order('error', req.body);
        if (req.body.not_fatal_error) {
          res.json({success: false});
          return;
        }
        assert(err);
        return next(err);
      };

      const subserver = new Server();
      subserver.pre(pre);
      subserver.use(middleware2);
      subserver.use('method', middleware3, method);

      // extend
      server.use('submodule', middleware1, subserver);

      const rootserver = new Server();
      rootserver.use('root_method', middleware1, method);

      // extend
      server.use(rootserver);

      server.use(defaultMethod);

      server.use(errorHandler);

      return done();
    });

    beforeEach(function(done) {
      this.sandbox = sinon.sandbox.create();
      this._order = this.sandbox.spy(name => name);
      return done();
    });

    afterEach(function(done) {
      this.sandbox.restore();
      return done();
    });

    it('sub module callable', done =>

      client.send('submodule/method', {a: 'A'}, function(err, val) {
        assert(!err);
        assert(val.success);
        assert(val.data.a === 'A');
        return done();
      })
    );

    it('root_method call order', function(done) {

      return client.send('root_method', {}, (err, val) => {
        // !: pre belongs to 'root' as well as 'submodule'.
        assert(_.isEqual(this._order.returnValues, ['pre', 'middleware1', 'method']));
        return done();
      });
    });

    it('submodule.method call order', function(done) {

      return client.send('submodule/method', {}, (err, val) => {
        assert(_.isEqual(this._order.returnValues, ['pre', 'middleware1', 'middleware2', 'middleware3', 'method']));
        return done();
      });
    });

    it('"submodule" is callable, run middlewares and default method', function(done) {

      return client.send('submodule', {}, (err, val) => {
        assert(err);
        assert(_.isEqual(this._order.returnValues, ['pre', 'middleware1', 'middleware2', 'default', 'error']));
        return done();
      });
    });

    it('can middlware throw error', function(done) {

      return client.send('submodule/method', {throw_error: true}, (err, val) => {
        assert(err);
        assert(_.isEqual(this._order.returnValues, ['pre', 'middleware1', 'middleware2', 'error']));
        return done();
      });
    });

    return it('can middlware throw error, catch error handler', function(done) {

      return client.send('submodule/method', {throw_error: true, not_fatal_error: true}, (err, val) => {
        assert(!err);
        assert(val.success === false);
        assert(_.isEqual(this._order.returnValues, ['pre', 'middleware1', 'middleware2', 'error']));
        return done();
      });
    });
  });
});

describe('track cursor', function() {

  const NS = 'track_auth';
  const ACCEPT_ROOM = 'accept_room';
  const REJECT_ROOM = 'reject_room';

  before(function(done) {

    this.server = new Server(io, {
      name_space: NS,
      join(socket, room, cb) {
        if (room === 'accept_room') {
          return cb(); // accept
        } else {
          return cb(new Error('security error'));
        }
      } // reject
    });

    this.server.use('test', (req, res, next) => res.json({success: true, method: 'test'}));

    this.server.use('test_with_auto_track', function(req, res, next) {
      req.end(() => res.track(ACCEPT_ROOM));
      return res.json({success: true});
    });

    this.clientModuleTrack = new Client(io_for_client, {
      name_space: NS,
      url: 'http://localhost:2000',
      track_path: ACCEPT_ROOM
    });

    return done();
  });

  it('can join accept room', function(done) {

    const cursor = this.clientModuleTrack.track('test_with_auto_track');

    let called = 0;

    return cursor
      .error(function(err) {
        console.log(err);
        return assert(false);}).end(function({success}) {
        assert(success);
        called++;
        assert(called < 3);
        if (called === 2) {
          cursor.track(false);
          return setTimeout(() => done()
          , 100);
        }}).track(true)
      .update({});
  });

  it('cannot join reject room', function(done) {

    const cursor = this.clientModuleTrack.track('test_with_auto_track', undefined, {
      track_path: REJECT_ROOM
    });

    let called = 0;

    cursor
      .error(function(err) {
        console.log(err);
        return assert(false);}).end(function({success}) {
        assert(success);
        called++;
        assert(called < 2);
        if (called === 1) {
          cursor.track(false);
          return done();
        }}).track(true)
      .update({});

    return this.server.track(REJECT_ROOM);
  });

  it('can update by accept room track', function(done) {

    const cursor = this.clientModuleTrack.track('test', undefined, {
      track_path: ACCEPT_ROOM
    });

    let called = 0;

    cursor
      .error(function(err) {
        console.log(err);
        return assert(false);}).end(function({success, method}) {
        assert(method === 'test');
        assert(success);
        called++;
        assert(called < 3);
        if (called === 2) {
          cursor.track(false);
          return done();
        }}).track(true)
      .update({});

    return this.clientModuleTrack.send('test_with_auto_track', {}, function(err, {success}) {
      assert(!err);
      return assert(success);
    });
  });

  it('can cancel call by pre method', function(done) {

    const cursor = this.clientModuleTrack.track('test', undefined, {
      track_path: ACCEPT_ROOM
    });

    let updateCount = 0;
    let called = 0;

    cursor
      .pre(function(data, context, next) {
        updateCount++;
        if (updateCount === 2) {
          return next(); // by default, next(null, data, context)
        } else {
          return next(null, data, null);
        }}).error(function(err) {
        console.log(err);
        return assert(false);}).end(function({success, method}) {
        assert(method === 'test');
        assert(success);
        called++;
        assert(called === 1);
        if (called >= 1) {
          return done();
        }
    });

    cursor.update({});
    cursor.update({}, null); // context is null
    return cursor.update({});
  });

  return it('track_id check', function(done) {

    const cursor = this.clientModuleTrack.track('test', undefined, {
      track_path: ACCEPT_ROOM
    });

    let called = 0;
    const track_ids = [undefined, 1, 2, 4, 3, 4, 10, 11];

    cursor
      .pre(function(data, context, next) {
        assert(track_ids[called] === context.track_id);
        return next();}).error(function(err) {
        console.log(err);
        return assert(false);}).end(function({success}) {
        assert(success);
        called++;
        assert(called <= 8);
        if (called === 8) {
          cursor.track(false);
          return setTimeout(() => done()
          , 100);
        }}).track(true)
      .update({}); // call: undefined

    return setTimeout(() => {
      this.server.track(ACCEPT_ROOM, {track_id: 1}); // call: 1
      this.server.track(ACCEPT_ROOM, {track_id: 1}); // skip
      this.server.track(ACCEPT_ROOM, {track_id: 0}); // skip

      return setTimeout(() => {
        this.server.track(ACCEPT_ROOM, {track_id: 2}); // call: 2
        this.server.track(ACCEPT_ROOM, {track_id: 3}); // skip
        this.server.track(ACCEPT_ROOM, {track_id: 5, auto_track: true}); // skip, auto_track is weak reqquest.
        this.server.track(ACCEPT_ROOM, {track_id: 4}); // call (requested): 4

        return setTimeout(() => {
          this.server.track(ACCEPT_ROOM, {track_id: 3}); // call: 3
          this.server.track(ACCEPT_ROOM); // call: 4

          return setTimeout(() => {
            cursor.track(false);
            cursor.track(true, {track_id: 10}); // id update and track call: 10
            this.server.track(ACCEPT_ROOM, {track_id: 10}); // skip
            return this.server.track(ACCEPT_ROOM);
          } // call 11
          , 100);
        }
        , 100);
      }
      , 100);
    }
    , 100);
  });
});

describe('after', function() {
  it('close', function(done) {
    app.close();
    io.close();
    app.emit('close');
    done();
    process.exit();
  });
});