'use strict';

var $ = require('jquery');

var textArea = $('#repl_rendered_result').get(0);
var shadowRootAvalible = Boolean(textArea.createShadowRoot);

if (shadowRootAvalible) {
    var shadowRoot = textArea.createShadowRoot();
    var contentNode = document.createElement('div');
    var stylesNode = document.createElement('style');

    shadowRoot.appendChild(contentNode);
    shadowRoot.appendChild(stylesNode);
} else {
    textArea.innerHTML = 'Preview is not avalible.'
}

function setContent(content) {
    contentNode.innerHTML = content;
}

function setStyles(styles) {
    stylesNode.innerHTML = styles;
}

module.exports = {
    setContent: shadowRootAvalible ? setContent : function () {},
    setStyles: shadowRootAvalible ? setStyles : function () {}
};
