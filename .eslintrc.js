module.exports = {
  root: true,

  env: {
    node: true
  },

  extends: ["plugin:vue/recommended", "@vue/prettier"],

  rules: {
    "no-unused-vars": [2, { args: "after-used", argsIgnorePattern: "^_" }],
    "no-console": "off",
    "no-debugger": "off",
    "prettier/prettier": [
      "warn",
      {
        printWidth: 100
      }
    ],
    "vue/order-in-components": "off"
  },

  parserOptions: {
    parser: "babel-eslint"
  },

  overrides: [
    {
      files: ["**/__tests__/*.{j,t}s?(x)"],
      env: {
        jest: true
      }
    }
  ]
};
