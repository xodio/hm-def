module.exports = {
  parser: "babel-eslint",

  parserOptions: {
    ecmaVersion: 6,
    sourceType: 'module',
  },

  extends: [
    'eslint:recommended',
    'airbnb-base',
    './node_modules/sanctuary-style/eslint-es6.json'
  ],

  globals: {
    describe: true,
    it: true,
    before: true,
    beforeEach: true,
    after: true,
    afterEach: true,
  },

  rules: {
    'no-underscore-dangle': ['error', {
      allow: ["__"], /* Ramda’s R.__ */
    }],
    'no-spaced-func': 'off',
    'no-use-before-define': 'off',
    'new-cap': 'off',
    'import/prefer-default-export': 'off',
    'no-underscore-dangle': 'off',
    'implicit-arrow-linebreak': 'off',
  },
};
