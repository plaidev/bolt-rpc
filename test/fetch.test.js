/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */

const assert = require("assert");
const sinon = require('sinon');
const io_for_client = require('socket.io-client');
const {Server, Client} = require('..');

function timeout(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

describe('Promise API', function() {

  before((done) => {
    // server
    const app = require("http").createServer();
    const io = require("socket.io")(app);
    app.listen(8001, () => console.log('server listen start'));
    const server = new Server(io);

    // client
    const client = new Client(io_for_client, {url: 'http://localhost:8001'});

    this.io = io;
    this.app = app;
    this.server = server;
    this.client = client;
    done();
  });

  after((done) => {
    this.io.close();
    this.app.close();
    done();
  });

  it('create heavy task server', (done) => {
    const server = this.server;
    // heavy task. 1sec
    server.use('heavyTask', (req, res, next) =>
      setTimeout(() => res.send(req.body)
      , 500)
    );

    return done();
  });

  it('fetch', async () => {
    const client = this.client;
    let callCount = 0;
    const val = await client.fetch('heavyTask', {call: 1});
    assert(val.call, 1);
  });

  it('fetchOnce', async () => {
    const client = this.client;
    let callCount = 0;

    const callFetch1 = async () => {
      await timeout(100);
      const val = await client.fetchOnce('heavyTask', {call: 1});
      assert(val.call, 1);
    }

    const callFetch2 = async () => {
      try {
        const val = await client.fetchOnce('heavyTask', {call: 2});
        assert(val, null);
      } catch (err) {
        assert(err.message, 'CancelledBySameMethod')
      }
    }

    await Promise.all([
      callFetch2(),
      callFetch1(),
    ]);
  });

});