var $ = require('jquery');

var isEditor = true;

function toggleMode(event) {
    $('#result')
        .removeClass()
        .addClass($(event.target).data('mode'));
}

module.exports = toggleMode;
