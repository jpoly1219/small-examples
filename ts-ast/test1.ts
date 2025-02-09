import * as ts from 'typescript';

interface TypeAnalysis {
  kind: string;
  text: string;
  constituents?: TypeAnalysis[];
  parameters?: ParameterAnalysis[];
  returnType?: TypeAnalysis;
  heritage?: TypeAnalysis[][];
}

interface ParameterAnalysis {
  name: string;
  optional: boolean;
  type: TypeAnalysis;
}

function handleMembers(members: ts.NodeArray<ts.TypeElement> | ts.NodeArray<ts.ClassElement>, checker: ts.TypeChecker): TypeAnalysis[] {
  return members.map(member => {
    if (ts.isPropertySignature(member) || ts.isPropertyDeclaration(member)) {
      const propertyType = member.type ? analyzeTypeNode(member.type, checker) : { kind: 'Any', text: 'any' };
      return {
        kind: 'Property',
        text: member.getText(),
        constituents: [propertyType]
      };
    } else if (ts.isMethodSignature(member) || ts.isMethodDeclaration(member)) {
      const parameters = member.parameters.map(param => ({
        name: param.name.getText(),
        optional: !!param.questionToken,
        type: param.type ? analyzeTypeNode(param.type, checker) : { kind: 'Any', text: 'any' }
      }));
      const returnType = member.type ? analyzeTypeNode(member.type, checker) : { kind: 'Any', text: 'any' };
      return {
        kind: 'Method',
        text: member.getText(),
        parameters,
        returnType
      };
    } else {
      return {
        kind: "Unknown",
        text: member.getText()
      };
    }
  })
}

function analyzeTypeString(typeString: string, program: ts.Program): TypeAnalysis {
  const sourceFile = ts.createSourceFile('temp.ts', `type T = ${typeString};`, ts.ScriptTarget.Latest, true);
  let typeNode: ts.TypeNode | undefined;

  ts.forEachChild(sourceFile, node => {
    if (ts.isTypeAliasDeclaration(node)) {
      typeNode = node.type;
    }
  });

  if (!typeNode) {
    throw new Error('Failed to parse type string');
  }

  const checker = program.getTypeChecker();
  return analyzeTypeNode(typeNode, checker);
}

