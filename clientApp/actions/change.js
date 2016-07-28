var resultArea = require('../cm/result');
var renderedResultArea = require('../cm/renderedResult');
var compiledArea = require('../cm/compiled');
var stylesArea = require('../cm/styles');
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
    compiledArea.setValue(result.compiled);
    renderedResultArea.setContent(result.output);
    renderedResultArea.setStyles(stylesArea.getValue());
}

module.exports = onEditorChange;
