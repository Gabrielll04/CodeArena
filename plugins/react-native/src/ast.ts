import { parse } from '@babel/parser';
import type * as t from '@babel/types';

export interface SyntaxProblem {
  message: string;
  line: number | null;
  column: number | null;
}

export type ParseOutcome = { ok: true; ast: t.File } | { ok: false; error: SyntaxProblem };

export function parseSource(code: string): ParseOutcome {
  try {
    const ast = parse(code, {
      sourceType: 'module',
      plugins: ['jsx', 'typescript'],
      errorRecovery: false,
    });
    return { ok: true, ast };
  } catch (err) {
    const e = err as Error & { loc?: { line: number; column: number } };
    const message = (e.message ?? String(err)).replace(/\s*\(\d+:\d+\)\s*$/, '');
    return { ok: false, error: { message, line: e.loc?.line ?? null, column: e.loc?.column ?? null } };
  }
}

type AnyNode = t.Node & Record<string, unknown>;

/** Percorre todos os nós da AST (pré-ordem). */
export function walk(node: t.Node, visit: (node: t.Node, parent: t.Node | null) => void, parent: t.Node | null = null): void {
  visit(node, parent);
  for (const key of Object.keys(node)) {
    if (key === 'loc' || key === 'leadingComments' || key === 'trailingComments' || key === 'innerComments') continue;
    const value = (node as AnyNode)[key];
    if (Array.isArray(value)) {
      for (const child of value) {
        if (child && typeof child === 'object' && typeof (child as t.Node).type === 'string') walk(child as t.Node, visit, node);
      }
    } else if (value && typeof value === 'object' && typeof (value as t.Node).type === 'string') {
      walk(value as t.Node, visit, node);
    }
  }
}

export function jsxName(name: t.JSXOpeningElement['name']): string {
  switch (name.type) {
    case 'JSXIdentifier':
      return name.name;
    case 'JSXMemberExpression':
      return `${jsxName(name.object)}.${name.property.name}`;
    case 'JSXNamespacedName':
      return `${name.namespace.name}:${name.name.name}`;
  }
}

export type AttributeValue =
  | { kind: 'string'; value: string }
  | { kind: 'number'; value: number }
  | { kind: 'boolean'; value: boolean }
  | { kind: 'expression'; source: string };

export interface JsxElementInfo {
  name: string;
  attributes: Map<string, AttributeValue>;
  text: string;
  node: t.JSXElement;
}

function literalValue(expr: t.Node, code: string): AttributeValue {
  switch (expr.type) {
    case 'StringLiteral':
      return { kind: 'string', value: expr.value };
    case 'NumericLiteral':
      return { kind: 'number', value: expr.value };
    case 'BooleanLiteral':
      return { kind: 'boolean', value: expr.value };
    case 'TemplateLiteral':
      if (expr.expressions.length === 0) return { kind: 'string', value: expr.quasis.map((q) => q.value.cooked ?? '').join('') };
      break;
  }
  return { kind: 'expression', source: code.slice(expr.start ?? 0, expr.end ?? 0) };
}

function textOf(element: t.JSXElement): string {
  const parts: string[] = [];
  for (const child of element.children) {
    if (child.type === 'JSXText') parts.push(child.value);
    else if (child.type === 'JSXExpressionContainer') {
      const expr = child.expression;
      if (expr.type === 'StringLiteral') parts.push(expr.value);
      else if (expr.type === 'NumericLiteral') parts.push(String(expr.value));
      else if (expr.type === 'TemplateLiteral' && expr.expressions.length === 0) {
        parts.push(expr.quasis.map((q) => q.value.cooked ?? '').join(''));
      }
    }
  }
  return parts.join('').replace(/\s+/g, ' ').trim();
}

export interface SourceIndex {
  elements: JsxElementInfo[];
  imports: { source: string; names: string[]; defaultName: string | null }[];
  calls: string[];
  /** Nome do componente exportado por padrão (função/classe/identificador), ou "(anônimo)". */
  defaultExport: { name: string | null; isComponentLike: boolean } | null;
  objectKeys: { key: string; value: AttributeValue }[];
}

