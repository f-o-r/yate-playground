var resultArea = require('../cm/result');
var renderedResultArea = require('../cm/renderedResult');
var compiledArea = require('../cm/compiled');
var stylesArea = require('../cm/styles');
var editorArea = require('../cm/editor');
var contextArea = require('../cm/context');
var compile = require('../compile');
var DEFAULT_DELAY = 300;

function debounce(fn, delay) {
    var timeoutId;
    return function() {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(fn, delay);
    };
}

function onEditorChange() {
    var context;
    var result;

    try {
        context = JSON.parse(contextArea.getValue());
    } catch (error) {
        console.log('invalid context: ', error);
    }
    result = compile(editorArea.getValue(), context);
    resultArea.setValue(result.output);
    compiledArea.setValue(result.compiled);
    renderedResultArea.setContent(result.output);
    renderedResultArea.setStyles(stylesArea.getValue());
}

module.exports = debounce(onEditorChange, DEFAULT_DELAY);
