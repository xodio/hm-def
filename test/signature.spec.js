import S from 'sanctuary';
import $ from 'sanctuary-def';
import Z from 'sanctuary-type-classes';
import show from 'sanctuary-show';
import {assert} from 'chai';
import {resolve} from '../src/signature';

// assertSameTypes :: [Type] -> [Type] -> Undefined !
const assertSameTypes = actual => expected => {
  if (!(S.equals (actual) (expected))) { // Array and Type are both Setoid providing equals()
    assert.equal (show (actual), show (expected), 'S.equals'); // assert.equal() because assert.isOk() does not diff actual/expected
    assert.fail (); // final failure in the hypothetical case that show() would return same strings for different types
  }
};

describe ('Function name', () => {
  it ('should be extracted', () => {
    const {name} = resolve ($) ([]) ($.env) ('foo :: Number -> Number');
    assert.strictEqual (name, 'foo');
  });
});

describe ('Type constraints', () => {
  it ('should return {} if not specified', () => {
    const {constraints} = resolve ($) ([]) ($.env) ('foo :: Number -> Number');
    assert.deepEqual (constraints, {});
  });

  it ('should resolve single constraint', () => {
    const tcs = [Z.Monoid];
    const {constraints} = resolve ($) (tcs) ($.env) ('foo :: Monoid a => a -> a');
    assert.deepEqual (constraints, {a: [Z.Monoid]});
  });

  it ('should resolve multiple contraints', () => {
    const tcs = [Z.Monoid, Z.Setoid];
    const {constraints} = resolve ($) (tcs) ($.env) ('foo :: (Monoid a, Setoid b) => a -> b');
    assert.deepEqual (constraints, {a: [Z.Monoid], b: [Z.Setoid]});
  });

  it ('should resolve multiple contraints on same variable', () => {
    const tcs = [Z.Monoid, Z.Setoid];
    const {constraints} = resolve ($) (tcs) ($.env) ('foo :: (Monoid a, Setoid a) => a -> b');
    assert.deepEqual (constraints, {a: [Z.Monoid, Z.Setoid]});
  });
});

describe ('Parameter types', () => {
  it ('should resolve built-in types', () => {
    const {types} = resolve ($) ([]) ($.env) ('foo :: Number -> String');
    assert.deepEqual (types, [$.Number, $.String]);
  });

  it ('should resolve user types', () => {
    const Widget = $.NullaryType ('Widget') ('http://example.com/Widget') ([]) (S.K (true));
    const env = $.env.concat ([Widget]);
    const {types} = resolve ($) ([]) (env) ('foo :: Widget -> String');
    assert.deepEqual (types, [Widget, $.String]);
  });

  it ('should resolve namespaced user types', () => {
    const Widget = $.NullaryType ('x/y/z/Widget') ('http://example.com/Widget') ([]) (S.K (true));
    const env = $.env.concat ([Widget]);
    const {types} = resolve ($) ([]) (env) ('foo :: Widget -> String');
    assert.deepEqual (types, [Widget, $.String]);
  });

  it ('should resolve lists', () => {
    const {types} = resolve ($) ([]) ($.env) ('foo :: [Number] -> [String]');
    assertSameTypes (types) ([$.Array ($.Number), $.Array ($.String)]);
  });

  it ('should resolve functions', () => {
    const {types} = resolve ($) ([]) ($.env) ('foo :: Number -> (Number -> Number)');
    assertSameTypes (types) ([$.Number, $.Function ([$.Number, $.Number])]);
  });

  it ('should resolve functions that return multi-arity functions', () => {
    const {types} = resolve ($) ([]) ($.env) ('foo :: Number -> (Number -> Number -> Number)');
    assertSameTypes (types) ([$.Number, $.Function ([$.Number, $.Function ([$.Number, $.Number])])]);
  });

  it ('should resolve higher-order functions that take multi-arity functions', () => {
    const {types} = resolve ($) ([]) ($.env) ('foo :: (Number -> Number -> Number) -> Number');
    const expecteds = [
      $.Function ([
        $.Number,
        $.Function ([
          $.Number,
          $.Number,
        ]),
      ]),
      $.Number,
    ];
    assertSameTypes (types) (expecteds);
  });

  it ('should resolve unary types', () => {
    const {types} = resolve ($) ([]) ($.env) ('foo :: Number -> StrMap Number');
    assertSameTypes (types) ([$.Number, $.StrMap ($.Number)]);
  });

  it ('should bark on wrong number of arguments', () => {
    const define = () => resolve ($) ([]) ($.env) ('foo :: Number -> StrMap Number Number');
    assert.throws (define, 'expects one argument, got two');
  });

  it ('should resolve typevars', () => {
    const a = $.TypeVariable ('a');
    const b = $.TypeVariable ('b');
    const {types} = resolve ($) ([]) ($.env) ('foo :: a -> b -> a');
    S.zip (types) ([a, b, a]).forEach (pair => {
      const actual = S.fst (pair);
      const expected = S.snd (pair);
      assert.equal (actual.name, expected.name);
      assert.equal (actual.type, expected.type);
      assert.deepEqual (actual.keys, expected.keys);
      assert.deepEqual (actual.types, expected.types);
    });
  });

  it ('should resolve maybes', () => {
    const Maybe = $.UnaryType
      ('my-package/Maybe')
      ('http://example.com/my-package#Maybe')
      ([])
      (S.K (true))
      (S.K ([]));

    const env = $.env.concat ([
      Maybe ($.Unknown),
    ]);
    const {types} = resolve ($) ([]) (env) ('foo :: Maybe String -> String');
    assertSameTypes (types) ([Maybe ($.String), $.String]);
  });

  it ('should resolve eithers', () => {
    const Either = $.BinaryType
      ('my-package/Either')
      ('http://example.com/my-package#Either')
      ([])
      (x => x != null && x['@@type'] === 'my-package/Either')
      (either => (either.isLeft ? [either.value] : []))
      (either => (either.isRight ? [either.value] : []));

    const env = $.env.concat ([
      Either ($.Unknown) ($.Unknown),
    ]);
    const {types} = resolve ($) ([]) (env) ('foo :: Either String Number -> String');
    assertSameTypes (types) ([Either ($.String) ($.Number), $.String]);
  });

  it ('should resolve thunks', () => {
    const {types} = resolve ($) ([]) ($.env) ('foo :: () -> Number');
    assertSameTypes (types) ([$.Number]);
  });

  it ('should resolve records', () => {
    const {types} = resolve ($) ([]) ($.env) ('foo :: { value :: Number } -> Number');
    assertSameTypes (types) ([$.RecordType ({value: $.Number}), $.Number]);
  });

  it ('should resolve constraints', () => {
    const a = $.TypeVariable ('a');
    const b = $.TypeVariable ('b');
    const f = $.UnaryTypeVariable ('f');
    const tcs = [Z.Functor];
    const {types} = resolve ($) (tcs) ($.env) ('foo :: Functor f => (a -> b) -> f a -> f b');
    assertSameTypes (types) ([$.Function ([a, b]), f (a), f (b)]);
  });
});
