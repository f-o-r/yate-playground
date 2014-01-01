(function(global) {
    /*global angular, yr, yate*/
    var yateApp = angular.module('yate', []);

    /**
     * @desc Main controller of application
     */
    yateApp.controller('MainController', function($scope) {
        $scope.repl = function(source) {
            var compiled;

            // If nothing to compile then
            // not call yate.compile
            if (!source) {
                return;
            }

            try {
                compiled = yate.compile(source); // compile yate template
                (1 && eval)(compiled.js); // Eval compiled template
                $scope.repl_results = yr.run(compiled.ast.p.Name, global); // Convert yate template to html
                $scope.repl_status = 'success';
            } catch (replError) {
                console.error(replError.stack);
                $scope.repl_status = 'error';
                $scope.repl_results = replError.stack;
            }
        };
    });
}(this));
