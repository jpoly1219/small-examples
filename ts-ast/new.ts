import * as ts from 'typescript';

function analyzeType(checker: ts.TypeChecker, type: ts.Type): string {
  // Check type predicates
  if (checker.isTupleType(type)) return 'Tuple';
  if (checker.isArrayType(type)) return 'Array';
  // if (checker.isUnionOrIntersectionType(type)) {
  //   return type.isUnion() ? 'Union' : 'Intersection';
  // }

  // Check number of call signatures for functions
  if (type.getCallSignatures().length > 0) return 'Function';

  // Check basic flags
  if (type.flags & ts.TypeFlags.String) return 'String';
  if (type.flags & ts.TypeFlags.Number) return 'Number';
  if (type.flags & ts.TypeFlags.Boolean) return 'Boolean';
  if (type.flags & ts.TypeFlags.Object) return 'Object';
  if (type.flags & ts.TypeFlags.Undefined) return 'Undefined';
  if (type.flags & ts.TypeFlags.Null) return 'Null';
  if (type.flags & ts.TypeFlags.Any) return 'Any';
  if (type.flags & ts.TypeFlags.Never) return 'Never';
  if (type.flags & ts.TypeFlags.Void) return 'Void';

  return 'Unknown';
}

// Test setup
const sourceFile = ts.createSourceFile(
  'test.ts',
  `
    type TestType = string[];
    `,
  ts.ScriptTarget.Latest
);

const program = ts.createProgram({
  rootNames: ['test.ts'],
  options: {},
  host: {
    ...ts.createCompilerHost({}),
    getSourceFile: (fileName: string) =>
      fileName === 'test.ts' ? sourceFile : undefined,
    writeFile: () => { },
    getCurrentDirectory: () => '/',
  }
});

const checker = program.getTypeChecker();

// Find type and analyze it
ts.forEachChild(sourceFile, node => {
  if (ts.isTypeAliasDeclaration(node)) {
    const type = checker.getTypeAtLocation(node.type);
    console.log(analyzeType(checker, type));
  }
});
