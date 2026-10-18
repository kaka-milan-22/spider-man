const { readFileSync } = require('node:fs');
const ts = require('typescript');

// Load the actual Worker modules without Wrangler or local secret files.
require.extensions['.ts'] = (module, filename) => {
  const { outputText } = ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
    fileName: filename,
  });
  module._compile(outputText, filename);
};
