
import R from 'ramda';
import $ from 'sanctuary-def';
import Z from 'sanctuary-type-classes';
import { assert } from 'chai';
import HMD from '../src/index';

const $Map = $.BinaryType(
  'Map',
  'someurl',
  R.is(Object),
  R.keys,
  R.values,
);

const $Wrapper = $.UnaryType(
  'Wrapper',
  'someurl',
  R.both(R.is(Object), R.has('value')),
  R.compose(R.of, R.prop('value'))
);

const def = HMD.create({
  checkTypes: true,
  env: $.env.concat([
    $Map($.Unknown, $.Unknown),
    $Wrapper($.Unknown),
  ]),
  typeClasses: [
    Z.Functor,
    Z.Semigroup,
  ],
});

describe('def', () => {
  it('should work with unary functions', () => {
    const foo = def(
      'foo :: Number -> String',
      x => x.toString(),
    );

    assert.strictEqual(foo(42), '42');
    assert.throws(() => foo(null), 'The value at position 1 is not a member of ‘Number’');
  });

  it('should work with thunks', () => {
    const foo = def(
      'foo :: () -> Number',
      () => 42,
    );

    assert.strictEqual(foo(), 42);
  });

  it('should work with records', () => {
    const foo = def(
      'foo :: Number -> { value :: Number }',
      x => ({ value: x }),
    );

    assert.deepEqual(foo(42), { value: 42 });
  });

  it('should work with unary type variables', () => {
    const foo = def(
      'foo :: Functor f => (a -> b) -> f a -> f b',
      (fn, x) => x.map(e => fn(e)),
    );

    const cube = x => x * x * x;

    assert.deepEqual(foo(cube, [1, 2, 3]), [1, 8, 27]);
    assert.throws(() => foo(cube, 'im-not-an-unary-type'), 'Type-class constraint violation');
  });

  it('should work with type class constraints', () => {
    const foo = def(
      'foo :: Semigroup a => a -> a -> a',
      (y, x) => x.concat(y),
    );

    assert.deepEqual(foo([3, 4], [1, 2]), [1, 2, 3, 4]);
    assert.deepEqual(foo(' world', 'Hello'), 'Hello world');
    assert.throws(() => foo(42, 13), 'requires ‘a’ to satisfy the Semigroup type-class constraint');
  });

  it('should work with manually curried functions', () => {
    const foo = def.curried(
      'foo :: Number -> Number -> Number -> Number',
      x => y => z => x + y + z,
    );

    assert.strictEqual(foo(1)(2)(3), 6);
    assert.strictEqual(foo(1, 2, 3), 6);
    assert.strictEqual(foo(1, 2)(3), 6);
    assert.strictEqual(foo(1)(2, 3), 6);
  });

  it('should work with users UnaryTypes', () => {
    const foo = def(
      'foo :: Wrapper Number -> Number',
      R.prop('value')
    );
    assert.equal(foo({ value: 10 }), 10);
    assert.throws(() => foo({}), 'The value at position 1 is not a member of ‘Wrapper Number’');
    assert.throws(() => foo(null), 'The value at position 1 is not a member of ‘Wrapper Number’');
    assert.throws(() => foo({ value: 'hello' }), 'The value at position 1 is not a member of ‘Number’');

    const bar = def(
      'bar :: Wrapper Number -> Wrapper String',
      R.over(R.lensProp('value'), R.toString)
    );
    assert.deepEqual(bar({ value: 10 }), { value: '10' });
    assert.throws(() => bar({}), 'The value at position 1 is not a member of ‘Wrapper Number’');
    assert.throws(() => bar(null), 'The value at position 1 is not a member of ‘Wrapper Number’');
    assert.throws(() => bar({ value: 'hello' }), 'The value at position 1 is not a member of ‘Number’');
  });

  it('should work with users BinaryTypes', () => {
    const foo = def(
      'foo :: Map String Number -> Map String String',
      R.map(R.toString)
    );
    assert.deepEqual(foo({ a: 5, b: 7 }), { a: '5', b: '7' });
    assert.throws(() => foo({ a: false }), 'The value at position 1 is not a member of ‘Number’');
    assert.throws(() => foo(null), 'The value at position 1 is not a member of ‘Map String Number’');

    const bar = def(
      'bar :: Map String (Map String Number) -> Map String Boolean',
      R.map(R.compose(
        R.gt(3),
        R.sum,
        R.values
      ))
    );
    assert.deepEqual(bar({ a: { x: 0, y: 1 }, b: { x: 1, y: 3 } }), { a: true, b: false });
    assert.throws(() => bar({ a: false }), 'The value at position 1 is not a member of ‘Map String Number’');
    assert.throws(() => bar(null), 'The value at position 1 is not a member of ‘Map String (Map String Number)’');

    const buzz = def(
      'buzz :: Map a b -> Map a a',
      R.map(R.toString)
    );
    assert.deepEqual(buzz({ a: 1, b: 2 }), { a: '1', b: '2' });
    assert.throws(() => buzz(null), 'The value at position 1 is not a member of ‘Map a b’');
  });
});

describe('README examples', () => {
  it('should have correct magnitude', () => {
    const magnitude = def(
      'magnitude :: [Number] -> Number',
      xs => Math.sqrt(xs.reduce((acc, x) => acc + (x * x), 0)),
    );

    const result = magnitude([3, 4, 0]);
    assert.equal(result, 5);
  });

  it('should have correct minMax', () => {
    const minMax = def(
      'minMax :: [Number] -> { min :: Number, max :: Number }',
      xs => xs.reduce(
        (acc, x) => ({
          min: Math.min(x, acc.min),
          max: Math.max(x, acc.max),
        }),
        { min: Infinity, max: -Infinity },
      ),
    );

    const result = minMax([1, 4, 6, 3, 4, 5, -3, 4]);
    assert.deepEqual(result, { min: -3, max: 6 });
  });

  it('should have correct occurrences', () => {
    const occurrences = def(
      'occurrences :: [String] -> StrMap Number',
      xs => xs.reduce(
        (acc, x) => {
          acc[x] = (acc[x] || 0) + 1; // eslint-disable-line
          return acc;
        },
        {},
      ),
    );

    const result = occurrences([
      'foo', 'bar', 'bar', 'baz', 'bar', 'qux', 'foo',
    ]);

    assert.deepEqual(result, {
      foo: 2,
      bar: 3,
      baz: 1,
      qux: 1,
    });
  });

  it('should work with manually curried functions', () => {
    const rejectValues = def.curried(
      'rejectValues :: [a] -> [a] -> [a]',
      badValues => R.reject(R.contains(R.__, badValues)),
    );

    const rejectAbuse = rejectValues(['foo', 'qux']);
    const result = rejectAbuse(['qux', 'mux', 'bar', 'foo', 'baz']);

    assert.deepEqual(result, ['mux', 'bar', 'baz']);
  });
});
