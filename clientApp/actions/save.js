var $ = require('jquery');
var editorArea = require('../cm/editor');
var contextArea = require('../cm/context');

var GITHUB_API_URL = 'https://api.github.com/gists';

/**
 * onClick handler for the save button
 *
 * @param {event}
 */
function onSaveClick(event) {
    var copy_block = $('#copy_block_container');
    var loader_block = $('#loader_block');

    $.ajax({
        url: GITHUB_API_URL,
        method: 'POST',
        data: prepareData(editorArea.getValue(), contextArea.getValue()),
        beforeSend: function() {
            copy_block.hide();
            loader_block.show();
        },
        success: function(answer) {
            var paste_input = $('#paste_input');

            var queryString = $.param({
                gistId: answer.id
            });

            copy_block.show();
            var base_url = window.location.origin + window.location.pathname;
            var new_url = base_url + '?' + queryString;
            paste_input.val(new_url);
            paste_input.select();

            $('#open_button_url').attr('href', new_url);
        },
        error: function(xhr, status, error) {
            alert('Something went wrong, check the console');
            console.error(xhr, status, error);
        },
        complete: function() {
            loader_block.hide();
        }
    });
}

/**
 * Generate json string to make a gist
 *
 * @see https://developer.github.com/v3/gists/
 * @param {String} yateFile - yate template
 * @param {Object} context
 * @returns {String} json string
 */
function prepareData(yateFile, yateContext) {
    var data = {
        "description": "Just an YATE file",
        "public": true,
        "files": {
            "yate-playground.yate": {
                "content": yateFile
            },
            "yate-context.json": {
                "content": yateContext
            }
        }
    };

    console.log(data);

    return JSON.stringify(data);
}

module.exports = onSaveClick;