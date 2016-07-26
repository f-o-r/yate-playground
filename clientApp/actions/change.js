var resultArea = require('../cm/result');
var editorArea = require('../cm/editor');
var contextArea = require('../cm/context');
var compile = require('../compile');

function onEditorChange() {
    try {
        var context = JSON.parse(contextArea.getValue());
    } catch (error) {
        console.log('invalid context: ', error);
    }
    var result = compile(editorArea.getValue(), context);
    resultArea.setValue(result.output);
}

module.exports = onEditorChange;