export function indexSource(ast: t.File, code: string): SourceIndex {
  const index: SourceIndex = { elements: [], imports: [], calls: [], defaultExport: null, objectKeys: [] };
  const functionNames = new Set<string>();

  walk(ast.program, (node) => {
    switch (node.type) {
      case 'JSXElement': {
        const attributes = new Map<string, AttributeValue>();
        for (const attr of node.openingElement.attributes) {
          if (attr.type !== 'JSXAttribute') continue;
          const name = attr.name.type === 'JSXIdentifier' ? attr.name.name : `${attr.name.namespace.name}:${attr.name.name.name}`;
          const value = attr.value;
          if (value === null || value === undefined) attributes.set(name, { kind: 'boolean', value: true });
          else if (value.type === 'StringLiteral') attributes.set(name, { kind: 'string', value: value.value });
          else if (value.type === 'JSXExpressionContainer' && value.expression.type !== 'JSXEmptyExpression') {
            attributes.set(name, literalValue(value.expression, code));
          }
        }
        index.elements.push({ name: jsxName(node.openingElement.name), attributes, text: textOf(node), node });
        break;
      }
      case 'ImportDeclaration': {
        const names: string[] = [];
        let defaultName: string | null = null;
        for (const spec of node.specifiers) {
          if (spec.type === 'ImportSpecifier') {
            names.push(spec.imported.type === 'Identifier' ? spec.imported.name : spec.imported.value);
          } else if (spec.type === 'ImportDefaultSpecifier') defaultName = spec.local.name;
          else if (spec.type === 'ImportNamespaceSpecifier') defaultName = spec.local.name;
        }
        index.imports.push({ source: node.source.value, names, defaultName });
        break;
      }
      case 'CallExpression': {
        const callee = node.callee;
        if (callee.type === 'Identifier') index.calls.push(callee.name);
        else if (callee.type === 'MemberExpression' && callee.property.type === 'Identifier') {
          const object = callee.object.type === 'Identifier' ? `${callee.object.name}.` : '';
          index.calls.push(`${object}${callee.property.name}`);
          index.calls.push(callee.property.name);
        }
        break;
      }
      case 'FunctionDeclaration':
        if (node.id) functionNames.add(node.id.name);
        break;
      case 'VariableDeclarator':
        if (
          node.id.type === 'Identifier' &&
          node.init &&
          (node.init.type === 'ArrowFunctionExpression' || node.init.type === 'FunctionExpression')
        ) {
          functionNames.add(node.id.name);
        }
        break;
      case 'ObjectProperty': {
        const key =
          node.key.type === 'Identifier' ? node.key.name : node.key.type === 'StringLiteral' ? node.key.value : null;
        if (key) index.objectKeys.push({ key, value: literalValue(node.value, code) });
        break;
      }
      case 'ExportDefaultDeclaration': {
        const decl = node.declaration;
        if (decl.type === 'FunctionDeclaration' || decl.type === 'ClassDeclaration') {
          index.defaultExport = { name: decl.id?.name ?? null, isComponentLike: true };
        } else if (decl.type === 'ArrowFunctionExpression' || decl.type === 'FunctionExpression') {
          index.defaultExport = { name: null, isComponentLike: true };
        } else if (decl.type === 'Identifier') {
          index.defaultExport = { name: decl.name, isComponentLike: false };
        } else {
          index.defaultExport = { name: null, isComponentLike: false };
        }
        break;
      }
    }
  });

  if (index.defaultExport && !index.defaultExport.isComponentLike && index.defaultExport.name) {
    index.defaultExport.isComponentLike = functionNames.has(index.defaultExport.name);
  }
  return index;
}

export function attributeMatches(actual: AttributeValue | undefined, expected: unknown): boolean {
  if (!actual) return false;
  if (expected === undefined) return true;
  if (actual.kind === 'expression') return typeof expected === 'string' && actual.source.trim() === expected.trim();
  return actual.value === expected || String(actual.value) === String(expected);
}

/**
 * Insere guardas em laços (for, while, do-while) para interromper loops infinitos no preview.
 * `guardName` deve ser uma função global que lança erro após um limite.
 */
export function addLoopGuards(code: string, guardName = '__codearenaLoopGuard'): string {
  const parsed = parseSource(code);
  if (!parsed.ok) return code;
  const inserts: { at: number; text: string }[] = [];
  walk(parsed.ast.program, (node) => {
    if (
      node.type === 'ForStatement' ||
      node.type === 'WhileStatement' ||
      node.type === 'DoWhileStatement' ||
      node.type === 'ForInStatement' ||
      node.type === 'ForOfStatement'
    ) {
      const body = node.body;
      if (body.type === 'BlockStatement') {
        inserts.push({ at: (body.start ?? 0) + 1, text: `${guardName}();` });
      } else {
        inserts.push({ at: body.start ?? 0, text: `{${guardName}();` });
        inserts.push({ at: body.end ?? 0, text: '}' });
      }
    }
  });
  inserts.sort((a, b) => b.at - a.at);
  let out = code;
  for (const { at, text } of inserts) out = out.slice(0, at) + text + out.slice(at);
  return out;
}
