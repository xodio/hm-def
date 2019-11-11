import $priv from 'sanctuary-def';
import * as Sig from './signature';

const def = $priv.create ({checkTypes: true, env: $priv.env});

const Parameters = $priv.RecordType ({
  $: $priv.Object,
  checkTypes: $priv.Boolean,
  env: $priv.Array ($priv.Type),
  typeClasses: $priv.Array ($priv.TypeClass),
});

export const create = def
  ('create')
  ({})
  ([
    Parameters,
    $priv.String,
    $priv.AnyFunction,
    $priv.AnyFunction,
  ])
  (({$, checkTypes, env, typeClasses}) => {
    if (!checkTypes) {
      return _ => f => f;
    }

    const $def = $.create ({checkTypes, env});
    const resovleSig = Sig.resolve ($) (typeClasses) (env);

    return $def
      ('def')
      ({})
      ([$.String, $.AnyFunction])
      (signature => func => {
        const params = resovleSig (signature);
        return $def
          (params.name)
          (params.constraints)
          (params.types)
          (func);
      });
  });
