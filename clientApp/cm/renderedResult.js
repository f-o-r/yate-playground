'use strict';

var $ = require('jquery');

var textArea = $('#repl_rendered_result').get(0);
var shadowRootAvailable = Boolean(textArea.createShadowRoot);
var cssScopesAvailable = (function(s) {
    s.setAttribute('scoped', 'true');
    return !!s.scoped;
})(document.createElement('style'));
var stylesEncapsulationAvailable = shadowRootAvalible || cssScopesAvalible;

var contentNode = document.createElement('div');
var stylesNode = document.createElement('style');

if (shadowRootAvailable) {
    var shadowRoot = textArea.createShadowRoot();

    shadowRoot.appendChild(contentNode);
    shadowRoot.appendChild(stylesNode);
} if (cssScopesAvailable) {
    stylesNode.setAttribute('scoped', 'true');

    textArea.appendChild(contentNode);
    textArea.appendChild(stylesNode);
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
    setContent: stylesEncapsulationAvailable ? setContent : function () {},
    setStyles: stylesEncapsulationAvailable ? setStyles : function () {}
};
