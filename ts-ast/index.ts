import * as ts from 'typescript';
import path from 'node:path';

interface TypeAnalysis {
  kind: string;
  text: string;
  constituents?: TypeAnalysis[];
  parameters?: ParameterAnalysis[];
  returnType?: TypeAnalysis;
  typeArguments?: TypeAnalysis[];
}

interface ParameterAnalysis {
  name: string;
  optional: boolean;
  type: TypeAnalysis;
}

function createVirtualProgram(fileContent: string) {
  // Create a virtual file system
  const virtualFiles = new Map<string, string>();
  const fileName = "virtual.ts";
  virtualFiles.set(fileName, fileContent);

  // Create compiler host
  const compilerHost: ts.CompilerHost = {
    getSourceFile: (name: string) => {
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
  const program = ts.createProgram(
    [fileName],
    {
      noResolve: true,
      target: ts.ScriptTarget.Latest,
      allowJs: true,
    },
    compilerHost
  );

  return program;
}

function analyzeType(
  typeChecker: ts.TypeChecker,
  type: ts.Type,
): TypeAnalysis {
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
    console.log(typeChecker.isTupleType(type))
    const objectType = type as ts.ObjectType;
    console.log("ObjectType: ", objectType.objectFlags)

    // Handle reference types (including arrays)
    if (objectType.objectFlags & ts.ObjectFlags.Reference) {
      const typeRef = type as ts.TypeReference;
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
      const typeArgs = typeChecker.getTypeArguments(type as ts.TypeReference);
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
  if (type.flags & ts.TypeFlags.String) return { kind: 'String', text: typeText };
  if (type.flags & ts.TypeFlags.Number) return { kind: 'Number', text: typeText };
  if (type.flags & ts.TypeFlags.Boolean) return { kind: 'Boolean', text: typeText };

  return {
    kind: 'Unknown',
    text: typeText,
    // flags: type.flags  // Including flags for debugging
  };
}

function parseTypeString(input: string): TypeAnalysis {
  // Create a complete TypeScript file with a type alias
  const sourceText = `type TestType = ${input};`;

  // Create program with virtual file system
  const program = createVirtualProgram(sourceText);
  const typeChecker = program.getTypeChecker();

  // Get the source file
  const sourceFile = program.getSourceFiles()[0];

  // Find our type alias declaration
  let result: TypeAnalysis = { kind: 'Unknown', text: 'Failed to parse' };

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
