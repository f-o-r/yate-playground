var $ = require('jquery');
var CodeMirror = require('codemirror');
require('codemirror/mode/coffeescript/coffeescript');

var textArea = $('#repl_source').get(0);
var params = {
    autoClearEmptyLines: true,
    theme: 'base16-dark',
    mode: "coffeescript",
    lineNumbers: true,
    autofocus: true,
    indentUnit: 4
};

module.exports = CodeMirror.fromTextArea(textArea, params);