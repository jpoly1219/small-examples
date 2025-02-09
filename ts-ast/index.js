"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const ts = __importStar(require("typescript"));
function createVirtualProgram(fileContent) {
    // Create a virtual file system
    const virtualFiles = new Map();
    const fileName = "virtual.ts";
    virtualFiles.set(fileName, fileContent);
    // Create compiler host
    const compilerHost = {
        getSourceFile: (name) => {
            const content = virtualFiles.get(name);
            return content
                ? ts.createSourceFile(name, content, ts.ScriptTarget.Latest)
                : undefined;
        },
        writeFile: () => { },
        getCurrentDirectory: () => "/",
        getDirectories: () => [],
        getCanonicalFileName: (fileName) => fileName,
        useCaseSensitiveFileNames: () => true,
        getNewLine: () => "\n",
        getDefaultLibFileName: () => "lib.d.ts",
        fileExists: (fileName) => virtualFiles.has(fileName),
        readFile: (fileName) => virtualFiles.get(fileName),
    };
    // Create program
    const program = ts.createProgram([fileName], {
        noResolve: true,
        target: ts.ScriptTarget.Latest,
        allowJs: true,
    }, compilerHost);
    return program;
}
function analyzeType(typeChecker, type) {
    const typeText = typeChecker.typeToString(type);
    // Handle union types
    if (type.isUnion()) {
        return {
            kind: 'Union',
            text: typeText,
            constituents: type.types.map(t => analyzeType(typeChecker, t))
        };
    }
    // Handle object types (including arrays, tuples, and classes)
    if (type.flags & ts.TypeFlags.Object) {
        console.log(typeChecker.isTupleType(type));
        const objectType = type;
        console.log("ObjectType: ", objectType.objectFlags);
        // Handle reference types (including arrays)
        if (objectType.objectFlags & ts.ObjectFlags.Reference) {
            const typeRef = type;
            const typeArgs = typeChecker.getTypeArguments(typeRef);
            const symbol = typeRef.symbol;
            if (symbol) {
                const name = symbol.getName();
                // Handle Array types
                if (name === 'Array') {
                    return {
                        kind: 'Array',
                        text: typeText,
                        typeArguments: typeArgs.map(t => analyzeType(typeChecker, t))
                    };
                }
            }
        }
        // Handle tuple types
        if (objectType.objectFlags & ts.ObjectFlags.Tuple) {
            const typeArgs = typeChecker.getTypeArguments(type);
            return {
                kind: 'Tuple',
                text: typeText,
                constituents: typeArgs.map(t => analyzeType(typeChecker, t))
            };
        }
        // Handle function types
        const signatures = type.getCallSignatures();
        if (signatures.length > 0) {
            const signature = signatures[0];
            return {
                kind: 'Function',
                text: typeText,
                parameters: signature.parameters.map(param => ({
                    name: param.name,
                    optional: !!(param.flags & ts.SymbolFlags.Optional),
                    type: analyzeType(typeChecker, typeChecker.getTypeOfSymbol(param))
                })),
                returnType: analyzeType(typeChecker, signature.getReturnType())
            };
        }
    }
    // Handle primitive types
    if (type.flags & ts.TypeFlags.String)
        return { kind: 'String', text: typeText };
    if (type.flags & ts.TypeFlags.Number)
        return { kind: 'Number', text: typeText };
    if (type.flags & ts.TypeFlags.Boolean)
        return { kind: 'Boolean', text: typeText };
    return {
        kind: 'Unknown',
        text: typeText,
        // flags: type.flags  // Including flags for debugging
    };
}
function parseTypeString(input) {
    // Create a complete TypeScript file with a type alias
    const sourceText = `type TestType = ${input};`;
    // Create program with virtual file system
    const program = createVirtualProgram(sourceText);
    const typeChecker = program.getTypeChecker();
    // Get the source file
    const sourceFile = program.getSourceFiles()[0];
    // Find our type alias declaration
    let result = { kind: 'Unknown', text: 'Failed to parse' };
    ts.forEachChild(sourceFile, node => {
        if (ts.isTypeAliasDeclaration(node)) {
            const type = typeChecker.getTypeAtLocation(node.type);
            result = analyzeType(typeChecker, type);
        }
    });
    return result;
}
// Example usage
const examples = [
    'number',
    'string',
    'boolean',
    'number[]',
    'Array<string>',
    '[number, string]',
    '(x: number) => string',
    'string | number',
];
examples.forEach(example => {
    console.log(`\nAnalyzing: ${example}`);
    console.log(JSON.stringify(parseTypeString(example), null, 2));
});
