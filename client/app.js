(function(global) {
    /*global angular*/
    var yateApp = angular.module('yate', []);

    /**
     * @desc Object of source editor (CodeMirror)
     */
    (function(global) {
        global.editor = (function() {
            var sourceTextArea = $('#repl_source');
            var cm = CodeMirror.fromTextArea(sourceTextArea.get(0), {
                autoClearEmptyLines: true,
                theme: 'monokai',
                lineNumbers: true,
                autofocus: true,
                indentUnit: 4
            });
            return cm;
        }());
    }(this));

    /**
     * @desc Logger
     */
    yateApp.factory('Logger', function($location) {
        var Logger = function(namespace) {
            this.namespace = namespace;

            ['log', 'error', 'info'].forEach(function(method) {
                this[method] = function() {
                    if ($location.search().debug) {
                        console[method].apply(console, arguments);
                    }
                }.bind(this, this.namespace + ":");
            }.bind(this));
        };

        return Logger;
    });

    yateApp.value('editorObject', global.editor);

    yateApp.value('yate', global.yate);

    yateApp.value('yateRuntime', global.yr);

    /**
     * @desc Main controller of application
     */
    yateApp.controller('MainController', function($scope, $timeout, Logger, editorObject, yate, yateRuntime) {


        var logger = new Logger('repl');

        $scope.repl_source = editorObject.getValue();
        $scope.version = yate.version;

        var indicator = $('#compile_status');

        /**
         * @desc Compile yate template
         * to html
         */
        var compile = function(source) {
            var compiled;

            // If nothing to compile then
            // not call yate.compile
            if (!source) {
                return;
            }

            logger.log('compile ...');

            try {
                compiled = yate.compile(source); // compile yate template
                (1 && eval)(compiled.js); // Eval compiled template
                logger.log('compiled', compiled);
                $scope.repl_results = yateRuntime.run(compiled.ast.p.Name, global); // Convert yate template to html
                $scope.repl_status = 'success';
                indicator.attr('class', 'green');
            } catch (replError) {
                logger.error(replError.stack);
                $scope.repl_status = 'error';
                $scope.repl_results = replError.stack;
                indicator.attr('class', 'red');
            }
        };

        // Now used only by button "Run"
        $scope.repl = function() {
            compile(editorObject.getValue());
        };

        editorObject.on('change', function(cm) {
            // Compile with pause
            $timeout.cancel($scope.timeout);
            $scope.timeout = $timeout(function() {
                $scope.repl_source = cm.getValue();
                compile($scope.repl_source);
            }, 50, true);
        });

    });
}(this));
