/* eslint-disable no-multi-assign */
import S from 'sanctuary';
import {chain, ap, map, of} from 'fantasy-land';
import show from 'sanctuary-show';

const $$show = '@@show';

// Reader :: TypeRep
function Reader(run) {
  if (!(this instanceof Reader)) {
    return new Reader (run);
  }
  this.run = run;
}

// run :: Reader a -> Any... -> Any
Reader.run = function run(reader, ...args) {
  return reader.run (...args);
};

// chain :: Reader a ~> (a -> Reader b) -> Reader b
Reader.prototype.chain = Reader.prototype[chain] = function chain_(f) {
  return new Reader ((r => f (this.run (r)).run (r)));
};

// ap :: Reader a ~> Reader (a -> b) -> Reader b
Reader.prototype.ap = Reader.prototype[ap] = function ap_(a) {
  return a.chain (f => this.map (f));
};

// map :: Reader a ~> (a -> b) -> Reader b
Reader.prototype.map = Reader.prototype[map] = function map_(f) {
  return this.chain (a => Reader.of (f (a)));
};

// of :: a -> Reader a
Reader.prototype.of = Reader.prototype[of] = a => new Reader ((() => a));
Reader.of = Reader[of] = Reader.prototype.of;

// ask :: Reader (a -> a)
Reader.ask = Reader (S.I);

// show :: Reader a ~> String
Reader.prototype.toString = Reader.prototype[$$show] = function show_() {
  return 'Reader (' + show (this.run) + ')';
};

export default Reader;
