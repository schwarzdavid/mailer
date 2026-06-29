import {type Config} from 'prettier'

export default {
  tabWidth: 4,
  "singleQuote": true,
  "trailingComma": "all",
  overrides: [
    {
      files: ['package.json'],
      options: {
        tabWidth: 2
      }
    }
  ],
  semi: false,
  vueIndentScriptAndStyle: true,
} satisfies Config
