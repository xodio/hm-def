import S from 'sanctuary';
import HMP from 'hm-parser';
import memoize from 'mem';
import Reader from './Reader';

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

// ----------------------------------------------------------------------------
//
// Utilities
//
// ----------------------------------------------------------------------------

//    isEmpty :: Foldable f => f a -> Boolean
const isEmpty = xs => xs.length === 0;
//    propEq :: String -> a -> StrMap a -> Boolean
const propEq = prop => val => obj => obj[prop] === val;
//    indexBy :: (StrMap a -> String) -> Array (StrMap a) -> StrMap (StrMap a)
const indexBy = memoize
  (f => S.reduce
    (xs => x => S.insert (f (x)) (x) (xs))
    ({}));
//    fromPairs :: Array (Array2 String a) -> StrMap a
const fromPairs = S.reduce
  (acc => curr => S.insert (curr[0]) (curr[1]) (acc))
  ({});
//    cond :: Array (Array2 (a -> Boolean) (a -> b)) -> a -> b
const cond = conds => x => {
  const c = conds.find (y => y[0] (x));
  if (c !== undefined) {
    return c[1] (x);
  }
  throw new Error (`No predicate was satisfied for ${x}`);
};

//    stripNamespace :: String -> String
const stripNamespace = memoize (xs => xs.split ('/').pop ());

//    name :: { name :: a } -> a
const name = S.prop ('name');

//    text :: { text :: a } -> a
const text = S.prop ('text');

//    spellNumber :: Number -> String
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
}[x] || x.toString ());

// ----------------------------------------------------------------------------
//
// Type classes
//
// ----------------------------------------------------------------------------

//    lookupTypeClass :: TypeClassMap -> String -> TypeClass
const lookupTypeClass = tcm => tcName => {
  const tc = tcm[tcName];
  if (!tc) {
    const allTypeClasses = S.pipe ([S.keys, S.joinWith (', ')]) (tcm);
    throw new TypeError (`Type class ${tcName} not found. Available type `
      + `classes are: ${allTypeClasses}`);
  }

  return tc;
};

//    indexTypeClasses :: Array TypeClass -> TypeClassMap
const indexTypeClasses = memoize (indexBy (S.pipe ([
  name,
  stripNamespace,
])));

// ----------------------------------------------------------------------------
//
// Types
//
// ----------------------------------------------------------------------------

//    children :: { children :: Array a } -> Array a
const children = S.prop ('children');

//    firstChild :: { children :: NonEmpty (Array a) } -> a
const firstChild = x => children (x)[0];

//    typeEq :: String -> Object -> Boolean
const typeEq = propEq ('type');

//    hasChildren :: { children :: Array a } -> Boolean
const hasChildren = x => !isEmpty (children (x));

//    assertTypeArity :: Type -> Array Type -> Undefined !
const assertTypeArity = type => argTypes => {
  const expected = type.keys.length;
  const actual = argTypes.length;
  if (expected !== actual) {
    throw new TypeError (
      `Type ${type.name} expects ${spellNumber (expected)} `
      + `argument${expected === 1 ? '' : 's'}, got `
      + `${spellNumber (argTypes.length)}`,
    );
  }
};

//    lookupType :: SignatureEntry -> Reader (TypeMap Type)
const lookupType = entry => Reader (typeMap_ => {
  const typeName = entry.text;
  const t = typeMap_[typeName];
  if (!t) {
    const allTypes = S.joinWith (', ') (S.keys (typeMap_));
    throw new TypeError (`Type ${typeName} not found in env. Available types `
      + `are: ${allTypes}`);
  }
  return t;
});

// ----------------------------------------------------------------------------
//
// API
//
// ----------------------------------------------------------------------------

