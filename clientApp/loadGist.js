var $ = require('jquery');
var editorArea = require('./cm/editor');
var contextArea = require('./cm/context');

var GITHUB_API_URL = 'https://api.github.com/gists';

function loadGist(id) {
    $.ajax({
        url: GITHUB_API_URL + '/' + id,
        method: 'GET',
        success: function(data) {
            var template = data.files['yate-playground.yate'];
            editorArea.setValue(template.content);

            var context = data.files['yate-context.json'];
            contextArea.setValue(context.content);
        },
        error: function(xhr, status, error) {
            alert('Something went wrong, most likely you used wrong gistID');
            console.error(xhr, status, error);
        }
    });
}

module.exports = loadGist;