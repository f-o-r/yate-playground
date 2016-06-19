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
                theme: 'base16-dark',
                lineNumbers: true,
                autofocus: true,
                indentUnit: 4
            });
            return cm;
        }());
    }(this));

    /**
     *  @desc Object of result field (based on CodeMirror as well)
     */
    (function(global) {
        global.resultArea = (function() {
            var resultTextArea = $('#repl_results_textarea');
            var cm = CodeMirror.fromTextArea(resultTextArea.get(0), {
                autoClearEmptyLines: true,
                theme: 'base16-light',
                readOnly: 'nocursor',
                mode: "htmlmixed",
                lineNumbers: false,
                autofocus: false,
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

    yateApp.value('resultArea', global.resultArea);

    yateApp.value('yate', global.yate);

    yateApp.value('yateRuntime', global.yr);

    /**
     * @desc Main controller of application
     */
    yateApp.controller('MainController', function($scope, $timeout, Logger, editorObject, yate, yateRuntime) {


        var logger = new Logger('repl');
        var editorValue = editorObject.getValue();
        $scope.repl_source = editorValue;

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
                resultArea.setValue(yateRuntime.run(compiled.ast.p.Name, global));
                $scope.repl_status = 'success';
                indicator.attr('class', 'green');
            } catch (replError) {
                logger.error(replError.stack);
                $scope.repl_status = 'error';
                resultArea.setValue(replError.stack);
                indicator.attr('class', 'red');
            }
        };

        // For the first time, run compile() manually
        compile(editorValue); // For the first time, run compile() manually
        editorObject.setCursor({line: editorValue.split('\n').length-3, ch: null}); // Set carret at the end of n-3 line

        editorObject.on('change', function(cm) {
            // Compile with pause
            $timeout.cancel($scope.timeout);
            $scope.timeout = $timeout(function() {
                $scope.repl_source = cm.getValue();
                compile($scope.repl_source);
            }, 50, true);
        });

        var paste_input = $('#paste_input');
        /* SAVING! */
        $('#save_button').click(function() {
            var copy_block = $('#copy_block_container');
            var loader_block = $('#loader_block');
            var data = {
                "description": "Just an YATE file",
                "public": true,
                "files": {
                    "yate-playground.yate": {
                        "content": editorObject.getValue()
                    }
                }
            };
            $.ajax({
                url: 'https://api.github.com/gists',
                method: 'POST',
                data: JSON.stringify(data),
                beforeSend: function() {
                    copy_block.hide();
                    loader_block.show();
                },
                success: function(answer) {
                    var url = answer.html_url;
                    copy_block.show();
                    paste_input.val(url);
                    paste_input.select();
                    $('#open_button_url').attr('href', url);
                },
                error: function(xhr, status, error) {
                    alert('Something went wrong...');
                    console.error(xhr, status, error);
                },
                complete: function() {
                    loader_block.hide();
                }
            });
        });
    });
}(this));
