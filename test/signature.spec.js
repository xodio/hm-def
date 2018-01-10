
import R from 'ramda';
import $ from 'sanctuary-def';
import Z from 'sanctuary-type-classes';
import HMP from 'hm-parser';
import { assert } from 'chai';
import { resolve } from '../src/signature';

// :: Any -> Any
function wipeFunctions(x) {
  return R.cond([
    [R.is(Function), R.always('[Function]')],
    [R.is(Array), R.map(wipeFunctions)],
    [R.is(Object), R.map(wipeFunctions)],
    [R.T, R.identity],
  ])(x);
}

function assertDeepEqual(actual, expected, message) {
  assert.deepEqual(wipeFunctions(actual), wipeFunctions(expected), message);
}

// Debugging utility
// eslint-disable-next-line no-unused-vars, no-console
function logHMP(sig) { console.log(JSON.stringify(HMP.parse(sig), null, 2)); }

/* Types are by convention starts with a capital leter, so: */
/* eslint-disable new-cap */

describe('Function name', () => {
  it('should be extracted', () => {
    const { name } = resolve([], [], $.env, 'foo :: Number -> Number');
    assert.strictEqual(name, 'foo');
  });
});

describe('Type constraints', () => {
  it('should return {} if not specified', () => {
    const { constraints } = resolve([], [], $.env, 'foo :: Number -> Number');
    assert.deepEqual(constraints, {});
  });

  it('should resolve single constraint', () => {
    const tcs = [Z.Monoid];
    const { constraints } = resolve(tcs, [], $.env, 'foo :: Monoid a => a -> a');
    assert.deepEqual(constraints, { a: [Z.Monoid] });
  });
});

describe('Parameter types', () => {
  it('should resolve built-in types', () => {
    const { types } = resolve([], [], $.env, 'foo :: Number -> String');
    assertDeepEqual(types, [$.Number, $.String]);
  });

  it('should resolve user types', () => {
    const Widget = $.NullaryType('Widget', 'http://example.com/Widget', R.T);
    const env = R.append(Widget, $.env);
    const { types } = resolve([], [], env, 'foo :: Widget -> String');
    assertDeepEqual(types, [Widget, $.String]);
  });

  it('should resolve namespaced user types', () => {
    const Widget = $.NullaryType('x/y/z/Widget', 'http://example.com/Widget', R.T);
    const env = R.append(Widget, $.env);
    const { types } = resolve([], [], env, 'foo :: Widget -> String');
    assertDeepEqual(types, [Widget, $.String]);
  });

  it('should resolve lists', () => {
    const { types } = resolve([], [], $.env, 'foo :: [Number] -> [String]');
    assertDeepEqual(types, [$.Array($.Number), $.Array($.String)]);
  });

  it('should resolve functions', () => {
    const { types } = resolve([], [], $.env, 'foo :: Number -> (Number -> Number)');
    assertDeepEqual(types, [$.Number, $.Function([$.Number, $.Number])]);
  });

  it('should resolve unary types', () => {
    const { types } = resolve([], [], $.env, 'foo :: Number -> StrMap Number');
    assertDeepEqual(types, [$.Number, $.StrMap($.Number)]);
  });

  it('should bark on wrong number of arguments', () => {
    const define = () => resolve([], [], $.env, 'foo :: Number -> StrMap Number Number');
    assert.throws(define, 'expects one argument, got two');
  });

  it('should resolve typevars', () => {
    const a = $.TypeVariable('a');
    const b = $.TypeVariable('b');
    const { types } = resolve([], [], $.env, 'foo :: a -> b -> a');
    assertDeepEqual(types, [a, b, a]);
  });

  it('should resolve maybes', () => {
    const Maybe = $.UnaryType(
      'my-package/Maybe',
      'http://example.com/my-package#Maybe',
      R.T,
      R.always([]),
    );
    const { types } = resolve([], [Maybe], $.env, 'foo :: Maybe String -> String');
    assertDeepEqual(types, [Maybe($.String), $.String]);
  });

  it('should resolve eithers', () => {
    const Either = $.BinaryType(
      'my-package/Either',
      'http://example.com/my-package#Either',
      R.T,
      R.always([]),
      R.always([]),
    );

    const { types } = resolve([], [Either], $.env, 'foo :: Either String Number -> String');
    assertDeepEqual(types, [Either($.String, $.Number), $.String]);
  });

  it('should resolve thunks', () => {
    const { types } = resolve([], [], $.env, 'foo :: () -> Number');
    assertDeepEqual(types, [$.Number]);
  });

  it('should resolve records', () => {
    const { types } = resolve([], [], $.env, 'foo :: { value :: Number } -> Number');
    assertDeepEqual(types, [$.RecordType({ value: $.Number }), $.Number]);
  });

  it('should resolve constraints', () => {
    const a = $.TypeVariable('a');
    const b = $.TypeVariable('b');
    const f = $.UnaryTypeVariable('f');
    const tcs = [Z.Functor];
    const { types } = resolve(tcs, [], $.env, 'foo :: Functor f => (a -> b) -> f a -> f b');
    assertDeepEqual(types, [$.Function([a, b]), f(a), f(b)]);
  });
});
