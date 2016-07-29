var $ = require('jquery');

var isEditor = true;

function toggleMode(event) {
    $('#editor')
        .removeClass()
        .addClass($(event.target).data('mode'));
}

module.exports = toggleMode;
