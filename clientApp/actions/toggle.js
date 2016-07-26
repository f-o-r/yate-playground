var $ = require('jquery');

var isEditor = true;

function toggleMode(event) {
    if (isEditor) {
        $('#editor_wrap').hide();
        $('#context_wrap').show();
    } else {
        $('#editor_wrap').show();
        $('#context_wrap').hide(); 
    }

    var altText = this.attr('data-altText');
    this.attr('data-altText', this.html());
    this.html(altText);

    isEditor = !isEditor;

    return this;
}

module.exports = toggleMode;