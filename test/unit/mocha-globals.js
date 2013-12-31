var chai, sinon, mockery;

sinon = require('sinon');

chai = require('chai');

mockery = require('mockery');

chai.use(require('chai-as-promised'));

chai.use(require('sinon-chai'));

global.expect = chai.expect;

global.should = chai.should();

global.sinon = sinon;

global.mockery = mockery;

beforeEach(function() {
  global.sinon = sinon.sandbox.create();
  global.mockery.enable();
});

afterEach(function() {
  global.sinon.restore();
  global.mockery.disable();
});
