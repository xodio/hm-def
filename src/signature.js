
import R from 'ramda';
import { Reader } from 'ramda-fantasy';
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

// TODO: implement, so
// eslint-disable-next-line no-unused-vars
export const constraints = sig => ({});

const lift = R.map;

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
    throw new TypeError(`Type ${name} not found in env. Available types are: ${allTypes}`);
  }
  return t;
});

// Helper Type to wipe out thunks
const Thunk = $.NullaryType('hm-def/Thunk', '', R.F);

// :: SignatureEntry -> Reader TypeMap Type
const convertTypeConstructor = entry => R.ifElse(
  hasChildren,
  R.compose(
    readerOfArgs => Reader(typeMap =>
      lookupType(entry).run(typeMap)(...readerOfArgs.run(typeMap)),
    ),
    convertTypes,
    R.prop('children'),
  ),
  lookupType,
)(entry);

// :: SignatureEntry -> Reader TypeMap Type
const convertList = R.compose(
  lift($.Array),
  convertType,
  R.path(['children', 0]),
);

// :: SignatureEntry -> Reader TypeMap Type
const convertFunction = R.compose(
  lift($.Function),
  convertTypes,
  R.prop('children'),
);

// :: SignatureEntry -> Reader TypeMap (Pair String Type)
const convertRecordField = entry =>
  convertType(entry.children[0]).map(valueType => [
    entry.text, // field key
    valueType,  // field value
  ]);

// :: SignatureEntry -> Reader TypeMap Type
const convertRecord = R.compose(
  lift($.RecordType),
  lift(R.fromPairs),
  R.sequence(Reader.of),
  R.map(convertRecordField),
  R.prop('children'),
);

// :: SignatureEntry -> Type
const convertTypevar = R.memoize(R.compose($.TypeVariable, R.prop('text')));

// :: SignatureEntry -> (Type -> Type)
const unaryTypevar = R.memoize(R.compose($.UnaryTypeVariable, R.prop('text')));

// :: SignatureEntry -> Reader TypeMap Type
const convertConstrainedType = entry => Reader(typeMap =>
  unaryTypevar(entry)(convertType(entry.children[0]).run(typeMap)), // TODO:
);

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

// :: TypeMap -> [SignatureEntry] -> [Type]
export const types = R.curry((typeMap, entries) =>
  convertTypes(entries).run(typeMap),
);

// :: String -> String
const stripNamespace = R.compose(R.last, R.split('/'));

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
export const typemap = R.indexBy(shortName);
