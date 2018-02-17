Hindley Milner Definitions
=========================

The `hm-def` package allows you to enforce runtime type checking for JavaScript
functions using Haskell-alike [Hindley
Milner](https://github.com/ramda/ramda/wiki/Type-Signatures) type signatures.

The `hm-def` is build on top of
[sanctuary-def](https://github.com/sanctuary-js/sanctuary-def)
and basically just a syntax sugar for it.

Install
-------

```bash
$ yarn add hm-def
# or
$ npm install hm-def
```

Usage
-----

First, you need to create a function definition function.

```javascript
import $ from 'sanctuary-def';
import HMD from 'hm-def';

const def = HMD.create({
  checkTypes: true,
  env: $.env,
});
```

Then instead of this:

```javascript
function sum(a, b) {
  return a + b;
}
```

you can write:

```javascript
const sum = def(
  'sum :: Number -> Number -> Number',
  (a, b) => a + b
);
```

And the calls to `sum` will be type checked:

```javascript
sum(42, 13);
// 55

sum('42', 13);
// TypeError: Invalid value
//
// foo :: Number -> Number -> Number
//        ^^^^^^
//          1
//
// 1)  "42" :: String
//
// The value at position 1 is not a member of ‘Number’.
```

### Arrays

To denote an array you enclose type of its elements in square brackets:

```javascript
const magnitude = def(
  'magnitude :: [Number] -> Number',
  xs => Math.sqrt(xs.reduce((acc, x) => acc + x * x, 0))
);

magnitude([3, 4, 0]);
// 5

magnitude(3, 4, 0);
// TypeError: Function applied to too many arguments
//
// magnitude :: Array Number -> Number
//
// ‘magnitude’ expected at most one argument but received three arguments.
```

Actually it’s just a shortcut to a more general:

```javascript
const magnitude = def(
  'magnitude :: Array Number -> Number',
  xs => Math.sqrt(xs.reduce((acc, x) => acc + x * x, 0))
);
```

Where `Array` is a regular unary type provided by the default environment.
It takes a single type argument which describes the type of array’s elements.

### Records

To denote objects with a known schema record syntax is used:

```javascript
const minMax = def(
  'minMax :: [Number] -> { min :: Number, max :: Number }',
  xs => xs.reduce(
    (acc, x) => ({
      min: Math.min(x, acc.min),
      max: Math.max(x, acc.max),
    }),
    { min: Infinity, max: -Infinity }
  )
);

minMax([1, 4, 6, 3, 4, 5, -3, 4]);
// { min: -3, max: 6 }
```

### Maps

To describe a map of homogenous data you can use `StrMap` type:

```javascript
const occurrences = def(
  'occurrences :: [String] -> StrMap Number',
  xs => xs.reduce(
    (acc, x) => {
      // a bit of dirty local mutation
      acc[x] = (acc[x] || 0) + 1;
      return acc;
    },
    {}
  )
);

occurrences(['foo', 'bar', 'bar', 'baz', 'bar', 'qux', 'foo']);
// {
//   foo: 2,
//   bar: 3,
//   baz: 1,
//   qux: 1,
// }
```

### Types available

You pass type definitions with `env` option of `HMD.create`. `$.env` from
`sanctuary-def` provides type info for all built-in types:

- AnyFunction
- Arguments
- Array
- Boolean
- Date
- Error
- Null
- Number
- Object
- RegExp
- StrMap
- String
- Undefined

You would likely to add your own application domain types. See [documentation
of type
constructors](https://github.com/sanctuary-js/sanctuary-def#type-constructors)
to learn how.

### Type constraints

For most generic functions you’d like to add type constraints. Consider the
function:

```javascript
const concat = def(
  'concat :: a -> a -> a',
  (y, x) => x.concat(y)
);

concat([3, 4], [1, 2]);
// [1, 2, 3, 4]

concat(' world', 'Hello')
// 'Hello world'

concat(42, 13)
// TypeError: x.concat is not a function
```

The call to the function crashed on invalid argument types post factum. We can
place a type constraint on `a` to fail in advance with a more clear message.

Type constraints are done with type classes. There are many type classes
provided by
[sanctuary-type-classes](https://github.com/sanctuary-js/sanctuary-type-classes)
and you can create your own.

To use HM definitions with type class constaints you should provide `typeClasses`
option with classes you’d like to use later:

```javascript
import $ from 'sanctuary-def';
import Z from 'sanctuary-type-classes';
import HMD from 'hm-def';

const def = HMD.create({
  checkTypes: true,
  env: $.env,
  typeClasses: [
    // ...
    Z.Functor,
    Z.Semigroup,
    // ...
  ],
});
```

Then:

```javascript
const concat = def(
  'concat :: Semigroup a => a -> a -> a',
  (y, x) => x.concat(y)
);

concat([3, 4], [1, 2]);
// [1, 2, 3, 4]

concat(' world', 'Hello')
// 'Hello world'

concat(42, 13)
// TypeError: Type-class constraint violation
//
// foo :: Semigroup a => a -> a -> a
//        ^^^^^^^^^^^    ^
//                       1
//
// 1)  42 :: Number
//
// ‘foo’ requires ‘a’ to satisfy the Semigroup type-class constraint; the value
// at position 1 does not.
```

<a name="type-constructors"></a>
### Type constructors
_Added in v0.3.0_

If you need UnaryType or BinaryType of something you should add them into `env`
with `$.Unknown` types in it. Then `hm-def` will recreate specific types when you
will define your functions.

```javascript
const Either = $.BinaryType(
  'my-package/Either',
  'http://example.com/my-package#Either',
  x => x != null && x['@@type'] === 'my-package/Either'
  either => (either.isLeft ? [either.value] : []),
  either => (either.isRight ? [either.value] : [])
);
// Either is a function `Either :: Type -> Type -> Type`,

const def = HMD.create({
  checkTypes: true,
  env: $.env.concat([
    Either($.Unknown, $.Unknown),
  ]),
});

// Now we can just define functions as usual:
const foo = def(
  'foo :: Either Number String -> Either String String',
  (x) => x.chain((val) => {
    if (val >= 3) return S.Either.Right('It greater than or equal 3');
    return S.Either.Left('It less than 3');
  })
);

foo(S.Either.Right(4)); // Either.Right('It greater than or equal 3')
foo(S.Either.Right(1)); // Either.Left('It less than 3')
foo(S.Either.Right('hello')); // TypeError: The value at position 1 is not a member of ‘Number’
foo(1); // TypeError: The value at position 1 is not a member of ‘Either Number String’
```

### Currying

Thanks to `sanctuary-def` functions defined with `def` are automatically
curried. You haven’t to use `R.curry` everywhere.

```javascript
const sum = def(
  'sum :: Number -> Number -> Number',
  (a, b) => a + b
);

const add42 = sum(42);
// add42 is a partially applied function

add42(13);
// 55
```

Although while programming in point-free style it is often more desirable to
curry functions by hand. In these cases you can use `def.curried` and provide
a manually curried function:

```javascript
import R from 'ramda';

const rejectValues = def.curried(
  'rejectValues :: [a] -> [a] -> [a]',
  badValues => filterable => R.reject(x => R.constaints(x, badValues), filterable)
);

// or the same in point-free fashion
const rejectValues = def.curried(
  'rejectValues :: [a] -> [a] -> [a]',
  badValues => R.reject(R.contains(R.__, badValues))
);

const rejectAbuse = rejectValues(['foo', 'qux']);

rejectAbuse([
  'qux',
  'mux',
  'bar',
  'foo',
  'baz',
]);
// ['mux', 'bar', 'baz']
```

Changelog
---------

### 0.3.0

* Update `sanctuary-def` dependency to version 0.14.0
* BREAKING :exclamation: All Unary/Binary Types with variable types inside should be
  specified in `env` with `$.Unknown` types. Then, when you define functions, `hm-def`
  will recreate specific types for these functions. (See more)[#type-constructors]

  Since version 0.10.0 of `sanctuary-def` environments must be of type `Array Type`.
  So it must not contain type constructors anymore.
  ([sanctuary-js/sanctuary-def#124](https://github.com/sanctuary-js/sanctuary-def/pull/124))

### 0.2.1

* Update `ramda` dependency to version 0.24.1

### 0.2.0

* Add `def.curried`
* Fix errors when using some non-nullary types like built-in `Array` or `StrMap`

License
-------

MIT
