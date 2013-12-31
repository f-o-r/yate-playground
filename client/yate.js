(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);throw new Error("Cannot find module '"+o+"'")}var f=n[o]={exports:{}};t[o][0].call(f.exports,function(e){var n=t[o][1][e];return s(n?n:e)},f,f.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
var fs_ = require('fs');
var vm_ = require('vm');

//  ---------------------------------------------------------------------------------------------------------------  //

var pt = require('parse-tools');

//  ---------------------------------------------------------------------------------------------------------------  //

var yate = require('./yate.js');

require('./factory.js');
require('./grammar.js');

//  ---------------------------------------------------------------------------------------------------------------  //
//  yate actions
//  ---------------------------------------------------------------------------------------------------------------  //

yate.parse = function(filename) {
    var parser = new pt.Parser(yate.grammar, yate.factory);

    var ast;

    try {
        ast = parser.parse(filename, 'module');
    } catch (e) {
        if (e instanceof pt.Parser.Error) {
            throw Error(e.toString());
        } else {
            throw e;
        }

    }

    return ast;
};

// ----------------------------------------------------------------------------------------------------------------- //

yate.compile = function(filename) {

    //  Парсим
    //  ------

    /// console.time('parse');
    var ast = yate.parse(filename);
    /// console.timeEnd('parse');


    //  Фазы-проходы по дереву
    //  ----------------------

    /// console.time('walk');

    ast.walkdo(function(ast) {
        ast.w_deinclude();
    });

    ast.walkdo(function(ast) {
        ast.w_deimport();
    });

    ast.dowalk(function(ast) {
        ast.w_deitemize();
    });

    //  Каждой ноде выставляется поле parent,
    /// console.time('walk.parents');
    ast.w_setParents();

    /// console.timeEnd('walk.parents');

    //  Для каждой ноды создается или наследуется scope.
    /// console.time('walk.scope');
    ast.dowalk(function(ast) {
        ast.p.Rid = 0;
        ast.p.Cid = 0;

        ast.w_setScope();
    });
    /// console.timeEnd('walk.scope');

    //  Действие над каждой нодой в ast, не выходящее за рамки этой ноды и ее state/scope/context.
    /// console.time('walk.action');
    ast.walkdo(function(ast) {
        ast.w_action();
    });

    ast.dowalk(function(ast) {
        ast.w_list();
    });
    /// console.timeEnd('walk.action');

    //  Оптимизация дерева. Группировка нод, перестановка, замена и т.д.
    /// ast.trigger('optimize');

    //  Валидация. Проверяем типы, определенность переменных/функций и т.д.
    /// console.time('walk.validate');
    ast.dowalk(function(ast) {
        ast.w_validate();
    });
    /// console.timeEnd('walk.validate');

    //  Вычисляем типы и приводим к нужным типам соответствующие ноды.
    /// console.time('walk.types');
    ast.dowalk(function(ast) {
        ast.w_setTypes();
    });
    /// console.timeEnd('walk.types');

    //  Важно! Только после этого момента разрешается вызывать метод getType() у нод.
    //  В предыдущих фазах он никогда не должен вызываться.

    //  Вытаскиваем определения (vars, funcs, jpaths, predicates, keys) в правильном порядке.
    /// console.time('walk.defs');
    ast.walkdo(function(ast) {
        ast.w_extractDefs();
    });
    /// console.timeEnd('walk.defs');

    //  Подготовка к кодогенерации.
    /// console.time('walk.prepare');
    ast.dowalk(function(ast) {
        ast.w_prepare();
    });
    /// console.timeEnd('walk.prepare');

    //  Трансформируем некоторые ноды (в частности, заворачиваем в cast)/
    /// console.time('walk.transform');
    ast.walkdo(function(ast, params, pKey, pObject) {
        if (pObject) {
            var ast_ = ast.w_transform();
            if (ast_) {
                pObject[pKey] = ast_;
            }
        }
    });
    /// console.timeEnd('walk.transform');

    /// console.timeEnd('walk');


    //  Генерим код
    //  -----------

    /// console.time('js');
    var js = ast.js();
    /// console.timeEnd('js');

    return {
        ast: ast,
        js: js
    };
};

// ----------------------------------------------------------------------------------------------------------------- //

yate.run = function(yate_filename, data, ext_cnontent, mode) {

    // Читаем runtime.
    var js = "//  ---------------------------------------------------------------------------------------------------------------  //\n//  yate runtime\n//  ---------------------------------------------------------------------------------------------------------------  //\n\nvar yr = {};\n\n(function() {\n\nyr.log = function() {};\n\n//  TODO:\n//  Пустой массив. Можно использовать везде, где предполается,\n//  что он read-only. Например, когда из select() возвращается пустой нодесет и т.д.\n//  var emptyA = [];\n\nvar modules = {};\n\n//  ---------------------------------------------------------------------------------------------------------------  //\n\n//  Кешируем регулярки для лучшей производительности.\n//  (http://jsperf.com/entityify-test/2)\n//\nvar RE_AMP = /&/g;\nvar RE_LT = /</g;\nvar RE_GT = />/g;\nvar RE_QUOTE = /\"/g;\n\nvar RE_E_AMP = /&amp;/g;\nvar RE_E_LT = /&lt;/g;\nvar RE_E_GT = /&gt;/g;\n\nyr.text2xml = function(s) {\n    if (s == null) { return ''; }\n\n    //  NOTE: Странное поведение Safari в этом месте.\n    //  Иногда сюда попадает объект, которые != null, но при этом у него\n    //  нет метода toString. По идее, такого быть просто не может.\n    //  Попытки пронаблюдать этот объект (при помощи console.log и т.д.)\n    //  приводят к тому, что он \"нормализуется\" и баг пропадает.\n    //  Вообще, любые операции, которые неявно приводят его к строке, например,\n    //  тоже приводят к нормализации и пропаданию бага.\n    //\n    //  Поэтому, вместо `s.toString()` используем `('' + s)`.\n    //\n    return ('' + s)\n        .replace(RE_AMP, '&amp;')\n        .replace(RE_LT, '&lt;')\n        .replace(RE_GT, '&gt;');\n};\n\nyr.xml2text = function(s) {\n    //  NOTE: См. коммент про Safari выше.\n\n    if (s == null) { return ''; }\n\n    return ('' + s)\n        .replace(RE_E_LT, '<')\n        .replace(RE_E_GT, '>')\n        .replace(RE_E_AMP, '&');\n};\n\nyr.text2attr = function(s) {\n    //  NOTE: См. коммент про Safari выше.\n\n    if (s == null) { return ''; }\n\n    return ('' + s)\n        .replace(RE_AMP, '&amp;')\n        .replace(RE_QUOTE, '&quot;')\n        .replace(RE_LT, '&lt;')\n        .replace(RE_GT, '&gt;');\n};\n\nyr.xml2attr = function(s) {\n    //  NOTE: См. коммент про Safari выше.\n\n    if (s == null) { return ''; }\n\n    return ('' + s)\n        .replace(RE_QUOTE, '&quot;')\n        .replace(RE_LT, '&lt;')\n        .replace(RE_GT, '&gt;');\n};\n\n//  ---------------------------------------------------------------------------------------------------------------  //\n\nyr.register = function(id, module) {\n    if ( modules[id] ) {\n        throw Error('Module \"' + id + '\" already exists');\n    }\n\n    //  Резолвим ссылки на импортируемые модули.\n\n    var ids = module.imports || [];\n    /// module.id = id;\n    //  Для удобства добавляем в imports сам модуль.\n    var imports = [ module ];\n    for (var i = 0, l = ids.length; i < l; i++) {\n        var module_ = modules[ ids[i] ];\n        if (!module_) {\n            throw Error('Module \"' + ids[i] + '\" doesn\\'t exist');\n        } else {\n            imports = imports.concat(module_.imports);\n        }\n    }\n    //  В результате мы дерево импортов превратили в плоский список.\n    module.imports = imports;\n\n    modules[id] = module;\n};\n\n//  ---------------------------------------------------------------------------------------------------------------  //\n\nyr.run = function(id, data, mode) {\n    mode = mode || '';\n\n    var module = modules[id];\n    if (!module) {\n        throw 'Module \"' + id + '\" is undefined';\n    }\n\n    var doc = new Doc(data);\n\n    var r = module.a(module, [ doc.root ], mode, { a: {} } );\n\n    return r;\n};\n\n//  ---------------------------------------------------------------------------------------------------------------  //\n\nyr.join = function join(left, right) {\n    return left.concat(right);\n};\n\n//  ---------------------------------------------------------------------------------------------------------------  //\n\nyr.nodeValue = function nodeValue(node) {\n    var data = node.data;\n    return (typeof data === 'object') ? '': data;\n};\n\nyr.nodeName = function nodeName(nodeset) {\n    var node = nodeset[0];\n\n    return (node) ? node.name : '';\n};\n\n//  ---------------------------------------------------------------------------------------------------------------  //\n\nyr.simpleScalar = function simpleScalar(name, context) {\n    var data = context.data;\n    if (!data) { return ''; }\n\n    if (name === '*') {\n        for (var key in data) {\n            return yr.simpleScalar(key, context);\n        }\n        return '';\n    }\n\n    var r = data[name];\n\n    if (typeof r === 'object') {\n        return '';\n    }\n\n    return r;\n};\n\nyr.simpleBoolean = function simpleBoolean(name, context) {\n    var data = context.data;\n    if (!data) { return false; }\n\n    if (name === '*') {\n        for (var key in data) {\n            var r = yr.simpleBoolean(key, context);\n            if (r) { return true; }\n        }\n        return false;\n    }\n\n    var r = data[name];\n\n    if (!r) { return false; }\n\n    if (r instanceof Array) {\n        return r.length;\n    }\n\n    return true;\n};\n\n//  ---------------------------------------------------------------------------------------------------------------  //\n\nyr.nodeset2scalar = function nodeset2scalar(nodeset) {\n    if (!nodeset.length) { return ''; }\n\n    var data = nodeset[0].data;\n    return (typeof data == 'object') ? '': data;\n};\n\nyr.nodeset2boolean = function nodeset2boolean(nodeset) {\n    if (! (nodeset && nodeset.length > 0) ) {\n        return false;\n    }\n\n    return !!nodeset[0].data;\n};\n\nyr.nodeset2xml = function nodeset2xml(nodeset) {\n    return yr.scalar2xml( yr.nodeset2scalar(nodeset) );\n};\n\nyr.nodeset2attrvalue = function nodeset2attrvalue(nodeset) {\n    return yr.scalar2attrvalue( yr.nodeset2scalar(nodeset) );\n};\n\nyr.scalar2xml = yr.text2xml;\nyr.xml2scalar = yr.xml2text;\n\n//  FIXME: Откуда вообще взялась идея, что xml в атрибуты нужно кастить не так, как скаляры?!\n//  Смотри #157. Не нужно квотить амперсанд, потому что он уже заквочен.\nyr.xml2attrvalue = yr.xml2attr;\n\nyr.scalar2attrvalue = yr.text2attr;\n\nyr.object2nodeset = function object2nodeset(object) {\n    return [ ( new Doc(object) ).root ];\n};\n\nyr.array2nodeset = function array2nodeset(array) {\n    var object = {\n        'item': array\n    };\n    return [ ( new Doc(object) ).root ];\n};\n\n//  Сравниваем скаляр left с нодесетом right.\nyr.cmpSN = function cmpSN(left, right) {\n    for (var i = 0, l = right.length; i < l; i++) {\n        if ( left == yr.nodeValue( right[i] ) ) {\n            return true;\n        }\n    }\n    return false;\n};\n\n//  Сравниваем два нодесета.\nyr.cmpNN = function cmpNN(left, right) {\n    var m = right.length;\n\n    if (m === 0) { return false; }\n    if (m === 1) { return yr.cmpSN( yr.nodeValue( right[0] ), left ); }\n\n    var values = [];\n\n    var rv = yr.nodeValue( right[0] );\n    for (var i = 0, l = left.length; i < l; i++) {\n        var lv = yr.nodeValue( left[i] );\n        if (lv == rv) { return true; }\n        values[i] = lv;\n    }\n\n    for (var j = 1; j < m; j++) {\n        rv = yr.nodeValue( right[j] );\n        for (var i = 0, l = left.length; i < l; i++) {\n            if ( values[i] == rv ) { return true; }\n        }\n    }\n\n    return false;\n};\n\n//  ---------------------------------------------------------------------------------------------------------------  //\n\nyr.shortTags = {\n    br: true,\n    col: true,\n    embed: true,\n    hr: true,\n    img: true,\n    input: true,\n    link: true,\n    meta: true,\n    param: true,\n    wbr: true\n};\n\nyr.closeAttrs = function closeAttrs(a) {\n    var name = a.s;\n\n    if (name) {\n        var r = '';\n        var attrs = a.a;\n\n        for (var attr in attrs) {\n            r += ' ' + attr + '=\"' + attrs[attr].quote() + '\"';\n        }\n        /*\n        for (var attr in attrs) {\n            if ( attrs.hasOwnProperty(attr) ) {\n                var v = attrs[attr];\n                if (v.quote) {\n                    r += ' ' + attr + '=\"' + v.quote() + '\"';\n                } else {\n                    yr.log({\n                        id: 'NO_QUOTE',\n                        message: \"Attr doesn't have quote() method\",\n                        data: {\n                            key: attr,\n                            value: v\n                        }\n                    });\n                }\n            } else {\n                yr.log({\n                    id: 'BAD_PROTOTYPE',\n                    message: 'Object prototype is corrupted',\n                    data: {\n                        key: attr,\n                        value: v\n                    }\n                });\n            }\n        }\n        */\n        r += (yr.shortTags[name]) ? '/>' : '>';\n        a.s = null;\n\n        return r;\n    }\n\n    return '';\n};\n\nyr.copyAttrs = function copyAttrs(to, from) {\n    for (var key in from) {\n        to[key] = from[key];\n    }\n};\n\n//  ---------------------------------------------------------------------------------------------------------------  //\n\nyr.scalarAttr = function(s) {\n    //  NOTE: См. коммент про Safari выше.\n\n    this.s = (s == null) ? '' : ('' + s);\n};\n\nyr.scalarAttr.prototype.quote = function() {\n    return yr.text2attr(this.s);\n};\n\nfunction quoteAmp(s) {\n    return s.replace(/&/g, '&amp;');\n}\n\nyr.scalarAttr.prototype.addxml = function(xml) {\n    return new yr.xmlAttr( quoteAmp(this.s) + xml );\n};\n\nyr.scalarAttr.prototype.addscalar = function(xml) {\n    return new yr.scalarAttr( this.s + xml );\n};\n\nyr.xmlAttr = function(s) {\n    //  NOTE: См. коммент про Safari выше.\n\n    this.s = (s == null) ? '' : ('' + s);\n};\n\nyr.xmlAttr.prototype.quote = function() {\n    return yr.xml2attr(this.s);\n};\n\nyr.xmlAttr.prototype.addscalar = function(scalar) {\n    return new yr.xmlAttr( this.s + quoteAmp(scalar) );\n};\n\n//  ---------------------------------------------------------------------------------------------------------------  //\n\nyr.slice = function(s, from, to) {\n    //  NOTE: См. коммент про Safari выше.\n\n    s = '' + s;\n    return (to) ? s.slice(from, to) : s.slice(from);\n};\n\nyr.exists = function(nodeset) {\n    return nodeset.length > 0;\n};\n\nyr.grep = function(nodeset, predicate) {\n    var r = [];\n    for (var index = 0, count = nodeset.length; index < count; index++) {\n        var node = nodeset[index];\n        if (predicate(node, index, count)) {\n            r.push(node);\n        }\n    }\n    return r;\n};\n\nyr.byIndex = function(nodeset, i) {\n    return nodeset.slice(i, i + 1);\n};\n\n//  ---------------------------------------------------------------------------------------------------------------  //\n\nyr.sort = function(nodes, by, desc) {\n    var values = [];\n    for (var i = 0, l = nodes.length; i < l; i++) {\n        var node = nodes[i];\n        var value = by(node, i, l);\n        values.push({\n            node: node,\n            value: value\n        });\n    }\n\n    var greater = (desc) ? -1 : +1;\n    var less = (desc) ? +1 : -1;\n\n    var sorted = values.sort(function(a, b) {\n        var va = a.value;\n        var vb = b.value;\n        if (va < vb) { return less; }\n        if (va > vb) { return greater; }\n        return 0;\n    });\n\n    var r = [];\n    for (var i = 0, l = sorted.length; i < l; i++) {\n        r.push( sorted[i].node );\n    }\n\n    return r;\n};\n\n//  ---------------------------------------------------------------------------------------------------------------  //\n\nyr.nodeset2data = function(nodes) {\n    var l = nodes.length;\n    if (l === 0) {\n        return '';\n    }\n\n    if (l === 1) {\n        return nodes[0].data;\n    }\n\n    var data = [];\n    for (var i = 0; i < l; i++) {\n        data.push( nodes[i].data );\n    }\n\n    return data;\n};\n\n//  ---------------------------------------------------------------------------------------------------------------  //\n\nyr.externals = {};\n\n\n//  ---------------------------------------------------------------------------------------------------------------  //\n//  Module\n//  ---------------------------------------------------------------------------------------------------------------  //\n\n\nvar Module = function() {};\n\n//  ---------------------------------------------------------------------------------------------------------------  //\n\n//  NOTE: ex applyValue.\nModule.prototype.a = function applyValue(M, nodeset, mode, a0) {\n    var r = '';\n\n    //  Достаем аргументы, переданные в apply, если они там есть.\n    var args;\n    if (arguments.length > 4) {\n        args = Array.prototype.slice.call(arguments, 4);\n    }\n\n    var imports = M.imports;\n\n    //  Идем по нодесету.\n    for (var i0 = 0, l0 = nodeset.length; i0 < l0; i0++) {\n        var c0 = nodeset[i0];\n\n        //  Для каждой ноды ищем подходящий шаблон.\n        //  Сперва ищем в текущем модуле ( imports[0] ),\n        //  затем идем далее по списку импортов.\n\n        //  Если мы найдем шаблон, в found будет его id, а в module -- модуль,\n        //  в котором находится этот шаблон.\n        var found = false;\n        var module;\n\n        var i2 = 0;\n        var l2 = imports.length;\n        var template;\n        while (!found && i2 < l2) {\n            module = imports[i2++];\n\n            //  matcher представляем собой двухуровневый объект,\n            //  на первом уровне ключами являются моды,\n            //  на втором -- имена нод.\n            //  Значения на втором уровне -- список id-шников шаблонов.\n            var names = module.matcher[mode];\n\n            if (names) {\n                //  FIXME: Тут неправильно. Если шаблоны для c0.name будут,\n                //  но ни один из них не подойдет, то шаблоны для '*' не применятся вообще.\n                //  FIXME: Плюс шаблоны на '*' всегда имеют более низкий приоритет.\n                var templates = names[c0.name] || names['*'];\n                if (templates) {\n                    var i3 = 0;\n                    var l3 = templates.length;\n                    while (!found && i3 < l3) {\n                        var tid = templates[i3++];\n                        template = module[tid];\n\n                        var selector = template.j;\n                        if (selector) {\n                            //  В template.j лежит id селектора (jpath'а).\n                            //  В tempalte.a флаг о том, является ли jpath абсолютным.\n                            if ( module.matched(selector, template.a, c0, i0, l0) ) {\n                                found = tid;\n                            }\n                        } else {\n                            var selectors = template.s;\n                            var abs = template.a;\n                            //  В template.s лежит массив с id-шниками селекторов.\n                            for (var i4 = 0, l4 = selectors.length; i4 < l4; i4++) {\n                                if ( module.matched(selectors[i4], abs[i4], c0, i0, l0) ) {\n                                    found = tid;\n                                    break;\n                                }\n                            }\n                        }\n                    }\n                }\n            }\n        }\n\n        if (found) {\n            //  Шаблон нашли, применяем его.\n            if (args) {\n                //  Шаблон позвали с параметрами, приходится изгаляться.\n                r += template.apply( M, [M, c0, i0, l0, a0].concat(args) );\n            } else {\n                r += template(M, c0, i0, l0, a0);\n            }\n        }\n    }\n\n    return r;\n};\n\n//  ---------------------------------------------------------------------------------------------------------------  //\n\nModule.prototype.matched = function matched(jpath, abs, c0, i0, l0) {\n    if (jpath === 1) {\n        //  Это jpath '/'\n        return !c0.parent;\n    }\n\n    var l = jpath.length;\n    //  i (и l) всегда будет четное.\n    var i = l - 2;\n    while (i >= 0) {\n        if (!c0) { return false; }\n\n        var step = jpath[i];\n        //  Тут step может быть либо 0 (nametest), либо 2 (predicate).\n        //  Варианты 1 (dots) и 3 (index) в jpath'ах в селекторах запрещены.\n        switch (step) {\n            case 0:\n                //  Nametest.\n                var name = jpath[i + 1];\n                if (name !== '*' && name !== c0.name) { return false; }\n                c0 = c0.parent;\n                break;\n\n            case 2:\n            case 4:\n                //  Predicate or guard.\n                var predicate = jpath[i + 1];\n                if ( !predicate(this, c0, i0, l0) ) { return false; }\n                break;\n        }\n\n        i -= 2;\n    }\n\n    if (abs && c0.parent) {\n        return false;\n    }\n\n    return true;\n};\n\n//  ---------------------------------------------------------------------------------------------------------------  //\n\n//  NOTE: ex selectN.\nModule.prototype.s = function selectN(jpath, node) {\n    return this.n( jpath, [ node ] );\n};\n\n//  NOTE: ex selectNs.\nModule.prototype.n = function selectNs(jpath, nodeset) {\n\n    var current = nodeset;\n    var m = current.length;\n\n    var result;\n    for (var i = 0, n = jpath.length; i < n; i += 2) {\n        result = [];\n\n        var type = jpath[i];\n        var step = jpath[i + 1];\n\n        switch (type) {\n\n            case 0: // Это nametest (.foo или .*), в step 'foo' или '*'.\n                for (var j = 0; j < m; j++) {\n                    yr.selectNametest(step, current[j], result);\n                }\n                break;\n\n            case 1: // Это dots (., .., ...), в step количество шагов минус один ( . -- 0, .. -- 1, ... -- 2 и т.д. ).\n                for (var j = 0; j < m; j++) {\n                    var k = 0;\n                    var node = current[j];\n                    while (k < step && node) {\n                        node = node.parent;\n                        k++;\n                    }\n                    if (node) {\n                        result.push(node);\n                    }\n                }\n                break;\n\n            case 2: // Это filter, в step предикат.\n                for (var j = 0; j < m; j++) {\n                    var node = current[j];\n                    if (step(this, node, j, m)) { // Предикат принимает четыре параметра: module, node, index и count.\n                        result.push(node);\n                    }\n                }\n                break;\n\n            case 3: // Это index, в step индекс нужного элемента.\n                var node = current[ step ];\n                result = (node) ? [ node ] : [];\n                break;\n\n            case 4:\n                //  Это глобальный гвард.\n                if (m > 0) {\n                    var node = current[0];\n                    if ( step(this, node.doc.root, 0, 1) ) {\n                        result = result.concat(current);\n                    }\n                }\n\n        }\n\n        current = result;\n        m = current.length;\n\n        if (!m) { return []; }\n    }\n\n    return result;\n};\n\nyr.selectNametest = function selectNametest(step, context, result) {\n\n    var data = context.data;\n\n    if (!data || typeof data !== 'object') { return result; }\n\n    if (step === '*') {\n        if (data instanceof Array) {\n            for (var i = 0, l = data.length; i < l; i++) {\n                yr.selectNametest(i, context, result);\n            }\n        } else {\n            for (step in data) {\n                yr.selectNametest(step, context, result);\n            }\n        }\n        return result;\n    }\n\n    data = data[step];\n    if (data === undefined) { return result; }\n\n    var doc = context.doc;\n    if (data instanceof Array) {\n        for (var i = 0, l = data.length; i < l; i++) {\n            result.push({\n                data: data[i],\n                parent: context,\n                name: step,\n                //  FIXME: Не нравится мне этот doc.\n                doc: doc\n            });\n        }\n    } else {\n        result.push({\n            data: data,\n            parent: context,\n            name: step,\n            //  FIXME: Не нравится мне этот doc.\n            doc: doc\n        });\n    }\n\n    return result;\n};\n\nyr.document = function(nodeset) {\n    var doc;\n    if (!nodeset.length) {\n        doc = new Doc( {} );\n    } else {\n        doc = new Doc( nodeset[0].data );\n    }\n    return [ doc.root ];\n};\n\nyr.subnode = function(name, data, context) {\n    var doc = context.doc;\n\n    if (data instanceof Array) {\n        var nodeset = [];\n        for (var i = 0, l = data.length; i < l; i++) {\n            nodeset.push({\n                data: data[i],\n                name: name,\n                parent: context,\n                doc: doc\n            });\n        }\n        return nodeset;\n    }\n\n    return [\n        {\n            data: data,\n            name: name,\n            parent: context,\n            doc: doc\n        }\n    ];\n};\n\n//  ---------------------------------------------------------------------------------------------------------------  //\n\n//  Глобальные переменные у нас \"ленивые\" с кэшированием.\n//  В this[name] находится только лишь функция,\n//  вычисляющая нужное значение.\n//\n//  NOTE: ex vars\nModule.prototype.v = function vars(id, c0) {\n    var vars = c0.doc._vars;\n    var value = vars[id];\n    if (value === undefined) {\n        var var_ = this.findSymbol(id);\n        value = (typeof var_ === 'function') ? var_(this, c0, 0, 1) : var_;\n        vars[id] = value;\n    }\n    return value;\n};\n\n//  FIXME: Тут еще бывает a0, а иногда не бывает.\n//\n//  NOTE: ex funcs\nModule.prototype.f = function funcs(id, c0, i0, l0, v0) {\n    var func = this.findSymbol(id);\n\n    if (arguments.length > 5) {\n        //  Два и более аргументов.\n        var args = Array.prototype.slice.call(arguments);\n        args[0] = this;\n        return func.apply(this, args);\n    }\n\n    if (v0 !== undefined) {\n        //  Один аргумент.\n        return func(this, c0, i0, l0, v0);\n    }\n\n    //  Без аргументов.\n    return func(this, c0, i0, l0);\n};\n\n//  NOTE: ex keys.\nModule.prototype.k = function keys(id, use, c0, multiple) {\n    var keys = c0.doc._keys;\n\n    var key = this.findSymbol(id);\n\n    var cache = keys[id];\n    if (!cache) {\n        cache = this._initKey(key, id, use, c0);\n    }\n\n    var values = cache.values;\n    var nodes = cache.nodes;\n\n    var that = this;\n\n    if (multiple) {\n        //  В use -- нодесет.\n        var r;\n\n        if (cache.xml) {\n            r = '';\n            for (var i = 0, l = use.length; i < l; i++) {\n                var c0 = use[i];\n                r += getValue( yr.nodeValue(c0) );\n            }\n        } else {\n            r = [];\n            for (var i = 0, l = use.length; i < l; i++) {\n                var c0 = use[i];\n                r = r.concat( getValue( yr.nodeValue(c0) ) );\n            }\n        }\n\n        return r;\n\n    } else {\n        //  В use -- скаляр.\n        var value = values[use];\n        if (value === undefined) {\n            value = getValue(use);\n        }\n\n        return value;\n\n    }\n\n    function getValue(use) {\n        var nodes_ = nodes[use];\n\n        var r;\n        if (cache.xml) {\n            r = '';\n            if (nodes_) {\n                for (var i = 0, l = nodes_.length; i < l; i++) {\n                    var node = nodes_[i];\n                    //  FIXME: Нельзя ли тут последний параметр сделать общим,\n                    //  а не создавать его для каждого элемента цикла?\n                    r += key.b( that, node.c, node.i, node.l, {} );\n                }\n            }\n        } else {\n            r = [];\n            if (nodes_) {\n                for (var i = 0, l = nodes_.length; i < l; i++) {\n                    var node = nodes_[i];\n                    r = r.concat( key.b(that, node.c, node.i, node.l) );\n                }\n            }\n        }\n\n        values[use] = r;\n\n        return r;\n    }\n\n};\n\nModule.prototype._initKey = function(key, id, use, c0) {\n    var keys = c0.doc._keys;\n    var cache = keys[id] = {};\n\n    //  Тело ключ имеет тип xml.\n    cache.xml = (key.bt === 'xml');\n\n    //  Вычисляем нодесет с нодами, которые матчатся ключом.\n    var matched = key.n(this, c0);\n    //  Хранилище для этих нод.\n    var nodes = cache.nodes = {};\n\n    //  Значение use ключа может возвращать нодесет или скаляр.\n    if (key.ut === 'nodeset') {\n        for (var i0 = 0, l0 = matched.length; i0 < l0; i0++) {\n            var c1 = matched[i0];\n            //  Тип use_ -- nodeset.\n            var use_ = key.u(this, c1, i0, l0);\n\n            for (var j = 0, m = use_.length; j < m; j++) {\n                store( yr.nodeValue( use_[j] ), { c: c1, i: i0, l: l0 } );\n            }\n        }\n\n    } else {\n        for (var i0 = 0, l0 = matched.length; i0 < l0; i0++) {\n            var c1 = matched[i0];\n            //  Тип use_ -- nodeset.\n            var use_ = key.u(this, c1, i0, l0);\n\n            store( use_, { c: c1, i: i0, l: l0 } );\n        }\n\n    }\n\n    //  Хранилище для уже вычисленных значений ключа.\n    cache.values = {};\n\n    return cache;\n\n    //  Сохраняем ноду по соответствующему ключу.\n    //  Одному ключу может соответствовать несколько нод.\n    function store(key, info) {\n        var items = nodes[key];\n        if (!items) {\n            items = nodes[key] = [];\n        }\n        items.push(info);\n    }\n\n\n};\n\n//  ---------------------------------------------------------------------------------------------------------------  //\n\nModule.prototype.findSymbol = function(id) {\n    var imports = this.imports;\n    for (var i = 0, l = imports.length; i < l; i++) {\n        var module = imports[i];\n        var symbol = module[id];\n        if (symbol !== undefined) { return symbol; }\n    }\n};\n\n//  ---------------------------------------------------------------------------------------------------------------  //\n\nfunction Doc(data) {\n    //  FIXME: Что тут использовать? Array.isArray?\n    if (data instanceof Array) {\n        data = {\n            //  FIXME: Сделать название поля ('item') настраеваемым.\n            'item': data\n        };\n    }\n\n    this.root = {\n        data: data,\n        parent: null,\n        name: '',\n        doc: this\n    };\n\n    this._vars = {};\n    this._keys = {};\n}\n\n//  ---------------------------------------------------------------------------------------------------------------  //\n\n\n\nyr.Module = Module;\n\n//  ---------------------------------------------------------------------------------------------------------------  //\n\n})();\n\n//  ---------------------------------------------------------------------------------------------------------------  //\n\n//  NOTE: Для использования из node.js.\n//  При этом недостаточно просто проверить window/document.\n//  Потому что в тестах runtime грузится не как модуль (пока что, надеюсь),\n//  но просто эвалится, поэтому в нем module не определен.\n//\nif (typeof module === 'object' && module.exports) {\n    module.exports = yr;\n}\n\n";

    // Добавляем внешние функции, если есть.
    if (ext_cnontent) {
        js += ext_cnontent;
    }

    // Добавляем скомпилированные шаблоны.
    js += yate.compile(yate_filename).js;

    js += 'var data = ' + getData(data) + ';';

    mode = mode || '';
    js += 'yr.run("main", data, "' + mode + '");';

    var result = vm_.runInNewContext(js, {
        console: console
    });

    function getData(o) {
        if (o.filename) {
            //  Возможность просто передать строку,
            //  содержащую объект с данными. Например:
            //
            //      yate hello.yate '{ username: "nop" }'
            //
            if (/^\s*[{[]/.test(o.filename)) {
                return o.filename;
            }
        }

        return JSON.stringify(o.data);
    }

    return result;
};

// ----------------------------------------------------------------------------------------------------------------- //

module.exports = yate;

//  ---------------------------------------------------------------------------------------------------------------  //

},{"./factory.js":6,"./grammar.js":7,"./yate.js":11,"fs":12,"parse-tools":27,"vm":15}],2:[function(require,module,exports){
var no = require('nommon');
var pt = require('parse-tools');

//  ---------------------------------------------------------------------------------------------------------------  //

var yate = require('./yate.js');

require('./scope.js');
require('./types.js');

//  ---------------------------------------------------------------------------------------------------------------  //

yate.AST = function() {};

no.inherit(yate.AST, pt.AST);

//  ---------------------------------------------------------------------------------------------------------------  //

yate.AST.prototype.state = {
    //  Глобальные id-шники:

    //  jpath'ы.
    jid: 0,
    //  Предикаты.
    pid: 0,
    //  Шаблоны.
    tid: 0,
    //  Переменные.
    vid: 0,
    //  Функции.
    fid: 0,
    //  Ключи.
    kid: 0

};

//  ---------------------------------------------------------------------------------------------------------------  //

//  FIXME: Как бы так сделать, чтобы доопределить этот метод (см. ast.js),
//  а не переопределять его полностью?
yate.AST.prototype.make = function(id, params) {
    var ast = this.factory.make(id, this.where, params);

    ast.w_setScope();
    ast.p.Rid = this.p.Rid;
    ast.p.Cid = this.p.Cid;

    return ast;
};

//  ---------------------------------------------------------------------------------------------------------------  //
// Type methods
//  ---------------------------------------------------------------------------------------------------------------  //

yate.AST.prototype.getType = function(to) {
    var type = this.__type;
    if (type === undefined) {
        type = this.__type = this._getType();
    }

    return (to) ? yate.types.convertable(type, to) : type;
};

yate.AST.prototype._getType = function() {
    return 'none';
};

yate.AST.prototype.cast = function(to) {
    var from = this.getType();
    to = to || from;

    var r = this.oncast(to);
    if (from !== to && r !== false) {
        if ( !yate.types.convertable(from, to) ) {
            this.error( 'Cannot convert type from ' + from + ' to ' + to + ' ' + this.id );
        }

        this.p.AsType = to;
    }
};

yate.AST.prototype.oncast = no.nop;

yate.AST.prototype.inline = no.false;

yate.AST.prototype.isSimple = no.false;

yate.AST.prototype.isConst = no.false;

yate.AST.prototype.isGlobal = function() {
    return !this.scope.parent;
};

//  ---------------------------------------------------------------------------------------------------------------  //
// Walk methods
//  ---------------------------------------------------------------------------------------------------------------  //

yate.AST.prototype.w_setScope = function() {
    var parent = this.parent;

    var scope = (parent) ? parent.scope : null;
    if (this.options.scope) {
        scope = (scope) ? scope.child() : new yate.Scope();
    }

    if (scope) {
        this.scope = scope;
        this.Sid = scope.id;
    }
};

yate.AST.prototype.getScope = function() {
    return this.scope.top();
};

//  ---------------------------------------------------------------------------------------------------------------  //

yate.AST.prototype.setAsList = no.nop;

//  ---------------------------------------------------------------------------------------------------------------  //

yate.AST.prototype.rid = function() {
    var rid = this.p.Rid + 1;
    this.dowalk(function(ast) {
        ast.p.Rid = rid;
    });
};

yate.AST.prototype.cid = function() {
    var cid = this.p.Cid + 1;
    this.dowalk(function(ast) {
        ast.p.Cid = cid;
    });
};

//  ---------------------------------------------------------------------------------------------------------------  //

yate.AST.prototype.opens = no.false;

yate.AST.prototype.closes = no.true;

//  ---------------------------------------------------------------------------------------------------------------  //

yate.AST.prototype.js = function(mode) {
    return this.code('js', mode);
};

yate.AST.prototype.yate = function(mode) {
    return this.code('yate', mode);
};

yate.AST.prototype.w_deinclude = no.nop;
yate.AST.prototype.w_deimport = no.nop;
yate.AST.prototype.w_deitemize = no.nop;

yate.AST.prototype.w_action = no.nop;
yate.AST.prototype.w_list = no.nop;
yate.AST.prototype.w_validate = no.nop;
yate.AST.prototype.w_prepare = no.nop;
yate.AST.prototype.w_extractDefs = no.nop;
yate.AST.prototype.w_transform = no.nop;
yate.AST.prototype.w_setTypes = no.nop;

yate.AST.prototype.setPrevOpened = no.nop;

//  ---------------------------------------------------------------------------------------------------------------  //

var fs = require('fs');

yate.AST.js = new pt.Codegen( 'js', null, "// vim: set filetype=javascript:\n\n// ----------------------------------------------------------------------------------------------------------------- //\n// module\n// ----------------------------------------------------------------------------------------------------------------- //\n\n// На первое время, шаблоны (и соответственно matcher) выводятся только на верхнем уровне.\n\nmodule\n    var yr = yr || require('yate/lib/runtime.js');\n\n    (function() {\n\n        var cmpNN = yr.cmpNN;\n        var cmpSN = yr.cmpSN;\n        var nodeset2xml = yr.nodeset2xml;\n        var nodeset2boolean = yr.nodeset2boolean;\n        var nodeset2attrvalue = yr.nodeset2attrvalue;\n        var nodeset2scalar = yr.nodeset2scalar;\n        var scalar2attrvalue = yr.scalar2attrvalue;\n        var xml2attrvalue = yr.xml2attrvalue;\n        var scalar2xml = yr.scalar2xml;\n        var xml2scalar = yr.xml2scalar;\n        var simpleScalar = yr.simpleScalar;\n        var simpleBoolean = yr.simpleBoolean;\n        var selectNametest = yr.selectNametest;\n        var closeAttrs = yr.closeAttrs;\n\n        var M = new yr.Module();\n\n        %{ Block.js__defs() }\n\n        %{ Block.Templates :defs }\n\n        M.matcher = %{ Block.js__matcher() };\n        M.imports = %{ Block.Imports };\n\n        yr.register('%{ . :name }', M);\n\n    })();\n\nmodule :name [ p.Name ]\n\n    %{ Name }\n\n//  Дефольтное название модуля.\nmodule :name\n\n    main\n\nimport\n\n    '%{ Name }'\n\n// ----------------------------------------------------------------------------------------------------------------- //\n// defs: template, function_, key, var_\n// ----------------------------------------------------------------------------------------------------------------- //\n\n// template.\n\ntemplate :defs\n\n    // match %{ Selectors :yate } %{ Mode }\n    M.t%{ Id } = %{ . :def };\n    %{ . :selectors }\n\ntemplate :def\n    function t%{ Id }(m, c%{ Cid }, i%{ Cid }, l%{ Cid }, a%{ Rid }%{ Args }) {\n        %{ Args :defaults }\n        %{ . :template_prologue }\n\n        %{ Body :output }\n\n        return r%{ Rid };\n    }\n\ntemplate_mode [ p.Value ]\n\n    : %{ Value }\n\ntemplate :selectors [ p.Selectors.length() === 1 ]\n\n    M.t%{ Id }.j = %{ Selectors :template_selector };\n    M.t%{ Id }.a = %{ Selectors :template_abs };\n\ntemplate :selectors\n\n    M.t%{ Id }.s = [ %{ Selectors :template_selector } ];\n    M.t%{ Id }.a = [ %{ Selectors :template_abs } ];\n\ntemplate :template_prologue [ a.getType() === 'array' ]\n\n    var r%{ Rid } = [];\n\ntemplate :template_prologue [ a.getType() === 'object' ]\n\n    var r%{ Rid } = {};\n\ntemplate :template_prologue\n\n    var r%{ Rid } = '';\n\n\n// Для jpath выводим имя его переменной, для / -- 1.\n\njpath :template_selector [ a.isRoot() ]\n\n    1\n\njpath :template_selector\n\n    j%{ Id }\n\njpath :template_abs [ p.Abs ]\n\n    1\n\njpath :template_abs\n\n    0\n\n\n// ----------------------------------------------------------------------------------------------------------------- //\n\nfunction_ :comment\n\n    func %{ Name }(%{ Args :yate }) : %{ getType() }\n\nfunction_ :defs [ f.isImported ]\n\n    // imported %{ . :comment }\n\n// function_\n\nfunction_ :defs [ a.isGlobal() ]\n\n    // %{ . :comment }\n    M.f%{ Id } = %{ . :def };\n\nfunction_ :defs\n\n    %{ . :def }\n\n\n//  Только функции с типом attr или xml используют параметр aN.\nfunction_ :def [ a.getType() === 'attr' || a.getType() === 'xml' ]\n\n    function f%{ Id }(m, c%{ Cid }, i%{ Cid }, l%{ Cid }, a%{ Rid }%{ Args }) {\n        %{ . :function_body }\n    }\n\nfunction_ :def\n\n    function f%{ Id }(m, c%{ Cid }, i%{ Cid }, l%{ Cid }%{ Args }) {\n        %{ . :function_body }\n    }\n\n//  Тело функции состоит из одного инлайнового выражения (без каких-либо определений).\n* :function_body [ p.Body.inline() ]\n    %{ Args :defaults }\n\n    return %{ Body };\n\n* :function_body\n\n    %{ Args :defaults }\n    %{ . :function_prologue }\n\n    %{ Body :output }\n\n    %{ . :function_epilogue }\n\n\n* :function_prologue [ a.getType() === 'object' ]\n\n    var r%{ Rid } = {};\n\n* :function_prologue [ a.getType() === 'array' ]\n\n    var r%{ Rid } = [];\n\n* :function_prologue [ a.getType() === 'nodeset' ]\n\n    var r%{ Rid } = [];\n\n* :function_prologue [ a.getType() === 'boolean' ]\n\n    var r%{ Rid } = false;\n\n//  Функция типа attr не использует переменную rN.\n* :function_prologue [ a.getType() !== 'attr' ]\n\n    var r%{ Rid } = '';\n\n\n* :function_epilogue [ a.getType() === 'attr' ]\n\n    return a%{ Rid }.a;\n\n* :function_epilogue\n\n    return r%{ Rid };\n\n\n//  ---------------------------------------------------------------------------------------------------------------  //\n//  var_\n//  ---------------------------------------------------------------------------------------------------------------  //\n\nvar_ :body\n\n    %{ Value :prologue }\n    %{ Value :output }\n    %{ . :epilogue }\n\nvar_ :comment\n\n    var %{ Name } : %{ Value.getType() }\n\n\n//  Глобальная переменная.\n//  ---------------------------------------------------------------------------------------------------------------  //\n\nvar_ :defs [ f.isImported ]\n\n    //  imported %{ . :comment }\n\nvar_ :defs [ a.isGlobal() ]\n\n    //  %{ . :comment }\n    M.v%{ Id } = %{ . :global };\n\nvar_ :global [ p.Value.isConst() ]\n\n    %{ Value }\n\nvar_ :global [ p.Value.inline() ]\n\n    function(m, c0, i0, l0) {\n        return %{ Value };\n    }\n\nvar_ :global\n\n    function(m, c0, i0, l0) {\n        %{ . :body }\n    }\n\nvar_ :epilogue [ a.isGlobal() && p.Value.getType() === 'attr' ]\n\n    return a%{ Value.Rid }.a;\n\nvar_ :epilogue [ a.isGlobal() ]\n\n    return r%{ Value.Rid };\n\n\n//  Локальная переменная\n//  ---------------------------------------------------------------------------------------------------------------  //\n\nvar_ :defs [ p.Value.inline() ]\n\n    //  %{ . :comment }\n    var v%{ Id } = %{ Value };\n\nvar_ :defs\n\n    //  %{ . :comment }\n    %{ . :body }\n\nvar_ :epilogue [ p.Value.getType() === 'attr' ]\n\n    var v%{ Id } = a%{ Value.Rid }.a;\n\nvar_ :epilogue\n\n    var v%{ Id } = r%{ Value.Rid };\n\n\n// ----------------------------------------------------------------------------------------------------------------- //\n\nkey :defs [ f.isImported ]\n\n    //  imported key %{ Name }()\n\nkey :defs\n\n    M.k%{ Id } = {};\n    M.k%{ Id }.n = %{ . :nodes };\n    //  %{ Use.getType() }\n    M.k%{ Id }.u = %{ . :use };\n    //  %{ Body.getType() }\n    M.k%{ Id }.b = %{ . :body };\n    %{ . :types }\n\nkey :nodes\n\n    function k%{ Id }n(m, c0, i0, l0) {\n        return %{ Nodes };\n    }\n\nkey :use\n\n    function k%{ Id }u(m, c0, i0, l0) {\n        return %{ Use };\n    }\n\nkey :body\n\n    function k%{ Id }b(m, c0, i0, l0, a0) {\n        %{ . :function_body }\n    }\n\nkey :types\n\n    M.k%{ Id }.ut = '%{ Use.getType() }';\n    M.k%{ Id }.bt = '%{ Body.getType() }';\n\n// ----------------------------------------------------------------------------------------------------------------- //\n\n//  jpath\n\njpath :defs\n    var j%{ Id } = %{ . :def };\n\njpath :def\n\n    [ %{ Steps } ]\n\njpath_nametest\n\n    0, '%{ Name }'\n\njpath_dots\n\n    1, %{ Length }\n\njpath_predicate [ a.isLocal() ]\n\n    2, p%{ Id }\n\njpath_predicate [ p.Expr.getType() === 'boolean' ]\n\n    4, p%{ Id }\n\njpath_predicate\n\n    3, %{ Expr }\n\n// ----------------------------------------------------------------------------------------------------------------- //\n\n//  jpath_predicate\n\njpath_predicate :defs\n//  FIXME\n//  [ this.isLocal() || this.Expr.getType() === 'nodeset' ]\n\n    function p%{ Id }(m, c%{ Cid }, i%{ Cid }, l%{ Cid }) {\n        return %{ Expr };\n    }\n\n\n// ----------------------------------------------------------------------------------------------------------------- //\n// block and body\n// ----------------------------------------------------------------------------------------------------------------- //\n\nbody [ f.AsList ]\n\n    %{ Block :listitem ]\n\nbody\n\n    %{ Block }\n\nbody :output\n\n    %{ Block :output }\n\n\n// ----------------------------------------------------------------------------------------------------------------- //\n\nblock :output [ f.AsList ]\n\n    %{ . :listitem }\n\nblock\n\n    %{ js__defs() }\n\n    %{ Exprs }\n\nblock :output\n\n    %{ js__defs() }\n\n    %{ Exprs :output }\n\nblock :listitem\n\n    %{ js__defs() }\n\n    %{ Exprs :listitem }\n\n* :prologue [ a.getType() === 'array' ]\n\n    var r%{ Rid } = [];\n    var a%{ Rid } = { a: {} };\n\n* :prologue [ a.getType() === 'object' ]\n\n    var r%{ Rid } = {};\n    var a%{ Rid } = { a: {} };\n\n* :prologue [ a.getType() === 'nodeset' ]\n\n    var r%{ Rid } = [];\n\n* :prologue [ a.getType() === 'boolean' ]\n\n    var r%{ Rid } = false;\n\n* :prologue\n\n    var r%{ Rid } = '';\n    var a%{ Rid } = { a: {} };\n\n\n// ----------------------------------------------------------------------------------------------------------------- //\n// block expressions\n// ----------------------------------------------------------------------------------------------------------------- //\n\nif_ :listitem\n\n    %{ . :output }\n\nif_ :output\n\n    if (%{ Condition }) %{ Then :if_body } %{ Elses }\n\n* :if_body\n\n    {\n        %{ . :output }\n    }\n\nelse_if\n\n    else if (%{ Condition }) %{ Body :if_body }\n\nelse_\n\n    else %{ Body :if_body }\n\n// ----------------------------------------------------------------------------------------------------------------- //\n\nfor_ :listitem\n\n    %{ . :output }\n\nfor_ :output\n\n    var items%{ Cid } = %{ Selector };\n    for (var i%{ Body.Cid } = 0, l%{ Body.Cid } = items%{ Cid }.length; i%{ Body.Cid } < l%{ Body.Cid }; i%{ Body.Cid }++) {\n        var c%{ Body.Cid } = items%{ Cid }[ i%{ Body.Cid } ];\n        %{ Body :output }\n    }\n\n// ----------------------------------------------------------------------------------------------------------------- //\n\napply :output\n\n    %{ . :output-prologue }\n    r%{ Rid } += %{ . :output-value }\n\napply :listitem\n\n    %{ . :output-prologue }\n    r%{ Rid }.push(%{ . :output-value });\n\napply :output-prologue [ p.Expr.id === 'object' ]\n\n    var r%{ Expr.Rid } = {};\n    %{ Expr :output }\n\napply :output-value [ p.Expr.id === 'object' ]\n    m.a(m, yr.object2nodeset(r%{ Expr.Rid }), %{ Mode :string }, a%{ Rid }%{ Args :comma })\n\napply :output-prologue [ p.Expr.id === 'array' ]\n\n    var r%{ Expr.Rid } = [];\n    %{ Expr :output }\n\napply :output-value [ p.Expr.id === 'array' ]\n    m.a(m, yr.array2nodeset(r%{ Expr.Rid }), %{ Mode :string }, a%{ Rid }%{ Args :comma })\n\napply :output-value [ p.Expr.getType() === 'object' ]\n\n    m.a(m, yr.object2nodeset(%{ Expr }), %{ Mode :string }, a%{ Rid }%{ Args :comma })\n\napply :output-value [ p.Expr.getType() === 'array' ]\n\n    m.a(m, yr.array2nodeset(%{ Expr }), %{ Mode :string }, a%{ Rid }%{ Args :comma })\n\napply :output-value\n\n    m.a(m, %{ Expr }, %{ Mode :string }, a%{ Rid }%{ Args :comma })\n\ntemplate_mode :string\n\n    '%{ Value }'\n\n//  ---------------------------------------------------------------------------------------------------------------  //\n\ncdata :listitem\n\n    r%{ Rid }.push(%{ Value });\n\ncdata :output\n\n    r%{ Rid } += %{ Value };\n\n// ----------------------------------------------------------------------------------------------------------------- //\n\nxml_attr :open\n\n    '%{ Name }': new yr.scalarAttr(%{ Value })\n\nxml_line :output\n\n    r%{ Rid } += %{ . :content };\n\nxml_line :listitem\n\n    r%{ Rid }.push(%{ . :content });\n\nxml_line :content\n\n    %{ js__content() }\n\n\n// ----------------------------------------------------------------------------------------------------------------- //\n\n// FIXME: Закэшировать a0.a в отдельную переменную.\nattr :output [ p.Value.inline() && p.Op === '+=' ]\n\n    var tmp%{ Cid } = a%{ Rid }.a[ %{ Name } ];\n    if (tmp%{ Cid }) {\n        a%{ Rid }.a[ %{ Name } ] = tmp%{ Cid }.add%{ AttrType }(%{ Value });\n    } else {\n        a%{ Rid }.a[ %{ Name } ] = new yr.%{ AttrType }Attr(%{ Value });\n    }\n\nattr :output [ p.Value.inline() ]\n    a%{ Rid }.a[ %{ Name } ] = new yr.%{ AttrType }Attr(%{ Value });\n\nattr :output [ p.Op === '+=' ]\n\n    %{ Value :prologue }\n    %{ Value :output }\n    var tmp%{ Cid } = a%{ Rid }.a[ %{ Name } ];\n    if (tmp%{ Cid }) {\n        a%{ Rid }.a[ %{ Name } ] = tmp%{ Cid }.add%{ AttrType }(r%{ Value.Rid });\n    } else {\n        a%{ Rid }.a[ %{ Name } ] = new yr.%{ AttrType }Attr(r%{ Value.Rid });\n    }\n\nattr :output\n\n    %{ Value :prologue }\n    %{ Value :output }\n    a%{ Rid }.a[ %{ Name } ] = new yr.%{ AttrType }Attr(r%{ Value.Rid });\n\nattrs_close :output\n    r%{ Rid } += closeAttrs(a%{ Rid });\n\nattrs_open :output\n\n    a%{ Rid }.a = {\n        %{ Attrs :open }\n    };\n    a%{ Rid }.s = '%{ Name }';\n\n\n\n// ----------------------------------------------------------------------------------------------------------------- //\n\nsubexpr :listitem\n\n    %{ Block :prologue }\n    %{ Block :output }\n    r%{ Rid }.push(r%{ Block.Rid });\n\nsubexpr :output\n\n    %{ Block :output }\n\n\n\n// ----------------------------------------------------------------------------------------------------------------- //\n// Selectors: jpath\n// ----------------------------------------------------------------------------------------------------------------- //\n\njpath [ a.isRoot() ]\n\n    [ c%{ Cid }.doc.root ]\n\njpath [ a.isSelf() ]\n\n    [ c%{ Cid } ]\n\njpath [ f.IsSimple && p.AsType === 'scalar' ]\n\n    simpleScalar('%{ Name }', %{ . :context })\n\njpath [ f.IsSimple && p.AsType === 'boolean' ]\n\n    simpleBoolean('%{ Name }', %{ . :context })\n\njpath [ f.IsSimple ]\n\n    selectNametest('%{ Name }', %{ . :context }, [])\n\njpath\n\n    m.s(j%{ Id }, %{ . :context })\n\njpath :context [ p.Abs ]\n\n    c%{ Cid }.doc.root\n\njpath :context\n\n    c%{ Cid }\n\n// FIXME: Переименовать jpath_filter в inline_filter.\njpath_filter\n\n    m.n(j%{ JPath.Id }, %{ Expr })\n\n\n// ----------------------------------------------------------------------------------------------------------------- //\n\narglist_item\n    , v%{ Id }\n\narglist_item :defaults [ p.Default ]\n    v%{ Id } = (v%{ Id } === undefined) ? %{ Default } : v%{ Id };\n\narglist_item :defaults [ p.Typedef === 'nodeset' ]\n    v%{ Id } = (v%{ Id } === undefined) ? [] : v%{ Id };\n\n\n// ----------------------------------------------------------------------------------------------------------------- //\n//  value\n// ----------------------------------------------------------------------------------------------------------------- //\n\nvalue\n\n    %{ Value }\n\nvalue :listitem\n\n    r%{ Rid }.push(%{ Value });\n\nvalue :output [ ( a.getType() === 'nodeset' || a.getType() === 'boolean' ) && !p.AsType ]\n\n    r%{ Rid } = %{ Value };\n\nvalue :output [ a.getType() === 'attr' && p.Value.is('inline_var') ]\n\n    yr.copyAttrs( a%{ Rid }.a, %{ Value } );\n\nvalue :output [ a.getType() === 'attr' && p.Value.is('inline_function') && p.Value.def.is('external') ]\n\n    yr.copyAttrs( a%{ Rid }.a, %{ Value } );\n\n//  А тут всегда Value должно быть inline_function.\nvalue :output [ a.getType() === 'attr' ]\n\n    %{ Value };\n\nvalue :output\n\n    r%{ Rid } += %{ Value };\n\n\n//  ---------------------------------------------------------------------------------------------------------------  //\n//  object\n//  ---------------------------------------------------------------------------------------------------------------  //\n\narray :listitem\n\n    %{ . :prologue }\n    %{ . :output }\n    r%{ ~.Rid }.push(r%{ Block.Rid });\n\narray :output\n\n    %{ Block :listitem }\n\nobject :listitem\n\n    %{ . :prologue }\n    %{ . :output }\n    r%{ ~.Rid }.push(r%{ Block.Rid });\n\nobject :output\n\n    %{ Block :output }\n\npair :output [ p.Value.inline() ]\n\n    r%{ Rid }[ %{ Key } ] = %{ Value };\n\npair :output\n\n    %{ Value :prologue }\n    %{ Value :output }\n    r%{ Rid }[ %{ Key } ] = r%{ Value.Rid };\n\n// ----------------------------------------------------------------------------------------------------------------- //\n// inline expressions\n// ----------------------------------------------------------------------------------------------------------------- //\n\ninline_or\n    %{ Left } || %{ Right }\n\ninline_and\n    %{ Left } && %{ Right }\n\ninline_not\n    !%{ Left }\n\ninline_eq [ p.Op === '!=' && ( p.Left.getType() === 'nodeset' || p.Right.getType() === 'nodeset' ) ]\n\n    !(%{ . :cmp })\n\ninline_eq\n\n    %{ . :cmp }\n\ninline_eq :cmp [ p.Left.getType() === 'nodeset' && p.Right.getType() === 'nodeset' ]\n\n    cmpNN(%{ Left }, %{ Right })\n\ninline_eq :cmp [ p.Left.getType() === 'nodeset' ]\n\n    cmpSN(%{ Right }, %{ Left })\n\ninline_eq :cmp [ p.Right.getType() === 'nodeset' ]\n\n    cmpSN(%{ Left }, %{ Right })\n\ninline_eq :cmp\n    %{ Left } %{ Op } %{ Right }\n\ninline_rel\n    %{ Left } %{ Op } %{ Right }\n\ninline_add\n    %{ Left } %{ Op } %{ Right }\n\ninline_mul\n    %{ Left } %{ Op } %{ Right }\n\ninline_unary\n    -%{ Left }\n\ninline_union\n    (%{ Left }).concat(%{ Right })\n\ninline_subexpr\n    (%{ Expr })\n\n\n\n// ----------------------------------------------------------------------------------------------------------------- //\n\ninline_function [ f.IsExternal ]\n    (yr.externals['%{ Name }'])(%{ Args })\n\n//  FIXME: Положить в какой-нибудь флаг инфу о том, что аргументом ключа является нодесет.\ninline_function [ f.IsKey && p.Args.first().getType() === 'nodeset' ]\n    m.k('k%{ Id }', %{ Args }, c%{ Cid }.doc.root, true)\n\ninline_function [ f.IsKey ]\n    m.k('k%{ Id }', %{ Args }, c%{ Cid }.doc.root)\n\ninline_function [ f.IsUser && a.def.isGlobal() ]\n    m.f('f%{ Id }', c%{ Cid }, i%{ Cid }, l%{ Cid }%{ . :attrs }%{ Args :comma })\n\ninline_function [ f.IsUser ]\n    f%{ Id }(m, c%{ Cid }, i%{ Cid }, l%{ Cid }%{ . :attrs }%{ Args :comma })\n\n//  Этот вызов функции сохраняется в переменную, а не просто используется.\n//  Поэтому мы передаем вместо aN новый пустой объект для атрибутов.\ninline_function :attrs [ a.getType() === 'attr' && f.InlineVarValue ]\n\n    , { a: {} }\n\ninline_function :attrs [ a.getType() === 'attr' || a.getType() === 'xml' ]\n\n    , a%{ Rid }\n\n//  Все остальное -- это встроенные функции, для них есть индивидуальные шаблоны ниже.\n//  js__internal() вызывает соответствующий шаблон.\ninline_function\n    %{ js__internal() }\n\ncallargs :comma [ !a.empty() ]\n    , %{ . }\n\ncallarg [ p.AsType === 'nodeset' && p.Expr.id === 'object' ]\n    yr.object2nodeset(%{ . :object })\n\ncallarg [ p.AsType === 'nodeset' && p.Expr.id === 'array' ]\n    yr.array2nodeset(%{ . :object })\n\ncallarg [ p.Expr.id === 'object' || p.Expr.id === 'array' ]\n    %{ . :object }\n\ncallarg :object\n    (function() {\n        %{ Expr :prologue }\n        %{ Expr :output }\n\n        return r%{ Expr.Rid };\n    })()\n\ncallarg\n\n    %{ Expr }\n\n// ----------------------------------------------------------------------------------------------------------------- //\n\ninternal_function_true\n    true\n\ninternal_function_false\n    false\n\ninternal_function_name [ p.Signature === 'nodeset' ]\n    yr.nodeName( %{Args} )\n\ninternal_function_name\n    c%{ Cid }.name\n\ninternal_function_index\n    i%{ Cid }\n\ninternal_function_count [ p.Signature === 'nodeset' ]\n    ( %{Args} ).length\n\ninternal_function_count\n    l%{ Cid }\n\ninternal_function_slice\n    yr.slice(%{ Args })\n\ninternal_function_html\n    %{ Args }\n\ninternal_function_exists\n    yr.exists(%{ Args })\n\ninternal_function_number\n    (+(%{ Args }))\n\ninternal_function_string [ p.Signature === 'nodeset' ]\n    ('' + yr.nodeset2scalar(%{ Args }))\n\ninternal_function_string\n    ('' + %{ Args })\n\ninternal_function_scalar\n    %{ Args }\n\ninternal_function_boolean\n    %{ Args }\n\ninternal_function_log\n    (console.log(%{ Args }),'')\n\ninternal_function_document\n    yr.document(%{ Args })\n\ninternal_function_subnode\n    yr.subnode(%{ Args }, c%{ Cid })\n\n// ----------------------------------------------------------------------------------------------------------------- //\n\ninline_var [ a.def.isGlobal() ]\n\n    m.v('v%{ Id }', c%{ Cid }.doc.root)\n\ninline_var\n    v%{ Id }\n\n//  ---------------------------------------------------------------------------------------------------------------  //\n\ninline_number\n    %{ Value }\n\ninline_string\n    %{ Value }\n\nstring_expr\n    ( %{ Expr } )\n\nstring_literal\n    %{ stringify() }\n\n\n\n// ----------------------------------------------------------------------------------------------------------------- //\n// cast and quote\n// ----------------------------------------------------------------------------------------------------------------- //\n\ncast [ p.From === 'nodeset' && p.To === 'data' ]\n    yr.nodeset2data(%{ Expr })\n\ncast [ p.From === 'nodeset' && (p.To === 'scalar' || p.To === 'xml' || p.To === 'attrvalue' || p.To === 'boolean') ]\n    nodeset2%{ To }( %{ Expr } )\n\ncast [ p.From === 'scalar' && (p.To === 'xml' || p.To == 'attrvalue') ]\n    scalar2%{ To }( %{ Expr } )\n\ncast [ p.From === 'xml' && p.To == 'attrvalue' ]\n    xml2attrvalue( %{ Expr } )\n\ncast [ p.From === 'xml' && p.To == 'scalar' ]\n    xml2scalar( %{ Expr } )\n\ncast [ p.From === 'object' && p.To == 'nodeset' ]\n    yr.object2nodeset( %{ Expr } )\n\ncast [ p.From === 'array' && p.To == 'nodeset' ]\n    yr.array2nodeset( %{ Expr } )\n\n// FIXME: Не бывает ли ситуации, когда таки нужно нетривиально приводить scalar к boolean?\ncast [ p.From === 'scalar' && p.To === 'boolean' ]\n    %{ Expr }\n\ncast\n    %{ Expr }\n\nquote\n    yr.%{ Mode }Quote(%{ Expr })\n\n//  ---------------------------------------------------------------------------------------------------------------  //\n\nsort [ p.Order === 'desc' ]\n\n    yr.sort(%{ Nodes }, function(c%{ Cid }, i%{ Cid }, l%{ Cid }) { return %{ By }; }, true)\n\nsort\n\n    yr.sort(%{ Nodes }, function(c%{ Cid }, i%{ Cid }, l%{ Cid }) { return %{ By }; })\n\n// ----------------------------------------------------------------------------------------------------------------- //\n// misc\n// ----------------------------------------------------------------------------------------------------------------- //\n\n* :yate\n    %{ yate() }\n\n\n".toString());
yate.AST.yate = new pt.Codegen( 'yate', null,  "module [ p.Name ]\n\n// FIXME экранировать кавычки\n    module \"%{ Name }\"\n\n    %{ Block }\n\nmodule\n\n    %{ Block }\n\n// ----------------------------------------------------------------------------------------------------------------- //\n\ntemplate\n\n    match %{ Selectors } %{ Mode } %{ Args :list } %{ Body }\n\ntemplate_mode\n\n    %{ Value }\n\n// ----------------------------------------------------------------------------------------------------------------- //\n\nfunction_\n\n    func %{ Name }(%{ Args }) %{ Body }\n\n// ----------------------------------------------------------------------------------------------------------------- //\n\nkey\n\n    key %{ Name } (%{ Nodes }, %{ Use }) %{ Body }\n\n// ----------------------------------------------------------------------------------------------------------------- //\n\narglist :list\n\n    (%{ . })\n\narglist_item [ p.Default ]\n\n    %{ Typedef } %{ Name } = %{ Default }\n\narglist_item\n\n    %{ Typedef } %{ Name }\n\n// ----------------------------------------------------------------------------------------------------------------- //\n\nvar_\n\n    %{ Name } = %{ Value }\n\n// ----------------------------------------------------------------------------------------------------------------- //\n\nbody [ p.AsList ]\n\n    [\n        %{ Block }\n    ]\n\nbody\n\n    {\n        %{ Block }\n    }\n\n// ----------------------------------------------------------------------------------------------------------------- //\n\nblock\n\n    %{ Items }\n\n// ----------------------------------------------------------------------------------------------------------------- //\n\nblock_exprs\n\n    %{ yate__() }\n\n// ----------------------------------------------------------------------------------------------------------------- //\n\nif_\n\n    if %{ Condition } %{ Then }%{ Elses }\n\nelse_if\n\n    \\ else if %{ Condition } %{ Body }\n\nelse_\n\n    \\ else %{ Body }\n\n// ----------------------------------------------------------------------------------------------------------------- //\n\nfor_\n\n    for %{ Expr } %{ Body }\n\n// ----------------------------------------------------------------------------------------------------------------- //\n\napply\n\n    apply %{ Expr } %{ Mode } %{ Args :list }\n\n// ----------------------------------------------------------------------------------------------------------------- //\n\nattr\n\n    @%{ Name } %{ Op } %{ Value }\n\n// ----------------------------------------------------------------------------------------------------------------- //\n\ninline_or\n    %{ Left } || %{ Right }\n\ninline_and\n    %{ Left } && %{ Right }\n\ninline_not\n    !%{ Left }\n\ninline_eq\n    %{ Left } %{ Op } %{ Right }\n\ninline_rel\n    %{ Left } %{ Op } %{ Right }\n\ninline_add\n    %{ Left } %{ Op } %{ Right }\n\ninline_mul\n    %{ Left } %{ Op } %{ Right }\n\ninline_unary\n    -%{ Expr }\n\ninline_union\n    %{ Left } | %{ Right }\n\ninline_subexpr\n    ( %{ Expr } )\n\ninline_function\n    %{ Name }(%{ Args })\n\ninline_number\n    %{ Value }\n\ninline_var\n    %{ Name }\n\n//  ---------------------------------------------------------------------------------------------------------------  //\n\ncallargs :list\n\n    (%{ . })\n\ncallarg\n    %{ Expr }\n\n// ----------------------------------------------------------------------------------------------------------------- //\n\njpath [ p.Abs ]\n    /%{ Steps }\n\njpath\n    %{ Steps }\n\njpath_dots\n    %{ Dots }\n\njpath_nametest\n    .%{ Name }%{ Predicates }\n\njpath_predicate\n    [ %{ Expr } ]\n\njpath_filter\n    %{ Expr }%{ JPath }\n\n// ----------------------------------------------------------------------------------------------------------------- //\n\nxml_empty\n    <%{ Name }%{ Attrs }/>\n\nxml_start\n    <%{ Name }%{ Attrs }>\n\nxml_end\n    </%{ Name }>\n\nxml_text\n    %{ Text }\n\nxml_attr\n    \\ %{ Name }=%{ Value }\n\n// ----------------------------------------------------------------------------------------------------------------- //\n\n// FIXME экранировать кавычки\ninline_string\n    \"%{ Value }\"\n\nstring_expr\n    { %{ Expr } }\n\nstring_literal\n    %{ Value }\n\n// ----------------------------------------------------------------------------------------------------------------- //\n\nsubexpr\n    (\n        %{ Block }\n    )\n\npair\n    %{ Key } : %{ Value }\n\narray\n    [\n        %{ Block }\n    ]\n\nobject\n    {\n        %{ Block }\n    }\n\nvalue\n\n    %{ Value }\n\nsimple_jpath\n\n    .%{ Name }\n\ncast\n\n    %{ Expr }\n\n// vim: set filetype=javascript:\n\n\n".toString());

yate.AST.prototype._code = function(lang, mode) {
    return yate.AST[lang].generate(this.id, this, mode);
};

yate.AST.prototype.code = function(lang, mode) {
    mode = mode || '';

    return this._code(lang, mode) || '';
};

//  ---------------------------------------------------------------------------------------------------------------  //

yate.AST.serialize = function(ast) {
    return JSON.stringify({
        version: yate.version,
        filename: ast.where.input.filename,
        ast: yate.AST.toJSON(ast)
    });
};

yate.AST.deserialize = function(obj) {
    var filename = obj.filename;
    var input = new pt.InputStream( { filename: filename } );

    return yate.AST.fromJSON(obj.ast, input);
};

//  ---------------------------------------------------------------------------------------------------------------  //

yate.AST.toJSON = function(ast) {
    if (!ast || typeof ast !== 'object') {
        return ast;
    }

    var r = {};

    r.id = ast.id;
    r.x = ast.where.x;
    r.y = ast.where.y;

    var props = r.p = {};
    for (var key in ast.p) {
        var value = ast.p[key];
        if (value instanceof Array) {
            var a = props[key] = [];
            for (var i = 0, l = value.length; i < l; i++) {
                a.push( yate.AST.toJSON( value[i] ) );
            }
        } else {
            props[key] = yate.AST.toJSON(value);
        }
    }

    return r;
};

yate.AST.fromJSON = function(obj, input) {
    if (!obj || typeof obj !== 'object') {
        return obj;
    }

    var where = {
        x: obj.x,
        y: obj.y,
        input: input
    };

    var ast = yate.factory.make(obj.id, where);

    var props = ast.p;
    for (var key in obj.p) {
        var value = obj.p[key];
        if (value instanceof Array) {
            var a = props[key] = [];
            for (var i = 0, l = value.length; i < l; i++) {
                a.push( yate.AST.fromJSON(value[i], input) );
            }
        } else {
            props[key] = yate.AST.fromJSON(value, input);
        }
    }

    return ast;
};

//  ---------------------------------------------------------------------------------------------------------------  //


},{"./scope.js":9,"./types.js":10,"./yate.js":11,"fs":12,"nommon":17,"parse-tools":27}],3:[function(require,module,exports){
var pt = require('parse-tools');

//  ---------------------------------------------------------------------------------------------------------------  //

var yate = require('./yate.js');

require('./types.js');
require('./scope.js');
require('./consts.js');
require('./ast.js');

var entities = require('./entities.json');

var no = require('nommon');

var yr = require('./runtime.js');

//  ---------------------------------------------------------------------------------------------------------------  //

yate.asts = {};

//  ---------------------------------------------------------------------------------------------------------------  //

function deentitify(s) {
    return s
        .replace(/&#(\d+);?/g, function (_, code) {
            return String.fromCharCode(code);
        })
        .replace(/&#[xX]([A-Fa-f0-9]+);?/g, function (_, hex) {
            return String.fromCharCode( parseInt(hex, 16) );
        })
        .replace(/&(\w+);/g, function (entity, name) {
            return entities[name] || entity;
        });
}

//  ---------------------------------------------------------------------------------------------------------------  //
//  items
//  ---------------------------------------------------------------------------------------------------------------  //

yate.asts.items = {};

//  ---------------------------------------------------------------------------------------------------------------  //

yate.asts.items._init = function(items) {
    this.p.Items = items || [];
};

//  ---------------------------------------------------------------------------------------------------------------  //

yate.asts.items.add = function(item) {
    this.p.Items.push(item);
};

yate.asts.items.length = function() {
    return this.p.Items.length;
};

yate.asts.items.first = function() {
    return this.p.Items[0];
};

yate.asts.items.last = function() {
    var items = this.p.Items;
    return items[items.length - 1];
};

yate.asts.items.empty = function() {
    return (this.p.Items.length === 0);
};

yate.asts.items.iterate = function(callback) {
    this.p.Items.forEach(callback);
};

yate.asts.items.iterateBack = function(callback) {
    this.p.Items.reverse().forEach(callback);
};

yate.asts.items.grep = function(callback) {
    return this.p.Items.filter(callback);
};

yate.asts.items.map = function(callback) {
    return this.p.Items.map(callback);
};

//  ---------------------------------------------------------------------------------------------------------------  //

yate.asts.items.code = function(lang, mode) {
    mode = mode || '';

    var result = this._code(lang, mode);
    if (result !== undefined) {
        return result;
    }

    var r = [];
    this.iterate(function(item) {
        r.push( item.code(lang, mode) );
    });

    var sep = this[lang + 'sep__' + mode] || '';

    return r.join(sep);
};

//  ---------------------------------------------------------------------------------------------------------------  //

yate.asts.items.toString = function() {
    if (this.p.Items.length > 0) {
        var r = this.p.Items.join('\n').replace(/^/gm, '    ');
        return this.id.bold + ' [\n' + r + '\n]';
    }
    return '';
};

/*
yate.asts.items.toJSON = function() {
    return this.map(function(item) {
        return item.toJSON();
    });
};
*/

//  ---------------------------------------------------------------------------------------------------------------  //

//  FIXME: Из этих трех методов используется только один в одном месте!
yate.asts.items.someIs = function(callback) {
    var items = this.p.Items;

    if (typeof callback === 'function') {
        for (var i = 0, l = items.length; i < l; i++) {
            if (callback( items[i] )) { return true; }
        }
    } else {
        for (var i = 0, l = items.length; i < l; i++) {
            if ( items[i][callback]() ) { return true; }
        }
    }

    return false;
};

yate.asts.items.allIs = function(callback) {
    var items = this.p.Items;

    if (typeof callback === 'function') {
        for (var i = 0, l = items.length; i < l; i++) {
            if ( !callback( items[i] ) ) { return false; }
        }
    } else {
        for (var i = 0, l = items.length; i < l; i++) {
            if ( !items[i][callback]() ) { return false; }
        }
    }

    return true;
};

yate.asts.items.noneIs = function(callback) {
    var items = this.p.Items;

    if (typeof callback === 'function') {
        for (var i = 0, l = items.length; i < l; i++) {
            if ( callback( items[i] ) ) { return false; }
        }
    } else {
        for (var i = 0, l = items.length; i < l; i++) {
            if ( items[i][callback]() ) { return false; }
        }
    }

    return true;
};

//  ---------------------------------------------------------------------------------------------------------------  //

yate.asts.items.apply = function(callback, params) {
    var items = this.p.Items;
    for (var i = 0, l = items.length; i < l; i++) {
        callback(items[i], params);
    }
};

yate.asts.items.walkdo = function(callback, params, pKey, pObject) {
    var items = this.p.Items;
    for (var i = 0, l = items.length; i < l; i++) {
        items[i].walkdo(callback, params, i, items);
    }

    callback(this, params, pKey, pObject);
};

yate.asts.items.dowalk = function(callback, params) {
    callback(this, params);

    var items = this.p.Items;
    for (var i = 0, l = items.length; i < l; i++) {
        items[i].dowalk(callback, params, i, items);
    }
};

yate.asts.items.mergeWith = function(ast) {
    this.p.Items = ast.p.Items.concat(this.p.Items);
};

//  ---------------------------------------------------------------------------------------------------------------  //

yate.asts.items._getType = function() {
    var items = this.p.Items;
    var l = items.length;

    if (!l) { return 'scalar'; } // FIXME: А нужно ли это? Может быть UNDEF сработает?

    var currentId = items[0].id;
    var currentType = items[0].getType();

    for (var i = 1; i < l; i++) {
        var item = items[i];
        var nextType = item.getType();

        var commonType = yate.types.joinType(currentType, nextType);
        if (commonType == 'none') {
            item.error('Несовместимые типы ' + currentType + ' (' + currentId + ') и ' + nextType + ' (' + item.id + ')');
        }
        currentId = item.id;
        currentType = commonType;
    }

    return currentType;
};

//  ---------------------------------------------------------------------------------------------------------------  //

yate.asts.items.toResult = function(result) {
    this.iterate(function(item) {
        item.toResult(result);
    });
};

//  ---------------------------------------------------------------------------------------------------------------  //

yate.asts.items.oncast = function(to) {
    this.iterate(function(item) {
        item.cast(to);
    });
};

//  ---------------------------------------------------------------------------------------------------------------  //

yate.asts.items.isLocal = function() {
    return this.someIs('isLocal');
};

yate.asts.items.isConst = function() {
    return this.allIs('isConst');
};

//  ---------------------------------------------------------------------------------------------------------------  //

yate.asts.items.getScope = function() {
    var items = this.p.Items;
    var l = items.length;
    if (!l) { return this.scope; }

    var scope = items[0].getScope();
    for (var i = 1; i < l; i++) {
        scope = yate.Scope.commonScope( scope, items[i].getScope() );
    }

    return scope;
};



//  ---------------------------------------------------------------------------------------------------------------  //
//  module
//  ---------------------------------------------------------------------------------------------------------------  //

yate.asts.module = {};

//  ---------------------------------------------------------------------------------------------------------------  //
//
//  block and body:
//
//    * body
//    * block
//        * block_imports
//        * block_defs
//        * block_templates
//        * block_exprs
//
//  ---------------------------------------------------------------------------------------------------------------  //


//  ---------------------------------------------------------------------------------------------------------------  //
//  body
//  ---------------------------------------------------------------------------------------------------------------  //

yate.asts.body = {};

yate.asts.body._getType = function() {
    return this.p.Block.getType();
};

yate.asts.body.closes = function() {
    return this.p.Block.closes();
};

yate.asts.body.oncast = function(to) {
    this.p.Block.cast(to);
};

yate.asts.body.setPrevOpened = function(prevOpened) {
    this.p.Block.setPrevOpened(prevOpened);
};

yate.asts.body.isLocal = function() {
    return this.p.Block.isLocal();
};

yate.asts.body.inline = function() {
    return this.p.Block.inline();
};

yate.asts.body.setAsList = function() {
    this.f.AsList = true;
    this.p.Block.setAsList();
};

//  ---------------------------------------------------------------------------------------------------------------  //
//  block
//  ---------------------------------------------------------------------------------------------------------------  //

yate.asts.block = {};

yate.asts.block.options = {
    scope: true
};

yate.asts.block._init = function() {
    var p = this.p;

    //  Хранилище всего содержимого блока. Заполняется при парсинге.
    p.Items = this.make('block_items');

    //  После парсинга все элементы блока раскладываются на отдельные кучки.
    //  p.Includes = this.make('block_includes');
    //  p.Imports = this.make('block_imports');
    p.Defs = this.make('block_defs');
    p.Templates = this.make('block_templates');
    p.Exprs = this.make('block_exprs');
};

yate.asts.block._getType = function() {
    return this.p.Exprs.getType();
};

yate.asts.block.w_setTypes = function() {
    if (this.f.AsList) {
        this.p.Exprs.iterate(function(item) {
            if (item.getType() === 'nodeset') {
                item.cast('scalar');
            } else {
                item.cast();
            }
        });
    }
};

yate.asts.block.w_deinclude = function() {
    var a = [];

    this.p.Items.iterate(function(item) {
        if (item.id === 'include') {
            var ast = yate.parse(item.p.Filename, 'module');
            ast.dowalk(function(ast) {
                ast.w_deinclude();
            });
            a = a.concat(ast.p.Block.p.Items.p.Items);
        } else {
            a.push(item);
        }
    });

    this.p.Items.p.Items = a;
};

yate.asts.block.w_deimport = function() {
    var a = [];
    var imports = [];

    this.p.Items.iterate(function(item) {
        if (item.id === 'import') {
            var name = item.p.Name;
            var module = yate.modules[name];
            if (!module) {
                item.error('Cannot find module "' + name + '"');
            }

            imports.push(name);

            var defs = module.defs;
            var input = new pt.InputStream( { filename: module.filename } );

            var b = [];
            for (var i = 0, l = defs.length; i < l; i++) {
                var def = defs[i];
                var ast = yate.AST.fromJSON(def, input);
                ast.f.isImported = true;
                b.push(ast);

                switch (ast.id) {
                    case 'var_':
                        ast.state.vid = ast.p.Id + 1;
                        break;
                    case 'function_':
                        ast.state.fid = ast.p.Id + 1;
                        break;
                    case 'key':
                        ast.state.kid = ast.p.Id + 1;
                }
            }
            a = b.concat(a);

        } else {
            a.push(item);
        }
    });

    this.p.Items.p.Items = a;
    this.p.Imports = JSON.stringify(imports);
};

yate.asts.block.w_deitemize = function() {
    var Defs = this.p.Defs;
    var Templates = this.p.Templates;
    var Exprs = this.p.Exprs;

    //  FIXME: Без этой проверки каким-то образом этот код вызывается повторно.
    if (this.p.Items) {
        this.p.Items.iterate(function(item) {
            switch (item.id) {
                case 'template':
                    Templates.add(item);
                    break;

                case 'key':
                case 'function_':
                case 'var_':
                case 'external':
                    Defs.add(item);
                    break;

                default:
                    Exprs.add(item);
            }

        });

        this.p.Items = null;
    }
};

yate.asts.block.oncast = function(to) {
    this.p.Exprs.cast(to);
};

yate.asts.block.closes = function() {
    //  FIXME: Может таки унести это в block_exprs.closes?
    var exprs = this.p.Exprs;
    if ( exprs.empty() ) { return false; }

    return exprs.first().closes();
};

yate.asts.block.setPrevOpened = function(prevOpened) {
    this.prevOpened = prevOpened;
};

yate.asts.block.mergeWith = function(block) {
    this.p.Imports.mergeWith(block.p.Imports);
    this.p.Defs.mergeWith(block.p.Defs);
    this.p.Templates.mergeWith(block.p.Templates);
    this.p.Exprs.mergeWith(block.p.Exprs);
};

yate.asts.block.isLocal = function() {
    return this.p.Exprs.isLocal();
};

yate.asts.block.inline = function() {
    return (
        this.p.Templates.empty() &&
        !this.scope.defs.length &&
        this.p.Exprs.length() === 1 &&
        this.p.Exprs.first().inline()
    );
};

yate.asts.block.js__matcher = function() {
    //  Группируем шаблоны по модам.
    var groups = {};
    this.p.Templates.iterate(function(template) {
        var mode = template.p.Mode.p.Value;

        var info = groups[mode];
        if (!info) {
            info = groups[mode] = {
                templates: [],
                matcher: {}
            };
        }

        info.templates.push(template);
        var steps = template.p.Selectors.getLastSteps();
        for (var i = 0, l = steps.length; i < l; i++) {
            var step = steps[i];
            if ( !info.matcher[step] ) {
                info.matcher[step] = [];
            }
        }
    });

    //  В groups у нас получается такая структура.
    //  На верхнем уровне объект, ключами в котором -- моды.
    //  Значения -- объект с двумя полями:
    //
    //    * templates -- линейный список всех шаблонов с такой модой
    //    * matcher -- объект, который станет куском глобального matcher'а.
    //      в нем ключи -- это имена нод, а значениями пока что пустые массивы.
    //      Дальнейший код разложит шаблоны по этим пустым массивам.
    //

    var matcher = {};

    for (var mode in groups) {
        var info = groups[mode];

        var templates = info.templates;
        for (var i = 0, l = templates.length; i < l; i++) {
            var template = templates[i];
            var tid = 't' + template.p.Id;

            var steps = template.p.Selectors.getLastSteps();
            for (var j = 0, m = steps.length; j < m; j++) {
                var step = steps[j];
                info.matcher[step].unshift(tid);
                if (step === '*') {
                    for (var name in info.matcher) {
                        if (name !== '*' && name !== '') {
                            info.matcher[name].unshift(tid);
                        }
                    }
                }
            }
        }
        matcher[mode] = info.matcher;
    }

    return JSON.stringify(matcher, null, 4);
};

yate.asts.block.js__defs = function() {
    var defs = this.scope.defs;
    var r = [];
    for (var i = 0, l = defs.length; i < l; i++) {
        r.push( defs[i].js('defs') );
    }
    return r.join('\n\n');
};

yate.asts.block.setAsList = function() {
    this.f.AsList = true;
    this.p.Exprs.iterate(function(item) {
        item.setAsList();
    });
};

//  ---------------------------------------------------------------------------------------------------------------  //
//  block_items
//  ---------------------------------------------------------------------------------------------------------------  //

yate.asts.block_items = {};

yate.asts.block_items.options = {
    mixin: 'items'
};

yate.asts.block_items.yatesep__ = '\n';

/*
//  FIXME: Сделать инденты при выводе.
yate.asts.block_items.yate__ = function() {
    var exprs = [];
    var indent = 0;

    // XML indents

    this.iterate(function(expr) {
        var delta = 0;
        if (expr.is('xml_line')) {
            expr.iterate(function(item) {
                if (item.is('xml_start')) {
                    delta++;
                } else if (item.is('xml_end')) {
                    delta--;
                }
            });
        }
        if (delta < 0) indent--;
        exprs.push( expr.yate().replace(/^/gm, Array(indent + 1).join('    ')) );
        if (delta > 0) indent++;
    });

    return exprs.join('\n');
};
*/

//  ---------------------------------------------------------------------------------------------------------------  //
//  block_imports
//  ---------------------------------------------------------------------------------------------------------------  //

/*
yate.asts.block_imports = {};

yate.asts.block_imports.options = {
    mixin: 'items'
};

yate.asts.block_imports.jssep__ = ', ';
*/

//  ---------------------------------------------------------------------------------------------------------------  //
//  block_includes
//  ---------------------------------------------------------------------------------------------------------------  //

yate.asts.block_includes = {};

yate.asts.block_includes.options = {
    mixin: 'items'
};


//  ---------------------------------------------------------------------------------------------------------------  //
//  block_defs
//  ---------------------------------------------------------------------------------------------------------------  //

yate.asts.block_defs = {};

yate.asts.block_defs.options = {
    mixin: 'items'
};

yate.asts.block_defs.jssep__global_def = '\n';

yate.asts.block_defs.yatesep__ = '\n';


//  ---------------------------------------------------------------------------------------------------------------  //
//  block_templates
//  ---------------------------------------------------------------------------------------------------------------  //

yate.asts.block_templates = {};

yate.asts.block_templates.options = {
    mixin: 'items'
};

yate.asts.block_templates.jssep__ = '\n\n';

yate.asts.block_templates.jssep__defs = '\n\n';

yate.asts.block_templates.yatesep__ = '\n\n';


//  ---------------------------------------------------------------------------------------------------------------  //
//  block_exprs
//  ---------------------------------------------------------------------------------------------------------------  //

yate.asts.block_exprs = {};

yate.asts.block_exprs.options = {
    mixin: 'items'
};

yate.asts.block_exprs.w_validate = function() {
    var opened = [];
    this.iterate(function(item) {
        if (item.is('xml_line') || item.is('block_list')) {
            item.wellFormed(opened);
        }
    });
    if (opened.length > 0) {
        this.error('Невалидный XML в блоке. Ожидается </' + opened[0] + '>');
    }
};

yate.asts.block_exprs.w_prepare = function() {
    if ( this.parent.f.AsList ) { return; }
    if ( this.getType() !== 'xml' && this.p.AsType !== 'xml' ) { return; }

    var items = this.p.Items;
    var l = items.length;
    if (!l) { return; }

    var prevOpened = this.parent.prevOpened; // block.prevOpened.

    var o = [];
    for (var i = 0; i < l; i++) {
        var item = items[i];
        var next = items[i + 1];

        if ( item.closes() && (prevOpened !== false) ) {
            o.push( this.make('attrs_close', this) );

            prevOpened = false;
        }

        o.push(item);

        if ( item.opens() && !(next && next.closes()) ) {
            var lastTag = item.lastTag();

            lastTag.open = true;
            o.push( this.make('attrs_open', lastTag) );

            prevOpened = true;
        }

        item.setPrevOpened(prevOpened);
    }

    this.p.Items = o;
};

yate.asts.block_exprs.jssep__output = '\n';

yate.asts.block_exprs.jssep__listitem = '\n';

//  ---------------------------------------------------------------------------------------------------------------  //


//  ---------------------------------------------------------------------------------------------------------------  //
//
//  declarations:
//
//    * template
//        * template_selectors
//        * template_mode
//    * var_
//    * function_
//    * key
//    * external
//
//  ---------------------------------------------------------------------------------------------------------------  //


//  ---------------------------------------------------------------------------------------------------------------  //
//  template
//  ---------------------------------------------------------------------------------------------------------------  //

yate.asts.template = {};

yate.asts.template.w_action = function() {
    this.p.Id = this.state.tid++;
};

yate.asts.template.w_setTypes = function() {
    this.p.Body.cast( this.getType() );
};

yate.asts.template._getType = function() {
    var type = this.p.Body.getType();
    if (type == 'array' || type == 'object') {
        return type;
    }
    return 'xml';
};


//  ---------------------------------------------------------------------------------------------------------------  //
//  template_selectors
//  ---------------------------------------------------------------------------------------------------------------  //

yate.asts.template_selectors = {};

yate.asts.template_selectors.options = {
    mixin: 'items'
};

yate.asts.template_selectors.getLastSteps = function() {
    var steps = [];
    this.iterate(function(selector) {
        var step = ( selector.isRoot() ) ? '' : selector.lastName();
        if (steps.indexOf(step) === -1) {
            steps.push(step);
        }
    });
    return steps;
};

yate.asts.template_selectors.w_validate = function() {
    this.iterate(function(selector) {
        selector.validateMatch();
    });
};

yate.asts.template_selectors.jssep__template_selector = ', ';
yate.asts.template_selectors.jssep__template_abs = ', ';

yate.asts.template_selectors.yatesep__ = ' | ';


//  ---------------------------------------------------------------------------------------------------------------  //
//  template_mode
//  ---------------------------------------------------------------------------------------------------------------  //

yate.asts.template_mode = {};


//  ---------------------------------------------------------------------------------------------------------------  //
//  var_
//  ---------------------------------------------------------------------------------------------------------------  //

yate.asts.var_ = {};

yate.asts.var_.w_action = function() {
    var vars = this.scope.vars;
    var name = this.p.Name;

    if (vars[name]) {
        this.error('Повторное определение переменной ' + name);
    }

    if (this.p.Id === undefined) {
        this.p.Id = this.state.vid++;
    }
    this.f.IsUser = true;

    /*
    if (!this.scope.parent) { // NOTE: В данный момент все глобальные переменные будут "ленивыми".
                              // FIXME: Делать ленивыми только неконстантные переменные.
        this.f.Lazy = true;
    }
    */

    vars[name] = this;
};

yate.asts.var_._getType = function() {
    return this.p.Value.getType();
};

yate.asts.var_.w_setTypes = function() {
    this.p.Value.cast();
};

yate.asts.var_.w_prepare = function() {
    var Value = this.p.Value;
    //  Выставляем значению переменной специальный флаг.
    if ( Value.inline() ) {
        if (Value.getType() === 'attr') {
            Value.p.Value.f.InlineVarValue = true;
        }
    } else {
        Value.rid();
    }
};

yate.asts.var_.w_extractDefs = function() {
    this.scope.defs.push(this);
};

yate.asts.var_.isConst = function() {
    return this.p.Value.isConst();
};


//  ---------------------------------------------------------------------------------------------------------------  //
//  function_
//  ---------------------------------------------------------------------------------------------------------------  //

yate.asts.function_ = {};

yate.asts.function_.w_action = function() {
    var functions = this.scope.functions;
    var name = this.p.Name;

    if (functions[name]) {
        this.error('Повторное определение функции или ключа ' + name);
    }

    if (this.p.Id === undefined) {
        this.p.Id = this.state.fid++;
    }
    this.f.IsUser = true;

    functions[name] = this;
};

yate.asts.function_.w_validate = function() {
    if (this.p.Body.getType() === 'undef') {
        this.error('Undefined type of return value');
    }
};

yate.asts.function_._getType = function() {
    return this.p.Body.getType();
};

yate.asts.function_.w_setTypes = function() {
    this.p.Body.cast();
};

yate.asts.function_.w_extractDefs = function() {
    this.scope.defs.push(this);
};

yate.asts.function_.isLocal = function() {
    return this.p.Body.isLocal();
};


//  ---------------------------------------------------------------------------------------------------------------  //
//  key
//  ---------------------------------------------------------------------------------------------------------------  //

yate.asts.key = {};

yate.asts.key.w_action = function() {
    var functions = this.scope.functions;
    var name = this.p.Name;

    if (functions[name]) {
        this.error('Повторное определение функции или ключа ' + name);
    }

    if (this.p.Id === undefined) {
        this.p.Id = this.state.kid++;
    }
    this.f.IsKey = true;

    functions[name] = this;
};

yate.asts.key.w_validate = function() {
    if ( !this.p.Nodes.getType('nodeset') ) {
        this.p.Nodes.error('Nodeset is required');
    }
    var useType = this.p.Use.getType();
    if (useType !== 'scalar' && useType !== 'nodeset') {
        this.p.Use.error('Scalar or nodeset is required');
    }
};

yate.asts.key._getType = function() {
    return this.p.Body.getType();
};

yate.asts.key.w_prepare = function() {
    //  Если в Nodes объект, то его бы неплохо привести к nodeset.
    this.p.Nodes.cast('nodeset');
    if (this.p.Use.getType() !== 'nodeset') {
        this.p.Use.cast('scalar');
    }
    this.p.Body.cast();
};

yate.asts.key.w_extractDefs = function() {
    this.scope.defs.push(this);
};


//  ---------------------------------------------------------------------------------------------------------------  //
//  external
//  ---------------------------------------------------------------------------------------------------------------  //

yate.asts.external = {};

yate.asts.external.w_action = function() {
    var functions = this.scope.functions;
    var name = this.p.Name;

    if (functions[name]) {
        this.error('Повторное определение функции или ключа ' + name);
    }

    this.f.IsExternal = true;

    functions[name] = this;
};

yate.asts.external._getType = function() {
    return this.p.Type;
};

yate.asts.external.w_extractDefs = function() {
    this.scope.defs.push(this);
};


//  ---------------------------------------------------------------------------------------------------------------  //
//
//  block expressions:
//
//    * if_
//        * elses
//        * else_if
//        * else_
//    * for_
//    * apply
//    * value
//    * subexpr
//    * attr
//    * attrs_close
//    * attrs_open
//    * xml
//
//  ---------------------------------------------------------------------------------------------------------------  //


//  ---------------------------------------------------------------------------------------------------------------  //
//  if
//  ---------------------------------------------------------------------------------------------------------------  //

yate.asts.if_ = {};

yate.asts.if_.options = {
    base: 'expr'
};

yate.asts.if_._init = function() {
    this.p.Elses = this.make('elses');
};

yate.asts.if_._getType = function() {
    var type = this.p.Then.getType();
    this.p.Elses.iterate(function(item) {
        type = yate.types.commonType( type, item.getType() );
    });
    return type;
};

yate.asts.if_.w_setTypes = function() {
    this.p.Condition.cast('boolean');
    this.p.Elses.iterate(function(item) {
        if ( item.is('else_if') ) {
            item.p.Condition.cast('boolean');
        }
    });
};

yate.asts.if_.oncast = function(to) {
    this.p.Then.cast(to);
    this.p.Elses.iterate(function(item) {
        item.p.Body.cast(to);
    });
};

yate.asts.if_.closes = function() {
    return this.p.Then.closes() && this.p.Elses.allIs('closes');
};

yate.asts.if_.setPrevOpened = function(prevOpened) {
    this.p.Then.setPrevOpened(prevOpened);
    this.p.Elses.iterate(function(item) {
        item.p.Body.setPrevOpened(prevOpened);
    });
};

yate.asts.if_.isLocal = function() {
    return this.p.Then.isLocal() || this.p.Elses.isLocal();
};

yate.asts.if_.setAsList = function() {
    this.f.AsList = true;
    this.p.Then.setAsList();
    this.p.Elses.iterate(function(item) {
        item.setAsList();
    });
};


//  ---------------------------------------------------------------------------------------------------------------  //
//  elses
//  ---------------------------------------------------------------------------------------------------------------  //

yate.asts.elses = {};

yate.asts.elses.options = {
    mixin: 'items'
};

yate.asts.elses.jssep__ = ' ';


//  ---------------------------------------------------------------------------------------------------------------  //
//  else_if
//  ---------------------------------------------------------------------------------------------------------------  //

yate.asts.else_if = {};

yate.asts.else_if._getType = function() {
    return this.p.Body.getType();
};

yate.asts.else_if.closes = function() {
    return this.p.Body.closes();
};


//  ---------------------------------------------------------------------------------------------------------------  //
//  else_
//  ---------------------------------------------------------------------------------------------------------------  //

yate.asts.else_ = {};

yate.asts.else_._getType = function() {
    return this.p.Body.getType();
};

yate.asts.else_.closes = function() {
    return this.p.Body.closes();
};

//  ---------------------------------------------------------------------------------------------------------------  //
//  for_
//  ---------------------------------------------------------------------------------------------------------------  //

yate.asts.for_ = {};

yate.asts.for_.options = {
    base: 'expr'
};

yate.asts.for_._getType = function() {
    var type = this.p.Body.getType();

    if (this.f.AsList) {
        return type;
    }

    return yate.types.joinType(type, type);
};

yate.asts.for_.oncast = function(to) {
    this.p.Body.cast(to);
};

yate.asts.for_.w_prepare = function() {
    this.p.Body.cid();
};

yate.asts.for_.closes = function() {
    return this.p.Body.closes();
};

yate.asts.for_.setPrevOpened = function(prevOpened) {
    this.p.Body.setPrevOpened(prevOpened);
};

yate.asts.for_.isLocal = function() {
    return this.p.Body.isLocal();
};

yate.asts.for_.setAsList = function() {
    this.f.AsList = true;
    this.p.Body.setAsList();
};

//  ---------------------------------------------------------------------------------------------------------------  //
//  apply
//  ---------------------------------------------------------------------------------------------------------------  //

yate.asts.apply = {};

yate.asts.apply.options = {
    base: 'expr'
};

yate.asts.apply._getType = no.value('xml');

yate.asts.apply.w_validate = function() {
    var Expr = this.p.Expr;
    if ( !( Expr.getType('nodeset') || Expr.getType('object') || Expr.getType('array') ) ) {
        this.error('Type of expression should be NODESET');
    }
};

yate.asts.apply.w_prepare = function() {
    var Expr = this.p.Expr;
    if (Expr.id === 'object' || Expr.id === 'array') {
        Expr.rid();
    }
};

yate.asts.apply.closes = no.false;

yate.asts.apply.setAsList = function() {
    this.f.AsList = true;
};

//  ---------------------------------------------------------------------------------------------------------------  //
//  value
//  ---------------------------------------------------------------------------------------------------------------  //

yate.asts.value = {};

yate.asts.value._getType = function() {
    return this.p.Value.getType();
};

yate.asts.value.oncast = function(to) {
    this.p.Value.cast(to);
};

yate.asts.value.inline = function() {
    return this.p.Value.inline();
};

yate.asts.value.closes = function() {
    return this.p.Value.closes();
};

yate.asts.value.isLocal = function() {
    return this.p.Value.isLocal();
};

yate.asts.value.isConst = function() {
    return this.p.Value.isConst();
};

yate.asts.value.setAsList = function() {
    this.f.AsList = true;
};

//  ---------------------------------------------------------------------------------------------------------------  //
//  subexpr
//  ---------------------------------------------------------------------------------------------------------------  //

yate.asts.subexpr = {};

yate.asts.subexpr._getType = function() {
    return this.p.Block.getType();
};

yate.asts.subexpr.oncast = function(to) {
    this.p.Block.cast(to);
};

yate.asts.subexpr.closes = function() {
    return this.p.Block.closes();
};

yate.asts.subexpr.setPrevOpened = function(prevOpened) {
    this.p.Block.setPrevOpened(prevOpened);
};

yate.asts.subexpr.setAsList = function() {
    this.f.AsList = true;
};

yate.asts.subexpr.w_prepare = function() {
    if (this.f.AsList) {
        this.p.Block.rid();
    }
};

//  ---------------------------------------------------------------------------------------------------------------  //
//  attr
//  ---------------------------------------------------------------------------------------------------------------  //

yate.asts.attr = {};

yate.asts.attr.options = {
    base: 'xml'
};

yate.asts.attr._getType = no.value('attr');

yate.asts.attr.w_setTypes = function() {
    this.p.Name.cast('scalar');
    if ( this.p.Value.getType() !== 'xml' ) {
        //  Приведение через cast не меняет на самом деле тип выражения.
        //  Так что в шаблонах по типу не понять, какой там тип.
        this.p.AttrType = 'scalar';
        this.p.Value.cast('scalar');
    } else {
        this.p.AttrType = 'xml';
        this.p.Value.cast('xml');
    }
};

yate.asts.attr.w_prepare = function() {
    if ( !this.p.Value.inline() ) {
        this.p.Value.rid();
    }
};

yate.asts.attr.closes = no.false;


//  ---------------------------------------------------------------------------------------------------------------  //

yate.asts.attrs_close = {};

yate.asts.attrs_close._getType = no.value('xml');


//  ---------------------------------------------------------------------------------------------------------------  //

yate.asts.attrs_open = {};

yate.asts.attrs_open._init = function(item) {
    this.p.Name = item.p.Name;
    this.p.Attrs = item.p.Attrs;
    //  FIXME: По идее, переопределение parent должно происходить в this.make('attrs_open', ...),
    //  но w_setTypes для xml_attr случает раньше этого.
    this.p.Attrs.parent = this;
    //  FIXME: В правой части, похоже, можно что угодно написать. Нужна ли эта строчка вообще?
    item.p.Attrs = null;
};

yate.asts.attrs_open._getType = no.value('xml');



//  ---------------------------------------------------------------------------------------------------------------  //
//
//  xml:
//
//    * xmw
//    * xml_line
//    * xml_start
//    * xml_end
//    * xml_empty
//    * xml_text
//    * xml_full
//    * xml_attrs
//    * xml_attr
//
//  ---------------------------------------------------------------------------------------------------------------  //


//  ---------------------------------------------------------------------------------------------------------------  //
//  xml
//  ---------------------------------------------------------------------------------------------------------------  //

yate.asts.xml = {};

yate.asts.xml.options = {
    base: 'expr'
};

yate.asts.xml._getType = no.value('xml');


//  ---------------------------------------------------------------------------------------------------------------  //
//  xml_line
//  ---------------------------------------------------------------------------------------------------------------  //

yate.asts.xml_line = {};

yate.asts.xml_line.options = {
    base: 'xml',
    mixin: 'items'
};

yate.asts.xml_line.wellFormed = function(opened) {
    var that = this;

    this.iterate(function(item) {
        if (item.is('xml_start')) {
            opened.push(item.p.Name);
        } else if (item.is('xml_end')) {
            var name = opened.pop();
            if (!name) {
                //  FIXME: Если p.Name === true, будет не очень внятное сообщение об ошибке.
                that.error('Закрывающий тег </' + item.p.Name + '> не был предварительно открыт');
            } else if ( (item.p.Name !== name) && (item.p.Name !== true) ) {
                that.error('Невалидный XML. Ожидается </' + name + '>');
            }
            //  FIXME: Не очень подходящее место для этого действия.
            //  Лучше бы унести это в какой-то .action().
            item.p.Name = name;
        }
    });
};

yate.asts.xml_line.opens = function() {
    return !!this.lastTag();
};

yate.asts.xml_line.lastTag = function() {
    var last = this.last();
    if ( last.is('xml_start') ) {
        return last;
    }
};

yate.asts.xml_line.js__content = function() {
    var items = [];
    this.toResult(items);

    var r = [];
    var s = '';
    for (var i = 0, l = items.length; i < l; i++) {
        var item = items[i];
        if (typeof item == 'string') {
            s += item;
        } else {
            if (s) {
                r.push(s);
                s = '';
            }
            r.push(item); // FIXME: item -> make('string_literal')
        }
    }
    if (s) {
        r.push(s); // FIXME:
    }

    for (var i = 0, l = r.length; i < l; i++) {
        var item = r[i];
        if (typeof item == 'string') {
            r[i] = JSON.stringify(item);
        } else {
            r[i] = item.js();
        }
    }

    return r.join(' + ') || "''"; // FIXME: В случае, когда xml_line состоит из одного, скажем, </img>, должна выводиться хотя бы пустая строка.
};


//  ---------------------------------------------------------------------------------------------------------------  //
//  xml_start
//  ---------------------------------------------------------------------------------------------------------------  //

yate.asts.xml_start = {};

yate.asts.xml_start.options = {
    base: 'xml'
};

yate.asts.xml_start.toResult = function(result) {
    var name = this.p.Name;

    result.push('<' + name);
    if (!this.open) {
        this.p.Attrs.toResult(result);
        result.push( (yate.consts.shortTags[name]) ? '/>' : '>' );
    }
};


//  ---------------------------------------------------------------------------------------------------------------  //
//  xml_end
//  ---------------------------------------------------------------------------------------------------------------  //

yate.asts.xml_end = {};

yate.asts.xml_end.options = {
    base: 'xml'
};

yate.asts.xml_end.w_action = function() {
    if ( yate.consts.shortTags[this.p.Name] ) {
        this.f.Short = true;
    }
};

yate.asts.xml_end.toResult = function(result) {
    if (!this.f.Short) {
        result.push('</' + this.p.Name + '>');
    }
};


//  ---------------------------------------------------------------------------------------------------------------  //
//  xml_empty
//  ---------------------------------------------------------------------------------------------------------------  //

yate.asts.xml_empty = {};

yate.asts.xml_empty.options = {
    base: 'xml'
};

yate.asts.xml_empty.toResult = function(result) {
    var name = this.p.Name;

    result.push('<' + name);
    this.p.Attrs.toResult(result);
    if ( yate.consts.shortTags[name] ) {
        result.push('/>');
    } else {
        result.push('></' + name + '>');
    }
};


//  ---------------------------------------------------------------------------------------------------------------  //
//  xml_text
//  ---------------------------------------------------------------------------------------------------------------  //

yate.asts.xml_text = {};

yate.asts.xml_text.options = {
    base: 'xml'
};

yate.asts.xml_text.oncast = function(to) {
    this.p.Text.cast(to);
};

yate.asts.xml_text.toResult = function(result) {
    this.p.Text.toResult(result);
};


//  ---------------------------------------------------------------------------------------------------------------  //
//  xml_full
//  ---------------------------------------------------------------------------------------------------------------  //

yate.asts.xml_full = {};

yate.asts.xml_full.options = {
    base: 'xml',
    mixin: 'items'
};


//  ---------------------------------------------------------------------------------------------------------------  //
//  xml_attrs
//  ---------------------------------------------------------------------------------------------------------------  //

yate.asts.xml_attrs = {};

yate.asts.xml_attrs.options = {
    mixin: 'items'
};

yate.asts.xml_attrs.jssep__open = ',\n';


//  ---------------------------------------------------------------------------------------------------------------  //
//  xml_attr
//  ---------------------------------------------------------------------------------------------------------------  //

yate.asts.xml_attr = {};

yate.asts.xml_attr.toResult = function(result) {
    result.push(' ' + this.p.Name + '="');
    this.p.Value.toResult(result);
    result.push('"');
};

yate.asts.xml_attr.w_prepare = function() {
    if ( !this.parent.parent.is('attrs_open') ) { // FIXME: Как бы не ходить по дереву так уродливо?
        this.p.Value.cast('attrvalue');
    } else {
        this.p.Value.cast('scalar');
    }
};



//  ---------------------------------------------------------------------------------------------------------------  //
//
//  inline expressions:
//
//    * inline_expr
//    * inline_op
//    * inline_or
//    * inline_and
//    * inline_eq
//    * inline_rel
//    * inline_add
//    * inline_mul
//    * inline_unary
//    * inline_not
//    * inline_union
//    * inline_number
//    * inline_string
//        * string_literal
//        * string_content
//        * string_expr
//    * inline_subexpr
//    * inline_var
//    * inline_function
//    * inline_internal_function
//    * quote
//    * cast
//    * sort
//
//  ---------------------------------------------------------------------------------------------------------------  //


//  ---------------------------------------------------------------------------------------------------------------  //
//  inline_expr
//  ---------------------------------------------------------------------------------------------------------------  //

yate.asts.inline_expr = {};

yate.asts.inline_expr.options = {
    base: 'expr'
};

yate.asts.inline_expr.toResult = function(result) {
    //  FIXME: А не нужно ли тут еще какого-нибудь условия?
    if (this.mode) {
        result.push( this.make('quote', {
            expr: this,
            mode: this.mode
        }) );
    } else {
        result.push(this);
    }
};

yate.asts.inline_expr.inline = no.true;

yate.asts.inline_expr.closes = function() {
    return ( this.getType() != 'attr' ); // Если тип атрибут, то после него все еще могут быть другие атрибуты.
};

var _needCast = {
    'nodeset-scalar': true,
    'nodeset-xml': true,
    'nodeset-attrvalue': true,
    'nodeset-boolean': true,
    'nodeset-data': true,

    'scalar-xml': true,
    'scalar-attrvalue': true,

    'xml-attrvalue': true,
    'xml-scalar': true,

    'object-nodeset': true,
    'array-nodeset': true
};

yate.asts.inline_expr.w_transform = function() {
    var AsType = this.p.AsType;

    if ( this.isSimple() && (!AsType || AsType === 'scalar' || AsType === 'boolean') ) {
        return this;
    }

    if ( AsType && needCast( this.getType(), AsType ) ) {
        return this.make( 'cast', { to: AsType, expr: this } );
    }

    return this;

    function needCast(from, to) {
        return _needCast[from + '-' + to];
    }
};


//  ---------------------------------------------------------------------------------------------------------------  //
//  inline_op
//  ---------------------------------------------------------------------------------------------------------------  //

yate.asts.inline_op = {};

yate.asts.inline_op.options = {
    base: 'inline_expr'
};

yate.asts.inline_op.w_setTypes = function() {
    var signature = this.signature;
    if (signature) {
        this.p.Left.cast(signature.left);
        if (this.p.Right) {
            this.p.Right.cast(signature.right);
        }
    }
};

yate.asts.inline_op.isLocal = function() {
    return this.p.Left.isLocal() || ( this.p.Right && this.p.Right.isLocal() );
};

yate.asts.inline_op._getType = function() {
    return this.signature.result;
};

yate.asts.inline_op.getScope = function() {
    var lscope = this.p.Left.getScope();
    if (this.p.Right) {
        var rscope = this.p.Right.getScope();
        return yate.Scope.commonScope(lscope, rscope);
    } else {
        return lscope;
    }
};


//  ---------------------------------------------------------------------------------------------------------------  //
//  inline_or
//  ---------------------------------------------------------------------------------------------------------------  //

yate.asts.inline_or = {};

yate.asts.inline_or.signature = {
    left: 'boolean',
    right: 'boolean',
    result: 'boolean'
};

yate.asts.inline_or.options = {
    base: 'inline_op'
};


//  ---------------------------------------------------------------------------------------------------------------  //
//  inline_and
//  ---------------------------------------------------------------------------------------------------------------  //

yate.asts.inline_and = {};

yate.asts.inline_and.signature = {
    left: 'boolean',
    right: 'boolean',
    result: 'boolean'
};

yate.asts.inline_and.options = {
    base: 'inline_op'
};


//  ---------------------------------------------------------------------------------------------------------------  //
//  inline_eq
//  ---------------------------------------------------------------------------------------------------------------  //

yate.asts.inline_eq = {};

yate.asts.inline_eq.signature = {
    left: 'scalar',
    right: 'scalar',
    result: 'boolean'
};

yate.asts.inline_eq.options = {
    base: 'inline_op'
};

yate.asts.inline_eq.w_setTypes = function() {
    var Left = this.p.Left;
    var Right = this.p.Right;

    var lType = Left.getType();
    var rType = Right.getType();

    if (lType === 'boolean' || rType === 'boolean') {
        Left.cast('boolean');
        Right.cast('boolean');
    } else if (lType !== 'nodeset' && rType !== 'nodeset') {
        Left.cast('scalar');
        Right.cast('scalar');
    }
};


//  ---------------------------------------------------------------------------------------------------------------  //
//  inline_rel
//  ---------------------------------------------------------------------------------------------------------------  //

yate.asts.inline_rel = {};

yate.asts.inline_rel.signature = {
    left: 'scalar',
    right: 'scalar',
    result: 'boolean'
};

yate.asts.inline_rel.options = {
    base: 'inline_op'
};


//  ---------------------------------------------------------------------------------------------------------------  //
//  inline_add
//  ---------------------------------------------------------------------------------------------------------------  //

yate.asts.inline_add = {};

yate.asts.inline_add.signature = {
    left: 'scalar',
    right: 'scalar',
    result: 'scalar'
};

yate.asts.inline_add.options = {
    base: 'inline_op'
};


//  ---------------------------------------------------------------------------------------------------------------  //
//  inline_mul
//  ---------------------------------------------------------------------------------------------------------------  //

yate.asts.inline_mul = {};

yate.asts.inline_mul.signature = {
    left: 'scalar',
    right: 'scalar',
    result: 'scalar'
};

yate.asts.inline_mul.options = {
    base: 'inline_op'
};


//  ---------------------------------------------------------------------------------------------------------------  //
//  inline_unary
//  ---------------------------------------------------------------------------------------------------------------  //

yate.asts.inline_unary = {};

yate.asts.inline_unary.signature = {
    left: 'scalar',
    result: 'scalar'
};

yate.asts.inline_unary.options = {
    base: 'inline_op'
};


//  ---------------------------------------------------------------------------------------------------------------  //
//  inline_not
//  ---------------------------------------------------------------------------------------------------------------  //

yate.asts.inline_not = {};

yate.asts.inline_not.signature = {
    left: 'boolean',
    result: 'boolean'
};

yate.asts.inline_not.options = {
    base: 'inline_op'
};


//  ---------------------------------------------------------------------------------------------------------------  //
//  inline_union
//  ---------------------------------------------------------------------------------------------------------------  //

yate.asts.inline_union = {};

yate.asts.inline_union.signature = {
    left: 'nodeset',
    right: 'nodeset',
    result: 'nodeset'
};

yate.asts.inline_union.options = {
    base: 'inline_op'
};


//  ---------------------------------------------------------------------------------------------------------------  //
//  inline_number
//  ---------------------------------------------------------------------------------------------------------------  //

yate.asts.inline_number = {};

yate.asts.inline_number.options = {
    base: 'inline_expr'
};

yate.asts.inline_number.isLocal = no.false;

yate.asts.inline_number.isConst = no.true;

yate.asts.inline_number._getType = no.value('scalar');


//  ---------------------------------------------------------------------------------------------------------------  //
//  inline_string
//  ---------------------------------------------------------------------------------------------------------------  //

yate.asts.inline_string = {};

yate.asts.inline_string.options = {
    base: 'inline_expr'
};

yate.asts.inline_string._getType = no.value('scalar');

yate.asts.inline_string.oncast = function(to) {
    this.p.Value.cast(to);

    //  FIXME: WTF?
    return false;
};

yate.asts.inline_string.toResult = function(result) {
    this.p.Value.toResult(result);
};

yate.asts.inline_string.asString = function() {
    var s = '';

    this.p.Value.iterate(function(item) {
        s += item.asString();
    });

    return s;
};

yate.asts.inline_string.isConst = function() {
    return this.p.Value.isConst();
};

yate.asts.inline_string.isLocal = function() {
    return this.p.Value.isLocal();
};


//  ---------------------------------------------------------------------------------------------------------------  //
//  string_content
//  ---------------------------------------------------------------------------------------------------------------  //

yate.asts.string_content = {};

yate.asts.string_content.options = {
    mixin: 'items'
};

yate.asts.string_content._getType = no.value('scalar');

yate.asts.string_content.jssep__ = ' + ';


//  ---------------------------------------------------------------------------------------------------------------  //
//  string_expr
//  ---------------------------------------------------------------------------------------------------------------  //

yate.asts.string_expr = {};

yate.asts.string_expr.options = {
    base: 'inline_expr'
};

yate.asts.string_expr._init = function(expr) {
    this.p.Expr = expr;
};

yate.asts.string_expr._getType = function() {
    return this.p.Expr.getType();
};

yate.asts.string_expr.isLocal = function() {
    return this.p.Expr.isLocal();
};


//  ---------------------------------------------------------------------------------------------------------------  //
//  string_literal
//  ---------------------------------------------------------------------------------------------------------------  //

yate.asts.string_literal = {};

yate.asts.string_literal.w_action = function() {
    this.p.Value = deentitify(this.p.Value);
};

yate.asts.string_literal.options = {
    base: 'inline_expr'
};

yate.asts.string_literal._init = function(s) {
    this.p.Value = s;
};

// Чтобы при выводе не отрезались начальные и конечные пробелы.
// См. codegen.js
yate.asts.string_literal.yate = function() {
    return this.p.Value;
};

yate.asts.string_literal._getType = no.value('scalar');

yate.asts.string_literal.oncast = function(to) {
    if (to === 'attrvalue') {
        this.p.Value = yr.text2attr(this.p.Value);
    } else if (to === 'xml') {
        this.p.Value = yr.text2xml(this.p.Value);
    }

    return false;
};

yate.asts.string_literal.stringify = function() {
    return JSON.stringify(this.p.Value);
};

yate.asts.string_literal.asString = function() {
    return this.p.Value;
};

yate.asts.string_literal.isConst = no.true;

yate.asts.string_literal.isLocal = no.false;


//  ---------------------------------------------------------------------------------------------------------------  //
//  inline_subexpr
//  ---------------------------------------------------------------------------------------------------------------  //

yate.asts.inline_subexpr = {};

yate.asts.inline_subexpr.options = {
    base: 'inline_expr'
};

yate.asts.inline_subexpr.isLocal = function() {
    return this.p.Expr.isLocal();
};

yate.asts.inline_subexpr._getType = function() {
    return this.p.Expr.getType();
};


//  ---------------------------------------------------------------------------------------------------------------  //
//  inline_var
//  ---------------------------------------------------------------------------------------------------------------  //

yate.asts.inline_var = {};

yate.asts.inline_var.options = {
    base: 'inline_expr'
};

yate.asts.inline_var.w_action = function() {
    var def = this.def = this.scope.findVar(this.p.Name);
    if (!def) {
        this.error('Undefined variable ' + this.p.Name);
    }

    this.p.Id = def.p.Id;
};

yate.asts.inline_var._getType = function() {
    return this.def.getType();
};

yate.asts.inline_var.isLocal = no.false;

yate.asts.inline_var.getScope = function() {
    // return this.def.scope; // FIXME: В этот момент метод action еще не отработал, видимо, нужно action выполнять снизу-вверх.
    return this.scope.findVar(this.p.Name).scope;
};


//  ---------------------------------------------------------------------------------------------------------------  //
//  inline_function
//  ---------------------------------------------------------------------------------------------------------------  //

yate.asts.inline_function = {};

yate.asts.inline_function.options = {
    base: 'inline_expr'
};

yate.asts.inline_function._getType = function() {
    var def = this.def;
    if (def.f.IsInternal) {
        return this.signature.type;
    }

    return def.getType();
};

yate.asts.inline_function.w_action = function() {
    var name = this.p.Name;

    //  Ищем функцию в scope'ах.
    var def = this.scope.findFunction(name);

    if (!def) {
        //  Ищем среди внутренних функций.
        def = internalFunctions[name];

        //  Среди уже инстанцированных нет, смотрим, есть ли определение для внутренней функции.
        var params;
        if ( !def && (( params = yate.consts.internalFunctions[name] )) ) {
            //  Если есть, создаем ее.
            params = {
                signatures: (params instanceof Array) ? params : [ params ],
                name: name
            };
            def = internalFunctions[name] = this.make('inline_internal_function', params);
        }
    }

    if (!def) {
        this.error('Undefined function ' + name);
    }

    this.def = def;

    if (def.f.IsExternal) {
        this.f.IsExternal = true;
    } else if (def.f.IsUser) {
        this.p.Id = def.p.Id;
        this.f.IsUser = true;
    } else if (def.f.IsKey) {
        this.p.Id = def.p.Id;
        this.f.IsKey = true;
    } else {
        this.signature = def.findSignature(this.p.Args.p.Items);
        if (!this.signature) {
            this.error('Cannot find signature for this arguments');
        }
    }
};

yate.asts.inline_function.w_prepare = function() {
    var def = this.def;
    var args = this.p.Args;

    if (def.f.IsExternal) {
        var argTypes = def.p.ArgTypes;
        args.iterate(function(arg, i) {
            arg.cast( argTypes[i] || 'scalar' );
        });

    } else if (def.f.IsKey) {
        var type = args.first().getType();
        if (type !== 'nodeset') {
            args.first().cast('scalar');
        }

    } else if (def.f.IsInternal) {
        var signature = this.signature;
        var types = signature.args;
        var defType = signature.defType;
        args.iterate(function(arg, i) {
            arg.cast( types[i] || defType );
        });

    } else if (def.f.IsUser) {
        var defArgs = def.p.Args.p.Items;
        args.iterate(function(arg, i) {
            arg.cast( defArgs[i].p.Typedef || 'scalar' );
        });

    }
};

yate.asts.inline_function.getScope = function() {
    //  Если в предикате используется вызов функции,
    //  то определение этого jpath'а нужно выводить в этом же scope.
    //  См. ../tests/functions.18.yate
    return this.scope;
};

yate.asts.inline_function.isLocal = function() {
    if (this.def.f.IsInternal) {
        if (this.signature.local) {
            return true;
        }

        return this.p.Args.someIs('isLocal');
        /*
        var args = this.p.Args.p;
        for (var i = 0, l = args.length; i < l; i++) {
            if ( args[i].isLocal() ) { return true; }
        }
        return false;
        */
    }

    if (this.f.IsExternal || this.f.IsKey) {
        return this.p.Args.someIs('isLocal');
        /*
        var args = this.p.Args.p;
        for (var i = 0, l = args.length; i < l; i++) {
            if ( args[i].isLocal() ) { return true; }
        }
        return false;
        */
    }

    return this.def.isLocal();
};

yate.asts.inline_function.js__internal = function() {
    var signature = this.signature;
    this.p.Signature = signature.args.join(',');
    return yate.AST.js.generate('internal_function_' + this.p.Name, this);
};


//  ---------------------------------------------------------------------------------------------------------------  //
//  inline_internal_function
//  ---------------------------------------------------------------------------------------------------------------  //

//  Сюда будем складывать инстансы inline_internal_function.
//  Определения для них лежат в consts.js, а создаются они в inline_function.action.
var internalFunctions = {};

yate.asts.inline_internal_function = {};

yate.asts.inline_internal_function._init = function(params) {
    this.p.Name = params.name;
    var signatures = this.signatures = params.signatures;
    for (var i = 0, l = signatures.length; i < l; i++) {
        prepareSignature( signatures[i] );
    }
    this.f.IsInternal = true;

    function prepareSignature(signature) {
        var args = signature.args = signature.args || [];
        for (var i = 0, l = args.length; i < l; i++) {
            var arg = args[i];
            if ( arg.substr(0, 3) === '...' ) {
                args[i] = arg.substr(3);

                signature.defType = args[i];
            }
        }
    }
};

yate.asts.inline_internal_function.findSignature = function(callargs) {
    var signatures = this.signatures;

    for (var i = 0, l = signatures.length; i < l; i++) {
        var signature = signatures[i];
        //  Смотрим, подходят ли переданные аргументы под одну из сигнатур.
        if ( checkArgs(signature, callargs) ) {
            return signature;
        }
    }

    function checkArgs(signature, callargs) {
        var args = signature.args;
        var defType = signature.defType;

        for (var i = 0, l = callargs.length; i < l; i++) {
            var callarg = callargs[i];
            var arg = args[i] || defType;

            //  Для каждого переданного аргумента должен быть
            //      а) формальный аргумент
            //      б) тип переданного аргумента должен приводиться к типу формального.
            if ( !arg || !yate.types.convertable( callarg.getType(), arg ) ) {
                return false;
            }
        }

        return true;
    }
};


//  ---------------------------------------------------------------------------------------------------------------  //
//  quote
//  ---------------------------------------------------------------------------------------------------------------  //

yate.asts.quote = {};

yate.asts.quote.options = {
    base: 'inline_expr'
};

yate.asts.quote._init = function(params) {
    this.p.Expr = params.expr;
    this.p.Mode = params.mode;
};


//  ---------------------------------------------------------------------------------------------------------------  //
//  cast
//  ---------------------------------------------------------------------------------------------------------------  //

yate.asts.cast = {};

yate.asts.cast.options = {
    base: 'inline_expr'
};

yate.asts.cast._init = function(params) {
    var to = params.to;
    var expr = params.expr;

    this.p.From = expr.getType();
    this.p.To = to;
    this.p.Expr = expr;
    this.mode = expr.mode;
};

yate.asts.cast._getType = function() {
    return this.p.To;
};

yate.asts.cast.isLocal = function() {
    return this.p.Expr.isLocal();
};


//  ---------------------------------------------------------------------------------------------------------------  //
//  sort
//  ---------------------------------------------------------------------------------------------------------------  //

yate.asts.sort = {};

yate.asts.sort.options = {
    base: 'inline_expr'
};

yate.asts.sort._getType = no.value('nodeset');

yate.asts.sort.w_validate = function() {
    if (this.p.Nodes.getType() !== 'nodeset') {
        this.p.Nodes.error('Type should be nodeset.');
    }
};

yate.asts.sort.w_prepare = function() {
    this.p.By.cast('scalar');
};



//  ---------------------------------------------------------------------------------------------------------------  //
//
//  jpath:
//
//    * jpath
//    * jpath_steps
//    * jpath_dors
//    * jpath_predicate
//    * jpath_filter
//    * simple_jpath
//
//  ---------------------------------------------------------------------------------------------------------------  //


//  ---------------------------------------------------------------------------------------------------------------  //
//  jpath
//  ---------------------------------------------------------------------------------------------------------------  //

yate.asts.jpath = {};

yate.asts.jpath.options = {
    base: 'inline_expr'
};

yate.asts.jpath._getType = no.value('nodeset');

yate.asts.jpath.isLocal = function() {
    return !this.p.Abs;
};

yate.asts.jpath.w_action = function() {
    if ( this.isSimple() ) {
        this.f.IsSimple = true;
        this.p.Name = this.p.Steps.first().p.Name;
    }
};

yate.asts.jpath.isSimple = function() {
    var steps = this.p.Steps;
    return ( steps.length() === 1 && steps.first().is('jpath_nametest') );
};

yate.asts.jpath.isSelf = function() {
    var steps = this.p.Steps;
    return !this.p.Abs && !steps.length;
};

yate.asts.jpath.isRoot = function() {
    return this.p.Abs && this.p.Steps.empty();
};

yate.asts.jpath.w_validate = function() {
    var context = this.p.Context;
    if ( context && !context.getType('nodeset') ) {
        context.error('Invalid type. Should be NODESET');
    }
};

yate.asts.jpath.validateMatch = function() {
    var steps = this.p.Steps.p;
    for (var i = 0, l = steps.length; i < l; i++) {
        var step = steps[i];
        if ( step.is('jpath_dots') ) {
            step.error('You can\'t use parent axis in match');
        }
        if ( step.is('jpath_predicate') && !step.isMatchable() ) {
            step.error('You can\'t use index in match');
        }
    }
};

// oncast = function() {},

// Возвращаем значение последнего nametest'а или же ''.
// Например, lastName(/foo/bar[id]) == 'bar', lastName(/) == ''.
yate.asts.jpath.lastName = function() { // FIXME: Унести это в jpath_steps?
    var steps = this.p.Steps.p.Items;
    for (var i = steps.length; i--; ) {
        var step = steps[i];
        if ( step.is('jpath_nametest') ) {
            return step.p.Name;
        }
    }
    return '';
};

yate.asts.jpath.getScope = function() {
    return this.p.Steps.getScope();
};

yate.asts.jpath.w_extractDefs = function() {
    //  Каноническая запись jpath.
    var key = this.yate();

    var state = this.state;
    //  scope, в котором этот jpath имеет смысл.
    //  Например, .foo.bar[ .count > a + b ] имеет смысл только внутри scope'а,
    //  в котором определены переменные a и b.
    var scope = this.getScope();

    //  Если этот jpath еще не хранится в scope, то добаляем его туда.
    var jid = scope.jkeys[key];
    if (jid === undefined) {
        jid = scope.jkeys[key] = state.jid++;
        scope.defs.push(this);
    }

    //  Запоминаем id-шник.
    this.p.Id = jid;
    this.p.Key = key;
};


//  ---------------------------------------------------------------------------------------------------------------  //
//  jpath_steps
//  ---------------------------------------------------------------------------------------------------------------  //

yate.asts.jpath_steps = {};

yate.asts.jpath_steps.options = {
    mixin: 'items'
};

yate.asts.jpath_steps.jssep__ = ', ';


//  ---------------------------------------------------------------------------------------------------------------  //
//  jpath_dots
//  ---------------------------------------------------------------------------------------------------------------  //

yate.asts.jpath_dots = {};

yate.asts.jpath_dots.w_action = function() {
    this.p.Length = this.p.Dots.length - 1;
};


//  ---------------------------------------------------------------------------------------------------------------  //
//  jpath_predicate
//  ---------------------------------------------------------------------------------------------------------------  //

yate.asts.jpath_predicate = {};

yate.asts.jpath_predicate.getScope = function() {
    if ( this.isLocal() ) {
        return this.p.Expr.getScope();
    } else {
        //  FIXME: Временный костыль. Выражение .item[ /.index ] должно быть индексом,
        //  но из-за того, что оно глобальное, оно уезжает в глобальный scope.
        //  А индексы у меня сейчас не предусмотрены глобальные, т.к. там выражение
        //  явно генерится, без функциональной обертки.
        return this.scope;
    }
};

yate.asts.jpath_predicate.isLocal = function() {
    return this.p.Expr.isLocal();
};

yate.asts.jpath_predicate.isMatchable = function() {
    return this.p.Expr.isLocal() || this.p.Expr.getType() === 'boolean';
};

yate.asts.jpath_predicate.w_setTypes = function() {
    if (this.isLocal() || this.p.Expr.getType() === 'boolean') {
        //  .items[ .count ] -- Expr является значением, зависящим от контекста. Это предикат.
        this.p.Expr.cast('boolean');
    } else {
        //  .items[ count ] -- Expr не зависит от контекста. Это индекс.
        this.p.Expr.cast('scalar');
    }
};

yate.asts.jpath_predicate.w_extractDefs = function() {
    //  Каноническая запись предиката.
    var key = this.p.Expr.yate();

    var state = this.state;
    //  См. примечание в jpath.action().
    var scope = this.getScope();

    //  Если этот predicate еще не хранится в scope, то добаляем его туда.
    var pid = scope.pkeys[key];
    if (!pid) {
        pid = scope.pkeys[key] = state.pid++;
        scope.defs.push(this);
    }

    //  Запоминаем id-шник.
    this.p.Id = pid;
    this.p.Key = key;
};


//  ---------------------------------------------------------------------------------------------------------------  //
//  jpath_filter
//  ---------------------------------------------------------------------------------------------------------------  //

yate.asts.jpath_filter = {};

yate.asts.jpath_filter.options = {
    base: 'inline_expr'
};

yate.asts.jpath_filter._init = function(params) {
    if (params) {
        this.p.Expr = params.expr;
        this.p.JPath = params.jpath;
    }
};

yate.asts.jpath_filter._getType = no.value('nodeset');

yate.asts.jpath_filter.isLocal = function() {
    return this.p.Expr.isLocal() || this.p.JPath.isLocal();
};

yate.asts.jpath_filter.getScope = function() {
    return yate.Scope.commonScope( this.p.Expr.getScope(), this.p.JPath.getScope() );
};

yate.asts.jpath_filter.w_prepare = function() {
    this.p.Expr.cast('nodeset');
};

yate.asts.jpath_filter.w_validate = function() {
    if ( !this.p.Expr.getType('nodeset') ) {
        this.p.Expr.error('Type should be NODESET');
    }
};


//  ---------------------------------------------------------------------------------------------------------------  //
//  simple_jpath
//  ---------------------------------------------------------------------------------------------------------------  //

yate.asts.simple_jpath = {};

yate.asts.simple_jpath.options = {
    base: 'inline_expr'
};

yate.asts.simple_jpath._getType = no.value('nodeset');

yate.asts.simple_jpath._init = function(jpath) {
    this.p.JPath = jpath;
    this.p.Name = jpath.p.Steps.first().p.Name;
};

yate.asts.simple_jpath.isLocal = function() {
    return this.p.JPath.isLocal();
};

yate.asts.simple_jpath.getScope = function() {
    return this.p.JPath.getScope();
};



//  ---------------------------------------------------------------------------------------------------------------  //
//
//  arguments:
//
//    * arglist
//    * arglist_item
//    * callargs
//    * callarg
//
//  ---------------------------------------------------------------------------------------------------------------  //


//  ---------------------------------------------------------------------------------------------------------------  //
//  arglist
//  ---------------------------------------------------------------------------------------------------------------  //

yate.asts.arglist = {};

yate.asts.arglist.options = {
    mixin: 'items'
};

yate.asts.arglist.jssep__defaults = '\n';

yate.asts.arglist.yatesep__ = ', ';



//  ---------------------------------------------------------------------------------------------------------------  //
//  arglist_item
//  ---------------------------------------------------------------------------------------------------------------  //

yate.asts.arglist_item = {};

yate.asts.arglist_item.w_action = function() {
    //  FIXME: Очень уж хрупкая конструкция.
    //  NOTE: Смысл в том, что в AST параметры и блок на одном уровне, а отдельный scope создается
    //  только для блока. И аргументы нужно прописывать именно туда.
    var blockScope = this.parent.parent.p.Body.p.Block.scope;
    var vars = blockScope.vars;

    var name = this.p.Name;
    if ( vars[name] ) {
        this.error('Повторное определение аргумента ' + name);
    }

    vars[name] = this;
    //  Заодно меняем и scope.
    this.scope = blockScope;

    this.p.Id = this.state.vid++;
};

yate.asts.arglist_item.isConst = no.false;

yate.asts.arglist_item._getType = function() {
    var typedef = this.p.Typedef;
    switch (typedef) {
        case 'nodeset':
        case 'object':
        case 'array':
        case 'boolean':
        case 'xml':
            return typedef;

        default:
            return 'scalar';
    }
};

yate.asts.arglist_item.w_prepare = function() {
    if (this.p.Default) {
        this.p.Default.cast( this.getType() );
    }
};


//  ---------------------------------------------------------------------------------------------------------------  //
//  callargs
//  ---------------------------------------------------------------------------------------------------------------  //

yate.asts.callargs = {};

yate.asts.callargs.options = {
    mixin: 'items'
};

yate.asts.callargs.jssep__ = ', ';

yate.asts.callargs.yatesep__ = ', ';

//  ---------------------------------------------------------------------------------------------------------------  //
//  callarg
//  ---------------------------------------------------------------------------------------------------------------  //

yate.asts.callarg = {};

yate.asts.callarg._getType = function() {
    return this.p.Expr.getType();
};

yate.asts.callarg.isLocal = function() {
    return this.p.Expr.isLocal();
};

yate.asts.callarg.oncast = function(to) {
    this.p.Expr.cast(to);
};



//  ---------------------------------------------------------------------------------------------------------------  //

yate.asts.pair = {};

yate.asts.pair._getType = no.value('pair');

yate.asts.pair.w_setTypes = function() {
    this.p.Key.cast('scalar');

    var type = this.p.Value.getType();
    if (type === 'nodeset') {
        this.p.Value.cast('data');
    } else {
        this.p.Value.cast(type);
    }
};

yate.asts.pair.w_prepare = function() {
    var value = this.p.Value;

    if ( !value.inline() ) {
        value.rid();
    }
};

//  ---------------------------------------------------------------------------------------------------------------  //

yate.asts.object = {};

yate.asts.object._getType = no.value('object');

yate.asts.object.w_setTypes = function() {
    this.p.Block.cast('pair');
};

yate.asts.object.setAsList = function() {
    this.f.AsList = true;
};

yate.asts.object.w_prepare = function() {
    if (this.f.AsList) {
        this.rid();
    }
};

//  ---------------------------------------------------------------------------------------------------------------  //

yate.asts.array = {};

yate.asts.array._getType = no.value('array');

yate.asts.array.w_list = function() {
    this.p.Block.setAsList();
};

yate.asts.array.setAsList = function() {
    this.f.AsList = true;
};

yate.asts.array.w_prepare = function() {
    if (this.f.AsList) {
        this.rid();
    }
};

//  ---------------------------------------------------------------------------------------------------------------  //

yate.asts.cdata = {};

yate.asts.cdata._getType = no.value('xml');


},{"./ast.js":2,"./consts.js":4,"./entities.json":5,"./runtime.js":8,"./scope.js":9,"./types.js":10,"./yate.js":11,"nommon":17,"parse-tools":27}],4:[function(require,module,exports){
var yate = require('./yate.js');

//  ---------------------------------------------------------------------------------------------------------------  //
//  yate.consts
//  ---------------------------------------------------------------------------------------------------------------  //

yate.consts = {};

//  ---------------------------------------------------------------------------------------------------------------  //

yate.consts.shortTags = {
    br: true,
    col: true,
    embed: true,
    hr: true,
    img: true,
    input: true,
    link: true,
    meta: true,
    param: true,
    wbr: true
};

yate.consts.internalFunctions = {

    'true': {
        type: 'boolean'
    },

    'false': {
        type: 'boolean'
    },

    'name': [
        {
            type: 'scalar',
            local: true
        },
        {
            type: 'scalar',
            args: [ 'nodeset' ]
        }
    ],

    'index': {
        type: 'scalar',
        local: true
    },

    'count': [
        {
            type: 'scalar',
            local: false
        },
        {
            type: 'scalar',
            args: [ 'nodeset' ]
        }
    ],

    'slice': {
        type: 'scalar',
        args: [ 'scalar', 'scalar', 'scalar' ]
    },

    'html': {
        type: 'xml',
        args: [ 'scalar' ]
    },

    'exists': {
        type: 'boolean',
        args: [ 'nodeset' ]
    },

    'number': {
        type: 'scalar',
        args: [ 'scalar' ]
    },

    'string': [
        {
            type: 'scalar',
            args: [ 'nodeset' ]
        },
        {
            type: 'scalar',
            args: [ 'scalar' ]
        },
        {
            type: 'scalar',
            args: [ 'boolean' ]
        }
    ],

    'boolean': {
        type: 'boolean',
        args: [ 'boolean' ]
    },

    'scalar': {
        type: 'scalar',
        args: [ 'scalar' ]
    },

    'log': {
        type: 'xml',
        args: [ '...any' ]
    },

    'document': {
        type: 'nodeset',
        args: [ 'nodeset' ]
    },

    'subnode': [
        {
            type: 'nodeset',
            args: [ 'scalar', 'object' ]
        },
        {
            type: 'nodeset',
            args: [ 'scalar', 'array' ]
        },
        {
            type: 'nodeset',
            args: [ 'scalar', 'scalar' ]
        }
    ]

};

//  ---------------------------------------------------------------------------------------------------------------  //


},{"./yate.js":11}],5:[function(require,module,exports){
module.exports={
    "amp": "&",
    "gt": ">",
    "lt": "<",
    "quot": "\"",
    "apos": "'",
    "AElig": "Æ",
    "Aacute": "Á",
    "Acirc": "Â",
    "Agrave": "À",
    "Aring": "Å",
    "Atilde": "Ã",
    "Auml": "Ä",
    "Ccedil": "Ç",
    "ETH": "Ð",
    "Eacute": "É",
    "Ecirc": "Ê",
    "Egrave": "È",
    "Euml": "Ë",
    "Iacute": "Í",
    "Icirc": "Î",
    "Igrave": "Ì",
    "Iuml": "Ï",
    "Ntilde": "Ñ",
    "Oacute": "Ó",
    "Ocirc": "Ô",
    "Ograve": "Ò",
    "Oslash": "Ø",
    "Otilde": "Õ",
    "Ouml": "Ö",
    "THORN": "Þ",
    "Uacute": "Ú",
    "Ucirc": "Û",
    "Ugrave": "Ù",
    "Uuml": "Ü",
    "Yacute": "Ý",
    "aacute": "á",
    "acirc": "â",
    "aelig": "æ",
    "agrave": "à",
    "aring": "å",
    "atilde": "ã",
    "auml": "ä",
    "ccedil": "ç",
    "eacute": "é",
    "ecirc": "ê",
    "egrave": "è",
    "eth": "ð",
    "euml": "ë",
    "iacute": "í",
    "icirc": "î",
    "igrave": "ì",
    "iuml": "ï",
    "ntilde": "ñ",
    "oacute": "ó",
    "ocirc": "ô",
    "ograve": "ò",
    "oslash": "ø",
    "otilde": "õ",
    "ouml": "ö",
    "szlig": "ß",
    "thorn": "þ",
    "uacute": "ú",
    "ucirc": "û",
    "ugrave": "ù",
    "uuml": "ü",
    "yacute": "ý",
    "yuml": "ÿ",
    "copy": "©",
    "reg": "®",
    "nbsp": " ",
    "iexcl": "¡",
    "cent": "¢",
    "pound": "£",
    "curren": "¤",
    "yen": "¥",
    "brvbar": "¦",
    "sect": "§",
    "uml": "¨",
    "ordf": "ª",
    "laquo": "«",
    "not": "¬",
    "shy": "­",
    "macr": "¯",
    "deg": "°",
    "plusmn": "±",
    "sup1": "¹",
    "sup2": "²",
    "sup3": "³",
    "acute": "´",
    "micro": "µ",
    "para": "¶",
    "middot": "·",
    "cedil": "¸",
    "ordm": "º",
    "raquo": "»",
    "frac14": "¼",
    "frac12": "½",
    "frac34": "¾",
    "iquest": "¿",
    "times": "×",
    "divide": "÷",
    "OElig": "Œ",
    "oelig": "œ",
    "Scaron": "Š",
    "scaron": "š",
    "Yuml": "Ÿ",
    "fnof": "ƒ",
    "circ": "ˆ",
    "tilde": "˜",
    "Alpha": "Α",
    "Beta": "Β",
    "Gamma": "Γ",
    "Delta": "Δ",
    "Epsilon": "Ε",
    "Zeta": "Ζ",
    "Eta": "Η",
    "Theta": "Θ",
    "Iota": "Ι",
    "Kappa": "Κ",
    "Lambda": "Λ",
    "Mu": "Μ",
    "Nu": "Ν",
    "Xi": "Ξ",
    "Omicron": "Ο",
    "Pi": "Π",
    "Rho": "Ρ",
    "Sigma": "Σ",
    "Tau": "Τ",
    "Upsilon": "Υ",
    "Phi": "Φ",
    "Chi": "Χ",
    "Psi": "Ψ",
    "Omega": "Ω",
    "alpha": "α",
    "beta": "β",
    "gamma": "γ",
    "delta": "δ",
    "epsilon": "ε",
    "zeta": "ζ",
    "eta": "η",
    "theta": "θ",
    "iota": "ι",
    "kappa": "κ",
    "lambda": "λ",
    "mu": "μ",
    "nu": "ν",
    "xi": "ξ",
    "omicron": "ο",
    "pi": "π",
    "rho": "ρ",
    "sigmaf": "ς",
    "sigma": "σ",
    "tau": "τ",
    "upsilon": "υ",
    "phi": "φ",
    "chi": "χ",
    "psi": "ψ",
    "omega": "ω",
    "thetasym": "ϑ",
    "upsih": "ϒ",
    "piv": "ϖ",
    "ensp": " ",
    "emsp": " ",
    "thinsp": " ",
    "zwnj": "‌",
    "zwj": "‍",
    "lrm": "‎",
    "rlm": "‏",
    "ndash": "–",
    "mdash": "—",
    "lsquo": "‘",
    "rsquo": "’",
    "sbquo": "‚",
    "ldquo": "“",
    "rdquo": "”",
    "bdquo": "„",
    "dagger": "†",
    "Dagger": "‡",
    "bull": "•",
    "hellip": "…",
    "permil": "‰",
    "prime": "′",
    "Prime": "″",
    "lsaquo": "‹",
    "rsaquo": "›",
    "oline": "‾",
    "frasl": "⁄",
    "euro": "€",
    "image": "ℑ",
    "weierp": "℘",
    "real": "ℜ",
    "trade": "™",
    "alefsym": "ℵ",
    "larr": "←",
    "uarr": "↑",
    "rarr": "→",
    "darr": "↓",
    "harr": "↔",
    "crarr": "↵",
    "lArr": "⇐",
    "uArr": "⇑",
    "rArr": "⇒",
    "dArr": "⇓",
    "hArr": "⇔",
    "forall": "∀",
    "part": "∂",
    "exist": "∃",
    "empty": "∅",
    "nabla": "∇",
    "isin": "∈",
    "notin": "∉",
    "ni": "∋",
    "prod": "∏",
    "sum": "∑",
    "minus": "−",
    "lowast": "∗",
    "radic": "√",
    "prop": "∝",
    "infin": "∞",
    "ang": "∠",
    "and": "∧",
    "or": "∨",
    "cap": "∩",
    "cup": "∪",
    "int": "∫",
    "there4": "∴",
    "sim": "∼",
    "cong": "≅",
    "asymp": "≈",
    "ne": "≠",
    "equiv": "≡",
    "le": "≤",
    "ge": "≥",
    "sub": "⊂",
    "sup": "⊃",
    "nsub": "⊄",
    "sube": "⊆",
    "supe": "⊇",
    "oplus": "⊕",
    "otimes": "⊗",
    "perp": "⊥",
    "sdot": "⋅",
    "lceil": "⌈",
    "rceil": "⌉",
    "lfloor": "⌊",
    "rfloor": "⌋",
    "lang": "〈",
    "rang": "〉",
    "loz": "◊",
    "spades": "♠",
    "clubs": "♣",
    "hearts": "♥",
    "diams": "♦"
}

},{}],6:[function(require,module,exports){
var pt = require('parse-tools');

//  ---------------------------------------------------------------------------------------------------------------  //

var yate = require('./yate.js');

require('./ast.js');
require('./asts.js');

//  ---------------------------------------------------------------------------------------------------------------  //
//  yate.factory
//  ---------------------------------------------------------------------------------------------------------------  //

yate.factory = new pt.Factory(yate.AST, yate.asts);

//  ---------------------------------------------------------------------------------------------------------------  //


},{"./ast.js":2,"./asts.js":3,"./yate.js":11,"parse-tools":27}],7:[function(require,module,exports){
var path_ = require('path');

//  ---------------------------------------------------------------------------------------------------------------  //

var pt = require('parse-tools');

//  ---------------------------------------------------------------------------------------------------------------  //

var yate = require('./yate.js');

//  ---------------------------------------------------------------------------------------------------------------  //
//  yate grammar
//  ---------------------------------------------------------------------------------------------------------------  //

grammar = {};

//  ---------------------------------------------------------------------------------------------------------------  //

//  Tokens

grammar.tokens = {
    QNAME: /^[a-zA-Z_][a-zA-Z0-9_-]*/,
    JSTEP: /^[a-zA-Z0-9_][a-zA-Z0-9_-]*/,
    //  либо (...), либо (..)(.foo) -- то есть если после точек есть идентификатор, то последнюю точку не берем.
    DOTS: /^(?:\.{2,}(?=\.['"a-zA-Z0-9_*])|\.+(?!['"a-zA-Z0-9_*]))/,
    ESC: /^["'\\nt]/,
    NUMBER: /^[0-9]+(\.[0-9]+)?/,
    '/': /^\/(?!\/)/,
    '|': /^\|(?!\|)/,
    '=': /^=(?!=)/,
    ATTR_END: /^(?:\s+|\+=|=)/
};


//  ---------------------------------------------------------------------------------------------------------------  //

//  Keywords

grammar.keywords = [
    'module',
    'import',
    'include',
    'match',
    'func',
    'external',
    'sort',
    'for',
    'if',
    'else',
    'else if',
    'apply',
    'key',
    'nodeset',
    'boolean',
    'scalar',
    'attr',
    'xml',
    'asc',
    'desc',
    'object',
    'array'
];


//  ---------------------------------------------------------------------------------------------------------------  //

//  Rules

var rules = grammar.rules = {};

rules.eol = function() {
    var input = this.input;
    if ( !input.isEOL() ) {
        this.error('EOL expected');
    }
    input.nextLine();
};

//  ---------------------------------------------------------------------------------------------------------------  //
//  Blocks
//  ---------------------------------------------------------------------------------------------------------------  //

//  module := block

rules.module = {

    rule: function(p, a) {
        p.Name = this.match('module_name');
        p.Block = this.match( 'block', { toplevel: true } );

        if ( !this.input.isEOF() ) {
            this.error('EOF expected');
        }

    },

    options: {
        skipper: 'default_'
    }

};

rules.module_name = function() {
    if ( this.test('MODULE') ) {
        this.match('MODULE');

        var name = this.match( 'inline_string', { noexpr: true } );
        this.match('eol');

        return name.asString();
    }

    return '';
};

//  ---------------------------------------------------------------------------------------------------------------  //

//  block := ( import | include | template | function_ | key | var_ | block_expr )*

rules.block = function(p, a, params) {
    var that = this;

    var input = this.input;

    var Items = p.Items;

    //  Блок верхнего уровня (module) заканчивается с концом файла.
    //  Вложенные блоки заканчиваются закрывающей скобкой '}', ']' или ')'.
    while ( !( input.isEOF() || this.testAny('}', ']', ')') ) ) {
        //  Пропускаем пустые строки.
        if ( input.isEOL() ) {
            this.match('eol');
            continue;
        }

        var r = null;
        if ( this.test('IMPORT') ) {
            checktop();
            Items.add( this.match('import') );

        } else if ( this.test('INCLUDE') ) {
            Items.add( this.match('include') );

        } else if ( this.test('MATCH') ) {
            checktop();
            Items.add( this.match('template') );

        } else if ( this.test('KEY') ) {
            checktop();
            Items.add( this.match('key') );

        } else if ( this.test('FUNC') ) {
            Items.add( this.match('function_') );

        } else if ( this.test('EXTERNAL') ) {
            checktop();
            Items.add( this.match('external') );

        } else if ( this.testAll('QNAME', '=') ) {
            Items.add( this.match('var_') );

        } else {
            Items.add( this.match('block_expr') );

        }

        //  Если после выражения или определения нет перевода строки, то это конец блока.
        if ( !input.isEOL() ) {
            break;
        }

        this.match('eol');
    }

    function checktop() {
        if (!params.toplevel) {
            that.error('"match", "include", "import", "key" and "external" aren\'t allowed in blocks');
        }
    }

};

//  ---------------------------------------------------------------------------------------------------------------  //

//  body := '{' block '}' | '[' block ']'

rules.body = function(p, a) {
    //  Блоки бывают двух видов. Обычные { ... } и со списочным контекстом [ ... ].
    //  В [ ... ] каждое выражение верхнего уровня генерит отдельный элемент списка.
    var start = this.testAny('{', '[');
    if (start) {
        this.match(start);

        p.Block = this.match('block');
        /*
        if (start == '[') {
            p.AsList = true;
        }
        */

        var end = (start == '{') ? '}' : ']';
        this.match(end);
    } else {
        //  FIXME: Кажется, тут нужно использовать this.backtrace().
        this.error('Expected { or [');
    }

};


//  ---------------------------------------------------------------------------------------------------------------  //

//  import := 'import' inline_string

rules.import = function(p, a) {
    this.match('IMPORT');
    p.Name = this.match( 'inline_string', { noexpr: true } ).asString();
};

//  ---------------------------------------------------------------------------------------------------------------  //

//  include := 'include' inline_string

rules.include = function(p, a) {
    this.match('INCLUDE');

    var filename = this.match( 'inline_string', { noexpr: true } ).asString();
    var dirname = path_.dirname(this.input.filename);

    p.Filename = path_.resolve(dirname, filename);
};

//  ---------------------------------------------------------------------------------------------------------------  //
//  Declarations: templates, functions, keys, vars
//  ---------------------------------------------------------------------------------------------------------------  //

//  template := 'match' jpath ( '|' jpath )* template_mode? arglist? body

rules.template = function(p, a) {
    this.match('MATCH');
    p.Selectors = this.match('template_selectors');

    p.Mode = this.match('template_mode');
    if ( this.test('(') ) {
        p.Args = this.match('arglist');
    }
    p.Body = this.match('body');
};

rules.template_selectors = function(p, a) {
    a.add( this.match('jpath') );
    while ( this.test('|') ) {
        this.match('|');
        a.add( this.match('jpath') );
    }
};

//  template_mode := QNAME

rules.template_mode = function(p, a) {
    if ( this.test('QNAME') ) {
        p.Value = this.match('QNAME');
    } else {
        p.Value = '';
    }
};

//  arglist := '(' arglist_item ( ',' arglist_item )* ')'

rules.arglist = function(p, a) {
    this.match('(');
    if ( this.test('arglist_item') ) {
        a.add( this.match('arglist_item') );
        while ( this.test(',') ) {
            this.match(',');
            a.add( this.match('arglist_item') );
        }
    }
    this.match(')');
};

//  arglist_item := ( 'nodeset', 'boolean', 'scalar' )? QNAME ( '=' inline_expr )?

rules.arglist_item = function(p, a) {
    if ( this.test('typedef') ) {
        p.Typedef = this.match('typedef');
    }
    p.Name = this.match('QNAME');
    if ( this.test('=') ) {
        this.match('=');
        p.Default = this.match('inline_expr');
    }
};

rules.typedef = function() {
    return this.matchAny('NODESET', 'BOOLEAN', 'SCALAR', 'ATTR', 'XML', 'OBJECT', 'ARRAY');
};

//  ---------------------------------------------------------------------------------------------------------------  //

//  function_ := 'func' QNAME arglist body

rules.function_ = function(p, a) {
    this.match('FUNC');
    p.Name = this.match('QNAME');
    p.Args = this.match('arglist');
    p.Body = this.match('body');
};

//  ---------------------------------------------------------------------------------------------------------------  //

//  external := 'external' typedef QNAME argtypes

rules.external = function(p, a) {
    this.match('EXTERNAL');
    p.Type = this.match('typedef');
    p.Name = this.match('QNAME');
    p.ArgTypes = this.match('argtypes');
};

// argtypes := '(' ( typedef ( ',' typedef )* )? ')'

rules.argtypes = function() {
    var types = [];

    this.match('(');
    if ( this.test('typedef') ) {
        //  FIXME: Сделать не массив, а items.
        types.push( this.match('typedef') );
        while ( this.test(',') ) {
            this.match(',');
            types.push( this.match('typedef') );
        }
    }
    this.match(')');

    return types;
};

//  ---------------------------------------------------------------------------------------------------------------  //

//  key := 'key' QNAME '(' inline_expr ',' inline_expr ')' body

rules.key = function(p, a) {
    this.match('KEY');
    p.Name = this.match('QNAME');
    this.match('(');
    p.Nodes = this.match('inline_expr');
    this.match(',');
    p.Use = this.match('inline_expr');
    this.match(')');
    p.Body = this.match('body');
};

//  ---------------------------------------------------------------------------------------------------------------  //

//  var_ := QNAME '=' block_expr

rules.var_ = function(p, a) {
    p.Name = this.match('QNAME');
    this.match('=');
    p.Value = this.match('block_expr');
};


//  ---------------------------------------------------------------------------------------------------------------  //
//  Block expressions
//  ---------------------------------------------------------------------------------------------------------------  //

//  block_expr := if_ | for_ | apply | attr | xml_line | array | object | pair | subexpr

rules.block_expr = function() {
    var r;

    if ( this.test('IF') ) {
        r = this.match('if_');
    } else if ( this.test('FOR') ) {
        r = this.match('for_');
    } else if ( this.test('APPLY') ) {
        r = this.match('apply');
    } else if ( this.test(':::') ) {
        r = this.match('cdata');
    } else if ( this.test('@') ) {
        r = this.match('attr');
    } else if ( this.test('<') ) {
        r = this.match('xml_line');
    } else if ( this.test('[') ) {
        r = this.match('array');
    } else if ( this.test('{') ) {
        r = this.match('object');
    } else if ( this.testAll('inline_string', ':') ) {
        r = this.match('pair');
    } else if ( !this.test('(') ) {
        r = this.match('value');
    } else {
        //  Здесь всегда следующий символ это '('.

        //  FIXME: Важно, чтобы value шел перед subexpr. Иначе выражение вида (...) && (...) будет приводить к ошибке.
        if ( this.test('value') ) {
            r = this.match('value');
        } else {
            r = this.match('subexpr');
        }
    }

    return r;
};

//  ---------------------------------------------------------------------------------------------------------------  //

//  if_ := 'if' multiline_expr body else_if* else_?

rules.if_ = function(p, a) {
    this.match('IF');
    p.Condition = this.match('multiline_expr');
    p.Then = this.match('body');
    var Elses = p.Elses;
    while ( this.test('ELSE IF') ) {
        Elses.add( this.match('else_if') );
    }
    if ( this.test('ELSE') ) {
        Elses.add( this.match('else_') );
    }
};

//  else_if := 'else if' multiline_expr body

rules.else_if = function(p, a) {
    this.match('ELSE IF');
    p.Condition = this.match('multiline_expr');
    p.Body = this.match('body');
};

//  else_ := 'else' body

rules.else_ = function(p, a) {
    this.match('ELSE');
    p.Body = this.match('body');
};

//  ---------------------------------------------------------------------------------------------------------------  //

//  for_ := 'for' multiline_expr body

rules.for_ = function(p, a) {
    this.match('FOR');
    p.Selector = this.match('multiline_expr');
    p.Body = this.match('body');
};

//  ---------------------------------------------------------------------------------------------------------------  //

//  apply := 'apply' ( inline_expr | array | object ) template_mode? callargs?

rules.apply = function(p, a) {
    this.match('APPLY');

    if ( this.test('{') ) {
        p.Expr = this.match('object');
    } else if ( this.test('[') ) {
        p.Expr = this.match('array');
    } else {
        p.Expr = this.match('inline_expr');
    }
    /*
    var r = this.testAny('inline_expr', 'array', 'object');
    if (!r) {
        this.error('Expected expr');
    }

    p.Expr = this.match(r);
    */

    p.Mode = this.match('template_mode');
    if ( this.test('(') ) {
        p.Args = this.match('callargs');
    }
};

//  callargs := '(' ( callarg ( ',' callarg )* )? ')'

rules.callargs = function(p, a) {
    this.match('(');
    if ( !this.test(')') ) {
        a.add( this.match('callarg') );
        while ( this.test(',') ) {
            this.match(',');
            a.add( this.match('callarg') );
        }
    }
    this.match(')');
};

//  callarg := object | array | multiline_expr

rules.callarg = {
    rule: function(p, a) {
        if ( this.test('{') ) {
            p.Expr = this.match('object');
        } else if ( this.test('[') ) {
            p.Expr = this.match('array');
        } else {
            p.Expr = this.match('multiline_expr');
        }
    },

    options: {
        skipper: 'spaces'
    }
};

//  ---------------------------------------------------------------------------------------------------------------  //

//  attr := '@' QNAME ( '=' | '+=' ) block_expr

rules.attr = function(p, a) {
    this.match('@');

    p.Name = this.match('string_content', { noesc: true, delim: 'ATTR_END' });

    var r;
    if (( r = this.testAny('+=', '=') )) {
        p.Op = this.match(r);
        p.Value = this.match('block_expr');
    } else {
        this.error('"=" or "+=" expected');
    }
};


//  ---------------------------------------------------------------------------------------------------------------  //

//  array := '[' block ']'

rules.array = function(p, a) {
    //  FIXME: Поддержать инлайновый вариант: [ 1, 2, 3 ].
    this.match('[');
    p.Block = this.match('block');
    this.match(']');
};


//  ---------------------------------------------------------------------------------------------------------------  //

//  object := '{' block '}'

rules.object = function(p, a) {
    //  FIXME: Поддержать инлайновый вариант: { "foo": 42, "bar": 24 }.
    this.match('{');
    p.Block = this.match('block');
    this.match('}');
};


//  ---------------------------------------------------------------------------------------------------------------  //

//  pair := inline_expr ':' block_expr

rules.pair = function(p, a) {
    p.Key = this.match('inline_expr');
    this.match(':');
    p.Value = this.match('block_expr');
};

//  ---------------------------------------------------------------------------------------------------------------  //

//  subexpr := '(' block ')'

rules.subexpr = function(p, a) {
    this.match('(');
    p.Block = this.match('block');
    this.match(')');
};

//  ---------------------------------------------------------------------------------------------------------------  //

rules.value = function(p, a) {
    p.Value = this.match('inline_expr');
};


//  ---------------------------------------------------------------------------------------------------------------  //
//  XML
//  ---------------------------------------------------------------------------------------------------------------  //

//  xml_line := (xml_full | xml_empty | xml_start | xml_end)+

rules.xml_line = {

    rule: function(p, a) {
        var r;
        while (( r = this.testAny('xml_full', 'xml_empty', 'xml_start', 'xml_end') )) {
            a.add( this.match(r) );
        }
    },

    options: {
        skipper: 'none'
    }

};

//  ---------------------------------------------------------------------------------------------------------------  //

//  xml_full := xml_start ( xml_full | xml_empty | xml_text )* xml_end

rules.xml_full = {
    rule: function(p, a) {
        var start = this.match('xml_start');
        a.add(start);

        var r;
        while (( r = this.testAny('xml_full', 'xml_empty', 'xml_text') )) {
            a.add( this.match(r) );
        }

        var end = this.match('xml_end');
        a.add(end);

        //  FIXME: Унести это куда-то в .action().
        if (end.p.Name === true) {
            end.p.Name = start.p.Name;
        }

        if (start.p.Name != end.p.Name) {
            this.backtrace();
        }
    },

    options: {
        skipper: 'htmlBlockComments'
    }
};

//  ---------------------------------------------------------------------------------------------------------------  //

//  xml_start := '<' QNAME ( xml_attrs )? '>'

rules.xml_start = function(p, a) {
    this.match('<');
    p.Name = this.match('QNAME');
    p.Attrs = this.match('xml_attrs');
    this.match('>');
};

//  ---------------------------------------------------------------------------------------------------------------  //

//  xml_empty := '<' QNAME ( xml_attrs )? '/>'

rules.xml_empty = function(p, a) {
    this.match('<');
    p.Name = this.match('QNAME');
    p.Attrs = this.match('xml_attrs');
    this.match('/>');
};

//  ---------------------------------------------------------------------------------------------------------------  //

//  xml_end := '</' QNAME '>'

rules.xml_end = function(p, a) {
    if ( this.test('</>') ) {
        this.match('</>');
        p.Name = true;
    } else {
        this.match('</');
        p.Name = this.match('QNAME');
        this.skip('spaces');
        this.match('>');
    }
};

//  ---------------------------------------------------------------------------------------------------------------  //

//  xml_text := string_content

rules.xml_text = function(p, a) {
    var r = this.match( 'string_content', { noesc: true, delim: '<' } );
    //  FIXME: Нужно при вызове this.match('xml_text') проверять,
    //  что следующий символ не '<'. И тогда можно будет убрать этот backtrace().
    if ( r.empty() ) {
        this.backtrace();
    }
    p.Text = r;
};

//  ---------------------------------------------------------------------------------------------------------------  //

//  xml_attrs := xml_attr*

rules.xml_attrs = {

    rule: function(p, a) {
        var input = this.input;
        while (1) {
            //  Позволяем перевод строки между xml-атрибутами.
            if ( input.isEOL() ) {
                this.match('eol');
            } else if ( this.test('xml_attr') ) {
                a.add( this.match('xml_attr') );
            } else {
                break;
            }
        }
    },

    options: {
        skipper: 'spaces'
    }

};

//  xml_attr := QNAME '=' inline_string

rules.xml_attr = function(p, a) {
    p.Name = this.match('QNAME');
    this.match('=');
    p.Value = this.match('inline_string');
};


//  ---------------------------------------------------------------------------------------------------------------  //
//  Inline expressions
//  ---------------------------------------------------------------------------------------------------------------  //

//  inline_expr := inline_or

rules.inline_expr = {

    rule: function() {
        return this.match('inline_or');
    },

    options: {
        skipper: 'spaces'
    }

};

rules.multiline_expr = {

    rule: function() {
        return this.match('inline_or');
    },

    options: {
        skipper: 'whitespaces'
    }

};

//  inline_or := inline_and ( '||' inline_or )?

rules.inline_or = function(p, a) {
    p.Left = this.match('inline_and');
    if ( this.test('||') ) {
        p.Op = this.match('||');
        p.Right = this.match('inline_or');
    } else {
        return p.Left;
    }
};

//  inline_and := inline_eq ( '&&' inline_and )?

rules.inline_and = function(p, a) {
    p.Left = this.match('inline_eq');
    if ( this.test('&&') ) {
        p.Op = this.match('&&');
        p.Right = this.match('inline_and');
    } else {
        return p.Left;
    }
};

//  inline_eq := inline_rel ( ( '==' | '!=' ) inline_rel )?

rules.inline_eq = function(p, a) {
    p.Left = this.match('inline_rel');
    var op;
    if (( op = this.testAny('==', '!=') )) {
        p.Op = this.match(op);
        p.Right = this.match('inline_rel');
    } else {
        return p.Left;
    }
};

//  inline_rel := inline_add ( ( '<=' | '<' | '>=' | '>' ) inline_add )?

rules.inline_rel = function(p, a) {
    p.Left = this.match('inline_add');
    var op;
    if (( op = this.testAny('<=', '<', '>=', '>') )) {
        p.Op = this.match(op);
        p.Right = this.match('inline_add');
    } else {
        return p.Left;
    }
};

//  inline_add := inline_mul ( ( '+' | '-' ) inline_add )?

rules.inline_add = function(p, a) {
    p.Left = this.match('inline_mul');
    var op;
    //  FIXME: Проблемы с порядком выполнения. Например, 1 - 2 - 3 превратится в -(1, -(2, 3)).
    if (( op = this.testAny('+', '-') )) {
        p.Op = this.match(op);
        p.Right = this.match('inline_add');
    } else {
        return p.Left;
    }
};

//  inline_mul := inline_unary ( ( '/' | '*' | '%' ) inline_mul )?

rules.inline_mul = function(p, a) {
    p.Left = this.match('inline_unary');
    var op;
    if (( op = this.testAny('/', '*', '%') )) {
        p.Op = this.match(op);
        p.Right = this.match('inline_mul');
    } else {
        return p.Left;
    }
};

//  inline_unary := '-' inline_not | inline_not

rules.inline_unary = function(p, a) {
    if ( this.test('-') ) {
        p.Op = this.match('-');
        p.Left = this.match('inline_not');
    } else {
        return this.match('inline_not');
    }
};

//  inline_not := '!' inline_union | inline_union

rules.inline_not = function(p, a) {
    if ( this.test('!') ) {
        p.Op = this.match('!');
        p.Left = this.match('inline_not');
    } else {
        return this.match('inline_union');
    }
};

//  inline_union := inline_primary ( '|' inline_union )?

rules.inline_union = function(p, a) {
    p.Left = this.match('inline_primary');
    if ( this.test('|') ) {
        p.Op = this.match('|');
        p.Right = this.match('inline_union');
    } else {
        return p.Left;
    }
};

//  ---------------------------------------------------------------------------------------------------------------  //

//  inline_primary := inline_number | inline_string | inline_subexpr | jpath | inline_function | inline_var

rules.inline_primary = {

    rule: function(p, a) {
        if ( this.test('NUMBER') ) {
            return this.match('inline_number');
        }

        if ( this.testAny('"', "'") ) {
            return this.match('inline_string');
        }

        var expr;

        if ( this.test('(') ) {
            expr = this.match('inline_subexpr');
        } else if ( this.testAny('.', '/') ) {
            expr = this.match('jpath');
        } else if ( this.testAll('SORT', '(') ) {
            expr = this.match('sort');
        } else if ( this.testAll('QNAME', '(') ) {
            expr = this.match('inline_function');
        } else if ( this.test('QNAME') ) {
            expr = this.match('inline_var');
        } else {
            this.error('number, string, jpath, variable or function call expected');
        }

        if ( this.testAny('[', '.') ) {
            //  FIXME: А не нужно ли тут написать expr.make и убрать параметры p и a?
            expr = a.make( 'jpath_filter', {
                expr: expr,
                jpath: this.match( 'jpath', { inContext: true } )
            } );
        }

        return expr;
    },

    options: {
        skipper: 'none'
    }

};


//  ---------------------------------------------------------------------------------------------------------------  //

rules.sort = {

    rule: function(p, a) {
        this.match('SORT');
        this.match('(');
        p.Nodes = this.match('inline_expr');
        this.match(',');
        if ( this.testAny('ASC', 'DESC') ) {
            p.Order = this.matchAny('ASC', 'DESC');
        } else {
            p.Order = 'asc';
        }
        p.By = this.match('inline_expr');
        this.match(')');
    },

    options: {
        skipper: 'default_'
    }

};

//  ---------------------------------------------------------------------------------------------------------------  //

//  inline_number := NUMBER

rules.inline_number = function(p, a) {
    p.Value = parseFloat( this.match('NUMBER') );
};

//  ---------------------------------------------------------------------------------------------------------------  //

//  inline_string := '"' string_content '"'

rules.inline_string = {

    rule: function(p, a, params) {
        var quote = this.matchAny('"', "'");
        if ( this.test(quote) ) {
            //  Отдельно обрабатываем пустую строку.
            p.Value = a.make('string_literal', '');
        } else {
            p.Value = this.match( 'string_content', { noexpr: params.noexpr, noesc: params.noesc, delim: quote } );
        }
        this.match(quote);
    },

    options: {
        skipper: 'none'
    }

};

//  string_content := ...

//  params.noexpr   -- запрещает интерполяцию выражений в строке.
//  params.noesc    -- не нужно учитывать esc-последовательности типа \n, \t и т.д.
//  params.delim    -- задает символ, ограничивающий строковый контент.
rules.string_content = function(p, a, params) {
    var input = this.input;

    var s = '';

    while ( input.current() && !this.test(params.delim) ) {
        if ( !params.noexpr && this.testAny('{', '}') ) {
            if ( this.test('{{') ) {
                this.match('{{');
                s += '{';
            } else if ( this.test('}}') ) {
                this.match('}}');
                s += '}';

            } else if ( this.test('{') ) {
                if (s) {
                    a.add( a.make('string_literal', s) );
                    s = '';
                }
                this.match('{');
                this.skip('spaces');
                a.add( a.make( 'string_expr', this.match('inline_expr') ) );
                this.skip('spaces');
                this.match('}');
            } else {
                this.error('Unmatched }');
            }
        } else if ( !params.noesc && this.test('\\') ) {
            this.match('\\');
            if ( this.test('ESC') ) {
                var c = this.match('ESC');
                switch (c) {
                    case 'n': s += '\n'; break;
                    case 't': s += '\t'; break;
                    default: s += c;
                }
            }

        } else {
            s += input.current(1);
            input.next(1);
        }
    }

    if (s) {
        a.add( a.make('string_literal', s) );
    }

};

//  ---------------------------------------------------------------------------------------------------------------  //

//  inline_subexpr := '(' inline_expr ')'

rules.inline_subexpr = {

    rule: function(p, a) {
        this.match('(');
        p.Expr = this.match('inline_expr');
        this.match(')');
    }

};

//  ---------------------------------------------------------------------------------------------------------------  //

//  inline_var := QNAME

rules.inline_var = function(p, a) {
    p.Name = this.match('QNAME');
};

//  ---------------------------------------------------------------------------------------------------------------  //

//  inline_function := QNAME callargs

rules.inline_function = function(p, a) {
    p.Name = this.match('QNAME');
    p.Args = this.match('callargs');
};


//  ---------------------------------------------------------------------------------------------------------------  //
//  JPath
//  ---------------------------------------------------------------------------------------------------------------  //

//  jpath := '/'? jpath_steps

rules.jpath = {

    rule: function(p, a, params) {
        if (params.inContext) {
            //  inContext означает, что это не полный jpath. Например, в выражении foo[42].bar это [42].bar.
            p.InContext = true;
        } else {
            if ( !this.testAny('.', '/') ) {
                // Полный jpath всегда должен начинаться с точки или слэша.
                this.error('Expected . or /');
            }
        }

        //  jpath может начинаться с /, но это должен быть полный jpath, не в контексте.
        if ( !p.InContext && this.test('/') ) {
            this.match('/');
            p.Abs = true;
        } else if ( !this.testAny('.', '[') ) {
            this.error('Expected: . or [');
        }
        p.Steps = this.match('jpath_steps');
    },

    options: {
        skipper: 'none'
    }

};

//  jpath_steps := jpath_step*

rules.jpath_steps = function(p, a) {
    while ( this.test('jpath_step') ) {
        a.add( this.match('jpath_step') );
    }
};

//  jpath_step := jpath_dots | jpath_nametest | jpath_predicate

rules.jpath_step = function() {
    var r;

    if ( this.test('DOTS') ) {
        r = this.match('jpath_dots');
    } else if ( this.test('.') ) {
        r = this.match('jpath_nametest');
    } else if ( this.test('[') ) {
        r = this.match('jpath_predicate');
    } else {
        this.error('Expected: . or [');
    }

    return r;
};

//  jpath_parents := '.'+

rules.jpath_dots = function(p, a) {
    p.Dots = this.match('DOTS');
    //  FIXME: Не получается одни регэкспом различить ...foo и ...
    //  Точнее различить-то мы их можем.
    //  Но в первом случае мы получаем две точки, во втором -- три,
    //  но в обоих случаях нужно сделать два шага вверх.
    //  Поэтому смотрим, если дальше осталась точка, то добавляем одну точку.
    if ( this.test('.') ) {
        p.Dots += '.';
    }
};

//  jpath_nametest := '.' ( QNAME | '*' )

rules.jpath_nametest = function(p, a) {
    this.match('.');
    if ( this.testAny('"', "'") ) {
        p.Name = this.match( 'inline_string', { noexpr: true, noesc: true } ).asString();
    } else {
        p.Name = this.matchAny('JSTEP', '*');
    }
};

//  jpath_predicate := '[' multiline_expr ']'

rules.jpath_predicate = {

    rule: function(p, a) {
        this.match('[');
        p.Expr = this.match('multiline_expr');
        this.match(']');
    },

    options: {
        skipper: 'spaces'
    }

};

//  ---------------------------------------------------------------------------------------------------------------  //

//  cdata := ':::' strings ':::'

rules.cdata = {

    rule: function(p, a) {
        this.match(':::');

        var input = this.input;
        var s = [];

        while ( !input.isEOF() ) {
            var line = input.current();

            var i = line.indexOf(':::');
            if (i > -1) {
                s.push( line.substr(0, i) );
                input.next(i);
                break;
            }

            s.push(line);
            input.nextLine();
        }

        this.match(':::');

        var indent = 1000;
        for (var i = 1; i < s.length; i++) {
            indent = Math.min( indent, /^(\s*)/.exec( s[i] )[1].length );
        }

        if (indent) {
            for (var i = 1; i < s.length; i++) {
                s[i] = s[i].substr(indent);
            }
        }

        p.Value = a.make( 'string_literal', s.join('\n') );
    },

    options: {
        skipper: 'none'
    }

};

//  ---------------------------------------------------------------------------------------------------------------  //
//  Skippers
//  ---------------------------------------------------------------------------------------------------------------  //

grammar.skippers = {};

//  ---------------------------------------------------------------------------------------------------------------  //

grammar.skippers.default_ = function() {
    var r = false;
    while (1) {
        var l = this.skip('spaces') || this.skip('inlineComments') || this.skip('jsBlockComments') || this.skip('htmlBlockComments');
        r = r || l;
        if (!l) { break; }
    }
    return r;
};

grammar.skippers.spaces = /^[\ \t]+/;

grammar.skippers.whitespaces = function() {
    var input = this.input;

    this.skip('spaces');
    if ( !input.current() ) {
        input.nextLine();
    }
    this.skip('spaces');
};

grammar.skippers.none = function() {};

grammar.skippers.inlineComments = function() {
    var input = this.input;

    if ( input.isEOF() ) { return; }

    if (input.current(2) != '//') {
        return;
    }

    input.next( input.current().length );

    return true;
};

grammar.skippers.jsBlockComments = function() {
    var input = this.input;

    if ( input.isEOF() ) { return; }

    if (input.current(2) !== '/*') {
        return false;
    }

    input.next(2);
    while ( !input.isEOF() ) {
        var i = input.current().indexOf('*/');
        if (i == -1) {
            input.nextLine();
        } else {
            input.next(i);
            break;
        }
    }
    if (input.current(2) != '*/') {
        this.error('Expected */');
    }
    input.next(2);

    return true;
};

grammar.skippers.htmlBlockComments = function() {
    var input = this.input;

    if ( input.isEOF() ) { return; }

    if (input.current(4) !== '<!--') {
        return false;
    }

    input.next(4);
    while ( !input.isEOF() ) {
        var i = input.current().indexOf('-->');
        if (i == -1) {
            input.nextLine();
        } else {
            input.next(i);
            break;
        }
    }
    if (input.current(3) != '-->') {
        this.error('Expected -->');
    }
    input.next(3);

    return true;
};

//  ---------------------------------------------------------------------------------------------------------------  //

yate.grammar = new pt.Grammar(grammar);

//  ---------------------------------------------------------------------------------------------------------------  //


},{"./yate.js":11,"parse-tools":27,"path":14}],8:[function(require,module,exports){
//  ---------------------------------------------------------------------------------------------------------------  //
//  yate runtime
//  ---------------------------------------------------------------------------------------------------------------  //

var yr = {};

(function() {

yr.log = function() {};

//  TODO:
//  Пустой массив. Можно использовать везде, где предполается,
//  что он read-only. Например, когда из select() возвращается пустой нодесет и т.д.
//  var emptyA = [];

var modules = {};

//  ---------------------------------------------------------------------------------------------------------------  //

//  Кешируем регулярки для лучшей производительности.
//  (http://jsperf.com/entityify-test/2)
//
var RE_AMP = /&/g;
var RE_LT = /</g;
var RE_GT = />/g;
var RE_QUOTE = /"/g;

var RE_E_AMP = /&amp;/g;
var RE_E_LT = /&lt;/g;
var RE_E_GT = /&gt;/g;

yr.text2xml = function(s) {
    if (s == null) { return ''; }

    //  NOTE: Странное поведение Safari в этом месте.
    //  Иногда сюда попадает объект, которые != null, но при этом у него
    //  нет метода toString. По идее, такого быть просто не может.
    //  Попытки пронаблюдать этот объект (при помощи console.log и т.д.)
    //  приводят к тому, что он "нормализуется" и баг пропадает.
    //  Вообще, любые операции, которые неявно приводят его к строке, например,
    //  тоже приводят к нормализации и пропаданию бага.
    //
    //  Поэтому, вместо `s.toString()` используем `('' + s)`.
    //
    return ('' + s)
        .replace(RE_AMP, '&amp;')
        .replace(RE_LT, '&lt;')
        .replace(RE_GT, '&gt;');
};

yr.xml2text = function(s) {
    //  NOTE: См. коммент про Safari выше.

    if (s == null) { return ''; }

    return ('' + s)
        .replace(RE_E_LT, '<')
        .replace(RE_E_GT, '>')
        .replace(RE_E_AMP, '&');
};

yr.text2attr = function(s) {
    //  NOTE: См. коммент про Safari выше.

    if (s == null) { return ''; }

    return ('' + s)
        .replace(RE_AMP, '&amp;')
        .replace(RE_QUOTE, '&quot;')
        .replace(RE_LT, '&lt;')
        .replace(RE_GT, '&gt;');
};

yr.xml2attr = function(s) {
    //  NOTE: См. коммент про Safari выше.

    if (s == null) { return ''; }

    return ('' + s)
        .replace(RE_QUOTE, '&quot;')
        .replace(RE_LT, '&lt;')
        .replace(RE_GT, '&gt;');
};

//  ---------------------------------------------------------------------------------------------------------------  //

yr.register = function(id, module) {
    if ( modules[id] ) {
        throw Error('Module "' + id + '" already exists');
    }

    //  Резолвим ссылки на импортируемые модули.

    var ids = module.imports || [];
    /// module.id = id;
    //  Для удобства добавляем в imports сам модуль.
    var imports = [ module ];
    for (var i = 0, l = ids.length; i < l; i++) {
        var module_ = modules[ ids[i] ];
        if (!module_) {
            throw Error('Module "' + ids[i] + '" doesn\'t exist');
        } else {
            imports = imports.concat(module_.imports);
        }
    }
    //  В результате мы дерево импортов превратили в плоский список.
    module.imports = imports;

    modules[id] = module;
};

//  ---------------------------------------------------------------------------------------------------------------  //

yr.run = function(id, data, mode) {
    mode = mode || '';

    var module = modules[id];
    if (!module) {
        throw 'Module "' + id + '" is undefined';
    }

    var doc = new Doc(data);

    var r = module.a(module, [ doc.root ], mode, { a: {} } );

    return r;
};

//  ---------------------------------------------------------------------------------------------------------------  //

yr.join = function join(left, right) {
    return left.concat(right);
};

//  ---------------------------------------------------------------------------------------------------------------  //

yr.nodeValue = function nodeValue(node) {
    var data = node.data;
    return (typeof data === 'object') ? '': data;
};

yr.nodeName = function nodeName(nodeset) {
    var node = nodeset[0];

    return (node) ? node.name : '';
};

//  ---------------------------------------------------------------------------------------------------------------  //

yr.simpleScalar = function simpleScalar(name, context) {
    var data = context.data;
    if (!data) { return ''; }

    if (name === '*') {
        for (var key in data) {
            return yr.simpleScalar(key, context);
        }
        return '';
    }

    var r = data[name];

    if (typeof r === 'object') {
        return '';
    }

    return r;
};

yr.simpleBoolean = function simpleBoolean(name, context) {
    var data = context.data;
    if (!data) { return false; }

    if (name === '*') {
        for (var key in data) {
            var r = yr.simpleBoolean(key, context);
            if (r) { return true; }
        }
        return false;
    }

    var r = data[name];

    if (!r) { return false; }

    if (r instanceof Array) {
        return r.length;
    }

    return true;
};

//  ---------------------------------------------------------------------------------------------------------------  //

yr.nodeset2scalar = function nodeset2scalar(nodeset) {
    if (!nodeset.length) { return ''; }

    var data = nodeset[0].data;
    return (typeof data == 'object') ? '': data;
};

yr.nodeset2boolean = function nodeset2boolean(nodeset) {
    if (! (nodeset && nodeset.length > 0) ) {
        return false;
    }

    return !!nodeset[0].data;
};

yr.nodeset2xml = function nodeset2xml(nodeset) {
    return yr.scalar2xml( yr.nodeset2scalar(nodeset) );
};

yr.nodeset2attrvalue = function nodeset2attrvalue(nodeset) {
    return yr.scalar2attrvalue( yr.nodeset2scalar(nodeset) );
};

yr.scalar2xml = yr.text2xml;
yr.xml2scalar = yr.xml2text;

//  FIXME: Откуда вообще взялась идея, что xml в атрибуты нужно кастить не так, как скаляры?!
//  Смотри #157. Не нужно квотить амперсанд, потому что он уже заквочен.
yr.xml2attrvalue = yr.xml2attr;

yr.scalar2attrvalue = yr.text2attr;

yr.object2nodeset = function object2nodeset(object) {
    return [ ( new Doc(object) ).root ];
};

yr.array2nodeset = function array2nodeset(array) {
    var object = {
        'item': array
    };
    return [ ( new Doc(object) ).root ];
};

//  Сравниваем скаляр left с нодесетом right.
yr.cmpSN = function cmpSN(left, right) {
    for (var i = 0, l = right.length; i < l; i++) {
        if ( left == yr.nodeValue( right[i] ) ) {
            return true;
        }
    }
    return false;
};

//  Сравниваем два нодесета.
yr.cmpNN = function cmpNN(left, right) {
    var m = right.length;

    if (m === 0) { return false; }
    if (m === 1) { return yr.cmpSN( yr.nodeValue( right[0] ), left ); }

    var values = [];

    var rv = yr.nodeValue( right[0] );
    for (var i = 0, l = left.length; i < l; i++) {
        var lv = yr.nodeValue( left[i] );
        if (lv == rv) { return true; }
        values[i] = lv;
    }

    for (var j = 1; j < m; j++) {
        rv = yr.nodeValue( right[j] );
        for (var i = 0, l = left.length; i < l; i++) {
            if ( values[i] == rv ) { return true; }
        }
    }

    return false;
};

//  ---------------------------------------------------------------------------------------------------------------  //

yr.shortTags = {
    br: true,
    col: true,
    embed: true,
    hr: true,
    img: true,
    input: true,
    link: true,
    meta: true,
    param: true,
    wbr: true
};

yr.closeAttrs = function closeAttrs(a) {
    var name = a.s;

    if (name) {
        var r = '';
        var attrs = a.a;

        for (var attr in attrs) {
            r += ' ' + attr + '="' + attrs[attr].quote() + '"';
        }
        /*
        for (var attr in attrs) {
            if ( attrs.hasOwnProperty(attr) ) {
                var v = attrs[attr];
                if (v.quote) {
                    r += ' ' + attr + '="' + v.quote() + '"';
                } else {
                    yr.log({
                        id: 'NO_QUOTE',
                        message: "Attr doesn't have quote() method",
                        data: {
                            key: attr,
                            value: v
                        }
                    });
                }
            } else {
                yr.log({
                    id: 'BAD_PROTOTYPE',
                    message: 'Object prototype is corrupted',
                    data: {
                        key: attr,
                        value: v
                    }
                });
            }
        }
        */
        r += (yr.shortTags[name]) ? '/>' : '>';
        a.s = null;

        return r;
    }

    return '';
};

yr.copyAttrs = function copyAttrs(to, from) {
    for (var key in from) {
        to[key] = from[key];
    }
};

//  ---------------------------------------------------------------------------------------------------------------  //

yr.scalarAttr = function(s) {
    //  NOTE: См. коммент про Safari выше.

    this.s = (s == null) ? '' : ('' + s);
};

yr.scalarAttr.prototype.quote = function() {
    return yr.text2attr(this.s);
};

function quoteAmp(s) {
    return s.replace(/&/g, '&amp;');
}

yr.scalarAttr.prototype.addxml = function(xml) {
    return new yr.xmlAttr( quoteAmp(this.s) + xml );
};

yr.scalarAttr.prototype.addscalar = function(xml) {
    return new yr.scalarAttr( this.s + xml );
};

yr.xmlAttr = function(s) {
    //  NOTE: См. коммент про Safari выше.

    this.s = (s == null) ? '' : ('' + s);
};

yr.xmlAttr.prototype.quote = function() {
    return yr.xml2attr(this.s);
};

yr.xmlAttr.prototype.addscalar = function(scalar) {
    return new yr.xmlAttr( this.s + quoteAmp(scalar) );
};

//  ---------------------------------------------------------------------------------------------------------------  //

yr.slice = function(s, from, to) {
    //  NOTE: См. коммент про Safari выше.

    s = '' + s;
    return (to) ? s.slice(from, to) : s.slice(from);
};

yr.exists = function(nodeset) {
    return nodeset.length > 0;
};

yr.grep = function(nodeset, predicate) {
    var r = [];
    for (var index = 0, count = nodeset.length; index < count; index++) {
        var node = nodeset[index];
        if (predicate(node, index, count)) {
            r.push(node);
        }
    }
    return r;
};

yr.byIndex = function(nodeset, i) {
    return nodeset.slice(i, i + 1);
};

//  ---------------------------------------------------------------------------------------------------------------  //

yr.sort = function(nodes, by, desc) {
    var values = [];
    for (var i = 0, l = nodes.length; i < l; i++) {
        var node = nodes[i];
        var value = by(node, i, l);
        values.push({
            node: node,
            value: value
        });
    }

    var greater = (desc) ? -1 : +1;
    var less = (desc) ? +1 : -1;

    var sorted = values.sort(function(a, b) {
        var va = a.value;
        var vb = b.value;
        if (va < vb) { return less; }
        if (va > vb) { return greater; }
        return 0;
    });

    var r = [];
    for (var i = 0, l = sorted.length; i < l; i++) {
        r.push( sorted[i].node );
    }

    return r;
};

//  ---------------------------------------------------------------------------------------------------------------  //

yr.nodeset2data = function(nodes) {
    var l = nodes.length;
    if (l === 0) {
        return '';
    }

    if (l === 1) {
        return nodes[0].data;
    }

    var data = [];
    for (var i = 0; i < l; i++) {
        data.push( nodes[i].data );
    }

    return data;
};

//  ---------------------------------------------------------------------------------------------------------------  //

yr.externals = {};


//  ---------------------------------------------------------------------------------------------------------------  //
//  Module
//  ---------------------------------------------------------------------------------------------------------------  //


var Module = function() {};

//  ---------------------------------------------------------------------------------------------------------------  //

//  NOTE: ex applyValue.
Module.prototype.a = function applyValue(M, nodeset, mode, a0) {
    var r = '';

    //  Достаем аргументы, переданные в apply, если они там есть.
    var args;
    if (arguments.length > 4) {
        args = Array.prototype.slice.call(arguments, 4);
    }

    var imports = M.imports;

    //  Идем по нодесету.
    for (var i0 = 0, l0 = nodeset.length; i0 < l0; i0++) {
        var c0 = nodeset[i0];

        //  Для каждой ноды ищем подходящий шаблон.
        //  Сперва ищем в текущем модуле ( imports[0] ),
        //  затем идем далее по списку импортов.

        //  Если мы найдем шаблон, в found будет его id, а в module -- модуль,
        //  в котором находится этот шаблон.
        var found = false;
        var module;

        var i2 = 0;
        var l2 = imports.length;
        var template;
        while (!found && i2 < l2) {
            module = imports[i2++];

            //  matcher представляем собой двухуровневый объект,
            //  на первом уровне ключами являются моды,
            //  на втором -- имена нод.
            //  Значения на втором уровне -- список id-шников шаблонов.
            var names = module.matcher[mode];

            if (names) {
                //  FIXME: Тут неправильно. Если шаблоны для c0.name будут,
                //  но ни один из них не подойдет, то шаблоны для '*' не применятся вообще.
                //  FIXME: Плюс шаблоны на '*' всегда имеют более низкий приоритет.
                var templates = names[c0.name] || names['*'];
                if (templates) {
                    var i3 = 0;
                    var l3 = templates.length;
                    while (!found && i3 < l3) {
                        var tid = templates[i3++];
                        template = module[tid];

                        var selector = template.j;
                        if (selector) {
                            //  В template.j лежит id селектора (jpath'а).
                            //  В tempalte.a флаг о том, является ли jpath абсолютным.
                            if ( module.matched(selector, template.a, c0, i0, l0) ) {
                                found = tid;
                            }
                        } else {
                            var selectors = template.s;
                            var abs = template.a;
                            //  В template.s лежит массив с id-шниками селекторов.
                            for (var i4 = 0, l4 = selectors.length; i4 < l4; i4++) {
                                if ( module.matched(selectors[i4], abs[i4], c0, i0, l0) ) {
                                    found = tid;
                                    break;
                                }
                            }
                        }
                    }
                }
            }
        }

        if (found) {
            //  Шаблон нашли, применяем его.
            if (args) {
                //  Шаблон позвали с параметрами, приходится изгаляться.
                r += template.apply( M, [M, c0, i0, l0, a0].concat(args) );
            } else {
                r += template(M, c0, i0, l0, a0);
            }
        }
    }

    return r;
};

//  ---------------------------------------------------------------------------------------------------------------  //

Module.prototype.matched = function matched(jpath, abs, c0, i0, l0) {
    if (jpath === 1) {
        //  Это jpath '/'
        return !c0.parent;
    }

    var l = jpath.length;
    //  i (и l) всегда будет четное.
    var i = l - 2;
    while (i >= 0) {
        if (!c0) { return false; }

        var step = jpath[i];
        //  Тут step может быть либо 0 (nametest), либо 2 (predicate).
        //  Варианты 1 (dots) и 3 (index) в jpath'ах в селекторах запрещены.
        switch (step) {
            case 0:
                //  Nametest.
                var name = jpath[i + 1];
                if (name !== '*' && name !== c0.name) { return false; }
                c0 = c0.parent;
                break;

            case 2:
            case 4:
                //  Predicate or guard.
                var predicate = jpath[i + 1];
                if ( !predicate(this, c0, i0, l0) ) { return false; }
                break;
        }

        i -= 2;
    }

    if (abs && c0.parent) {
        return false;
    }

    return true;
};

//  ---------------------------------------------------------------------------------------------------------------  //

//  NOTE: ex selectN.
Module.prototype.s = function selectN(jpath, node) {
    return this.n( jpath, [ node ] );
};

//  NOTE: ex selectNs.
Module.prototype.n = function selectNs(jpath, nodeset) {

    var current = nodeset;
    var m = current.length;

    var result;
    for (var i = 0, n = jpath.length; i < n; i += 2) {
        result = [];

        var type = jpath[i];
        var step = jpath[i + 1];

        switch (type) {

            case 0: // Это nametest (.foo или .*), в step 'foo' или '*'.
                for (var j = 0; j < m; j++) {
                    yr.selectNametest(step, current[j], result);
                }
                break;

            case 1: // Это dots (., .., ...), в step количество шагов минус один ( . -- 0, .. -- 1, ... -- 2 и т.д. ).
                for (var j = 0; j < m; j++) {
                    var k = 0;
                    var node = current[j];
                    while (k < step && node) {
                        node = node.parent;
                        k++;
                    }
                    if (node) {
                        result.push(node);
                    }
                }
                break;

            case 2: // Это filter, в step предикат.
                for (var j = 0; j < m; j++) {
                    var node = current[j];
                    if (step(this, node, j, m)) { // Предикат принимает четыре параметра: module, node, index и count.
                        result.push(node);
                    }
                }
                break;

            case 3: // Это index, в step индекс нужного элемента.
                var node = current[ step ];
                result = (node) ? [ node ] : [];
                break;

            case 4:
                //  Это глобальный гвард.
                if (m > 0) {
                    var node = current[0];
                    if ( step(this, node.doc.root, 0, 1) ) {
                        result = result.concat(current);
                    }
                }

        }

        current = result;
        m = current.length;

        if (!m) { return []; }
    }

    return result;
};

yr.selectNametest = function selectNametest(step, context, result) {

    var data = context.data;

    if (!data || typeof data !== 'object') { return result; }

    if (step === '*') {
        if (data instanceof Array) {
            for (var i = 0, l = data.length; i < l; i++) {
                yr.selectNametest(i, context, result);
            }
        } else {
            for (step in data) {
                yr.selectNametest(step, context, result);
            }
        }
        return result;
    }

    data = data[step];
    if (data === undefined) { return result; }

    var doc = context.doc;
    if (data instanceof Array) {
        for (var i = 0, l = data.length; i < l; i++) {
            result.push({
                data: data[i],
                parent: context,
                name: step,
                //  FIXME: Не нравится мне этот doc.
                doc: doc
            });
        }
    } else {
        result.push({
            data: data,
            parent: context,
            name: step,
            //  FIXME: Не нравится мне этот doc.
            doc: doc
        });
    }

    return result;
};

yr.document = function(nodeset) {
    var doc;
    if (!nodeset.length) {
        doc = new Doc( {} );
    } else {
        doc = new Doc( nodeset[0].data );
    }
    return [ doc.root ];
};

yr.subnode = function(name, data, context) {
    var doc = context.doc;

    if (data instanceof Array) {
        var nodeset = [];
        for (var i = 0, l = data.length; i < l; i++) {
            nodeset.push({
                data: data[i],
                name: name,
                parent: context,
                doc: doc
            });
        }
        return nodeset;
    }

    return [
        {
            data: data,
            name: name,
            parent: context,
            doc: doc
        }
    ];
};

//  ---------------------------------------------------------------------------------------------------------------  //

//  Глобальные переменные у нас "ленивые" с кэшированием.
//  В this[name] находится только лишь функция,
//  вычисляющая нужное значение.
//
//  NOTE: ex vars
Module.prototype.v = function vars(id, c0) {
    var vars = c0.doc._vars;
    var value = vars[id];
    if (value === undefined) {
        var var_ = this.findSymbol(id);
        value = (typeof var_ === 'function') ? var_(this, c0, 0, 1) : var_;
        vars[id] = value;
    }
    return value;
};

//  FIXME: Тут еще бывает a0, а иногда не бывает.
//
//  NOTE: ex funcs
Module.prototype.f = function funcs(id, c0, i0, l0, v0) {
    var func = this.findSymbol(id);

    if (arguments.length > 5) {
        //  Два и более аргументов.
        var args = Array.prototype.slice.call(arguments);
        args[0] = this;
        return func.apply(this, args);
    }

    if (v0 !== undefined) {
        //  Один аргумент.
        return func(this, c0, i0, l0, v0);
    }

    //  Без аргументов.
    return func(this, c0, i0, l0);
};

//  NOTE: ex keys.
Module.prototype.k = function keys(id, use, c0, multiple) {
    var keys = c0.doc._keys;

    var key = this.findSymbol(id);

    var cache = keys[id];
    if (!cache) {
        cache = this._initKey(key, id, use, c0);
    }

    var values = cache.values;
    var nodes = cache.nodes;

    var that = this;

    if (multiple) {
        //  В use -- нодесет.
        var r;

        if (cache.xml) {
            r = '';
            for (var i = 0, l = use.length; i < l; i++) {
                var c0 = use[i];
                r += getValue( yr.nodeValue(c0) );
            }
        } else {
            r = [];
            for (var i = 0, l = use.length; i < l; i++) {
                var c0 = use[i];
                r = r.concat( getValue( yr.nodeValue(c0) ) );
            }
        }

        return r;

    } else {
        //  В use -- скаляр.
        var value = values[use];
        if (value === undefined) {
            value = getValue(use);
        }

        return value;

    }

    function getValue(use) {
        var nodes_ = nodes[use];

        var r;
        if (cache.xml) {
            r = '';
            if (nodes_) {
                for (var i = 0, l = nodes_.length; i < l; i++) {
                    var node = nodes_[i];
                    //  FIXME: Нельзя ли тут последний параметр сделать общим,
                    //  а не создавать его для каждого элемента цикла?
                    r += key.b( that, node.c, node.i, node.l, {} );
                }
            }
        } else {
            r = [];
            if (nodes_) {
                for (var i = 0, l = nodes_.length; i < l; i++) {
                    var node = nodes_[i];
                    r = r.concat( key.b(that, node.c, node.i, node.l) );
                }
            }
        }

        values[use] = r;

        return r;
    }

};

Module.prototype._initKey = function(key, id, use, c0) {
    var keys = c0.doc._keys;
    var cache = keys[id] = {};

    //  Тело ключ имеет тип xml.
    cache.xml = (key.bt === 'xml');

    //  Вычисляем нодесет с нодами, которые матчатся ключом.
    var matched = key.n(this, c0);
    //  Хранилище для этих нод.
    var nodes = cache.nodes = {};

    //  Значение use ключа может возвращать нодесет или скаляр.
    if (key.ut === 'nodeset') {
        for (var i0 = 0, l0 = matched.length; i0 < l0; i0++) {
            var c1 = matched[i0];
            //  Тип use_ -- nodeset.
            var use_ = key.u(this, c1, i0, l0);

            for (var j = 0, m = use_.length; j < m; j++) {
                store( yr.nodeValue( use_[j] ), { c: c1, i: i0, l: l0 } );
            }
        }

    } else {
        for (var i0 = 0, l0 = matched.length; i0 < l0; i0++) {
            var c1 = matched[i0];
            //  Тип use_ -- nodeset.
            var use_ = key.u(this, c1, i0, l0);

            store( use_, { c: c1, i: i0, l: l0 } );
        }

    }

    //  Хранилище для уже вычисленных значений ключа.
    cache.values = {};

    return cache;

    //  Сохраняем ноду по соответствующему ключу.
    //  Одному ключу может соответствовать несколько нод.
    function store(key, info) {
        var items = nodes[key];
        if (!items) {
            items = nodes[key] = [];
        }
        items.push(info);
    }


};

//  ---------------------------------------------------------------------------------------------------------------  //

Module.prototype.findSymbol = function(id) {
    var imports = this.imports;
    for (var i = 0, l = imports.length; i < l; i++) {
        var module = imports[i];
        var symbol = module[id];
        if (symbol !== undefined) { return symbol; }
    }
};

//  ---------------------------------------------------------------------------------------------------------------  //

function Doc(data) {
    //  FIXME: Что тут использовать? Array.isArray?
    if (data instanceof Array) {
        data = {
            //  FIXME: Сделать название поля ('item') настраеваемым.
            'item': data
        };
    }

    this.root = {
        data: data,
        parent: null,
        name: '',
        doc: this
    };

    this._vars = {};
    this._keys = {};
}

//  ---------------------------------------------------------------------------------------------------------------  //



yr.Module = Module;

//  ---------------------------------------------------------------------------------------------------------------  //

})();

//  ---------------------------------------------------------------------------------------------------------------  //

//  NOTE: Для использования из node.js.
//  При этом недостаточно просто проверить window/document.
//  Потому что в тестах runtime грузится не как модуль (пока что, надеюсь),
//  но просто эвалится, поэтому в нем module не определен.
//
if (typeof module === 'object' && module.exports) {
    module.exports = yr;
}


},{}],9:[function(require,module,exports){
var yate = require('./yate.js');

//  ---------------------------------------------------------------------------------------------------------------  //
//  yate.Scope
//  ---------------------------------------------------------------------------------------------------------------  //

yate.Scope = function() {
    this.id = yate.Scope._id++;

    this.defs = [];

    this.vars = {};
    this.functions = {};
    this.jkeys = {};
    this.pkeys = {};
};

yate.Scope._id = 0;

//  ---------------------------------------------------------------------------------------------------------------  //

yate.Scope.prototype.child = function() {
    var local = new this.constructor();
    local.parent = this;
    return local;
};

//  ---------------------------------------------------------------------------------------------------------------  //

yate.Scope.prototype.findVar = function(name) {
    var scope = this;
    while (scope) {
        var value = scope.vars[name];
        if (value) {
            return value;
        }
        scope = scope.parent;
    }
};

yate.Scope.prototype.findFunction = function(name) {
    var scope = this;
    while (scope) {
        var value = scope.functions[name];
        if (value) {
            return value;
        }
        scope = scope.parent;
    }
};

//  ---------------------------------------------------------------------------------------------------------------  //

yate.Scope.prototype.top = function() {
    var top = this;
    while (top.parent) {
        top = top.parent;
    }
    return top;
};

//  ---------------------------------------------------------------------------------------------------------------  //

yate.Scope.prototype.inScope = function(scope) {
    var that = this;

    while (that) {
        if (that === scope) { return true; }
        that = that.parent;
    }

    return false;
};

yate.Scope.commonScope = function(a, b) {
    return (a.inScope(b)) ? a : b;
};

//  ---------------------------------------------------------------------------------------------------------------  //


},{"./yate.js":11}],10:[function(require,module,exports){
var yate = require('./yate');

//  ---------------------------------------------------------------------------------------------------------------  //
//  yate.types
//  ---------------------------------------------------------------------------------------------------------------  //

yate.types = {};

//  ---------------------------------------------------------------------------------------------------------------  //

yate.types.joinType = function(left, right) {
    //  NONE + ??? == NONE
    if (left == 'none' || right == 'none') { return 'none'; }

    //  ARRAY + ??? == NONE, OBJECT + ??? == NONE, BOOLEAN + ??? == NONE
    if (left == 'array' || right == 'array') { return 'none'; }
    if (left == 'object' || right == 'object') { return 'none'; }
    if (left == 'boolean' || right == 'boolean') { return 'none'; }

    //  UNDEF + UNDEF == UNDEF
    if (left == 'undef' && right == 'undef') { return 'undef'; }

    //  PAIR + ??? == PAIR
    if (left == 'pair' || right == 'pair') { return 'pair'; }

    //  ATTR + ATTR == ATTR
    if (left == 'attr' && right == 'attr') { return 'attr'; }

    //  ATTR + ??? == XML, XML + ??? == XML.
    if (left == 'xml' || left == 'attr' || right == 'xml' || right == 'attr') { return 'xml'; }

    //  LIST + LIST == LIST
    if (left == 'list' && right == 'list') { return 'list'; }

    //  Все остальное это SCALAR.
    return 'scalar';
};

//  ---------------------------------------------------------------------------------------------------------------  //

yate.types.convertable = function(from, to) {
    return (
        (from == to) ||
        (to == 'any') ||
        (from == 'undef') ||
        (from == 'nodeset' && to == 'scalar') ||
        (from == 'nodeset' && to == 'xml') ||
        (from == 'nodeset' && to == 'attrvalue') ||
        (from == 'nodeset' && to == 'boolean') ||
        (from == 'nodeset' && to == 'data') ||
        (from == 'scalar' && to == 'boolean') ||
        (from == 'scalar' && to == 'xml') ||
        (from == 'xml' && to == 'scalar') ||
        (from == 'xml' && to == 'boolean') ||
        (from == 'scalar' && to == 'attrvalue') ||
        (from == 'xml' && to == 'attrvalue') ||
        (from == 'attr' && to == 'xml') ||
        (from == 'object' && to == 'nodeset') ||
        (from == 'array' && to == 'nodeset')
    );
};

//  ---------------------------------------------------------------------------------------------------------------  //

//  FIXME: Этот метод используется только в if_._getType. Унести его туда.
yate.types.commonType = function(left, right) {
    if (left == right) { return left; }

    if (left == 'undef') { return right; }
    if (right == 'undef') { return left; }

    if (
        left == 'array' || right == 'array' ||
        left == 'object' || right == 'object' ||
        left == 'pair' || right == 'pair'
    ) {
        return 'none';
    }

    if (left == 'boolean' || right == 'boolean') {
        return 'boolean';
    }

    if (
        left == 'xml' || right == 'xml' ||
        left == 'attr' || right == 'attr'
    ) {
        return 'xml';
    }

    return 'scalar';
};

//  ---------------------------------------------------------------------------------------------------------------  //


},{"./yate":11}],11:[function(require,module,exports){
//  ---------------------------------------------------------------------------------------------------------------  //
//  yate
//  ---------------------------------------------------------------------------------------------------------------  //

var yate = {};

//  ---------------------------------------------------------------------------------------------------------------  //

yate.version = require('../package.json').version;

yate.cliOptions = {};

//  ---------------------------------------------------------------------------------------------------------------  //

module.exports = yate;

//  ---------------------------------------------------------------------------------------------------------------  //


},{"../package.json":36}],12:[function(require,module,exports){

},{}],13:[function(require,module,exports){
// shim for using process in browser

var process = module.exports = {};

process.nextTick = (function () {
    var canSetImmediate = typeof window !== 'undefined'
    && window.setImmediate;
    var canPost = typeof window !== 'undefined'
    && window.postMessage && window.addEventListener
    ;

    if (canSetImmediate) {
        return function (f) { return window.setImmediate(f) };
    }

    if (canPost) {
        var queue = [];
        window.addEventListener('message', function (ev) {
            if (ev.source === window && ev.data === 'process-tick') {
                ev.stopPropagation();
                if (queue.length > 0) {
                    var fn = queue.shift();
                    fn();
                }
            }
        }, true);

        return function nextTick(fn) {
            queue.push(fn);
            window.postMessage('process-tick', '*');
        };
    }

    return function nextTick(fn) {
        setTimeout(fn, 0);
    };
})();

process.title = 'browser';
process.browser = true;
process.env = {};
process.argv = [];

process.binding = function (name) {
    throw new Error('process.binding is not supported');
}

// TODO(shtylman)
process.cwd = function () { return '/' };
process.chdir = function (dir) {
    throw new Error('process.chdir is not supported');
};

},{}],14:[function(require,module,exports){
var process=require("__browserify_process");// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

// resolves . and .. elements in a path array with directory names there
// must be no slashes, empty elements, or device names (c:\) in the array
// (so also no leading and trailing slashes - it does not distinguish
// relative and absolute paths)
function normalizeArray(parts, allowAboveRoot) {
  // if the path tries to go above the root, `up` ends up > 0
  var up = 0;
  for (var i = parts.length - 1; i >= 0; i--) {
    var last = parts[i];
    if (last === '.') {
      parts.splice(i, 1);
    } else if (last === '..') {
      parts.splice(i, 1);
      up++;
    } else if (up) {
      parts.splice(i, 1);
      up--;
    }
  }

  // if the path is allowed to go above the root, restore leading ..s
  if (allowAboveRoot) {
    for (; up--; up) {
      parts.unshift('..');
    }
  }

  return parts;
}

// Split a filename into [root, dir, basename, ext], unix version
// 'root' is just a slash, or nothing.
var splitPathRe =
    /^(\/?|)([\s\S]*?)((?:\.{1,2}|[^\/]+?|)(\.[^.\/]*|))(?:[\/]*)$/;
var splitPath = function(filename) {
  return splitPathRe.exec(filename).slice(1);
};

// path.resolve([from ...], to)
// posix version
exports.resolve = function() {
  var resolvedPath = '',
      resolvedAbsolute = false;

  for (var i = arguments.length - 1; i >= -1 && !resolvedAbsolute; i--) {
    var path = (i >= 0) ? arguments[i] : process.cwd();

    // Skip empty and invalid entries
    if (typeof path !== 'string') {
      throw new TypeError('Arguments to path.resolve must be strings');
    } else if (!path) {
      continue;
    }

    resolvedPath = path + '/' + resolvedPath;
    resolvedAbsolute = path.charAt(0) === '/';
  }

  // At this point the path should be resolved to a full absolute path, but
  // handle relative paths to be safe (might happen when process.cwd() fails)

  // Normalize the path
  resolvedPath = normalizeArray(filter(resolvedPath.split('/'), function(p) {
    return !!p;
  }), !resolvedAbsolute).join('/');

  return ((resolvedAbsolute ? '/' : '') + resolvedPath) || '.';
};

// path.normalize(path)
// posix version
exports.normalize = function(path) {
  var isAbsolute = exports.isAbsolute(path),
      trailingSlash = substr(path, -1) === '/';

  // Normalize the path
  path = normalizeArray(filter(path.split('/'), function(p) {
    return !!p;
  }), !isAbsolute).join('/');

  if (!path && !isAbsolute) {
    path = '.';
  }
  if (path && trailingSlash) {
    path += '/';
  }

  return (isAbsolute ? '/' : '') + path;
};

// posix version
exports.isAbsolute = function(path) {
  return path.charAt(0) === '/';
};

// posix version
exports.join = function() {
  var paths = Array.prototype.slice.call(arguments, 0);
  return exports.normalize(filter(paths, function(p, index) {
    if (typeof p !== 'string') {
      throw new TypeError('Arguments to path.join must be strings');
    }
    return p;
  }).join('/'));
};


// path.relative(from, to)
// posix version
exports.relative = function(from, to) {
  from = exports.resolve(from).substr(1);
  to = exports.resolve(to).substr(1);

  function trim(arr) {
    var start = 0;
    for (; start < arr.length; start++) {
      if (arr[start] !== '') break;
    }

    var end = arr.length - 1;
    for (; end >= 0; end--) {
      if (arr[end] !== '') break;
    }

    if (start > end) return [];
    return arr.slice(start, end - start + 1);
  }

  var fromParts = trim(from.split('/'));
  var toParts = trim(to.split('/'));

  var length = Math.min(fromParts.length, toParts.length);
  var samePartsLength = length;
  for (var i = 0; i < length; i++) {
    if (fromParts[i] !== toParts[i]) {
      samePartsLength = i;
      break;
    }
  }

  var outputParts = [];
  for (var i = samePartsLength; i < fromParts.length; i++) {
    outputParts.push('..');
  }

  outputParts = outputParts.concat(toParts.slice(samePartsLength));

  return outputParts.join('/');
};

exports.sep = '/';
exports.delimiter = ':';

exports.dirname = function(path) {
  var result = splitPath(path),
      root = result[0],
      dir = result[1];

  if (!root && !dir) {
    // No dirname whatsoever
    return '.';
  }

  if (dir) {
    // It has a dirname, strip trailing slash
    dir = dir.substr(0, dir.length - 1);
  }

  return root + dir;
};


exports.basename = function(path, ext) {
  var f = splitPath(path)[2];
  // TODO: make this comparison case-insensitive on windows?
  if (ext && f.substr(-1 * ext.length) === ext) {
    f = f.substr(0, f.length - ext.length);
  }
  return f;
};


exports.extname = function(path) {
  return splitPath(path)[3];
};

function filter (xs, f) {
    if (xs.filter) return xs.filter(f);
    var res = [];
    for (var i = 0; i < xs.length; i++) {
        if (f(xs[i], i, xs)) res.push(xs[i]);
    }
    return res;
}

// String.prototype.substr - negative index don't work in IE8
var substr = 'ab'.substr(-1) === 'b'
    ? function (str, start, len) { return str.substr(start, len) }
    : function (str, start, len) {
        if (start < 0) start = str.length + start;
        return str.substr(start, len);
    }
;

},{"__browserify_process":13}],15:[function(require,module,exports){
var indexOf = require('indexof');

var Object_keys = function (obj) {
    if (Object.keys) return Object.keys(obj)
    else {
        var res = [];
        for (var key in obj) res.push(key)
        return res;
    }
};

var forEach = function (xs, fn) {
    if (xs.forEach) return xs.forEach(fn)
    else for (var i = 0; i < xs.length; i++) {
        fn(xs[i], i, xs);
    }
};

var Script = exports.Script = function NodeScript (code) {
    if (!(this instanceof Script)) return new Script(code);
    this.code = code;
};

Script.prototype.runInNewContext = function (context) {
    if (!context) context = {};
    
    var iframe = document.createElement('iframe');
    if (!iframe.style) iframe.style = {};
    iframe.style.display = 'none';
    
    document.body.appendChild(iframe);
    
    var win = iframe.contentWindow;
    
    forEach(Object_keys(context), function (key) {
        win[key] = context[key];
    });
     
    if (!win.eval && win.execScript) {
        // win.eval() magically appears when this is called in IE:
        win.execScript('null');
    }
    
    var winKeys = Object_keys(win);

    var res = win.eval(this.code);
    
    forEach(Object_keys(win), function (key) {
        // Avoid copying circular objects like `top` and `window` by only
        // updating existing context properties or new properties in the `win`
        // that was only introduced after the eval.
        if (key in context || indexOf(winKeys, key) === -1) {
            context[key] = win[key];
        }
    });
    
    document.body.removeChild(iframe);
    
    return res;
};

Script.prototype.runInThisContext = function () {
    return eval(this.code); // maybe...
};

Script.prototype.runInContext = function (context) {
    // seems to be just runInNewContext on magical context objects which are
    // otherwise indistinguishable from objects except plain old objects
    // for the parameter segfaults node
    return this.runInNewContext(context);
};

forEach(Object_keys(Script.prototype), function (name) {
    exports[name] = Script[name] = function (code) {
        var s = Script(code);
        return s[name].apply(s, [].slice.call(arguments, 1));
    };
});

exports.createScript = function (code) {
    return exports.Script(code);
};

exports.createContext = Script.createContext = function (context) {
    // not really sure what this one does
    // seems to just make a shallow copy
    var copy = {};
    if(typeof context === 'object') {
        forEach(Object_keys(context), function (key) {
            copy[key] = context[key];
        });
    }
    return copy;
};

},{"indexof":16}],16:[function(require,module,exports){

var indexOf = [].indexOf;

module.exports = function(arr, obj){
  if (indexOf) return arr.indexOf(obj);
  for (var i = 0; i < arr.length; ++i) {
    if (arr[i] === obj) return i;
  }
  return -1;
};
},{}],17:[function(require,module,exports){
var no = require('./no.base.js');

//  ---------------------------------------------------------------------------------------------------------------  //

require('./no.string.js');
require('./no.array.js');
require('./no.object.js');

require('./no.events.js');
require('./no.jpath.js');
require('./no.promise.js');

require('./no.date.js');

//  ---------------------------------------------------------------------------------------------------------------  //

module.exports = no;

//  ---------------------------------------------------------------------------------------------------------------  //


},{"./no.array.js":18,"./no.base.js":19,"./no.date.js":20,"./no.events.js":21,"./no.jpath.js":22,"./no.object.js":23,"./no.promise.js":25,"./no.string.js":26}],18:[function(require,module,exports){
var no = no || require('./no.base.js');

//  ---------------------------------------------------------------------------------------------------------------  //

no.array = function(value) {
    if (value === undefined) {
        return [];
    }

    return ( Array.isArray(value) ) ? value : [ value ];
};

//  ---------------------------------------------------------------------------------------------------------------  //

no.array.map = function(array, callback) {
    var r = [];

    for (var i = 0, l = array.length; i < l; i++) {
        var value = callback( array[i], i );

        if (value !== undefined) {
            r.push(value);
        }
    }

    return r;
};

//  ---------------------------------------------------------------------------------------------------------------  //


},{"./no.base.js":19}],19:[function(require,module,exports){
var process=require("__browserify_process");//  ---------------------------------------------------------------------------------------------------------------  //
//  no
//  ---------------------------------------------------------------------------------------------------------------  //

var no = {};

//  ---------------------------------------------------------------------------------------------------------------  //

no.de = (typeof module === 'object' && module.exports);

//  ---------------------------------------------------------------------------------------------------------------  //

no.inherit = function(ctor, base, mixin) {
    var F = function() {};
    F.prototype = base.prototype;
    var proto = ctor.prototype = new F();

    if (mixin) {
        if ( Array.isArray(mixin) ) {
            for (var i = 0, l = mixin.length; i < l; i++) {
                no.extend( proto, mixin[i] );
            }
        } else {
            no.extend(proto, mixin);
        }
    }

    proto.super_ = base.prototype;
    proto.constructor = ctor;

    return ctor;
};

//  ---------------------------------------------------------------------------------------------------------------  //

/**
    @param {!Object} dest
    @param {...!Object} srcs
    @return {!Object}
*/
no.extend = function(dest) {
    for (var i = 1, l = arguments.length; i < l; i++) {
        var src = arguments[i];
        for (var key in src) {
            dest[key] = src[key];
        }
    }

    return dest;
};

//  ---------------------------------------------------------------------------------------------------------------  //

no.nop = function() {};

//  ---------------------------------------------------------------------------------------------------------------  //

no.true = function() { return true; };
no.false = function() { return false; };

//  ---------------------------------------------------------------------------------------------------------------  //

no.value = function(value) {
    return function() {
        return value;
    };
};

//  ---------------------------------------------------------------------------------------------------------------  //

/**
    @param {string} msg
    @return {function()}
*/
no.logger = function(msg) {
    if (msg) {
        return function() {
            var args = [].slice.call(arguments);
            console.log.apply(null, [ msg ].concat(args) );
        };
    }

    return console.log;
};

//  ---------------------------------------------------------------------------------------------------------------  //

if ( no.de ) {
    no.next = function(callback) {
        process.nextTick(callback);
    };
} else {
    //  FIXME: Посмотреть на postMessage и т.д.
    no.next = function(callback) {
        setTimeout(callback, 0);
    };
}

//  ---------------------------------------------------------------------------------------------------------------  //

if ( no.de ) {
    module.exports = no;
}

//  ---------------------------------------------------------------------------------------------------------------  //


},{"__browserify_process":13}],20:[function(require,module,exports){
var no = no || require('./no.base.js');

if ( no.de ) {
    require('./no.string.js');

    module.exports = no;
}

//  ---------------------------------------------------------------------------------------------------------------  //

no.date = {};

//  ---------------------------------------------------------------------------------------------------------------  //

(function() {

//  TODO: Локализация!
var data = {
    days: [ 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday' ],
    days_abbr: [ 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat' ],
    months: [ 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December' ],
    months_abbr: [ 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec' ]
};

//  ---------------------------------------------------------------------------------------------------------------  //

var _formatters = {}

no.date.format = function(format, date) {
    var formatter = _formatters[format];
    if (!formatter) {
        formatter = _formatters[format] = no.date.formatter(format);
    }

    return formatter(date);
};

no.date.formatter = function(format) {
    var js = [];

    var parts = format.split( /%([a-zA-Z%])/ );
    for (var i = 0, l = parts.length; i < l; i++) {
        var part = parts[i]

        if (i % 2) {
            switch (part) {
                //  http://php.net/manual/en/function.strftime.php

                //  Day.

                case 'a':
                    js.push( 'days_abbr[ d.getDay() ]' );
                    break;

                case 'A':
                    js.push( 'days[ d.getDay() ]' );
                    break;

                case 'd':
                    js.push( 'strpad( d.getDate(), 2, "0" )' );
                    break;

                case 'e':
                case 'j':
                case 'u':
                case 'w':
                    break;

                //  Week.

                case 'U':
                case 'V':
                case 'W':
                    break;

                //  Month.

                case 'b':
                case 'h':
                    js.push( 'months_abbr[ d.getMonth() ]' );
                    break;

                case 'B':
                    js.push( 'months[ d.getMonth() ]' );
                    break;

                case 'm':
                    js.push( 'strpad( d.getMonth() + 1, 2, "0" )' );
                    break;

                //  Year.

                case 'y':
                    js.push( 'strpad( d.getFullYear() % 100 )' );
                    break;

                case 'Y':
                    js.push( 'd.getFullYear()' );
                    break;

                case 'C':
                case 'g':
                case 'G':
                    break;

                //  Time.

                case 'H':
                    js.push( 'strpad( d.getHours(), 2, "0" )' );
                    break;

                case 'M':
                    js.push( 'strpad( d.getMinutes(), 2, "0" )' );
                    break;

                case 'S':
                    js.push( 'strpad( d.getSeconds(), 2, "0" )' );
                    break;

                case 'k':
                case 'I':
                case 'l':
                case 'p':
                case 'P':
                case 'r':
                case 'R':
                case 'S':
                case 'T':
                case 'X':
                case 'z':
                case 'Z':
                    break;

                //  Time and Date Stamps.

                case 's':
                    js.push( 'd.getTime()' );
                    break;

                case 'c':
                case 'D':
                case 'F':
                case 'x':
                    break;

                //  Miscellaneous.
                case '%':
                    js.push( '"%"' );
                    break;

                case 'n':
                    js.push( '"\\n"' );
                    break;

                case 't':
                    js.push( '"\\t"' );
                    break;

                //  Non-standard.

                case 'f':
                    js.push( 'strpad( d.getTime() % 1000, 3, "0" )' );
                    break;

            }
        } else {
            js.push( JSON.stringify(part) );
        }
    }

    return ( new Function('data', 'no',
        'var strpad = no.string.pad_left,' +
        'days = data.days,' +
        'days_abbr = data.days_abbr,' +
        'months = data.months,' +
        'months_abbr = data.months_abbr;' +
        'return function(d) { return ' + js.join('+') + '; };'
    ) )(data, no);
};

//  ---------------------------------------------------------------------------------------------------------------  //

})();

//  ---------------------------------------------------------------------------------------------------------------  //


},{"./no.base.js":19,"./no.string.js":26}],21:[function(require,module,exports){
var no = no || require('./no.base.js');

if ( no.de ) {
    module.exports = no;
}

//  ---------------------------------------------------------------------------------------------------------------  //

//  Простейший pub/sub
//  ------------------
//
//  `no.Events` -- объект, который можно подмиксовать к любому другому объекту:
//
//      var foo = {};
//      no.extend(foo, no.Events);
//
//      foo.on('bar', function(e, data) {
//          console.log(e, data);
//      });
//
//      foo.trigger('bar', 42);
//
//  Или же:
//
//      function Foo() {}
//
//      no.extend(Foo.prototype, no.Events);
//
//      var foo = new Foo();
//
//      foo.on('bar', function(e, data) {
//          console.log(e, data);
//      });
//
//      foo.trigger('bar', 42);
//

//  ---------------------------------------------------------------------------------------------------------------  //

no.Events = {};

//  ---------------------------------------------------------------------------------------------------------------  //

//  Подписываем обработчик handler на событие name.
//
no.Events.on = function(name, handler) {
    var handlers = this._noevents_handlers || (( this._noevents_handlers = {} ));

    ( handlers[name] || (( handlers[name] = [] )) ).push(handler);

    return this;
};

//  Отписываем обработчик handler от события name.
//  Если не передать handler, то удалятся вообще все обработчики события name.
//
no.Events.off = function(name, handler) {
    if (handler) {
        var handlers = this._noevents_handlers && this._noevents_handlers[name];
        if (handlers) {
            //  Ищем этот хэндлер среди уже забинженных обработчиков этого события.
            var i = handlers.indexOf(handler);

            if (i !== -1) {
                //  Нашли и удаляем этот обработчик.
                handlers.splice(i, 1);
            }
        }
    } else {
        var handlers = this._noevents_handlers;
        if (handlers) {
            //  Удаляем всех обработчиков этого события.
            //  FIXME: Может тут лучше делать handlers[name] = null?
            delete handlers[name];
        }
    }

    return this;
};

//  ---------------------------------------------------------------------------------------------------------------  //

//  "Генерим" событие name. Т.е. вызываем по-очереди (в порядке подписки) все обработчики события name.
//  В каждый передаем name и params.
//
no.Events.trigger = function(name, param1, param2) {
    var handlers = this._noevents_handlers && this._noevents_handlers[name];

    if (handlers) {
        //  Копируем список хэндлеров.
        //  Если вдруг внутри какого-то обработчика будет вызван `off()`,
        //  то мы не потеряем вызов следующего обработчика.
        handlers = handlers.slice();

        var l = arguments.length;

        if (l === 1) {
            for (var i = 0, l = handlers.length; i < l; i++) {
                handlers[i].call(this, name);
            }
        } else if (l === 2) {
            for (var i = 0, l = handlers.length; i < l; i++) {
                handlers[i].call(this, name, param1);
            }
        } else if (l === 3) {
            for (var i = 0, l = handlers.length; i < l; i++) {
                handlers[i].call(this, name, param1, param2);
            }
        } else {
            for (var i = 0, l = handlers.length; i < l; i++) {
                handlers[i].apply(this, arguments);
            }
        }
    }

    return this;
};

//  "Генерим" событие в следующем тике.
//
no.Events.atrigger = function(event, params) {
    var that = this;
    no.next(function() {
        that.trigger(event, params);
    });
};

//  ---------------------------------------------------------------------------------------------------------------  //

//  "Форвардим" все сообщения name в другой объект.
//
no.Events.forward = function(name, object) {
    return this.on(name, function(e, params) {
        object.trigger(e, params);
    });
};

//  ---------------------------------------------------------------------------------------------------------------  //


},{"./no.base.js":19}],22:[function(require,module,exports){
var no = no || require('./no.base.js');

if ( no.de ) {
    require('./no.parser.js');

    module.exports = no;
}

//  ---------------------------------------------------------------------------------------------------------------  //

(function() {

//  ---------------------------------------------------------------------------------------------------------------  //

/**
    @constructor
    @param {Object} data
*/
function JNode(data) {
    this.data = data;
}

//  ---------------------------------------------------------------------------------------------------------------  //

JNode.prototype.empty = new JNodeset();

/**
    @return {boolean}
*/
JNode.prototype.isEmpty = function() {
    return false;
};

/**
    @param {string} name
    @param {JNodeset=} result
    @return {(JNode|JNodeset)}
*/
JNode.prototype.nametest = function(name, result) {
    var data = this.data;
    if (!data) {
        return this.empty;
    }

    if ( Array.isArray(data) ) {
        result || (( result = new JNodeset() ));
        for (var i = 0; i < data.length; i++) {
            ( new JNode( data[i] ) ).nametest(name, result);
        }
        return result;
    }

    var r = data[name];
    if (r === undefined) {
        return this.empty;
    }

    var node = new JNode(r);
    if (result) {
        return result.push(node);
    }

    return node;
};

/**
    @param {JNodeset=} result
    @return {JNodeset}
*/
JNode.prototype.startest = function(result) {
    result || (( result = new JNodeset() ));

    var data = this.data;
    if ( Array.isArray(data) ) {
        for (var i = 0; i < data.length; i++) {
            ( new JNode( data[i] ) ).startest(result);
        }
    } else {
        for (var key in data) {
            this.nametest(key, result);
        }
    }

    return result;
};

/**
    @param {function(JNode, JNode): boolean} filter
    @param {JNode} root
    @return {(JNode|JNodeset)}
*/
//  FIXME: Добавить тут четвертый параметр result?
JNode.prototype.pred = function(filter, root, vars, funcs) {
    var data = this.data;

    if ( Array.isArray(data) ) {
        var result = new JNodeset();
        for (var i = 0; i < data.length; i++) {
            var node = new JNode( data[i] );
            if ( filter(node, root, vars, funcs) ) {
                result.push(node);
            }
        }
        return result;
    }

    return ( filter(this, root, vars, funcs) ) ? this : this.empty;
};

/**
    @param {number} index
    @return {JNodeset}
*/
JNode.prototype.index = function(index, root, vars, funcs) {
    var data = this.data;

    if ( Array.isArray(data) ) {
        var r = data[ index(this, root, vars, funcs) ];
        return (r !== undefined) ? ( new JNode(r) ).toNodeset() : this.empty;
    }

    return (index === 0) ? this : this.empty;
};

/**
    @return {Array}
*/
JNode.prototype.toArray = function() {
    return [ this.data ];
};

/**
    @return {JNodeset}
*/
JNode.prototype.toNodeset = function() {
    return ( new JNodeset() ).push(this);
};

JNode.prototype.scalar = function() {
    var data = this.data;
    return (typeof data === 'object') ? '' : data;
};

/**
    @return {boolean}
*/
JNode.prototype.boolean = function() {
    var data = this.data;

    if ( Array.isArray(data) ) {
        //  FIXME: Нужно ли отдельно рассматривать случай, когда это массив
        //  из одного falsy элемента?
        return data.length > 0;
    }

    return !!data;
};

/**
    @param {JNodeset} nodeset
    @return {boolean}
*/
JNode.prototype.cmpN = function(nodeset) {
    var data = this.data;

    if ( Array.isArray(data) ) {
        for (var i = 0; i < data.length; i++) {
            if ( cmpN(new JNode( data[i] ), nodeset) ) {
                return true;
            }
        }
        return false;
    }

    return cmpN(this, nodeset);
};

function cmpN(node, nodeset) {
    if (nodeset instanceof JNode) {
        return cmpS( nodeset, node.scalar() );
    }

    var nodes = nodeset.nodes;
    var value = node.scalar();
    for (var i = 0; i < nodes.length; i++) {
        if ( value == nodes[i].scalar() ) {
            return true;
        }
    }
    return false;
}

JNode.prototype.cmpS = function(scalar) {
    return cmpS(this, scalar);
};

function cmpS(node, scalar) {
    var data = node.data;

    if ( Array.isArray(data) ) {
        for (var i = 0; i < data.length; i++) {
            if ( ( new JNode( data[i] ) ).scalar() == scalar ) {
                return true;
            }
        }
        return false;
    }

    return node.scalar() == scalar;
}

//  ---------------------------------------------------------------------------------------------------------------  //

/**
    @constructor
*/
function JNodeset() {
    this.nodes = [];
}

//  ---------------------------------------------------------------------------------------------------------------  //

JNodeset.prototype.empty = JNode.prototype.empty;

/**
    @return {boolean}
*/
JNodeset.prototype.isEmpty = function() {
    return !this.nodes.length;
};

/**
    @param {JNode} node
    @return {JNodeset}
*/
JNodeset.prototype.push = function(node) {
    this.nodes.push(node);

    return this;
};

/**
    @param {string} name
    @param {JNodeset=} result
    @return {JNodeset}
*/
JNodeset.prototype.nametest = function(name, result) {
    var nodes = this.nodes;
    result || (( result = new JNodeset() ));
    for (var i = 0; i < nodes.length; i++) {
        nodes[i].nametest(name, result);
    }
    return result;
};

/**
    @param {JNodeset=} result
    @return {JNodeset}
*/
JNodeset.prototype.startest = function(result) {
    var nodes = this.nodes;
    result || (( result = new JNodeset() ));
    for (var i = 0; i < nodes.length; i++) {
        nodes[i].startest(result);
    }
    return result;
};

/**
    @param {function(JNode, JNode): boolean} filter
    @param {JNode} root
    @param {JNodeset=} result
    @return {JNodeset}
*/
JNodeset.prototype.pred = function(filter, root, vars, funcs) {
    var nodes = this.nodes;
    //  FIXME: result || (( result = new JNodeset() ));
    var result = new JNodeset();
    for (var i = 0; i < nodes.length; i++) {
        var node = nodes[i];
        if ( filter(node, root, vars, funcs) ) {
            result.push(node);
        }
    }
    return result;
};

/**
    @param {number} index
    @return {JNodeset}
*/
JNodeset.prototype.index = function(index) {
    var node = this.nodes[index];

    if (node !== undefined) {
        return ( new JNodeset() ).push(node);
    }

    return this.empty;
};

/**
    @return {Array}
*/
JNodeset.prototype.toArray = function() {
    var r = [];
    var nodes = this.nodes;
    for (var i = 0; i < nodes.length; i++) {
        r.push( nodes[i].data );
    }
    return r;
};

JNodeset.prototype.scalar = function() {
    var nodes = this.nodes;
    return (nodes.length) ? nodes[0].scalar() : '';
};

/**
    @return {boolean}
*/
JNodeset.prototype.boolean = function() {
    var nodes = this.nodes;
    return (nodes.length) ? nodes[0].boolean() : false;
};

/**
    @param {JNodeset} nodeset
    @return {boolean}
*/
JNodeset.prototype.cmpN = function(nodeset) {
    var nodes = this.nodes;
    for (var i = 0, l = nodes.length; i < l; i++) {
        if ( nodes[i].cmpN(nodeset) ) {
            return true;
        }
    }
    return false;
};

JNodeset.prototype.cmpS = function(scalar) {
    var nodes = this.nodes;
    for (var i = 0, l = nodes.length; i < l; i++) {
        if ( nodes[i].cmpS(scalar) ) {
            return true;
        }
    }
    return false;
};

//  ---------------------------------------------------------------------------------------------------------------  //

no.JNode = JNode;
no.JNodeset = JNodeset;

//  ---------------------------------------------------------------------------------------------------------------  //

//  ---------------------------------------------------------------------------------------------------------------  //
//  Grammar
//  ---------------------------------------------------------------------------------------------------------------  //

//  ---------------------------------------------------------------------------------------------------------------  //
//  Grammar consts
//  ---------------------------------------------------------------------------------------------------------------  //

//  Types.
//
var TYPE_SCALAR = 'scalar';
var TYPE_NODESET = 'nodeset';
var TYPE_BOOL = 'boolean';

//  Priorities of binary operators.
//
var BINOPS = {
    '*': 6,
    '/': 6,
    '%': 6,
    '+': 5,
    '-': 5,
    '<=': 4,
    '>=': 4,
    '<': 4,
    '>': 4,
    '==': 3,
    '!=': 3,
    '&&': 2,
    '||': 1
};

//  ---------------------------------------------------------------------------------------------------------------  //
//  Grammar tokens
//  ---------------------------------------------------------------------------------------------------------------  //

var tokens = {};

//  ---------------------------------------------------------------------------------------------------------------  //

tokens.SELF = /^\.(?![a-zA-Z_*.[])/;
tokens.ROOT = /^\/(?![.[])/;
tokens.BINOP = /^(?:\+|-|\*|\/|%|==|!=|<=|>=|<|>|&&|\|\|)/;
tokens.UNOP = /^(?:\+|-|!)/;
tokens.DIGIT = /^[0-9]/;

tokens.ID = /^[a-zA-Z_][a-zA-Z0-9-_]*/;
tokens.NUMBER = /^[0-9]+(?:\.[0-9]+)?/;
tokens.CHARS = /^[^"{}\\]+/;

//  ---------------------------------------------------------------------------------------------------------------  //
//  Grammar rules
//  ---------------------------------------------------------------------------------------------------------------  //

var rules = {};

//  ---------------------------------------------------------------------------------------------------------------  //

//  expr := unary ( BIN_OP unary )*

rules.expr = function() {
    //  Here we have list of expressions (arguments) and operators.
    //  We need to group them according to operator's priorities.

    //  There are two stacks. One for operators:
    var ops = [];
    //  And one for arguments. There should be at least one argument so we parse it now:
    var args = [ this.parse('unary') ];
    this.skip();

    var op;
    //  Priority of operator on top of `ops`.
    //  In the beginning it's 0.
    var cp = 0;

    //  In the loop we do two operations:
    //
    //    * Shift: read one operator and one argument and put them in `ops` and `args`.
    //    * Reduce: pop all operators with priority greater or equal than given.
    //      For each operator pop two arguments, group them and push back to `args`.
    //
    //  For example: [ 'a', '*', 'b', '+', 'c' ].
    //
    //      args: [ 'a' ]               ops: []
    //      shift
    //      args: [ 'b', 'a' ]          ops: [ '*' ]
    //      reduce(5)
    //      args: [ '(a * b)' ]         ops: []
    //      shift
    //      args: [ 'c', '(a * b)' ]    ops: [ '+' ]
    //      reduce(0)
    //      args: [ '((a * b) + c)' ]   ops: []
    //
    while (( op = this.test('BINOP') )) {
        this.move(op.length);
        this.skip();

        var p = BINOPS[op];
        //  Next op has less or equal priority than top of `ops`.
        if (p <= cp) {
            //  Reduce.
            reduce(p);
        }
        //  Shift.
        ops.unshift(op);
        args.unshift( this.parse('unary') );
        this.skip();

        //  Update cp.
        cp = p;
    }
    //  Reduce all remaining operators.
    reduce(0);

    //  Result is on top of the `args`.
    return args[0];

    function reduce(p) {
        var op, left, right;
        //  If top of `ops` has greater or equal priority than `p` -- reduce it.
        while ( (( op = ops[0] )) && (BINOPS[op] >= p) ) {
            //  Pop two arguments.
            right = args.shift();
            left = args.shift();
            //  Push back result of `op`.
            args.unshift({
                _id: 'binop',
                //  Type of '+', '-', '*', '/', '%' is scalar. Boolean otherwise.
                _type: ('+-*/%'.indexOf(op) > -1) ? TYPE_SCALAR : TYPE_BOOL,
                //  If either of left or right is local, then binary expression is local too.
                _local: left._local || right._local,

                //  Do not forget to pop `op` out of `ops`.
                op: ops.shift(),
                left: left,
                right: right
            });
        }
    }
};

//  ---------------------------------------------------------------------------------------------------------------  //

//  unary := UNOP? unary | primary

rules.unary = function() {
    var op;
    if (( op = this.test('UNOP') )) {
        this.move();

        var expr = this.parse('unary');

        return {
            _id: 'unop',
            //  Type of '!' is boolean, '+' and '-' -- scalar.
            _type: (op === '!') ? TYPE_BOOL : TYPE_SCALAR,
            _local: expr._local,

            op: op,
            expr: expr
        };
    }

    return this.parse('primary');
};

//  ---------------------------------------------------------------------------------------------------------------  //

//  primary := string | jpath | subexpr | number | filter | var

rules.primary = function() {
    var la = this.la();

    switch (la) {
        case '"':
            return this.parse('string');

        case '.':
        case '/':
            return this.parse('jpath');

        case '(':
            return this.parse('subexpr');
    }

    if ( this.test('DIGIT') ) {
        return {
            _id: 'number',
            _type: TYPE_SCALAR,

            value: this.match('NUMBER')
        };
    }

    var name = this.match('ID');

    if ( this.test('.') ) {
        return {
            _id: 'filter',
            _type: TYPE_NODESET,

            name: name,
            jpath: this.parse('jpath')
        };
    }

    if ( this.test('(') ) {
        this.move();
        this.skip();

        var args = [];
        if ( !this.test(')') ) {
            args.push( this.parse('expr') );
            this.skip();

            while ( this.test(',') ) {
                this.move();
                this.skip();
                args.push( this.parse('expr') );
                this.skip();
            }
        }

        this.match(')');

        return {
            _id: 'func',
            _type: TYPE_SCALAR,

            name: name,
            args: args
        };
    }

    return {
        _id: 'var',
        _type: TYPE_NODESET,

        name: name
    };
};

//  ---------------------------------------------------------------------------------------------------------------  //

//  subexpr := '(' expr ')'

rules.subexpr = function() {
    this.move();
    this.skip();
    var expr = this.parse('expr');
    this.skip();
    this.match(')');

    return {
        _id: 'subexpr',
        _type: expr._type,
        _local: expr._local,

        expr: expr
    };
};

//  ---------------------------------------------------------------------------------------------------------------  //

//  jpath := '.' | '/' | '/'? step+

rules.jpath = function() {

    if ( this.test('SELF') ) {
        this.move();

        return {
            _id: 'self',
            _type: TYPE_NODESET,
            _local: true
        };
    }

    if ( this.test('ROOT') ) {
        this.move();

        return {
            _id: 'root',
            _type: TYPE_NODESET
        };
    }

    var abs;
    if ( this.test('/') ) {
        this.move();
        abs = true;
    }

    var steps = [];
    while (1) {
        var la = this.la();

        if (la === '.') {
            steps.push( this.parse('step') );
        } else if (la === '[') {
            var pred = this.parse('pred');
            if (pred._id === 'guard') {
                steps.unshift(pred);
            } else {
                steps.push(pred);
            }
        } else {
            break;
        }
    }

    return {
        _id: 'jpath',
        _type: TYPE_NODESET,
        _local: !abs,

        abs: abs,
        steps: steps
    };
};

//  ---------------------------------------------------------------------------------------------------------------  //

//  step := '.' pred | '.*' | '.' ID

rules.step = function() {
    this.move();

    var la = this.la();

    if (la === '[') {
        return this.parse('pred');
    }

    if (la === '*') {
        this.move();

        return {
            _id: 'star'
        };
    }

    return {
        _id: 'nametest',

        nametest: this.match('ID')
    };
};

//  ---------------------------------------------------------------------------------------------------------------  //

//  pred := '[' expr ']'

rules.pred = function() {
    this.move();
    this.skip();
    var expr = this.parse('expr');
    this.skip();
    this.match(']');

    //  There are three types of "predicates":
    //
    //    * Predicate. `expr` is local (i.e. it depends on current context).
    //      Basically it means that it contains at least one non-absolute jpath.
    //
    //    * Global predicate (or guard). `expr` is not local but it has boolean type.
    //
    //    * Index. Global non-boolean expression.
    //
    var _id = 'index';
    if (expr._local) {
        _id = 'pred';
    } else if (expr._type === TYPE_BOOL) {
        _id = 'guard';
    }

    return {
        _id: _id,

        expr: expr
    };
};

//  ---------------------------------------------------------------------------------------------------------------  //

rules.string = function() {
    this.match('"');
    var content = this.parse('string_content');
    this.match('"');

    return content;
};

var disymbols = {
    '{{': '{',
    '}}': '}',
    '\\"': '"',
    '\\\\': '\\'
    //  FIXME: Нужны ли тут \', \n, \t и т.д.?
};

rules.string_content = function() {
    var parts = [];
    var c;
    var str = '';

    while (this.s) {
        c = disymbols[ this.la(2) ];
        if (c) {
            str += c;
            this.move(2);
        } else {
            c = this.la();

            if (c === '"') {
                break;
            }

            if (c === '\\') {
                str += c;
                this.move();
            } else if (c === '{') {
                pushStr();

                this.move();
                this.skip();
                parts.push( this.parse('expr') );
                this.skip();
                this.match('}');
            } else {
                str += this.match('CHARS');
            }
        }
    }
    pushStr();

    //  Это пустая строка.
    if (!parts.length) {
        parts.push( stringLiteral('') );
    }

    return {
        _id: 'string',
        _type: TYPE_SCALAR,

        value: parts
    };

    function pushStr() {
        if (str) {
            parts.push( stringLiteral(str) );
            str = '';
        }
    }

    function stringLiteral(s) {
        return {
            _id: 'string_literal',
            _type: TYPE_SCALAR,

            value: s
        };
    }
};


//  ---------------------------------------------------------------------------------------------------------------  //

var parser = new no.Parser(rules, tokens);

var _cache = {};

//  ---------------------------------------------------------------------------------------------------------------  //
//  no.jpath
//  ---------------------------------------------------------------------------------------------------------------  //

no.jpath = function(expr, data, vars, funcs) {
    return no.jpath.toScalar( no.jpath.expr(expr)(data, vars, funcs) );
};

no.jpath.raw = function(expr, data, vars, funcs) {
    return no.jpath.expr(expr)(data, vars, funcs);
};

no.jpath.scalar = function(expr) {
    var compiled = no.jpath.expr(expr);

    return function(data, vars, funcs) {
        return no.jpath.toScalar( compiled(data, vars, funcs) );
    };
};

no.jpath.boolean = function(expr) {
    var compiled = no.jpath.expr(expr);

    return function(data, vars, funcs) {
        return no.jpath.toBoolean( compiled(data, vars, funcs) );
    };
};

no.jpath.string = function(str) {
    return compileString(str, 'string_content');
};

//  Возвращает функцию с сигнатурой:
//
//      function(data, vars, funcs) { ... }
//
no.jpath.expr = function(expr) {
    var type = typeof expr;

    if (type === 'string') {
        return compileString(expr, 'expr');
    }

    //  Object or array.
    if (expr && type === 'object') {
        return ( Array.isArray(expr) ) ? compileArray(expr) : compileObject(expr);
    }

    //  Value.
    return function() {
        return expr;
    };
};

//  ---------------------------------------------------------------------------------------------------------------  //

no.jpath.toScalar = function(result) {
    if (result instanceof JNode) {
        return result.data;
    } else if (result instanceof JNodeset) {
        return ( result.isEmpty() ) ? undefined : result.toArray();
    } else {
        return result;
    }
};

no.jpath.toBoolean = function(result) {
    if (result instanceof JNode || result instanceof JNodeset) {
        return result.boolean();
    } else {
        return result;
    }
};

//  ---------------------------------------------------------------------------------------------------------------  //

function compileString(expr, id) {
    var key = expr + '::' + id;

    //  FIXME: Разложить по разным кэшам?
    var cached = _cache[key];

    if (!cached) {
        //  expr isn't cached.
        cached = _cache[key] = compile( parser.start(expr, id) );
    }

    return cached;
}

function compileObject(obj) {
    var items = {};

    for (var key in obj) {
        items[key] = no.jpath.expr( obj[key] );
    }

    //  FIXME: Компилировать сразу в функцию без цикла?
    return function(data, vars, funcs) {
        var r = {};

        for (var key in items) {
            r[key] = no.jpath.toScalar( items[key](data, vars, funcs) );
        }

        return r;
    };
}

function compileArray(arr) {
    var items = [];

    var l = arr.length;
    for (var i = 0; i < l; i++) {
        items.push( no.jpath.expr( arr[i] ) );
    }

    //  FIXME: Компилировать сразу в функцию без цикла?
    return function(data, vars, funcs) {
        var r = [];

        for (var i = 0; i < l; i++) {
            r.push( no.jpath.toScalar( items[i](data, vars, funcs) ) );
        }

        return r;
    };
}

//  ---------------------------------------------------------------------------------------------------------------  //

//  Compiled jpaths cache.
var _jpaths = {};

//  ---------------------------------------------------------------------------------------------------------------  //
//  Compilation
//  ---------------------------------------------------------------------------------------------------------------  //

function compile(ast) {
    var exprs = [];

    var p = (ast._id === 'jpath') ? jpath2func(ast, exprs) : expr2func(ast, exprs);

    var r = '';
    for (var i = 0; i <= p; i++) {
        r += 'function t' + i + '(node, root, vars, funcs) {\n' + exprs[i] + '\n}\n\n';
    }
    r += 'return function(data, vars, funcs) {\nvar node = new no.JNode(data);\nreturn t' + p + '(node, node, vars, funcs);\n}\n';

    //  console.log(r);
    return Function('no', r)(no);
}

//  ---------------------------------------------------------------------------------------------------------------  //

function expr2func(ast, exprs) {
    var r = 'return (' + ast2js(ast, exprs) + ');';

    return exprs.push(r) - 1;
}


function jpath2func(ast, exprs) {
    var r = '';
    if (ast.abs) {
        //  If it's an absolute jpath, then we should use root instead of data.
        r += 'node = root;\n';
    }

    var steps = ast.steps;
    for (var i = 0, l = steps.length; i < l; i++) {
        var step = steps[i];

        var id = step._id;
        switch (id) {
            case 'nametest':
                r += 'node = node.nametest("' + step.nametest + '");\n';
                break;

            case 'star':
                r += 'node = node.startest();\n';
                break;

            case 'pred':
            case 'index':
                //  Cast `expr` to boolean or scalar.
                step.expr._as = (id === 'pred') ? TYPE_BOOL : TYPE_SCALAR;
                var p = expr2func(step.expr, exprs);
                r += 'node = node.' + id + '(t' + p + ', root, vars, funcs);\n';
                break;

            case 'guard':
                r += 'if (!(' + ast2js(step.expr, exprs) + ')) { return node.empty; }\n';
                break;
        }

        if (id !== 'guard') {
            r += 'if (node.isEmpty()) { return node.empty; }\n';
        }
    }

    r += 'return node;';

    return exprs.push(r) - 1;
}

//  ---------------------------------------------------------------------------------------------------------------  //

function ast2js(ast, exprs) {
    var js;

    switch (ast._id) {

        case 'root':
            js = 'root';
            break;

        case 'self':
            js = 'node';
            break;

        case 'number':
            js = ast.value;
            break;

        case 'string_literal':
            js = JSON.stringify(ast.value);
            break;

        case 'string':
            //  FIXME: Убрать map.
            js = '(' + ast.value.map(function(value) {
                value._as = TYPE_SCALAR;
                return ast2js(value, exprs);
            }).join(' + ') + ')';
            break;

        case 'var':
            js = '(new no.JNode(vars["' + ast.name + '"]))';
            break;

        case 'func':
            js = 'funcs["' + ast.name + '"](';
            for (var i = 0, l = ast.args.length; i < l; i++) {
                var arg = ast.args[i];
                arg._as = TYPE_SCALAR;
                js += (i) ? ',' : '';
                js += ast2js(arg, exprs);
            }
            js += ')';
            break;

        case 'unop':
            //  Cast expr to boolean ('!') or scalar ('+', '-').
            ast.expr._as = (ast.op === '!') ? TYPE_BOOL : TYPE_SCALAR;

            js = ast.op + '(' + ast2js(ast.expr, exprs) + ')';
            break;

        case 'binop':
            var l = ast.left;
            var r = ast.right;

            var lt = l._type;
            var rt = r._type;

            var op = ast.op;
            var as;
            switch (op) {
                case '&&':
                case '||':
                    if (lt === TYPE_BOOL && rt === TYPE_BOOL) {
                        //  (.foo > 42) || (.bar < 42)
                        //  Both operands should be boolean.
                        as = TYPE_BOOL;
                    } else {
                        //  .foo || 42
                        as = TYPE_SCALAR;
                    }
                    break;

                case '==':
                case '!=':
                    if ( lt !== rt && (lt === TYPE_BOOL || rt === TYPE_BOOL) ) {
                        //  We compare nodeset or scalar to boolean.
                        //  Both operands should be boolean then.
                        as = TYPE_BOOL;
                    }
                    break;

                default:
                    //  Both operands should be scalar.
                    as = TYPE_SCALAR;
            }
            if (as) {
                //  Cast both operands if `as`.
                l._as = r._as = as;
            }

            var ljs = ast2js(l, exprs);
            var rjs = ast2js(r, exprs);

            if (op === '==' || op === '!=') {
                //  Special case: compare nodeset to nodeset or scalar.
                if (lt === TYPE_NODESET || rt === TYPE_NODESET) {
                    //  (nodeset, nodeset) or (nodeset, scalar)
                    if (lt === TYPE_SCALAR) {
                        var t = rjs;
                        rjs = ljs;
                        ljs = t;
                    }

                    var type = (lt === rt) ? 'N' : 'S';
                    js = '(' + ljs + ').cmp' + type + '(' + rjs + ')';
                }
                if (js && op === '!=') {
                    js = '!(' + js + ')';
                }
            }

            if (js === undefined) {
                //  Usual binary operation.
                js = '(' + ljs + ' ' + ast.op + ' ' + rjs + ')';
            }

            break;

        case 'subexpr':
            js = '(' + ast2js(ast.expr, exprs) + ')';
            break;

        case 'jpath':
            var p = jpath2func(ast, exprs);
            js = 't' + p + '(node, root, vars, funcs)';
            break;

        case 'filter':
            var p = jpath2func(ast.jpath, exprs);
            js = 't' + p + '(new no.JNode(vars["' + ast.name + '"]), root, vars, funcs)';
            break;
    }

    //  Typecasting.
    if (ast._as && ast._as !== ast._type) {
        if (ast._type === TYPE_NODESET) {
            js = '(' + js + ').' + ast._as + '()';
        } else if (ast._type === TYPE_SCALAR) {
            js = '!!(' + js + ')';
        }
    }

    return js;
}

//  ---------------------------------------------------------------------------------------------------------------  //

var _setters = {};

no.jpath.set = function(jpath, data, value) {
    var compiled = _setters[jpath] || (( _setters[jpath] = compileSetter(jpath) ));

    return compiled(data, value);
};

function compileSetter(jpath) {
    //  В jpath строка вида '.foo.bar'.

    var parts = jpath.split('.');

    //  Первый элемент массива игнорируем (там пустая строка).
    var i = 1;
    //  Последний будем обрабатывать особо. После цикла.
    var l = parts.length - 1;

    var body = 'var r = data; var t;';
    for (; i < l; i++) {
        //  Делаем "шаг". Т.е. примерно `r = r['foo'];`.
        body += 't = r["' + parts[i] + '"];';
        //  Если после "шага" получился null или undefined, создаем на этом месте пустой объект.
        body += 'if (t == null) { t = r["' + parts[i] + '"] = {}; }';
        body += 'r = t;';
    }
    //  Последний шаг — присваиваем значение.
    body += 'r["' + parts[i] + '"] = value;';
    body += 'return data;';

    return new Function('data', 'value', body);
}

//  ---------------------------------------------------------------------------------------------------------------  //

})();

//  ---------------------------------------------------------------------------------------------------------------  //


},{"./no.base.js":19,"./no.parser.js":24}],23:[function(require,module,exports){
var no = no || require('./no.base.js');

//  ---------------------------------------------------------------------------------------------------------------  //

no.object = {};

//  ---------------------------------------------------------------------------------------------------------------  //

no.object.map = function(object, callback) {
    var r = {};

    for (var key in object) {
        var value = callback( object[key], key );

        if (value !== undefined) {
            r[key] = value;
        }
    }

    return r;
};

//  ---------------------------------------------------------------------------------------------------------------  //


},{"./no.base.js":19}],24:[function(require,module,exports){
var no = no || require('./no.base.js');

//  ---------------------------------------------------------------------------------------------------------------  //

no.Parser = function(rules, tokens) {
    this._rules = rules;
    this._tokens = tokens || {};
};

//  ---------------------------------------------------------------------------------------------------------------  //

no.Parser.prototype.start = function(input, id) {
    this.input = input;
    this.p = 0;
    this.s = input; // this.s === this.input.substr(this.p);

    var ast = this.parse(id);

    if (this.s) {
        this.error('End of string expected');
    }

    return ast;
};

//  ---------------------------------------------------------------------------------------------------------------  //

no.Parser.prototype.parse = function(id, params) {
    var rule = this._rules[id];

    var p = this.p;

    var ast = rule.call(this, params);

    ast._start = p;
    ast._end = this.p;
    ast._input = this.input;

    return ast;
};

no.Parser.prototype.test = function(id) {
    var token = this._tokens[id];

    if (token) {
        var r = token.exec(this.s);
        return r && r[0];
    }

    if ( this.la(id.length) === id ) {
        return id;
    }
};

no.Parser.prototype.match = function(id) {
    var r = this.test(id);

    if (!r) {
        this.error('Token ' + id + ' expected');
    }

    this.move(r.length);

    return r;
};

//  ---------------------------------------------------------------------------------------------------------------  //

no.Parser.prototype.la = function(n) {
    return this.s.substr(0, n || 1);
};

no.Parser.prototype.move = function(n) {
    n || (( n = 1 ));
    this.s = this.s.substr(n);
    this.p += n;
};

no.Parser.prototype.skip = function() {
    var r = /^\s+/.exec(this.s);
    if (r) {
        this.move( r[0].length );
    }
};

//  ---------------------------------------------------------------------------------------------------------------  //

no.Parser.prototype.error = function(msg) {
    throw Error(msg + ' at ' + this.p + ': ' + this.s);
};

//  ---------------------------------------------------------------------------------------------------------------  //


},{"./no.base.js":19}],25:[function(require,module,exports){
var no = no || require('./no.base.js');

if  ( no.de ) {
    require('./no.events.js');

    module.exports = no;
}

//  ---------------------------------------------------------------------------------------------------------------  //

//  Объект, обещающий вернуть некий результат в будущем.
//  Обычно результат получается в результате некоторых асинхронных действий.
//
//  В сущности, это аналог обычных callback'ов, но более продвинутый.
//  А точнее, это событие, генерящееся при получении результата и на которое
//  можно подписаться:
//
//      var promise = new no.Promise();
//
//      promise.done(function(result) { // Подписываемся на получение результата.
//          console.log(result); // 42
//      });
//
//      // И где-то дальше:
//      ... promise.resolve(42); // Рассылаем результат всем подписавшимся.
//
//  Можно подписать на результат несколько callback'ов:
//
//      promise.done(function(result) { // Все методы done, fail, resolve, reject и wait -- chainable.
//          // Сделать что-нибудь.
//      }).done(function(result) {
//          // Сделать что-нибудь еще.
//      });
//
//  Можно подписываться на результат даже после того, как он уже получен:
//
//      var promise = new no.Promise();
//      promise.resolve(42);
//
//      promise.done(function(result) { // callback будет выполнен немедленно.
//          console.log(result); // 42
//      });
//
//  Имея список из нескольких promise'ов, можно создать новый promise,
//  которое зарезолвится только после того, как зарезолвятся все promise'ы из списка:
//
//      var p1 = new no.Promise();
//      var p2 = new no.Promise();
//
//      var p = no.Promise.wait([ p1, p2 ]);
//      p.done(function(result) { // В result будет массив из результатов p1 и p2.
//          console.log(result); // [ 42, 24 ]
//      });
//
//      p2.resolve(24); // Порядок, в котором резолвятся promise'ы из списка не важен.
//                      // При это в результате порядок будет тем же, что и promise'ы в wait([ ... ]).
//      p1.resolve(42);
//
//  К методам done/resolve есть парные методы fail/reject для ситуации, когда нужно вернуть
//  не результат, а какую-нибудь ошибку.
//
//      var p1 = new no.Promise();
//      var p2 = new no.Promise();
//
//      var p = no.Promise.wait([ p1, p2 ]);
//      p.fail(function(error) {
//          console.log(error); // 'Foo!'
//      });
//
//      p1.resolve(42);
//      p2.reject('Foo!'); // Если режектится любой promise из списка, p тоже режектится.
//
no.Promise = function() {
    this._init();
};

no.extend(no.Promise.prototype, no.Events);

//  ---------------------------------------------------------------------------------------------------------------  //

no.Promise.prototype._init = function() {
    this._dones = [];
    this._fails = [];
};

//  ---------------------------------------------------------------------------------------------------------------  //

//  NOTE: Да, ниже следует "зловещий копипаст". Методы done/fail и resolve/reject совпадают почти дословно.
//  Альтернатива в виде прокладки, реализующей только done/resolve (как, например, в jQuery), мне не нравится.


//  Добавляем callback, ожидающий обещанный результат.
//  Если promise уже зарезолвился, callback выполняется немедленно.
//
no.Promise.prototype.done = function(done) {
    if (!this._rejected) {
        if (this._resolved) {
            done(this._result);
        } else {
            this._dones.push(done);
        }
    }

    return this;
};

//  Тоже самое, что и done.
//
no.Promise.prototype.fail = function(fail) {
    if (!this._resolved) {
        if (this._rejected) {
            fail(this._error);
        } else {
            this._fails.push(fail);
        }
    }

    return this;
};

no.Promise.prototype.then = function(done, fail) {
    this.done(done);
    this.fail(fail);

    return this;
};

no.Promise.prototype.always = function(always) {
    this.done(always);
    this.fail(always);

    return this;
};

//  ---------------------------------------------------------------------------------------------------------------  //

//  Передать результат всем подписавшимся.
//
no.Promise.prototype.resolve = function(result) {
    if ( !(this._resolved || this._rejected) ) {
        this._resolved = true;
        this._result = result;

        var dones = this._dones;
        for (var i = 0, l = dones.length; i < l; i++) {
            dones[i](result);
        }
        this._dones = this._fails = null;
    }

    return this;
};

//  Тоже самое, что и resolve.
//
no.Promise.prototype.reject = function(error) {
    if ( !(this._rejected || this._resolved) ) {
        this._rejected = true;
        this._error = error;

        var elses = this._fails;
        for (var i = 0, l = elses.length; i < l; i++) {
            elses[i](error);
        }
        this._dones = this._fails = null;
    }

    return this;
};

//  ---------------------------------------------------------------------------------------------------------------  //

//  Проксируем resolve/reject в другой promise.
//
no.Promise.prototype.pipe = function(promise) {
    this.done(function(result) {
        promise.resolve(result);
    });
    this.fail(function(error) {
        promise.reject(error);
    });

    return this;
};

//  ---------------------------------------------------------------------------------------------------------------  //

//  Создаем из массива promise'ов новый promise, который зарезолвится только после того,
//  как зарезолвятся все promise'ы из списка. Результатом будет массив результатов.
//
no.Promise.wait = function(promises) {
    var wait = new no.Promise();

    var results = [];

    var l = promises.length;
    //  Если нет промисов, то сразу возвращаем зарезолвленный.
    if (l === 0) {
        return wait.resolve(results);
    }

    var n = l;
    for (var i = 0; i < l; i++) {
        //  Замыкание, чтобы сохранить значения promise и i.
        (function(promise, i) {

            promise.done( function(result) {
                results[i] = result;
                if (!--n) {
                    wait.resolve(results);
                }
            } );

            promise.fail( function(error) {
                //  FIXME: Может тут нужно сделать results = null; ?
                wait.reject(error);
            } );

        })(promises[i], i);

    }

    return wait;
};

//  ---------------------------------------------------------------------------------------------------------------  //

no.promise = function(promises) {
    if (promises) {
        return no.Promise.wait(promises);
    }

    return new no.Promise();
};

no.Promise.resolved = function(result) {
    return ( new no.Promise() ).resolve(result);
};

no.Promise.rejected = function(result) {
    return ( new no.Promise() ).reject(result);
};

//  ---------------------------------------------------------------------------------------------------------------  //


},{"./no.base.js":19,"./no.events.js":21}],26:[function(require,module,exports){
var no = no || require('./no.base.js');

if ( no.de ) {
    module.exports = no;
}

//  ---------------------------------------------------------------------------------------------------------------  //

no.string = {};

//  ---------------------------------------------------------------------------------------------------------------  //

no.string.repeat = function(s, n) {
    if (n === 0) { return ''; }

    s = s.toString();

    //  FIXME: Померять. Может лучше if, или вообще без этого блока.
    switch (n) {
        case 1:
            return s;
        case 2:
            return s + s;
        case 3:
            return s + s + s;
    }

    var result = '';

    while  (n > 1) {
        if (n & 1) {
            result += s;
        }
        s += s;
        n >>= 1;
    };

    return result + s;
};

//  ---------------------------------------------------------------------------------------------------------------  //

no.string.pad_left = function(s, n, ch) {
    if (n === 0) { return s; }

    s = s.toString();

    var l = n - s.length;
    if (l <= 0) {
        return s;
    }

    ch = ch || ' ';

    //  FIXME: Померять. Может лучше if, или вообще без этого блока.
    switch (l) {
        case 1:
            return ch + s;
        case 2:
            return ch + ch + s;
    }

    return no.string.repeat(ch, l) + s;
};

//  ---------------------------------------------------------------------------------------------------------------  //


},{"./no.base.js":19}],27:[function(require,module,exports){
//  ---------------------------------------------------------------------------------------------------------------  //
//  parse-tools
//  ---------------------------------------------------------------------------------------------------------------  //

var pt = require('./pt.js');

//  ---------------------------------------------------------------------------------------------------------------  //

require('./pt.ast.js');
require('./pt.codegen.js');
require('./pt.factory.js');
require('./pt.grammar.js');
require('./pt.inputstream.js');
require('./pt.parser.js');

//  ---------------------------------------------------------------------------------------------------------------  //

module.exports = pt;

//  ---------------------------------------------------------------------------------------------------------------  //


},{"./pt.ast.js":28,"./pt.codegen.js":29,"./pt.factory.js":30,"./pt.grammar.js":31,"./pt.inputstream.js":32,"./pt.js":33,"./pt.parser.js":34}],28:[function(require,module,exports){
//  ---------------------------------------------------------------------------------------------------------------  //
//  pt.AST
//  ---------------------------------------------------------------------------------------------------------------  //

require('no.colors');

//  ---------------------------------------------------------------------------------------------------------------  //

var pt = require('./pt.js');

//  ---------------------------------------------------------------------------------------------------------------  //

pt.AST = function() {};

//  ---------------------------------------------------------------------------------------------------------------  //

pt.AST.prototype._init = function() {};

//  ---------------------------------------------------------------------------------------------------------------  //

pt.AST.prototype.error = function(s) {
    var pos = this.where;
    throw new Error( 'ERROR: ' + s + '\n' + pos.input.where(pos) );
};

//  ---------------------------------------------------------------------------------------------------------------  //

//  FIXME: Этот базовый метод в таком виде не используется вообще.
//  Он полностью перекрыт в yate/lib/ast.js.
/*
pt.AST.prototype.make = function(id, params) {
    return this.factory.make(id, this.where, params);
};
*/

//  ---------------------------------------------------------------------------------------------------------------  //

pt.AST.prototype.trigger = function(event, params) {
    var handlers = this.options.events[event];

    var stop;
    var r;

    if (handlers) {
        for (var i = 0, l = handlers.length; i < l; i++) {
            r = handlers[i].call(this, params);
            if (r === false) {
                stop = true;
            }
        }
    }

    if (!stop) {
        this.apply(function(ast, params) {
            ast.trigger(event, params);
        }, params);
    }

    return r;
};

pt.AST.prototype.apply = function(callback, params) {
    var props = this.p;
    for (var key in props) {
        var child = props[key];
        if (child instanceof pt.AST) {
            callback(child, params);
        }
    }
};

pt.AST.prototype.walkdo = function(callback, params, pKey, pObject) {
    var props = this.p;
    for (var key in props) {
        var child = props[key];
        if (child instanceof pt.AST) {
            child.walkdo(callback, params, key, props);
        }
    }

    callback(this, params, pKey, pObject);
};

pt.AST.prototype.dowalk = function(callback, params, pKey, pObject) {
    callback(this, params, pKey, pObject);

    var props = this.p;
    for (var key in props) {
        var child = props[key];
        if (child instanceof pt.AST) {
            child.dowalk(callback, params, key, props);
        }
    }
};

//  ---------------------------------------------------------------------------------------------------------------  //

pt.AST.prototype.w_setParents = function(parent) {
    this.parent = parent || null;
    var that = this;
    this.apply(function(ast, parent) {
        ast.w_setParents(that);
    });
};

pt.AST.prototype.is = function(type) {
    for (var i = 0, l = arguments.length; i < l; i++) {
        if ( this instanceof this.factory.get( arguments[i] ) ) {
            return true;
        }
    }
};

//  ---------------------------------------------------------------------------------------------------------------  //

pt.AST.prototype.toString = function() {
    var r = [];
    var props = this.p;
    for (var key in props) {
        var child = props[key];
        if (child !== undefined) {
            if (child instanceof pt.AST) {
                var s = child.toString();
                if (s) {
                    r.push( key.blue.bold + ': ' + s);
                }
            } else {
                r.push( key.blue.bold + ': ' + JSON.stringify(child) );
            }
        }
    }
    if (r.length) {
        var s = this.id.bold + '( ' + this.getType().lime;
        if (this.AsType) {
            s += ' -> '.lime + this.AsType.lime;
        }
        s += ' )\n' + r.join('\n').replace(/^/gm, '    ');
        return s;
    }
    return '';
};

//  ---------------------------------------------------------------------------------------------------------------  //


},{"./pt.js":33,"no.colors":35}],29:[function(require,module,exports){
var pt = require('./pt.js');

//  ---------------------------------------------------------------------------------------------------------------  //
//  pt.Codegen
//  ---------------------------------------------------------------------------------------------------------------  //

pt.Codegen = function(lang, filename, content) {
    this.lang = lang;
    this._templates = {};

    if (!content) {
        content = require('fs').readFileSync(filename).toString();
    }

    this._readTemplates(content);
};

//  ---------------------------------------------------------------------------------------------------------------  //

//  Добавляем шаблон в хранилище.
pt.Codegen.prototype._addTemplate = function(id, template) {
    var templates = this._templates[id] || (( this._templates[id] = [] ));
    templates.push(template);
};

//  Возвращаем все шаблоны для данного id.
pt.Codegen.prototype._getTemplate = function(id) {
    return this._templates[id] || [];
};

//  ---------------------------------------------------------------------------------------------------------------  //

//  Читаем шаблоны из файла и складываем их в хранилище.
pt.Codegen.prototype._readTemplates = function(content) {
    //  Удаляем комментарии -- строки, начинающиеся на //.
    content = content.replace(/^\/\/.*\n/gm, '');

    // Разбиваем на отдельные шаблоны.
    var parts = content.match(/^\S.*\n(\n|    .*\n)+/gm);

    for (var i = 0, l = parts.length; i < l; i++) {
        var part = parts[i];

        //  Каждый шаблон устроен следующим образом:
        //
        //      description
        //          body
        //
        //  description -- это одна строка, состоящая из имени шаблона, моды и предиката. Например:
        //
        //      item :content [ this.Count > 0 ]
        //
        //  При этом только имя обязательно
        //
        //  body -- это текст, состоящий либо из пустых строк, либо из строк, отбитых четырьмя пробелами.

        var r = /^([\w-]+|\*)\ *(:[\w-]+)?\ *(\[.*\])?\n([\S\s]*)$/.exec(part);

        if (!r) {
            throw new Error('Ошибка синтаксиса шаблона:\n' + part);
        }

        //  id = name + mode (например, item:content или item:, если моды нет).
        var id = r[1] + (r[2] || ':');

        var predicate = r[3];
        if (predicate) {
            predicate = predicate.slice(1, -1);
            //  Отрезаем '[' и ']'.
            predicate = new Function('a', 'p', 'f', 'return !!(' + predicate + ');' );
        }

        //  Убираем отступ и переводы строк.
        var body = r[4]
            .replace(/^    /gm, '')
            .replace(/^\n+/, '')
            .replace(/\n+$/, '');

        this._addTemplate(id, {
            name: r[1],
            mode: r[2],
            predicate: predicate,
            body: body
        });
    }
};

//  ---------------------------------------------------------------------------------------------------------------  //

//  Находим подходящий шаблон, соответствующий паре name/mode. И заполняем его данными из ast.
pt.Codegen.prototype.generate = function(name, ast, mode) {
    var suffix = ':' + (mode || '');

    //  Берем все шаблоны для foo:bar и для *:bar
    var templates = []
        .concat( this._getTemplate(name + suffix) )
        .concat( this._getTemplate('*' + suffix) );

    //  Применяем первый подходящий (вернувший что-нибудь) шаблон.
    for (var i = 0, l = templates.length; i < l; i++) {
        var r = this._doTemplate( templates[i], ast );
        if (r !== undefined) { return r; }
    }
};

//  ---------------------------------------------------------------------------------------------------------------  //

//  Собственно код, который заполняет шаблон данными.
pt.Codegen.prototype._doTemplate = function(template, ast) {

    //  Если есть предикат, проверяем его истинность.
    var predicate = template.predicate;
    if ( predicate && !predicate(ast, ast.p, ast.f) ) {
        return;
    }

    var lines = template.body.split(/\n/);
    var result = [];

    var skip;

    for (var i = 0, l = lines.length; i < l; i++) {

        var line = lines[i];

        //  Пустые строки пропускаем только если прямо перед ними не было "пустой" doLine() (см. ниже).
        if (/^\s*$/.test(line)) {
            if (!skip) {
                result.push(line);
            }
            continue;
        }
        skip = false;

        //  Отрезаем начальный отступ. Он будет добавлен обратно после раскрытия всех макросов.
        var r = line.match(/^(\s*)(.*)\s*$/);
        var indent = r[1];
        line = r[2];

        //  Раскрываем макросы в строке.
        line = this._doLine(line, ast);
        if (!line) {
            //  Строка после раскрытия всех макросов стала пустой.
            //  Пропускаем ее и все проследующие пустые строки.
            skip = true;
            continue;
        }

        /*
            //  FIXME: Из-за бага в node/v8 портятся некоторые строки.

            //  Индентим то, что получилось.
            //  line = line.toString().replace(/^/gm, indent);
        */
        //  Индентим то, что получилось. Ручная версия.
        var _lines = line.toString().split('\n');
        for (var j = 0, m = _lines.length; j < m; j++) {
            _lines[j] = indent + _lines[j];
        }
        line = _lines.join('\n');

        result.push(line);
    }

    return result.join('\n')
        //  Чтобы вставить пробел в начале строки, его приходится эскейпить в виде '\ '.
        .replace(/\\\ /g, ' ')
        .replace(/^\ +$/gm, '')
        .replace(/^\n+/, '')
        .replace(/\n+$/, '');

};

//  Раскрываем макросы в строке. Макросы начинаются символом % и дальше более-менее похожи на xpath/jpath. Варианты:
//
//      %{ Foo }        -- если ast.Foo это скаляр, то вывести его, если это объект, то вызвать метод ast.p.Foo.code(lang).
//      %{ Foo :mode }  -- тоже самое, но в code передается еще и mode: ast.p.Foo.code(lang, mode).
//      %{ Foo.Bar }    -- тоже самое, но про ast.p.Foo.p.Bar.
//      %{ . :mode }    -- обработать этот же ast еще раз, но с другой модой.
//      %{ foo() }      -- результат ast.foo().
//      %{ Foo.bar() }  -- результат ast.p.Foo.bar() (в предположении, что ast.p.Foo объект).
//
pt.Codegen.prototype._doLine = function(line, ast) {
    var r = line.split(/(\s*%{.*?})/);

    for (var i = 1, l = r.length; i < l; i += 2) {
        r[i] = this._doMacro(r[i], ast);
    }

    return r.join('')
        //  FIXME: А нужно ли это вообще? Из-за этого портятся string_literal.
        .replace(/^\s*/, '')
        .replace(/\s*$/, '');

};

pt.Codegen.prototype._doMacro = function(macro, ast) {
    var r = /^(\s*)%{\s*(\.|[\w~-]+(?:\.[\w-]+)*)(\(\))?\s*(?::([\w-]+))?\s*}$/.exec(macro);

    if (!r) {
        throw new Error('MACRO ERROR: ' + macro);
    }

    var spaces = r[1];
    var path = r[2].split('.');
    var call = r[3];
    var mode = r[4];

    if (call) {
        call = path.pop();
    }

    //  Вычисляем path относительно ast (например, 'Foo.Bar' -> ast.p.Foo.p.Bar).
    var value = ast;
    var step;
    while ( value && (( step = path.shift() )) ) {
        if (step === '~') {
            value = value.parent;
            continue;
        }
        if (step !== '.') {
            value = value.p[step];
        }
    }
    if (value === undefined) { value = ''; }

    if (typeof value === 'object') {
        if (call) {
            value = value[call]();
        } else {
            value = value.code(this.lang, mode);
        }
    }

    return (value !== '') ? spaces + value : '';
};

//  ---------------------------------------------------------------------------------------------------------------  //


},{"./pt.js":33,"fs":12}],30:[function(require,module,exports){
var pt = require('./pt.js');

var no = require('nommon');

//  ---------------------------------------------------------------------------------------------------------------  //
//  pt.Factory
//  ---------------------------------------------------------------------------------------------------------------  //

pt.Factory = function(base, asts) {
    this.asts = asts;
    this.ctors = {
        '': base
    };
};

//  ---------------------------------------------------------------------------------------------------------------  //

pt.Factory.prototype.make = function(id, where, params) {
    var ctor = this.get(id);
    var ast = new ctor();

    //  Хранилища для "свойств" и "флагов".
    //  Первое -- это то, что создает парсер и что потом доступно в шаблонах кодогенерации.
    //  Второе -- разные дополнительные вычисляемые свойства, которые используются в предикатах кодогенератора.
    ast.p = {};
    ast.f = {};

    //  Точка во входном потоке, соответствующая этому AST.
    ast.where = where;

    //  Вызываем "конструктор". Настоящие конструктор пустой для упрощения наследования.
    ast._init(params);

    return ast;
};

pt.Factory.prototype.get = function(id) {
    var ctor = this.ctors[id];

    if (!ctor) {
        ctor = function() {};

        var proto = this.asts[id] || {};
        var options = proto.options = proto.options || {};

        var base = this.get(options.base || '');

        var that = this;

        var mixin = no.array.map(
            no.array(options.mixin),
            function(id) {
                return that.asts[id];
            }
        );
        mixin.push(proto);

        no.inherit(ctor, base, mixin);

        ctor.prototype.id = id;
        ctor.prototype.factory = this;

        this.ctors[id] = ctor;

        //  В options.events может находиться такая структура:
        //
        //  events: {
        //      'cast': [
        //          'oncast',
        //          function(evt, params) { ... }
        //      ],
        //      ...
        //  }
        //
        options.events = no.object.map(
            options.events || {},
            function(handlers) {
                //  В handlers может быть строка, означающая название метода, или функция.
                //  Или же там может быть массив строк и функций.
                return no.array.map(
                    //  Делаем массив, если было просто значение.
                    no.array(handlers),
                    function(handler) {
                        return (typeof handler === 'string') ? that[handler] : handler;
                    }
                );
            }
        );
    }

    return ctor;
};

//  ---------------------------------------------------------------------------------------------------------------  //


},{"./pt.js":33,"nommon":17}],31:[function(require,module,exports){
var pt = require('./pt.js');

//  ---------------------------------------------------------------------------------------------------------------  //
//  pt.Grammar
//  ---------------------------------------------------------------------------------------------------------------  //

pt.Grammar = function(grammar) {
    this.patterns = {};
    this.skippers = {};

    this.addTokens(grammar.tokens);
    this.addKeywords(grammar.keywords);
    this.addRules(grammar.rules);
    this.addSkippers(grammar.skippers);
};

//  ---------------------------------------------------------------------------------------------------------------  //

pt.Grammar.prototype.addTokens = function(tokens) {
    tokens = tokens || {};
    for (var id in tokens) {
        this.addToken( id, tokens[id] );
    }
};

pt.Grammar.prototype.addToken = function(id, token) {
    token = this.makeToken(id, token);
    this.patterns[ id.toUpperCase() ] = token;

    return token;
};

pt.Grammar.prototype.makeToken = function(id, token) {
    if (typeof token === 'string') {
        var l = token.length;

        return function() {
            if (this.input.current(l) === token) {
                this.input.next(l);
                this.skip();

                return token;
            }
            this.error('Expected token ' + id);
        };
    }

    if (token instanceof RegExp) {
        return function() {
            var r = token.exec( this.input.current() );

            if (r) {
                var s = r[0];

                var l = s.length;
                if (l) {
                    this.input.next(l);
                    this.skip();
                }

                return s;
            }

            this.error('Expected token ' + id);
        };
    }

    //  Should be a function.
    return token;
};

//  ---------------------------------------------------------------------------------------------------------------  //

pt.Grammar.prototype.addKeywords = function(keywords) {
    keywords = keywords || [];
    for (var i = 0, l = keywords.length; i < l; i++) {
        var keyword = keywords[i];
        this.addToken( keyword, new RegExp('^' + keyword + '\\b') );
    }
};

//  ---------------------------------------------------------------------------------------------------------------  //

pt.Grammar.prototype.addRules = function(rules) {
    rules = rules || {};
    for (var id in rules) {
        this.addRule( id, rules[id] );
    }
};

pt.Grammar.prototype.addRule = function(id, rule) {
    if (typeof rule === 'function') {
        this.patterns[id] = this.makeRule(id, rule);
    } else {
        this.patterns[id] = this.makeRule(id, rule.rule, rule.options);
    }
};

pt.Grammar.prototype.makeRule = function(id, rule, options) {
    options = options || {};

    var wrapper = function(params) {
        params = params || {};

        var skipper = this.setSkipper(options.skipper);

        var ast = this.makeAST(id);
        var r = rule.call(this, ast.p, ast, params);

        this.setSkipper(skipper);

        return (r === undefined) ? ast : r;
    };

    return wrapper;
};

//  ---------------------------------------------------------------------------------------------------------------  //

pt.Grammar.prototype.addSkippers = function(skippers) {
    skippers = skippers || {};
    for (var id in skippers) {
        this.addSkipper( id, skippers[id] );
    }
};

pt.Grammar.prototype.addSkipper = function(id, skipper) {
    this.skippers[id] = this.makeSkipper(id, skipper);
};

pt.Grammar.prototype.makeSkipper = function(id, skipper) {
    if (skipper instanceof RegExp) {
        return function() {
            var r = skipper.exec( this.input.current() );
            if (r) {
                r = r[0];
                var l = r.length;
                if (l) {
                    this.input.next(l);
                    return true; // Что-то поскипали.
                }
            }
        };
    }

    //  Should be a function.
    return skipper;
};

//  ---------------------------------------------------------------------------------------------------------------  //


},{"./pt.js":33}],32:[function(require,module,exports){
var path_ = require('path');

//  ---------------------------------------------------------------------------------------------------------------  //

var pt = require('./pt.js');

//  ---------------------------------------------------------------------------------------------------------------  //
//  pt.InputStream
//  ---------------------------------------------------------------------------------------------------------------  //

pt.InputStream = function(src) {
    if (src) {
        if (src.filename) {
            this.read(src.filename);
        } else {
            this.init(src.input);
        }
    }
};

pt.InputStream.prototype.read = function(filename) {
    var content = this.filename = path_.resolve(filename);

    if (path_.existsSync(this.filename)) {
        content = require('fs').readFileSync(this.filename, 'utf-8').toString();
    }

    this.init(content);

    return this;
};

pt.InputStream.prototype.init = function(input) {
    //  Strip UTF-8 BOM
    if (input.charAt(0) === '\uFEFF') {
        input = input.slice(1);
    }

    this.lines = input.split('\n');
    this.x = 0;
    this.y = 0;
    this.line = this.lines[0];

    return this;
};

//  ---------------------------------------------------------------------------------------------------------------  //

pt.InputStream.prototype.current = function(n) {
    var line = this.line;

    return (n && line) ? line.substr(0, n) : line;
};

pt.InputStream.prototype.next = function(n) {
    this.x += n;
    this.line = this.line.substr(n);
};

pt.InputStream.prototype.nextLine = function(n) {
    this.x = 0;
    this.y += (n || 1);
    this.line = this.lines[this.y];
};

pt.InputStream.prototype.isEOL = function() {
    return (this.line === '');
};

pt.InputStream.prototype.isEOF = function() {
    return (this.line === undefined);
};

//  ---------------------------------------------------------------------------------------------------------------  //

pt.InputStream.prototype.where = function(pos) {
    var input = (pos) ? pos.input : this;
    pos = pos || this;

    var where = 'at (' + (pos.x + 1) + ', ' + (pos.y + 1) + ') in ' + input.filename;

    var line = input.lines[pos.y] || '';
    where += ':\n' + line + '\n' + Array(pos.x + 1).join('-') + '^';

    return where;
};

pt.InputStream.prototype.whereKey = function() {
    return this.x + '|' + this.y;
};

//  ---------------------------------------------------------------------------------------------------------------  //

pt.InputStream.prototype.setPos = function(pos) {
    var x = this.x = pos.x;
    var y = this.y = pos.y;
    this.line = this.lines[y].substr(x);
};

pt.InputStream.prototype.getPos = function() {
    return {
        x: this.x,
        y: this.y,
        input: this
    };
};

//  ---------------------------------------------------------------------------------------------------------------  //


},{"./pt.js":33,"fs":12,"path":14}],33:[function(require,module,exports){
var pt = {};

//  ---------------------------------------------------------------------------------------------------------------  //

module.exports = pt;

//  ---------------------------------------------------------------------------------------------------------------  //


},{}],34:[function(require,module,exports){
var path_ = require('path');

//  ---------------------------------------------------------------------------------------------------------------  //

var pt = require('./pt.js');

require('./pt.inputstream.js');

//  ---------------------------------------------------------------------------------------------------------------  //
//  pt.Parser
//  ---------------------------------------------------------------------------------------------------------------  //

pt.Parser = function(grammar, factory) {
    this.grammar = grammar;
    this.factory = factory;
};

//  ---------------------------------------------------------------------------------------------------------------  //

pt.Parser.prototype.read = function(filename) {
    this.input = new pt.InputStream( { filename: filename } );
    this.skipper = null;
    this.cache = {};
};

pt.Parser.prototype.parse = function(filename, rule) {
    this.read(filename);

    return this.match(rule);
};

pt.Parser.prototype.subparser = function() {
    return new pt.Parser( this.grammar, this.factory, path_.dirname(this.input.filename) );
};

//  ---------------------------------------------------------------------------------------------------------------  //

pt.Parser.prototype.makeAST = function(id) {
    return this.factory.make( id, this.input.getPos() );
};

//  ---------------------------------------------------------------------------------------------------------------  //
//  Errors
//  ---------------------------------------------------------------------------------------------------------------  //

pt.Parser.prototype.error = function(msg) {
    throw new pt.Parser.Error( msg || 'Unknown error', this.input.getPos() );
};

//  Этот метод нужен для того, чтобы показать,
//  что правило не смогло правильно сматчиться и нужно делать backtrace.
pt.Parser.prototype.backtrace = function() {
    throw 'backtrace()';
};

pt.Parser.Error = function(msg, pos) {
    this.msg = msg;
    this.pos = pos;
};

pt.Parser.Error.prototype.toString = function() {
    var s = 'ERROR: ' + this.msg + '\n';
    var pos = this.pos;
    s += pos.input.where(pos);

    return s;
};

//  ---------------------------------------------------------------------------------------------------------------  //

pt.Parser.prototype.skip = function(id) {
    id = id || this.skipper;
    var skipper = this.grammar.skippers[id];
    var r = skipper.call(this);

    return r;
};

//  ---------------------------------------------------------------------------------------------------------------  //

pt.Parser.prototype.get = function(id) {
    var grammar = this.grammar;

    var pattern = grammar.patterns[id];
    if (!pattern) {
        pattern = grammar.addToken(id, id);
    }

    return pattern;
};

//  ---------------------------------------------------------------------------------------------------------------  //
//  Test / Match
//  ---------------------------------------------------------------------------------------------------------------  //

pt.Parser.prototype.test = function(id) {
    var key = this.input.whereKey() + '|' + id;
    var cached = this.cache[key];
    if (cached !== undefined) {
        return cached;
    }

    var state = this.getState();
    var r = true;
    try {
        this.get(id).call(this);
        /// console.log('Ok: ' + id);
    } catch (e) {
        r = false;
        /// console.log('Failed: ' + id, e);
    }
    this.setState(state);

    this.cache[key] = r;

    return r;
};

pt.Parser.prototype.testAny = function() {
    for (var i = 0, l = arguments.length; i < l; i++) {
        var id = arguments[i];
        if ( this.test(id) ) {
            return id;
        }
    }

    return false;
};

pt.Parser.prototype.testAll = function() {
    var state = this.getState();
    var r = true;
    try {
        for (var i = 0, l = arguments.length; i < l; i++) {
            this.get( arguments[i] ).call(this);
        }
    } catch (e) {
        r = false;
        /// console.log(e);
    }
    this.setState(state);

    return r;
};

pt.Parser.prototype.match = function(id, params) {
    var options = {};
    if (typeof id === 'object') {
        options = id.options;
        id = id.rule;
    }

    var skipper = this.setSkipper(options.skipper);

    var rule = this.get(id);
    var r = rule.call(this, params);

    this.setSkipper(skipper);

    return r;
};

pt.Parser.prototype.matchAny = function() {
    for (var i = 0, l = arguments.length; i < l; i++) {
        var id = arguments[i];
        if ( this.test(id) ) {
            return this.match(id);
        }
    }

    this.error( 'Expected: ' + arguments.join(', ') );
};

//  ---------------------------------------------------------------------------------------------------------------  //
//  Getters / Setters
//  ---------------------------------------------------------------------------------------------------------------  //

pt.Parser.prototype.getSkipper = function() {
    return this.skipper;
};

pt.Parser.prototype.setSkipper = function(id) {
    var skipper = this.skipper;
    if (id) {
        this.skipper = id;
        this.skip();
    }

    return skipper;
};

//  ---------------------------------------------------------------------------------------------------------------  //

pt.Parser.prototype.setState = function(state) {
    this.input.setPos(state.pos);
    this.setSkipper(state.skipper);
};

pt.Parser.prototype.getState = function() {
    return {
        pos: this.input.getPos(),
        skipper: this.getSkipper()
    };
};

//  ---------------------------------------------------------------------------------------------------------------  //


},{"./pt.inputstream.js":32,"./pt.js":33,"path":14}],35:[function(require,module,exports){
//  Inspired by: https://github.com/Marak/colors.js

(function() {

var colors = {

    //  Styles
    'bold'      : [1,  22],
    'italic'    : [3,  23],
    'underline' : [4,  24],
    'inverse'   : [7,  27],

    //  Dark colors
    'gray'      : [30, 39],
    'maroon'    : [31, 39],
    'green'     : [32, 39],
    'olive'     : [33, 39],
    'navy'      : [34, 39],
    'purple'    : [35, 39],
    'teal'      : [36, 39],
    'silver'    : [37, 39],

    //  Bright colors
    'black'     : [90, 39],
    'red'       : [91, 39],
    'lime'      : [92, 39],
    'yellow'    : [93, 39],
    'blue'      : [94, 39],
    'fuchsia'   : [95, 39],
    'aqua'      : [96, 39],
    'white'     : [97, 39]

};

for (var color in colors) {
    String.prototype.__defineGetter__(color, (function (color) {
        return function() {
            return '\033[' + color[0] + 'm' + this + '\033[' + color[1] + 'm';
        }
    })( colors[color] ));
}

})();


},{}],36:[function(require,module,exports){
module.exports={
    "author": {
        "name": "Sergey Nikitin",
        "email": "nik.pasaran@gmail.com",
        "url": "https://github.com/pasaran"
    },
    "name": "yate",
    "description": "Yet Another Template Engine",
    "version": "0.0.64",
    "homepage": "https://github.com/pasaran/yate",
    "repository": {
        "type": "git",
        "url": "git://github.com/pasaran/yate.git"
    },
    "dependencies": {
        "nopt": "*",
        "nommon": "git://github.com/maksimr/nommon.git",
        "parse-tools": "git://github.com/maksimr/parse-tools.git",
        "brfs": "0.0.8"
    },
    "devDependencies": {
        "mocha": "~1.8",
        "mocks": "~0.0.10",
        "mockery": "~1.4.0",
        "chai-as-promised": "~3.2",
        "sinon": "~1.6",
        "sinon-chai": "~2.3",
        "chai": "~1.5",
        "grunt": "~0.4",
        "grunt-simple-mocha": "git://github.com/yaymukund/grunt-simple-mocha.git",
        "grunt-contrib-watch": "~0.5.0",
        "grunt-browserify": "~1.2.4",
        "matchdep": "~0.1.2"
    },
    "optionalDependencies": {},
    "engines": {
        "node": "*"
    },
    "bin": "./yate",
    "main": "./lib/actions.js",
    "files": [
        "lib",
        "templates",
        "yate"
    ],
    "license": {
        "type": "MIT",
        "url": "https://github.com/pasaran/yate/raw/master/LICENSE"
    },
    "browserify": {
        "transform": [
            "brfs"
        ]
    }
}

},{}]},{},[1])