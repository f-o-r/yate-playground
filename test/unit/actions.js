describe('actions', function() {
    /*global mockery, sinon*/

    var path = require('path');
    var mocks = require('mocks');
    var homeDir = {};

    var templatesDir = path.join(__dirname, '../../templates').split('/').slice(1).reduce(function(structure, folder) {
        return (structure[folder] = {});
    }, homeDir);

    templatesDir['js.tmpl'] = mocks.fs.file(null, 'module :name\n\n    main');
    templatesDir['yate.tmpl'] = mocks.fs.file(null, 'tempalte_mode\n\n    %{ Value }');

    homeDir.test = {
        'file.yate': mocks.fs.file(null, 'module "hello"\nmatch / { "Hello World" }')
    };

    var fsMock = mocks.fs.create(homeDir);
    fsMock.writeFileSync = sinon.stub();

    sinon.stub(path, 'existsSync').withArgs('/test/file.yate').returns(true);

    mockery.registerMock('fs', fsMock);
    mockery.registerMock('path', path);

    var yate = require('../../lib/actions');

    it('should compile file', function() {
        expect(yate.compile('/test/file.yate')).to.be.equal('');
    });
});
