var $ = require('jquery');
var yate = require('../lib/actions.js');

var onEditorChange = require('./actions/change');
var onSaveClick = require('./actions/save');
var onToggleClick = require('./actions/toggle');
var changeResultsMode = require('./actions/changeResultsMode');
var loadGist = require('./loadGist');

var resultArea = require('./cm/result');
var editorArea = require('./cm/editor');
var contextArea = require('./cm/context');
var stylesArea = require('./cm/styles');

$(document).ready(initApp);

function initApp() {

    // Check if we need to load gist
    var paramName = '?gistId=';
    var index = location.search.indexOf(paramName);
    if (index !== -1) {
        var id = location.search.substring(index + paramName.length);
        loadGist(id);
    } else {
        // Set carret at the end of n-3 line
        editorArea.setCursor({line: editorArea.getValue().split('\n').length-3, ch: null});

        // Manually run for the first time
        onEditorChange();
    }

    // events
    editorArea.on('change', onEditorChange);
    contextArea.on('change', onEditorChange);
    stylesArea.on('change', onEditorChange);
    $('#save_button').on('click', onSaveClick);

    // select editor mode
    $('.change-editor-mode-button').on('click', onToggleClick);

    // select editor mode
    $('.change-results-mode-button').on('click', changeResultsMode);

    // setting current yate version
    $('#yate_version').html(yate.version);
}
