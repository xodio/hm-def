
import { uncurryN } from 'ramda';
import $ from 'sanctuary-def';
import * as Sig from './signature';

function create({ checkTypes, env, typeClasses = [], typeConstructors = [] }) {
  const $def = $.create({ checkTypes, env });

  function def(signature, func) {
    const params = Sig.resolve(typeClasses, typeConstructors, env, signature);
    return $def(params.name, params.constraints, params.types, func);
  }

  def.curried = function defUncurried(signature, func) {
    const params = Sig.resolve(typeClasses, typeConstructors, env, signature);
    const ufunc = uncurryN(params.types.length - 1, func);
    return $def(params.name, params.constraints, params.types, ufunc);
  };

  return def;
}

export default {
  create,
};
