// Static audit for the in-memory store: store.read() returns the live, frozen
// state, so code must never change what it read — only a transaction's draft.
// Traces every value derived from `await store.read()` and reports:
//   MUTATE  — an assignment, delete, ++/-- or mutating array method on it
//   PASSED  — it is handed to another function (check that function doesn't mutate)
// Usage: node server/tools/audit-read-mutations.mjs server/index.js [more files]
//        AUDIT_PARAMS=fnA,fnB node ... — also treat those functions' parameters
//        as read data, to check the helpers a PASSED line hands it to.
// Known gaps: for…of loop variables and callback parameters are not traced.
// The frozen state still throws at runtime (ESM is strict mode) — this only
// finds such bugs before a user does.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../../package.json', import.meta.url));
const { parse } = require('@babel/parser');
const traverse = require('@babel/traverse').default;

const MUTATING_METHODS = new Set(['push', 'pop', 'shift', 'unshift', 'splice', 'sort', 'reverse', 'fill', 'copyWithin']);
// Built-ins and helpers that only read their arguments.
const PURE_CALLEES = new Set(['find', 'filter', 'map', 'some', 'every', 'includes', 'reduce', 'forEach', 'flatMap', 'slice', 'concat', 'join', 'indexOf', 'findIndex', 'findLast', 'at', 'keys', 'values', 'entries',
  'String', 'Number', 'Boolean', 'Array.isArray', 'Object.keys', 'Object.values', 'Object.entries', 'Object.fromEntries', 'JSON.stringify', 'Math.max', 'Math.min', 'Math.round', 'Set', 'Map', 'Date', 'Promise.all',
  'res.json', 'res.send', 'console.log', 'console.error', 'structuredClone', 'assertDemoActor', 'assertMatchParticipant', 'publicProfile']);

const calleeName = (node) => {
  if (node.type === 'Identifier') return node.name;
  if (node.type === 'MemberExpression' && !node.computed) {
    const object = node.object.type === 'Identifier' ? node.object.name : node.object.type === 'NewExpression' && node.object.callee.type === 'Identifier' ? node.object.callee.name : null;
    return object ? `${object}.${node.property.name}` : node.property.name;
  }
  return null;
};

function rootIdentifier(node) {
  while (node) {
    if (node.type === 'Identifier') return node;
    if (node.type === 'MemberExpression' || node.type === 'OptionalMemberExpression') node = node.object;
    else if (node.type === 'CallExpression' || node.type === 'OptionalCallExpression') node = node.callee;
    else if (node.type === 'TSNonNullExpression' || node.type === 'ParenthesizedExpression') node = node.expression;
    else return null;
  }
  return null;
}

const isStoreRead = (node) => node?.type === 'AwaitExpression' && node.argument?.type === 'CallExpression'
  && calleeName(node.argument.callee) === 'store.read';

for (const file of process.argv.slice(2)) {
  const source = readFileSync(file, 'utf8');
  const ast = parse(source, { sourceType: 'module', plugins: ['topLevelAwait'] });
  const tainted = new Set(); // Babel bindings derived from store.read()
  const isTainted = (path, identifier) => identifier && tainted.has(path.scope.getBinding(identifier.name));
  const refsTainted = (path) => {
    let hit = false;
    path.traverse({ Identifier(inner) { if (inner.isReferencedIdentifier() && tainted.has(inner.scope.getBinding(inner.node.name))) hit = true; } });
    return hit;
  };

  const auditParams = new Set((process.env.AUDIT_PARAMS || '').split(',').filter(Boolean));
  if (auditParams.size) {
    traverse(ast, {
      Function(path) {
        const name = path.node.id?.name || (path.parentPath.isVariableDeclarator() ? path.parent.id.name : null);
        if (!auditParams.has(name)) return;
        for (const param of path.get('params')) for (const id of Object.keys(param.getBindingIdentifiers())) tainted.add(path.scope.getBinding(id));
      },
    });
  }

  // Pass 1 (repeated to a fixed point): mark read results and everything derived from them.
  let grew = true;
  while (grew) {
    grew = false;
    traverse(ast, {
      VariableDeclarator(path) {
        const { id, init } = path.node;
        if (!init) return;
        const fromRead = isStoreRead(init) || refsTainted(path.get('init'));
        if (!fromRead) return;
        const names = id.type === 'Identifier' ? [id.name] : Object.keys(path.getBindingIdentifiers());
        for (const name of names) {
          const binding = path.scope.getBinding(name);
          if (binding && !tainted.has(binding)) { tainted.add(binding); grew = true; }
        }
      },
      AssignmentExpression(path) {
        // `let x; x = db.users.find(...)` — taint the re-assigned variable too
        const { left } = path.node;
        if (left.type !== 'Identifier') return;
        const binding = path.scope.getBinding(left.name);
        if (binding && !tainted.has(binding) && (isStoreRead(path.node.right) || refsTainted(path.get('right')))) { tainted.add(binding); grew = true; }
      },
    });
  }

  // Pass 2: report changes to, and hand-offs of, tainted values.
  const report = (path, kind, text) => console.log(`${file}:${path.node.loc.start.line}  ${kind.padEnd(6)} ${text}`);
  traverse(ast, {
    AssignmentExpression(path) {
      const { left } = path.node;
      if (left.type === 'Identifier') return; // rebinding a local is fine
      if (isTainted(path, rootIdentifier(left))) report(path, 'MUTATE', source.slice(path.node.start, path.node.end).slice(0, 120));
    },
    UpdateExpression(path) {
      if (path.node.argument.type !== 'Identifier' && isTainted(path, rootIdentifier(path.node.argument))) report(path, 'MUTATE', source.slice(path.node.start, path.node.end));
    },
    UnaryExpression(path) {
      if (path.node.operator === 'delete' && isTainted(path, rootIdentifier(path.node.argument))) report(path, 'MUTATE', source.slice(path.node.start, path.node.end));
    },
    CallExpression(path) {
      const { callee, arguments: args } = path.node;
      if (callee.type === 'MemberExpression' && !callee.computed && MUTATING_METHODS.has(callee.property.name) && isTainted(path, rootIdentifier(callee.object))) {
        // `.slice().sort()` / `.filter().sort()` sort a fresh copy — fine.
        const object = callee.object;
        const freshCopy = object.type === 'CallExpression' && object.callee.type === 'MemberExpression' && ['slice', 'filter', 'map', 'concat', 'flatMap'].includes(object.callee.property?.name);
        const spreadCopy = object.type === 'ArrayExpression';
        if (!freshCopy && !spreadCopy) report(path, 'MUTATE', source.slice(path.node.start, path.node.end).slice(0, 120));
      }
      if (callee.type === 'Object.assign' || calleeName(callee) === 'Object.assign') {
        if (args[0] && isTainted(path, rootIdentifier(args[0]))) report(path, 'MUTATE', source.slice(path.node.start, path.node.end).slice(0, 120));
        return;
      }
      const name = calleeName(callee);
      if (!name || PURE_CALLEES.has(name) || PURE_CALLEES.has(name.split('.').pop())) return;
      if (args.some((arg) => arg.type === 'Identifier' && isTainted(path, arg))) report(path, 'PASSED', `${name}(${args.map((a) => (a.type === 'Identifier' ? a.name : '…')).join(', ')})`);
    },
  });
}