//           resolve :: Object -> Array TypeClass -> Array Type -> String
//                      -> { name :: String
//                         , constraints :: StrMap TypeClass
//                         , types :: (Array Type)
//                         }
export const resolve = $ => {
  // --------------------------------------------------------------------------
  //
  // Type classes
  //
  // --------------------------------------------------------------------------

  //    constraintNames :: Array SignatureConstraint -> StrMap String
  const constraintNames = S.reduce
    (xs => x => {
      const typeVarName = S.prop ('typevar') (x);
      const newTypeClassName = S.prop ('typeclass') (x);
      const typeVarClasses = S.fromMaybe
        ([])
        (S.get
          (S.is ($.Array ($.String)))
          (typeVarName)
          (xs));
      return S.insert
        (typeVarName)
        (S.append (newTypeClassName) (typeVarClasses))
        (xs);
    })
    ({});

  //    constraints :: TypeClassMap -> Array SignatureConstraint
  //                   -> StrMap (Array TypeClass)
  const constraints = tcm => S.pipe ([
    constraintNames,
    S.map (S.map (lookupTypeClass (tcm))),
  ]);

  // --------------------------------------------------------------------------
  //
  // Types
  //
  // --------------------------------------------------------------------------

  //    fromUnaryType :: Type -> (Type -> Type)
  const fromUnaryType = t => $.UnaryType
    (t.name)
    (t.url)
    (t._test)
    (t.types.$1.extractor);

  //    fromBinaryType :: Type -> (Type -> Type -> Type)
  const fromBinaryType = t => $.BinaryType
    (t.name)
    (t.url)
    (t._test)
    (t.types.$1.extractor)
    (t.types.$2.extractor);

  //    constructType :: (Array Type) -> Type -> Type
  const constructType = argTypes => t => {
    assertTypeArity (t) (argTypes);
    switch (t.type) {
      case 'BINARY':
        return fromBinaryType (t) (argTypes[0]) (argTypes[1]);
      case 'UNARY':
        return fromUnaryType (t) (argTypes[0]);
      default: {
        throw new TypeError (`Type ${t.name} should be recreated with `
          + `Types: ${S.map (name, argTypes)} but it haven't got `
          + `a proper function recreator for type ${t.type}.`);
      }
    }
  };

  // Helper Type to wipe out thunks
  const Thunk = $.NullaryType ('hm-def/Thunk') ('') (S.K (false));

  //    convertType :: SignatureEntry -> Reader (TypeMap Type)
  const convertType = memoize (entry => cond ([
      [typeEq ('typeConstructor'), convertTypeConstructor],
      [typeEq ('function'), convertFunction],
      [typeEq ('list'), convertList],
      [typeEq ('record'), convertRecord],
      [typeEq ('constrainedType'), convertConstrainedType],
      [typeEq ('typevar'), S.pipe ([convertTypevar, Reader.of])],
      [typeEq ('thunk'), S.K (Reader.of (Thunk))],
      [S.K (true), e => {
        throw new Error
          (`Don't know what to do with signature entry ${e.type}`);
      }],
    ]) (entry));

  //    convertTypes :: Array SignatureEntry -> Reader (TypeMap (Array Type))
  const convertTypes = memoize (S.pipe ([
      S.map (convertType),
      S.unchecked.sequence (Reader),
      S.unchecked.map (S.reject (S.equals (Thunk))),
    ]));

  //    convertTypeConstructor :: SignatureEntry -> Reader (TypeMap Type)
  const convertTypeConstructor = memoize (S.ifElse
    (hasChildren)
    (y => S.pipe ([
      children,
      convertTypes,
      x => S.unchecked.lift2 (constructType) (x) (lookupType (y)),
    ]) (y))
    (lookupType));

  //    convertList :: SignatureEntry -> Reader (TypeMap Type)
  const convertList = memoize (S.pipe ([
    firstChild,
    convertType,
    S.unchecked.map ($.Array),
  ]));

  //    convertFunction :: SignatureEntry -> Reader (TypeMap Type)
  const convertFunction = memoize (S.pipe ([
    children,
    convertTypes,
    S.unchecked.map (types => S.reduce
      (f => x => $.Function ([x, f]))
      (types[types.length - 1])
      (types.slice (0, -1))),
  ]));

  //    convertRecordField :: SignatureEntry
  //                          -> Reader (TypeMap (Pair String Type))
  const convertRecordField = memoize (entry => S.pipe ([
    firstChild,
    convertType,
    S.unchecked.map (valueType => [entry.text, valueType]),
  ]) (entry));

  //    convertRecord :: SignatureEntry -> Reader (TypeMap Type)
  const convertRecord = memoize (S.pipe ([
    children,
    S.map (convertRecordField),
    S.unchecked.sequence (Reader),
    S.unchecked.map (fromPairs),
    S.unchecked.map ($.RecordType),
  ]));

  //    convertTypevar :: SignatureEntry -> Type
  const convertTypevar = memoize (x => $.TypeVariable (text (x)));

  //    unaryTypevar :: SignatureEntry -> (Type -> Type)
  const unaryTypevar = memoize (x => $.UnaryTypeVariable (text (x)));

  //    convertConstrainedType :: SignatureEntry -> Reader (TypeMap Type)
  const convertConstrainedType = memoize (entry => S.pipe ([
    firstChild,
    convertType,
    S.unchecked.map (unaryTypevar (entry)),
  ]) (entry));

  //    shortName :: Type -> String
  const shortName = x => stripNamespace (name (x));

  //    indexTypes :: Array Type -> TypeMap
  const indexTypes = indexBy (shortName);

  return typeClasses => env => memoize (signature => {
    const typeMap = indexTypes (env);
    const typeClassMap = indexTypeClasses (typeClasses);
    const sig = HMP.parse (signature);
    const entries = sig.type.children;

    return {
      name: sig.name,
      constraints: constraints (typeClassMap) (sig.constraints),
      types: convertTypes (entries).run (typeMap),
    };
  });
};
