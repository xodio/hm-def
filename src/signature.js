
import R from 'ramda';
import { Reader } from 'ramda-fantasy';
import HMP from 'hm-parser';
import $ from 'sanctuary-def';

/* We need a recursion, so: */
/* eslint-disable no-use-before-define */

/* Types are by convention starts with a capital leter, so: */
/* eslint-disable new-cap */

/*
From https://www.npmjs.com/package/hindley-milner-parser-js:

HMP.parse('hello :: Foo a => a -> String');
{
  name: 'hello',
  constraints: [
    {typeclass: 'Foo', typevar: 'a'}],
  type:
    {type: 'function', text: '', children: [
      {type: 'typevar', text: 'a', children: []},
      {type: 'typeConstructor', text: 'String', children: []}]};
*/

// type TypeMap = StrMap Type

//-----------------------------------------------------------------------------
//
// Utilities
//
//-----------------------------------------------------------------------------

const lift = R.map;
const lift2 = R.liftN(2);
const uncurry2 = R.uncurryN(2);

// :: String -> String
const stripNamespace = R.compose(R.last, R.split('/'));

//-----------------------------------------------------------------------------
//
// Type classes
//
//-----------------------------------------------------------------------------

// TypeClassMap -> String -> TypeClass
const lookupTypeClass = tcm => (name) => {
  const tc = tcm[name];
  if (!tc) {
    const allTypeClasses = R.keys(tcm).join(', ');
    throw new TypeError(
      `Type class ${name} not found. ` +
      `Available type classes are: ${allTypeClasses}`,
    );
  }

  return tc;
};

// [SignatureConstraint] -> StrMap String
export const constraintNames = R.converge(R.zipObj, [
  R.pluck('typevar'),
  R.pluck('typeclass'),
]);

// TypeClassMap -> [SignatureConstraint] -> StrMap [TypeClass]
export const constraints = uncurry2(
  tcm => R.compose(
    R.map(R.of),
    R.map(lookupTypeClass(tcm)),
    constraintNames,
  ),
);

// :: [TypeClass] -> TypeClassMap
const indexTypeClasses = R.indexBy(R.compose(
  stripNamespace,
  R.prop('name'),
));

//-----------------------------------------------------------------------------
//
// Types
//
//-----------------------------------------------------------------------------

// :: { children :: [a] } -> [a]
const children = R.prop('children');

// :: { children :: [a] } -> a
const firstChild = R.compose(R.prop(0), children);

// :: Object -> String -> Boolean
const typeEq = R.propEq('type');

// :: SignatureEntry -> Boolean
const hasChildren = R.compose(R.not, R.isEmpty, R.prop('children'));

// :: SignatureEntry -> Reader TypeMap Type
const lookupType = entry => Reader((typeMap) => {
  const name = entry.text;
  const t = typeMap[name];
  if (!t) {
    const allTypes = R.keys(typeMap).join(', ');
    throw new TypeError(
      `Type ${name} not found in env. ` +
      `Available types are: ${allTypes}`,
    );
  }
  return t;
});

// Helper Type to wipe out thunks
const Thunk = $.NullaryType('hm-def/Thunk', '', R.F);

// :: SignatureEntry -> Reader TypeMap Type
const convertTypeConstructor = entry => R.ifElse(
  hasChildren,
  R.compose(
    lift2(R.apply)(lookupType(entry)),
    convertTypes,
    children,
  ),
  lookupType,
)(entry);

// :: SignatureEntry -> Reader TypeMap Type
const convertList = R.compose(
  lift($.Array),
  convertType,
  firstChild,
);

// :: SignatureEntry -> Reader TypeMap Type
const convertFunction = R.compose(
  lift($.Function),
  convertTypes,
  children,
);

// :: SignatureEntry -> Reader TypeMap (Pair String Type)
const convertRecordField = entry => R.compose(
  lift(valueType => [entry.text, valueType]),
  convertType,
  firstChild,
)(entry);

// :: SignatureEntry -> Reader TypeMap Type
const convertRecord = R.compose(
  lift($.RecordType),
  lift(R.fromPairs),
  R.sequence(Reader.of),
  R.map(convertRecordField),
  children,
);

// :: SignatureEntry -> Type
const convertTypevar = R.memoize(R.compose($.TypeVariable, R.prop('text')));

// :: SignatureEntry -> (Type -> Type)
const unaryTypevar = R.memoize(R.compose($.UnaryTypeVariable, R.prop('text')));

// :: SignatureEntry -> Reader TypeMap Type
const convertConstrainedType = entry => R.compose(
  lift(unaryTypevar(entry)),
  convertType,
  firstChild,
)(entry);

// :: SignatureEntry -> Reader TypeMap Type
function convertType(entry) {
  return R.cond([
    [typeEq('typeConstructor'), convertTypeConstructor],
    [typeEq('function'), convertFunction],
    [typeEq('list'), convertList],
    [typeEq('record'), convertRecord],
    [typeEq('constrainedType'), convertConstrainedType],
    [typeEq('typevar'), R.compose(Reader.of, convertTypevar)],
    [typeEq('thunk'), R.always(Reader.of(Thunk))],
    [R.T, (e) => {
      throw new Error(`Don't know what to do with signature entry ${e.type}`);
    }],
  ])(entry);
}

// :: [SignatureEntry] -> Reader TypeMap [Type]
function convertTypes(entries) {
  return R.compose(
    lift(R.reject(R.equals(Thunk))),
    R.sequence(Reader.of),
    R.map(convertType),
  )(entries);
}

// Type -> Type
const ensureParametrized = R.when(
  R.is(Function),
  fn => R.apply(fn, R.repeat($.Unknown, fn.length)),
);

// :: Type -> String
const shortName = R.compose(
  stripNamespace,
  R.prop('name'),
  ensureParametrized,
);

// :: [Type] -> TypeMap
const indexTypes = R.indexBy(shortName);

//-----------------------------------------------------------------------------
//
// API
//
//-----------------------------------------------------------------------------

// :: [TypeClass] -> [Type] -> String -> {
//      name :: String,
//      constraints :: StrMap TypeClass,
//      types :: [Type]
//    }
export const resolve = R.curry((typeClasses, env, signature) => {
  const typeMap = indexTypes(env);
  const typeClassMap = indexTypeClasses(typeClasses);
  const sig = HMP.parse(signature);
  const entries = sig.type.children;
  return {
    name: sig.name,
    constraints: constraints(typeClassMap, sig.constraints),
    types: convertTypes(entries).run(typeMap),
  };
});
