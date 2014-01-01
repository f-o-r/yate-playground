(function(global) {
    /*global angular, yr, yate*/
    var yateApp = angular.module('yate', []);

    (function(global) {
        /**
         *  @desc behave.js
         */
        global.editor = (function() {
            return new global.Behave({
                textarea: $('#repl_source').get(0),
                // Pressing the tab key will insert a tab instead of cycle input focus.
                replaceTab: true
            });
        }());
    }(this));

    /**
     * @desc Logger
     */
    yateApp.factory('Logger', function() {
        var Logger = function(namespace) {
            this.namespace = namespace;

            ['log', 'error', 'info'].forEach(function(method) {
                this[method] = console[method].bind(console, this.namespace + ":");
            }.bind(this));
        };

        return Logger;
    });

    yateApp.value('textareaNode', $('#repl_source'));

    /**
     * @desc Main controller of application
     */
    yateApp.controller('MainController', function($scope, $timeout, Logger, textareaNode) {
        var logger = new Logger('repl');

        $scope.repl_source = textareaNode.val();

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
                $scope.repl_results = yr.run(compiled.ast.p.Name, global); // Convert yate template to html
                $scope.repl_status = 'success';
            } catch (replError) {
                logger.error(replError.stack);
                $scope.repl_status = 'error';
                $scope.repl_results = replError.stack;
            }
        };

        $scope.repl = function() {
            // Compile with pause
            $timeout.cancel($scope.timeout);
            $scope.timeout = $timeout(function() {
                // XXX(maksimrv): Behave.js not update repl_source
                // after pressing <bakespace>
                $scope.repl_source = textareaNode.val();
                compile($scope.repl_source);
            }, 50, true);
        };
    });
}(this));
