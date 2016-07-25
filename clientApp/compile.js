var yate = require('../lib/actions.js');
var yateRuntime = window.yr;
// var yateRuntime = require('../lib/runtime.js');

/**
 * Compile yate template with given context
 *
 * @param {String} source - yate template
 * @param {Object} context
 * @returns {compileResult}
 */
function compile(source, context) {
    var result;

    try {
        var compiled = yate.compile(source); // compile yate template
        (1 && eval)(compiled.js); // Eval compiled template
        var output = yateRuntime.run(compiled.ast.p.Name, context);
        result = new compileResult(output, compiled.js, true);
    } catch (replError) {
        console.error(replError.stack);
        result = new compileResult(replError.stack, replError.stack, false);
    }

    return result;
}

/**
 * Object returned by 'compile' function
 *
 * @constructor
 * @param {String} output - result itself
 * @param {Object} context
 * @param {Boolean} 
 * 
 */
function compileResult(output, compiled, success) {
    return {
        output: output,
        compiled: compiled,
        success: success
    };
}

module.exports = compile;