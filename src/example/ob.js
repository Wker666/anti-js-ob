const fs = require("fs");
const obfuscator = require('javascript-obfuscator');

function obfuscate(code, options) {
  return obfuscator.obfuscate(code, options).getObfuscatedCode();
}

const code = fs.readFileSync('example/src.js', {
  encoding: 'utf-8'
});

const options = {
  compact: false,
  renameGlobals: true,
  controlFlowFlattening: true,
  identifierNamesGenerator: 'hexadecimal',
  stringArray: true,
  unicodeEscapeSequence: true,
  deadCodeInjection: true,
  rotateStringArray: true,
  disableConsoleOutput: true,
  debugProtection: true,
  selfDefending: true,
  domainLock: ['localhost']
};

let filePath = "example/code.js";
fs.writeFile(filePath, obfuscate(code, options), (err) => {
  if (err) {
    console.log('写入文件时发生错误:', err);
  } else {
    console.log(`文件已成功写入到 ${filePath}`);
  }
});

