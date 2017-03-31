module.exports = {
  parser: "babel-eslint",

  parserOptions: {
    ecmaVersion: 6,
    sourceType: 'module',
  },

  extends: [
    'eslint:recommended',
    'airbnb-base',
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
    }]
  },
};
