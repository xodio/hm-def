
import R from 'ramda';
import $ from 'sanctuary-def';
import Z from 'sanctuary-type-classes';
import { assert } from 'chai';
import HMD from '../src/index';

const def = HMD.create({
  checkTypes: true,
  env: $.env,
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
      'foo :: (a -> b) -> f a -> f b',
      (fn, x) => x.map(e => fn(e)),
    );

    const cube = x => x * x * x;

    assert.deepEqual(foo(cube, [1, 2, 3]), [1, 8, 27]);
    assert.throws(() => foo(cube, 'im-not-an-unary-type'), 'Type-variable constraint violation');
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
});

describe('README examples', () => {
  it('should have correct magnitude', () => {
    const magnitude = def(
      'magnitude :: [Number] -> Number',
      xs => Math.sqrt(xs.reduce((acc, x) => acc + x * x, 0))
    );

    const result = magnitude([3, 4, 0]);
    assert.equal(result, 5);
  });

  it('should work with manually curried functions', () => {
    const rejectValues = def.curried(
      'rejectValues :: [a] -> [a] -> [a]',
      badValues => R.reject(R.contains(R.__, badValues))
    );

    const rejectAbuse = rejectValues(['foo', 'qux']);
    const result = rejectAbuse(['qux', 'mux', 'bar', 'foo', 'baz']);

    assert.deepEqual(result, ['mux', 'bar', 'baz']);
  });
});
