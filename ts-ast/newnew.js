"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var ts = require("typescript");
function getTypeInfo(type, checker) {
    if (type.isUnion()) {
        return {
            kind: "union",
            name: "union",
            children: type.types.map(function (t) { return getTypeInfo(t, checker); })
        };
    }
    if (type.isIntersection()) {
        return {
            kind: "intersection",
            name: "intersection",
            children: type.types.map(function (t) { return getTypeInfo(t, checker); })
        };
    }
    if (type.flags & ts.TypeFlags.StringLiteral) {
        return {
            kind: "literal",
            name: "\"".concat(type.value, "\"")
        };
    }
    if (type.flags & ts.TypeFlags.NumberLiteral) {
        return {
            kind: "literal",
            name: "".concat(type.value)
        };
    }
    if (type.flags & ts.TypeFlags.Object) {
        var objectFlags = type.objectFlags;
        console.log(objectFlags);
        if (objectFlags & ts.ObjectFlags.Reference) {
            var typeArguments = type.typeArguments || [];
            return {
                kind: "reference",
                name: checker.typeToString(type),
                children: typeArguments.map(function (arg) { return getTypeInfo(arg, checker); })
            };
        }
        if (objectFlags & ts.ObjectFlags.Anonymous) {
            var properties = checker.getPropertiesOfType(type);
            return {
                kind: "object",
                name: "anonymous object",
                children: properties.map(function (prop) {
                    var propDeclaration = prop.valueDeclaration;
                    if (!propDeclaration)
                        return { kind: "property", name: prop.name, children: [] };
                    var propType = checker.getTypeOfSymbolAtLocation(prop, propDeclaration);
                    return {
                        kind: "property",
                        name: prop.name,
                        children: [getTypeInfo(propType, checker)]
                    };
                })
            };
        }
    }
    // if (type.flags & ts.TypeFlags.Function) {
    //   const callSignatures = type.getCallSignatures();
    //   return {
    //     kind: "function",
    //     name: "function",
    //     children: callSignatures.map(sig => {
    //       const returnType = checker.getReturnTypeOfSignature(sig);
    //       return {
    //         kind: "return",
    //         name: "return type",
    //         children: [getTypeInfo(returnType, checker)]
    //       };
    //     })
    //   };
    // }
    return {
        kind: checker.typeToString(type),
        name: checker.typeToString(type)
    };
}
function parseType(typeString) {
    var fileName = "temp.ts";
    var sourceCode = "type TempType = ".concat(typeString, ";");
    var compilerHost = {
        fileExists: function (fileName) { return fileName === fileName; },
        getCanonicalFileName: function (fileName) { return fileName; },
        getCurrentDirectory: function () { return ""; },
        getDefaultLibFileName: function (options) { return ts.getDefaultLibFilePath(options); },
        getNewLine: function () { return ts.sys.newLine; },
        getSourceFile: function (fileName, languageVersion) {
            if (fileName === "temp.ts") {
                return ts.createSourceFile(fileName, sourceCode, languageVersion);
            }
            return undefined;
        },
        readFile: function (fileName) { return (fileName === fileName ? sourceCode : undefined); },
        useCaseSensitiveFileNames: function () { return true; },
        writeFile: function () { },
    };
    var program = ts.createProgram({
        rootNames: [fileName],
        options: {},
        host: compilerHost,
    });
    var checker = program.getTypeChecker();
    var sourceFile = program.getSourceFile(fileName);
    if (!sourceFile) {
        throw new Error("Source file not found");
    }
    var typeAliasDeclaration = sourceFile.statements.find(ts.isTypeAliasDeclaration);
    if (typeAliasDeclaration && typeAliasDeclaration.type) {
        var type = checker.getTypeAtLocation(typeAliasDeclaration.type);
        return getTypeInfo(type, checker);
    }
    throw new Error("Type alias declaration not found or invalid");
}
// Test cases
var typesToTest = [
    "string",
    "number",
    "boolean",
    "string[]",
    "[ number, string ]",
    "{ a: string; b: number; c: boolean }",
    "Array<number>",
    "{ x: { y: string[] }; z: number }",
    "1 | 2 | 3",
    "\"literal\"",
    "() => void",
    "(a: number, b: string) => boolean"
];
typesToTest.forEach(function (typeStr) {
    try {
        console.log(JSON.stringify(parseType(typeStr), null, 2));
    }
    catch (error) {
        console.error("Error parsing type: ".concat(typeStr), error);
    }
});