function analyzeTypeNode(typeNode: ts.TypeNode, checker: ts.TypeChecker): TypeAnalysis {
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
      const tn = typeNode as ts.FunctionTypeNode;
      return {
        kind: "Function",
        text: tn.getText(),
        parameters: tn.parameters.map(parameter => {
          return {
            name: parameter.name.getText(),
            optional: !!parameter.questionToken,
            type: parameter.type ? analyzeTypeNode(parameter.type, checker) : { kind: "Any", text: "any" }
          }
        }),
        returnType: tn.type ? analyzeTypeNode(tn.type, checker) : undefined
      };
    }

    case ts.SyntaxKind.ArrayType: {
      const tn = typeNode as ts.ArrayTypeNode;
      return {
        kind: 'Array',
        text: typeNode.getText(),
        constituents: [analyzeTypeNode(tn.elementType, checker)]
      };
    }

    case ts.SyntaxKind.TupleType: {
      const tn = typeNode as ts.TupleTypeNode;
      const elements = tn.elements.map(element => {
        if (ts.isRestTypeNode(element)) {
          return {
            kind: 'RestElement',
            text: element.getText(),
            type: analyzeTypeNode(element.type, checker)
          };
        } else {
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
      const tn = typeNode as ts.UnionTypeNode;
      return {
        kind: "Union",
        text: tn.getText(),
        constituents: tn.types.map(typ => {
          return analyzeTypeNode(typ, checker);
        })
      };
    }

    case ts.SyntaxKind.IntersectionType: {
      const tn = typeNode as ts.IntersectionTypeNode;
      return {
        kind: "Intersection",
        text: tn.getText(),
        constituents: tn.types.map(typ => {
          return analyzeTypeNode(typ, checker);
        })
      };
    }

    case ts.SyntaxKind.TypeLiteral: {
      const tn = typeNode as ts.TypeLiteralNode;
      return {
        kind: "Object",
        text: tn.getText(),
        constituents: handleMembers(tn.members, checker)
      };
    }

    case ts.SyntaxKind.TypeReference: {
      console.log(typeNode)
      const tn = typeNode as ts.TypeReferenceNode;
      const symbol = checker.getSymbolAtLocation(tn.typeName);
      let typeAliasAnalysis: TypeAnalysis = { kind: 'TypeReference', text: typeNode.getText() };


      if (symbol && symbol.declarations) {
        const declaration = symbol.declarations[0];
        if (ts.isTypeAliasDeclaration(declaration)) {
          const typeAlias = declaration as ts.TypeAliasDeclaration;
          if (typeAlias.type) {
            typeAliasAnalysis = {
              ...typeAliasAnalysis,
              kind: `TypeReference of TypeAliasDeclaration`,
              constituents: [analyzeTypeNode(typeAlias.type, checker)]
            };
          }
        } else if (ts.isInterfaceDeclaration(declaration)) {
          const interfaceDecl = declaration as ts.InterfaceDeclaration;
          if (interfaceDecl.members) {
            typeAliasAnalysis = {
              ...typeAliasAnalysis,
              kind: `TypeReference of InterfaceDeclaration`,
              constituents: handleMembers(interfaceDecl.members, checker)
            };
          }
        } else if (ts.isClassDeclaration(declaration)) {
          const classDecl = declaration as ts.ClassDeclaration;
          if (classDecl.members) {
            typeAliasAnalysis = {
              ...typeAliasAnalysis,
              kind: `TypeReference of ClassDeclaration`,
              constituents: handleMembers(classDecl.members, checker),
            };

            if (classDecl.heritageClauses) {
              typeAliasAnalysis = {
                ...typeAliasAnalysis,
                heritage: classDecl.heritageClauses.map(heritageClause => {
                  return heritageClause.types.map(typ => {
                    return analyzeTypeNode(typ, checker);
                  });
                })
              };
            }
          }
        }
      } else {
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

function stringOfTypeAnalysis(typeAnalysisResult: TypeAnalysis, indent: number): string {
  let str = `${typeAnalysisResult.text.split("\n").map(line => " ".repeat(indent) + line).join("\n")} -> ${typeAnalysisResult.kind}\n`;

  if (typeAnalysisResult.parameters) {
    for (const param of typeAnalysisResult.parameters) {
      str += stringOfTypeAnalysis(param.type, indent + 2);
    }
  }

  if (typeAnalysisResult.returnType) {
    str += stringOfTypeAnalysis(typeAnalysisResult.returnType, indent + 2);
  }

  if (typeAnalysisResult.constituents) {
    for (const constituent of typeAnalysisResult.constituents) {
      str += stringOfTypeAnalysis(constituent, indent + 2);
    }
  }

  return str;
}

function createProgramFromSource(content: string): { program: ts.Program } {
  const fileName = 'test.ts';
  const sourceFile = ts.createSourceFile(fileName, content, ts.ScriptTarget.Latest, true);
  const host = ts.createCompilerHost({});
  host.getSourceFile = (fileName) => (fileName === 'test.ts' ? sourceFile : undefined);
  const program = ts.createProgram([fileName], {}, host);
  return { program };
}

function findDeclarations(node: ts.Node) {
  if (ts.isVariableDeclaration(node)) {
    console.log('Variable Declaration:', node.name.getText());
  } else if (ts.isFunctionDeclaration(node) && node.name) {
    console.log('Function Declaration:', node.name.getText());
  }

  ts.forEachChild(node, findDeclarations);
}

function findTopLevelDeclarations(node: ts.Node) {
  // Check if the node is a direct child of the SourceFile (top-level)
  if (node.parent && ts.isSourceFile(node.parent)) {
    if (ts.isVariableStatement(node)) {
      node.declarationList.declarations.forEach(declaration => {
        console.log('Top-level Variable Declaration:', declaration.name.getText());
      });
    } else if (ts.isFunctionDeclaration(node) && node.name) {
      console.log('Top-level Function Declaration:', node.name.getText());
    }
  }

  // Continue traversal for child nodes
  ts.forEachChild(node, findTopLevelDeclarations);
}

// Example usage
const tsContent = `
type StringOrNumber = string | number;
type ComplexTuple = [string, ...number[]];
type NestedType = { prop: StringOrNumber };

type User = {
  id: number;
  name: string;
  contact: ContactInfo;
};

type ContactInfo = {
  email: string;
  phone: number;
};

type NestedUnion = StringOrNumber | User;

type AliasFunction = (input: string) => boolean;

type GenericType<T> = T[];

interface Model {
  id: number;
  attributes: Attributes;
  action: (payload: Payload) => Result;
}

interface Attributes {
  key: string;
  value: any;
}

interface Payload {
  actionType: string;
  data: any;
}

interface Result {
  success: boolean;
  message: string;
}

type IntersectionType = User & { isActive: boolean };

type RecursiveType = {
  parent: RecursiveType | null;
};

function exampleFunction(param1: StringOrNumber, param2: User): ComplexTuple {
  return [param1.toString(), param2.id];
}

class ExampleClass implements Model {
  id: number;
  attributes: Attributes;
  action(payload: Payload): Result {
    return { success: true, message: 'Action executed' };
  }

  constructor(id: number, attributes: Attributes) {
    this.id = id;
    this.attributes = attributes;
  }
}

`;

const prelude = `
// TODO MVU

// A todo has a description and a status
type Todo = [string, boolean];

// A description input buffer and a todo list
type Model = [string, Todo[]];

type AddTodo = { type: "AddTodo"; };

type RemoveTodo = { type: "RemoveTodo"; id: number; };

type ToggleTodo = { type: "ToggleTodo"; id: number; };

type UpdateBuffer = { type: "UpdateBuffer"; name: string; };

type Action = AddTodo | RemoveTodo | ToggleTodo | UpdateBuffer;

type Update = (m: Model, a: Action) => Model;

const todo_eq: (t1: Todo, t2: Todo) => boolean = ([d1, s1], [d2, s2]) => {
  return d1 === d2 && s1 === s2;
}

const todo_array_eq: (ta1: Todo[], ta2: Todo[]) => boolean = (ta1, ta2) => {
  return ta1.length === ta2.length && ta1.every((el, i) => { return todo_eq(el, ta2[i]); });
}

const model_eq: (m1: Model, m2: Model) => boolean = ([b1, ts1], [b2, ts2]) => {
  return b1 === b2 && todo_array_eq(ts1, ts2);
}

const Model_init: Model = ["", []];

const add: (m: Model) => Todo[] = (m) => {
  if (m[0] === "") {
    return m[1];
  } else {
    return [...m[1], [m[0], false]];
  }
}

const remove: (index: number, todos: Todo[]) => Todo[] = (index, todos) => {
  const removedTodos: Todo[] = [];
  for (let i = 0; i < todos.length; i++) {
    if (i !== index) {
      removedTodos.push(todos[i]);
    }
  }
  return removedTodos;
  // const removedTodos = todos.filter((_, i) => { i !== index });
  // return removedTodos;
}

const toggle: (index: number, todos: Todo[]) => Todo[] = (index, todos) => {
  const toggledTodos = todos.map((t, i) => {
    if (i === index) {
      return [t[0], !t[1]] as Todo;
    } else {
      return t;
    }
  });
  return toggledTodos;
}
`;

const { program } = createProgramFromSource(prelude);

// const typeStrings = [
//   'string',
//   'ComplexTuple',
//   '[number, string[]]',
//   'Model',
//   'ExampleClass',
//   'ContactInfo',
//   'GenericType'
// ];
const typeStrings = [
  '(m: Model, a: Action) => Model',
  // 'string',
  // 'number',
  // 'boolean',
  // 'UpdateBuffer'
];
typeStrings.forEach(typeString => {
  console.log(`\nAnalyzing: ${typeString}`);
  const typeAnalysisResult = analyzeTypeString(typeString, program);
  console.log(JSON.stringify(typeAnalysisResult, null, 2));
  const re = /(.*)Keyword/;
  console.log(typeAnalysisResult.kind.match(re))
  // console.log(stringOfTypeAnalysis(analyzeTypeString(typeString, program), 0));
});

// findTopLevelDeclarations(ts.createSourceFile("temp.ts", prelude, ts.ScriptTarget.Latest, true));
