
import $ from 'sanctuary-def';
import * as Sig from './signature';

function create({ checkTypes, env }) {
  const $def = $.create({ checkTypes, env });

  return function def(signature, func) {
    const params = Sig.resolve(env, signature);
    return $def(params.name, params.constraints, params.types, func);
  };
}

export default {
  create,
};
