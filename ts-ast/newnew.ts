import * as ts from "typescript";

type TypeInfo = {
  kind: string;
  name: string;
  children?: TypeInfo[];
};

function getTypeInfo(type: ts.Type, checker: ts.TypeChecker): TypeInfo {
  if (type.isUnion()) {
    return {
      kind: "union",
      name: "union",
      children: type.types.map(t => getTypeInfo(t, checker))
    };
  }

  if (type.isIntersection()) {
    return {
      kind: "intersection",
      name: "intersection",
      children: type.types.map(t => getTypeInfo(t, checker))
    };
  }

  if (type.flags & ts.TypeFlags.StringLiteral) {
    return {
      kind: "literal",
      name: `"${(type as ts.StringLiteralType).value}"`
    };
  }

  if (type.flags & ts.TypeFlags.NumberLiteral) {
    return {
      kind: "literal",
      name: `${(type as ts.NumberLiteralType).value}`
    };
  }

  if (type.flags & ts.TypeFlags.Object) {
    const objectFlags = (type as ts.ObjectType).objectFlags;
    console.log(objectFlags)
    if (objectFlags & ts.ObjectFlags.Reference) {
      const typeArguments = (type as ts.TypeReference).typeArguments || [];
      return {
        kind: "reference",
        name: checker.typeToString(type),
        children: typeArguments.map(arg => getTypeInfo(arg, checker))
      };
    }

    if (objectFlags & ts.ObjectFlags.Anonymous) {
      const properties = checker.getPropertiesOfType(type);
      return {
        kind: "object",
        name: "anonymous object",
        children: properties.map(prop => {
          const propDeclaration = prop.valueDeclaration;
          if (!propDeclaration) return { kind: "property", name: prop.name, children: [] };

          const propType = checker.getTypeOfSymbolAtLocation(prop, propDeclaration);
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

function parseType(typeString: string): TypeInfo {
  const fileName = "temp.ts";
  const sourceCode = `type TempType = ${typeString};`;

  const compilerHost: ts.CompilerHost = {
    fileExists: fileName => fileName === fileName,
    getCanonicalFileName: fileName => fileName,
    getCurrentDirectory: () => "",
    getDefaultLibFileName: options => ts.getDefaultLibFilePath(options),
    getNewLine: () => ts.sys.newLine,
    getSourceFile: (fileName, languageVersion) => {
      if (fileName === "temp.ts") {
        return ts.createSourceFile(fileName, sourceCode, languageVersion);
      }
      return undefined;
    },
    readFile: fileName => (fileName === fileName ? sourceCode : undefined),
    useCaseSensitiveFileNames: () => true,
    writeFile: () => { },
  };

  const program = ts.createProgram({
    rootNames: [fileName],
    options: {},
    host: compilerHost,
  });

  const checker = program.getTypeChecker();
  const sourceFile = program.getSourceFile(fileName);
  if (!sourceFile) {
    throw new Error("Source file not found");
  }

  const typeAliasDeclaration = sourceFile.statements.find(ts.isTypeAliasDeclaration);
  if (typeAliasDeclaration && typeAliasDeclaration.type) {
    const type = checker.getTypeAtLocation(typeAliasDeclaration.type);
    return getTypeInfo(type, checker);
  }

  throw new Error("Type alias declaration not found or invalid");
}

// Test cases
const typesToTest = [
  "string",
  "number",
  "boolean",
  "string[]",
  "[ number, string ]",
  "{ a: string; b: number; c: boolean }",
  "Array<number>",
  "{ x: { y: string[] }; z: number }",
  "1 | 2 | 3",
  `"literal"`,
  "() => void",
  "(a: number, b: string) => boolean"
];

typesToTest.forEach(typeStr => {
  try {
    console.log(JSON.stringify(parseType(typeStr), null, 2));
  } catch (error) {
    console.error(`Error parsing type: ${typeStr}`, error);
  }
});
