var $ = require('jquery');
var CodeMirror = require('codemirror');
require('codemirror/mode/htmlmixed/htmlmixed');

var textArea = $('#repl_result').get(0);
var params = {
    autoClearEmptyLines: true,
    theme: 'base16-light',
    readOnly: 'nocursor',
    mode: "htmlmixed",
    lineNumbers: false,
    autofocus: false,
    indentUnit: 4
};

module.exports = CodeMirror.fromTextArea(textArea, params);