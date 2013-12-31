var chai, sinon;

sinon = require('sinon');

chai = require('chai');

chai.use(require('chai-as-promised'));

chai.use(require('sinon-chai'));

global.expect = chai.expect;

global.should = chai.should();

global.sinon = sinon;

beforeEach(function() {
  global.sinon = sinon.sandbox.create();
});

afterEach(function() {
  global.sinon.restore();
});
