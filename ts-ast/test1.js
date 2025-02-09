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
function handleMembers(members, checker) {
    return members.map(function (member) {
        if (ts.isPropertySignature(member) || ts.isPropertyDeclaration(member)) {
            var propertyType = member.type ? analyzeTypeNode(member.type, checker) : { kind: 'Any', text: 'any' };
            return {
                kind: 'Property',
                text: member.getText(),
                constituents: [propertyType]
            };
        }
        else if (ts.isMethodSignature(member) || ts.isMethodDeclaration(member)) {
            var parameters = member.parameters.map(function (param) { return ({
                name: param.name.getText(),
                optional: !!param.questionToken,
                type: param.type ? analyzeTypeNode(param.type, checker) : { kind: 'Any', text: 'any' }
            }); });
            var returnType = member.type ? analyzeTypeNode(member.type, checker) : { kind: 'Any', text: 'any' };
            return {
                kind: 'Method',
                text: member.getText(),
                parameters: parameters,
                returnType: returnType
            };
        }
        else {
            return {
                kind: "Unknown",
                text: member.getText()
            };
        }
    });
}
function analyzeTypeString(typeString, program) {
    var sourceFile = ts.createSourceFile('temp.ts', "type T = ".concat(typeString, ";"), ts.ScriptTarget.Latest, true);
    var typeNode;
    ts.forEachChild(sourceFile, function (node) {
        if (ts.isTypeAliasDeclaration(node)) {
            typeNode = node.type;
        }
    });
    if (!typeNode) {
        throw new Error('Failed to parse type string');
    }
    var checker = program.getTypeChecker();
    return analyzeTypeNode(typeNode, checker);
}
function analyzeTypeNode(typeNode, checker) {
    switch (typeNode.kind) {
        case ts.SyntaxKind.NumericLiteral: {
            return {
                kind: 'NumericLiteral',
                text: typeNode.getText(),
            };
        }
        case ts.SyntaxKind.StringLiteral: {
            return {
                kind: 'StringLiteral',
                text: typeNode.getText(),
            };
        }
        case ts.SyntaxKind.FunctionType: {
            var tn = typeNode;
            return {
                kind: "Function",
                text: tn.getText(),
                parameters: tn.parameters.map(function (parameter) {
                    return {
                        name: parameter.name.getText(),
                        optional: !!parameter.questionToken,
                        type: parameter.type ? analyzeTypeNode(parameter.type, checker) : { kind: "Any", text: "any" }
                    };
                }),
                returnType: tn.type ? analyzeTypeNode(tn.type, checker) : undefined
            };
        }
        case ts.SyntaxKind.ArrayType: {
            var tn = typeNode;
            return {
                kind: 'Array',
                text: typeNode.getText(),
                constituents: [analyzeTypeNode(tn.elementType, checker)]
            };
        }
        case ts.SyntaxKind.TupleType: {
            var tn = typeNode;
            var elements = tn.elements.map(function (element) {
                if (ts.isRestTypeNode(element)) {
                    return {
                        kind: 'RestElement',
                        text: element.getText(),
                        type: analyzeTypeNode(element.type, checker)
                    };
                }
                else {
                    return analyzeTypeNode(element, checker);
                }
            });
            return {
                kind: 'Tuple',
                text: typeNode.getText(),
                constituents: elements
            };
        }
        case ts.SyntaxKind.UnionType: {
            var tn = typeNode;
            return {
                kind: "Union",
                text: tn.getText(),
                constituents: tn.types.map(function (typ) {
                    return analyzeTypeNode(typ, checker);
                })
            };
        }
        case ts.SyntaxKind.IntersectionType: {
            var tn = typeNode;
            return {
                kind: "Intersection",
                text: tn.getText(),
                constituents: tn.types.map(function (typ) {
                    return analyzeTypeNode(typ, checker);
                })
            };
        }
        case ts.SyntaxKind.TypeLiteral: {
            var tn = typeNode;
            return {
                kind: "Object",
                text: tn.getText(),
                constituents: handleMembers(tn.members, checker)
            };
        }
        case ts.SyntaxKind.TypeReference: {
            console.log(typeNode);
            var tn = typeNode;
            var symbol = checker.getSymbolAtLocation(tn.typeName);
            var typeAliasAnalysis = { kind: 'TypeReference', text: typeNode.getText() };
            if (symbol && symbol.declarations) {
                var declaration = symbol.declarations[0];
                if (ts.isTypeAliasDeclaration(declaration)) {
                    var typeAlias = declaration;
                    if (typeAlias.type) {
                        typeAliasAnalysis = __assign(__assign({}, typeAliasAnalysis), { kind: "TypeReference of TypeAliasDeclaration", constituents: [analyzeTypeNode(typeAlias.type, checker)] });
                    }
                }
                else if (ts.isInterfaceDeclaration(declaration)) {
                    var interfaceDecl = declaration;
                    if (interfaceDecl.members) {
                        typeAliasAnalysis = __assign(__assign({}, typeAliasAnalysis), { kind: "TypeReference of InterfaceDeclaration", constituents: handleMembers(interfaceDecl.members, checker) });
                    }
                }
                else if (ts.isClassDeclaration(declaration)) {
                    var classDecl = declaration;
                    if (classDecl.members) {
                        typeAliasAnalysis = __assign(__assign({}, typeAliasAnalysis), { kind: "TypeReference of ClassDeclaration", constituents: handleMembers(classDecl.members, checker) });
                        if (classDecl.heritageClauses) {
                            typeAliasAnalysis = __assign(__assign({}, typeAliasAnalysis), { heritage: classDecl.heritageClauses.map(function (heritageClause) {
                                    return heritageClause.types.map(function (typ) {
                                        return analyzeTypeNode(typ, checker);
                                    });
                                }) });
                        }
                    }
                }
            }
            else {
                // console.log(tn)
            }
            return typeAliasAnalysis;
        }
    }
    return {
        kind: ts.SyntaxKind[typeNode.kind],
        text: typeNode.getText()
    };
}
function stringOfTypeAnalysis(typeAnalysisResult, indent) {
    var str = "".concat(typeAnalysisResult.text.split("\n").map(function (line) { return " ".repeat(indent) + line; }).join("\n"), " -> ").concat(typeAnalysisResult.kind, "\n");
    if (typeAnalysisResult.parameters) {
        for (var _i = 0, _a = typeAnalysisResult.parameters; _i < _a.length; _i++) {
            var param = _a[_i];
            str += stringOfTypeAnalysis(param.type, indent + 2);
        }
    }
    if (typeAnalysisResult.returnType) {
        str += stringOfTypeAnalysis(typeAnalysisResult.returnType, indent + 2);
    }
    if (typeAnalysisResult.constituents) {
        for (var _b = 0, _c = typeAnalysisResult.constituents; _b < _c.length; _b++) {
            var constituent = _c[_b];
            str += stringOfTypeAnalysis(constituent, indent + 2);
        }
    }
    return str;
}
function createProgramFromSource(content) {
    var fileName = 'test.ts';
    var sourceFile = ts.createSourceFile(fileName, content, ts.ScriptTarget.Latest, true);
    var host = ts.createCompilerHost({});
    host.getSourceFile = function (fileName) { return (fileName === 'test.ts' ? sourceFile : undefined); };
    var program = ts.createProgram([fileName], {}, host);
    return { program: program };
}
function findDeclarations(node) {
    if (ts.isVariableDeclaration(node)) {
        console.log('Variable Declaration:', node.name.getText());
    }
    else if (ts.isFunctionDeclaration(node) && node.name) {
        console.log('Function Declaration:', node.name.getText());
    }
    ts.forEachChild(node, findDeclarations);
}
function findTopLevelDeclarations(node) {
    // Check if the node is a direct child of the SourceFile (top-level)
    if (node.parent && ts.isSourceFile(node.parent)) {
        if (ts.isVariableStatement(node)) {
            node.declarationList.declarations.forEach(function (declaration) {
                console.log('Top-level Variable Declaration:', declaration.name.getText());
            });
        }
        else if (ts.isFunctionDeclaration(node) && node.name) {
            console.log('Top-level Function Declaration:', node.name.getText());
        }
    }
    // Continue traversal for child nodes
    ts.forEachChild(node, findTopLevelDeclarations);
}
// Example usage
var tsContent = "\ntype StringOrNumber = string | number;\ntype ComplexTuple = [string, ...number[]];\ntype NestedType = { prop: StringOrNumber };\n\ntype User = {\n  id: number;\n  name: string;\n  contact: ContactInfo;\n};\n\ntype ContactInfo = {\n  email: string;\n  phone: number;\n};\n\ntype NestedUnion = StringOrNumber | User;\n\ntype AliasFunction = (input: string) => boolean;\n\ntype GenericType<T> = T[];\n\ninterface Model {\n  id: number;\n  attributes: Attributes;\n  action: (payload: Payload) => Result;\n}\n\ninterface Attributes {\n  key: string;\n  value: any;\n}\n\ninterface Payload {\n  actionType: string;\n  data: any;\n}\n\ninterface Result {\n  success: boolean;\n  message: string;\n}\n\ntype IntersectionType = User & { isActive: boolean };\n\ntype RecursiveType = {\n  parent: RecursiveType | null;\n};\n\nfunction exampleFunction(param1: StringOrNumber, param2: User): ComplexTuple {\n  return [param1.toString(), param2.id];\n}\n\nclass ExampleClass implements Model {\n  id: number;\n  attributes: Attributes;\n  action(payload: Payload): Result {\n    return { success: true, message: 'Action executed' };\n  }\n\n  constructor(id: number, attributes: Attributes) {\n    this.id = id;\n    this.attributes = attributes;\n  }\n}\n\n";
var prelude = "\n// TODO MVU\n\n// A todo has a description and a status\ntype Todo = [string, boolean];\n\n// A description input buffer and a todo list\ntype Model = [string, Todo[]];\n\ntype AddTodo = { type: \"AddTodo\"; };\n\ntype RemoveTodo = { type: \"RemoveTodo\"; id: number; };\n\ntype ToggleTodo = { type: \"ToggleTodo\"; id: number; };\n\ntype UpdateBuffer = { type: \"UpdateBuffer\"; name: string; };\n\ntype Action = AddTodo | RemoveTodo | ToggleTodo | UpdateBuffer;\n\ntype Update = (m: Model, a: Action) => Model;\n\nconst todo_eq: (t1: Todo, t2: Todo) => boolean = ([d1, s1], [d2, s2]) => {\n  return d1 === d2 && s1 === s2;\n}\n\nconst todo_array_eq: (ta1: Todo[], ta2: Todo[]) => boolean = (ta1, ta2) => {\n  return ta1.length === ta2.length && ta1.every((el, i) => { return todo_eq(el, ta2[i]); });\n}\n\nconst model_eq: (m1: Model, m2: Model) => boolean = ([b1, ts1], [b2, ts2]) => {\n  return b1 === b2 && todo_array_eq(ts1, ts2);\n}\n\nconst Model_init: Model = [\"\", []];\n\nconst add: (m: Model) => Todo[] = (m) => {\n  if (m[0] === \"\") {\n    return m[1];\n  } else {\n    return [...m[1], [m[0], false]];\n  }\n}\n\nconst remove: (index: number, todos: Todo[]) => Todo[] = (index, todos) => {\n  const removedTodos: Todo[] = [];\n  for (let i = 0; i < todos.length; i++) {\n    if (i !== index) {\n      removedTodos.push(todos[i]);\n    }\n  }\n  return removedTodos;\n  // const removedTodos = todos.filter((_, i) => { i !== index });\n  // return removedTodos;\n}\n\nconst toggle: (index: number, todos: Todo[]) => Todo[] = (index, todos) => {\n  const toggledTodos = todos.map((t, i) => {\n    if (i === index) {\n      return [t[0], !t[1]] as Todo;\n    } else {\n      return t;\n    }\n  });\n  return toggledTodos;\n}\n";
var program = createProgramFromSource(prelude).program;
// const typeStrings = [
//   'string',
//   'ComplexTuple',
//   '[number, string[]]',
//   'Model',
//   'ExampleClass',
//   'ContactInfo',
//   'GenericType'
// ];
var typeStrings = [
    '(m: Model, a: Action) => Model',
    // 'string',
    // 'number',
    // 'boolean',
    // 'UpdateBuffer'
];
typeStrings.forEach(function (typeString) {
    console.log("\nAnalyzing: ".concat(typeString));
    var typeAnalysisResult = analyzeTypeString(typeString, program);
    console.log(JSON.stringify(typeAnalysisResult, null, 2));
    var re = /(.*)Keyword/;
    console.log(typeAnalysisResult.kind.match(re));
    // console.log(stringOfTypeAnalysis(analyzeTypeString(typeString, program), 0));
});
// findTopLevelDeclarations(ts.createSourceFile("temp.ts", prelude, ts.ScriptTarget.Latest, true));
