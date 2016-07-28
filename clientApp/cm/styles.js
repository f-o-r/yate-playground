var $ = require('jquery');
var CodeMirror = require('codemirror');
require('codemirror/mode/javascript/javascript');

var textArea = $('#styles_source').get(0);
var params = {
    autoClearEmptyLines: true,
    theme: 'base16-dark',
    mode: "css",
    lineNumbers: true,
    autofocus: true,
    indentUnit: 4
};

module.exports = CodeMirror.fromTextArea(textArea, params);
