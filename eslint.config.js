// eslint.config.js (flat config / ESLint 9)
// ★方針: 既存コードを壊さない。複数 <script> が globals を共有する vanilla 構成なので
//   no-undef は off（クロスファイル global を誤検出しないため）。lint は「実バグ」検出に絞る。
//   整形は prettier 側が担当。pre-push のゲートは test のみ（lint は commit 時 lint-staged で --fix）。
const js = require("@eslint/js");

module.exports = [
  {
    ignores: ["node_modules/**", ".vercel/**", "**/*.min.js", "hyperformula.full.min.js"],
  },
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "commonjs",
      globals: {
        // ブラウザ
        window: "readonly",
        document: "readonly",
        navigator: "readonly",
        location: "readonly",
        console: "readonly",
        fetch: "readonly",
        localStorage: "readonly",
        sessionStorage: "readonly",
        alert: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        requestAnimationFrame: "readonly",
        cancelAnimationFrame: "readonly",
        // Node / CommonJS
        module: "writable",
        require: "readonly",
        process: "readonly",
        __dirname: "readonly",
        Buffer: "readonly",
        // ベンダー / クロスファイル global
        HyperFormula: "readonly",
      },
    },
    rules: {
      "no-unused-vars": "warn",
      "no-empty": "off",
      "no-undef": "off",
      "no-cond-assign": "off",
      "no-control-regex": "off",
      "no-prototype-builtins": "off",
      "no-fallthrough": "off",
      "no-redeclare": "off",
      "no-useless-escape": "off",
    },
  },
  {
    // tests/ と各 *.config.js と .mjs は ESM(import/export)。アプリ本体(CommonJS)と分離。
    // .mjs は定義上ESモジュール（tests/live-nomiya.mjs など）。
    files: ["tests/**/*.js", "**/*.config.js", "**/*.mjs"],
    languageOptions: {
      sourceType: "module",
    },
  },
];
