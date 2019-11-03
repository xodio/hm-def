import {unchecked as S} from 'sanctuary';
import $ from 'sanctuary-def';
import Z from 'sanctuary-type-classes';
import {assert} from 'chai';
import {create} from '../src/index';

const hasProp = p => x => x[p] !== undefined;

const $Map = $.BinaryType
  ('Map')
  ('someurl')
  ([])
  (S.is ($.Object))
  (S.keys)
  (S.values);

const $Wrapper = $.UnaryType
  ('Wrapper')
  ('someurl')
  ([$.Object])
  (x => 'value' in x)
  (S.pipe ([S.prop ('value'), S.of (Array)]));

const def = create ({
  $,
  checkTypes: true,
  env: $.env.concat ([
    $Map ($.Unknown) ($.Unknown),
    $Wrapper ($.Unknown),
  ]),
  typeClasses: [
    Z.Functor,
    Z.Semigroup,
  ],
});

describe ('def', () => {
  it ('should work with unary functions', () => {
    const foo = def
      ('foo :: Number -> String')
      (x => x.toString ());

    assert.strictEqual (foo (42), '42');
    assert.throws (() => foo (null), 'The value at position 1 is not a member of ‘Number’');
  });

  it ('should work with thunks', () => {
    const foo = def
      ('foo :: () -> Number')
      (() => 42);

    assert.strictEqual (foo (), 42);
  });

  it ('should work with records', () => {
    const foo = def
      ('foo :: Number -> { value :: Number }')
      (x => ({value: x}));

    assert.deepEqual (foo (42), {value: 42});
  });

  it ('should work with unary type variables', () => {
    const foo = def
      ('foo :: Functor f => (a -> b) -> f a -> f b')
      (fn => x => x.map (e => fn (e)));

    const cube = x => x * x * x;

    assert.deepEqual (foo (cube) ([1, 2, 3]), [1, 8, 27]);
    assert.throws (() => foo (cube) ('im-not-an-unary-type'), 'The value at position 1 is not a member of ‘f a’');
  });

  it ('should work with type class constraints', () => {
    const foo = def
      ('foo :: Semigroup a => a -> a -> a')
      (y => x => x.concat (y));

    assert.deepEqual (foo ([3, 4]) ([1, 2]), [1, 2, 3, 4]);
    assert.deepEqual (foo (' world') ('Hello'), 'Hello world');
    assert.throws (() => foo (42) (13), 'requires ‘a’ to satisfy the Semigroup type-class constraint');
  });

  it ('should work with users UnaryTypes', () => {
    const foo = def
      ('foo :: Wrapper Number -> Number')
      (S.prop ('value'));

    assert.equal (foo ({value: 10}), 10);
    assert.throws (() => foo ({}), 'The value at position 1 is not a member of ‘Wrapper Number’');
    assert.throws (() => foo (null), 'The value at position 1 is not a member of ‘Wrapper Number’');
    assert.throws (() => foo ({value: 'hello'}), 'The value at position 1 is not a member of ‘Number’');

    const bar = def
      ('bar :: Wrapper Number -> Wrapper String')
      (x => { x.value = x.value.toString (); return x; });

    assert.deepEqual (bar ({value: 10}), {value: '10'});
    assert.throws (() => bar ({}), 'The value at position 1 is not a member of ‘Wrapper Number’');
    assert.throws (() => bar (null), 'The value at position 1 is not a member of ‘Wrapper Number’');
    assert.throws (() => bar ({value: 'hello'}), 'The value at position 1 is not a member of ‘Number’');
  });

  it ('should work with users BinaryTypes', () => {
    const foo = def
      ('foo :: Map String Number -> Map String String')
      (S.map (x => x.toString ()));

    assert.deepEqual (foo ({a: 5, b: 7}), {a: '5', b: '7'});
    assert.throws (() => foo ({a: false}), 'The value at position 1 is not a member of ‘Number’');
    assert.throws (() => foo (null), 'The value at position 1 is not a member of ‘Map String Number’');

    const bar = def
      ('bar :: Map String (Map String Number) -> Map String Boolean')
      (S.map (S.pipe ([
        S.values,
        S.sum,
        S.lt (3),
      ])));

    assert.deepEqual (bar ({a: {x: 0, y: 1}, b: {x: 1, y: 3}}), {a: true, b: false});
    assert.throws (() => bar ({a: false}), 'The value at position 1 is not a member of ‘Map String Number’');
    assert.throws (() => bar (null), 'The value at position 1 is not a member of ‘Map String (Map String Number)’');

    const buzz = def
      ('buzz :: Map a b -> Map a a')
      (S.map (x => x.toString ()));

    assert.deepEqual (buzz ({a: 1, b: 2}), {a: '1', b: '2'});
    assert.throws (() => buzz (null), 'The value at position 1 is not a member of ‘Map a b’');
  });

  it ('should work with higher order functions', () => {
    const sig = 'foo :: (Number -> Number -> Number) -> Number';
    const foo = def
      (sig)
      (a => b => c => a + b + c);

    assert.equal (foo.toString (), sig);
  });
});

describe ('README examples', () => {
  it ('should have correct magnitude', () => {
    const magnitude = def
      ('magnitude :: [Number] -> Number')
      (xs => Math.sqrt (xs.reduce ((acc, x) => acc + (x * x), 0)));

    const result = magnitude ([3, 4, 0]);
    assert.equal (result, 5);
  });

  it ('should have correct minMax', () => {
    const minMax = def
      ('minMax :: [Number] -> { min :: Number, max :: Number }')
      (xs => xs.reduce (
        (acc, x) => ({
          min: Math.min (x, acc.min),
          max: Math.max (x, acc.max),
        }),
        {min: Infinity, max: -Infinity},
      ));

    const result = minMax ([1, 4, 6, 3, 4, 5, -3, 4]);
    assert.deepEqual (result, {min: -3, max: 6});
  });

  it ('should have correct occurrences', () => {
    const occurrences = def
      ('occurrences :: [String] -> StrMap Number')
      (xs => xs.reduce (
        (acc, x) => {
          acc[x] = (acc[x] || 0) + 1; // eslint-disable-line
          return acc;
        },
        {},
      ));

    const result = occurrences ([
      'foo', 'bar', 'bar', 'baz', 'bar', 'qux', 'foo',
    ]);

    assert.deepEqual (result, {
      foo: 2,
      bar: 3,
      baz: 1,
      qux: 1,
    });
  });
});
