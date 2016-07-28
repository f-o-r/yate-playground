var $ = require('jquery');
var CodeMirror = require('codemirror');
require('codemirror/mode/javascript/javascript');

var textArea = $('#repl_compiled_result').get(0);
var params = {
    autoClearEmptyLines: true,
    theme: 'base16-light',
    readOnly: 'nocursor',
    mode: "js",
    lineNumbers: false,
    autofocus: false,
    indentUnit: 4
};

module.exports = CodeMirror.fromTextArea(textArea, params);
