import {assert} from 'chai';
import laws from 'fantasy-laws';
import Z from 'sanctuary-type-classes';
import jsc from 'jsverify';
import show from 'sanctuary-show';
import Reader from '../src/Reader';

const ReaderArb = x => x.smap (Reader, r => r.run (), show);
const equals = (x, y) => Z.equals (x.run (), y.run ());


describe ('Reader', () => {
  it ('should return value on run', () => {
    const r = Reader (() => 'foo');
    assert.equal (r.run (), 'foo');
  });

  it ('should pass params to contained function', () => {
    const r = Reader (x => `${x}bar`);
    assert.equal (r.run ('foo'), 'foobar');
  });

  it ('ask should be an identity Reader', () => {
    const r = Reader.ask;
    assert.equal (r.run ('foo'), 'foo');
  });

  describe ('Functor laws', () => {
    const {identity, composition} = laws.Functor (equals);

    it ('identity', identity (
      ReaderArb (jsc.fun (jsc.number)),
    ));

    it ('composition', composition (
      ReaderArb (jsc.fun (jsc.number)),
      jsc.constant (Math.abs),
      jsc.constant (Math.sqrt),
    ));
  });

  describe ('Apply', () => {
    const {composition} = laws.Apply (equals);
    it ('composition', composition (
      ReaderArb (jsc.fn (jsc.constant (Math.sqrt))),
      ReaderArb (jsc.fn (jsc.constant (Math.abs))),
      ReaderArb (jsc.fn (jsc.number)),
    ));
  });

  describe ('Applicative', () => {
    const {
      identity,
      homomorphism,
      interchange,
    } = laws.Applicative (equals, Reader);

    it ('identity', identity (
      ReaderArb (jsc.fn (jsc.number)),
    ));

    it ('homomorphism', homomorphism (
      jsc.constant (Math.abs),
      jsc.number,
    ));

    it ('interchange', interchange (
      ReaderArb (jsc.fn (jsc.constant (Math.abs))),
      jsc.number
    ));
  });

  describe ('Chain', () => {
    const {associativity} = laws.Chain (equals);

    it ('associativity', associativity (
      ReaderArb (jsc.fn (jsc.array (jsc.asciistring))),
      jsc.constant (x => Reader (() => `foo${x}`)),
      jsc.constant (x => Reader (() => x.toUpperCase ())),
    ));
  });

  describe ('Monad', () => {
    const {leftIdentity, rightIdentity} = laws.Monad (equals, Reader);

    it ('left identity', leftIdentity (
      jsc.constant (x => Reader (() => `foo${x}`)),
      jsc.constant (jsc.asciistring),
    ));

    it ('right identity', rightIdentity (
      ReaderArb (jsc.fn (jsc.number)),
    ));
  });
});
