(function() {
    /*global angular, yr, yate*/
    var yateModule = angular.module('yate', []);

    yateModule.controller('Sandbox', function($scope) {
        $scope.scope = JSON.stringify({
            "username": "Unicorn"
        });
        $scope.template = "module 'hello'\n\nmatch / {\n    'Hello {.username}'\n}";

        $scope.compileYateTemplate = function(template) {
            var result;

            $scope.yateStackTrace = '';

            try {
                result = yate.compile(template);

                (1 && eval)(result.js);

                $scope.result = yr.run(result.ast.p.Name, (1 && Function)('return ' + $scope.scope + ';')());
            } catch (e) {
                $scope.yateStackTrace = e.stack;
            }
        };
    });

    return yateModule;
}(this));
