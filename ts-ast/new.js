"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
Object.defineProperty(exports, "__esModule", { value: true });
var ts = require("typescript");
function analyzeType(checker, type) {
    // Check type predicates
    if (checker.isTupleType(type))
        return 'Tuple';
    if (checker.isArrayType(type))
        return 'Array';
    // if (checker.isUnionOrIntersectionType(type)) {
    //   return type.isUnion() ? 'Union' : 'Intersection';
    // }
    // Check number of call signatures for functions
    if (type.getCallSignatures().length > 0)
        return 'Function';
    // Check basic flags
    if (type.flags & ts.TypeFlags.String)
        return 'String';
    if (type.flags & ts.TypeFlags.Number)
        return 'Number';
    if (type.flags & ts.TypeFlags.Boolean)
        return 'Boolean';
    if (type.flags & ts.TypeFlags.Object)
        return 'Object';
    if (type.flags & ts.TypeFlags.Undefined)
        return 'Undefined';
    if (type.flags & ts.TypeFlags.Null)
        return 'Null';
    if (type.flags & ts.TypeFlags.Any)
        return 'Any';
    if (type.flags & ts.TypeFlags.Never)
        return 'Never';
    if (type.flags & ts.TypeFlags.Void)
        return 'Void';
    return 'Unknown';
}
// Test setup
var sourceFile = ts.createSourceFile('test.ts', "\n    type TestType = string[];\n    ", ts.ScriptTarget.Latest);
var program = ts.createProgram({
    rootNames: ['test.ts'],
    options: {},
    host: __assign(__assign({}, ts.createCompilerHost({})), { getSourceFile: function (fileName) {
            return fileName === 'test.ts' ? sourceFile : undefined;
        }, writeFile: function () { }, getCurrentDirectory: function () { return '/'; } })
});
var checker = program.getTypeChecker();
// Find type and analyze it
ts.forEachChild(sourceFile, function (node) {
    if (ts.isTypeAliasDeclaration(node)) {
        var type = checker.getTypeAtLocation(node.type);
        console.log(analyzeType(checker, type));
    }
});
