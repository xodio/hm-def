
import * as R from 'ramda';
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

// :: Number -> String
const spellNumber = x => ({
  1: 'one',
  2: 'two',
  3: 'three',
  4: 'four',
  5: 'five',
  6: 'six',
  7: 'seven',
  8: 'eight',
  9: 'nine',
}[x] || x.toString());

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

// Clones an object but do not flatten its prototype properties
// as R.clone does
// :: a -> a
const cloneObjPreserveType = (obj) => {
  // eslint-disable-next-line prefer-const
  let result = Object.create(Object.getPrototypeOf(obj));
  const properties = Object.getOwnPropertyNames(obj);
  for (let i = 0; i < properties.length; i += 1) {
    result[properties[i]] = obj[properties[i]];
  }

  return result;
};

// :: [Type] -> Type -> Type
const substituteTypes = argTypes => type => R.compose(
  R.reduce(
    (t, [argKey, argType]) => {
      // We’re in reducer, so we can cheat and mutate. The mutation is
      // necessary (versus R.assoc) to preserve the type of `t`
      // eslint-disable-next-line no-param-reassign
      t.types[argKey].type = argType;
      return t;
    },
    cloneObjPreserveType(type),
  ),
  R.zip(R.__, argTypes),
  R.tap((keys) => {
    const expected = keys.length;
    const actual = argTypes.length;
    if (expected !== actual) {
      throw new TypeError(
        `Type ${type.name} expects ${spellNumber(expected)} ` +
        `argument${expected === 1 ? '' : 's'}, ` +
        `got ${spellNumber(argTypes.length)}`,
      );
    }
  }),
  R.prop('keys'),
)(type);

//  :: Type -> (Type -> Type)
const fromUnaryType = t => $.UnaryType(t.name, t.url, t._test, t.types.$1.extractor);
//  :: Type -> (Type -> Type -> Type)
const fromBinaryType = t => $.BinaryType(t.name, t.url, t._test, t.types.$1.extractor, t.types.$2.extractor);

// :: Type -> Boolean
const isUnaryType = R.propEq('type', 'UNARY');
// :: Type -> Boolean
const isBinaryType = R.propEq('type', 'BINARY');

// :: [Type] -> Type -> Type
const constructNewTypeFromType = argTypes => type => R.compose(
  R.apply(R.__, argTypes),
  R.cond([
    [isUnaryType, fromUnaryType],
    [isBinaryType, fromBinaryType],
    [R.T, (x) => {
      // Actually it won't happen.
      // This is to ensure a clear error if one day sactuary-def change constants or something else.
      throw new TypeError(
        `Type ${type.name} should be recreated with Types: ${R.map(R.prop('name'), argTypes)} ` +
        `but it haven't got a proper function recreator for type ${type.type}.`
      );
    }]
  ])
)(type);

// :: [Type] -> Type|Function -> Type
const constructType = uncurry2(argTypes =>
  R.ifElse(
    R.is(Function),
    R.apply(R.__, argTypes),
    constructNewTypeFromType(argTypes)
  )
);

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
    lift2(constructType)(R.__, lookupType(entry)),
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
