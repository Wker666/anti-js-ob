const babel = require('@babel/core');
const t = require('@babel/types');
const { default: traverse } = require('@babel/traverse');
const parser = require('@babel/parser');
const { minify } = require('terser');

/**
 * 执行一条ast语句用来得到结果
 * @param node
 * @param context
 * @returns {*|null|{}|number|"undefined"|"object"|"boolean"|"number"|"string"|"function"|"symbol"|"bigint"|string|(*|{}|boolean)[]|boolean}
 */
function evaluate(node, context = {}) {
  if (t.isBooleanLiteral(node)
    || t.isNumericLiteral(node)
    || t.isStringLiteral(node)
  ) {
    return node.value;
  }

  if (t.isNullLiteral(node)) {
    return null;
  }

  if (t.isArrayExpression(node)) {
    return node.elements.map(e => evaluate(e, context));
  }

  if (t.isObjectExpression(node)) {
    const obj = {};
    node.properties.forEach(prop => {
      if (t.isObjectProperty(prop)) {
        const key = t.isIdentifier(prop.key) ? prop.key.name : evaluate(prop.key, context);
        const value = evaluate(prop.value, context);
        obj[key] = value;
      }
    });
    return obj;
  }

  if (t.isUnaryExpression(node)) {
    const argumentValue = evaluate(node.argument, context);
    if (argumentValue === null) return null;
    switch (node.operator) {
      case "!": return !argumentValue;
      case "-": return -argumentValue;
      case "+": return +argumentValue;
      case "~": return ~argumentValue;
      case "typeof": return typeof argumentValue;
      case "void": return void argumentValue;
      case "delete": return null; // 'delete' should be context-aware
      default: return null;
    }
  }

  if (t.isBinaryExpression(node)) {
    const left = evaluate(node.left, context);
    const right = evaluate(node.right, context);
    if (left === null || right === null) return null;

    switch (node.operator) {
      case '==': return left == right;
      case '===': return left === right;
      case '!=': return left != right;
      case '!==': return left !== right;
      case '<': return left < right;
      case '>': return left > right;
      case '<=': return left <= right;
      case '>=': return left >= right;
      case '|': return left | right;
      case '&': return left & right;
      case '^': return left ^ right;
      case '<<': return left << right;
      case '>>': return left >> right;
      case '>>>': return left >>> right;
      case '+': return left + right;
      case '-': return left - right;
      case '*': return left * right;
      case '/': return left / right;
      case '%': return left % right;
      case '**': return left ** right;
      default: return null;
    }
  }

  if (t.isLogicalExpression(node)) {
    const left = evaluate(node.left, context);
    if (node.operator === '&&') {
      return left && evaluate(node.right, context);
    }
    if (node.operator === '||') {
      return left || evaluate(node.right, context);
    }
    if (node.operator === '??') {
      return left ?? evaluate(node.right, context);
    }
  }

  if (t.isConditionalExpression(node)) {
    const test = evaluate(node.test, context);
    return test ? evaluate(node.consequent, context) : evaluate(node.alternate, context);
  }

  if (t.isIdentifier(node)) {
    return context[node.name] ?? null;
  }

  if (t.isCallExpression(node)) {
    const callee = evaluate(node.callee, context);
    if (typeof callee !== 'function') return null;
    const args = node.arguments.map(arg => evaluate(arg, context));
    return callee.apply(null, args);
  }

  if (t.isMemberExpression(node)) {
    const object = evaluate(node.object, context);
    const property = node.computed ? evaluate(node.property, context) : node.property.name;
    return object ? object[property] : null;
  }

  if (t.isAssignmentExpression(node)) {
    const value = evaluate(node.right, context);
    if (t.isIdentifier(node.left)) {
      context[node.left.name] = value;
      return value;
    }
    if (t.isMemberExpression(node.left)) {
      const obj = evaluate(node.left.object, context);
      const prop = node.left.computed ? evaluate(node.left.property, context) : node.left.property.name;
      obj[prop] = value;
      return value;
    }
  }

  if (t.isSequenceExpression(node)) {
    let result;
    node.expressions.forEach(expr => {
      result = evaluate(expr, context);
    });
    return result;
  }

  if (t.isTemplateLiteral(node)) {
    return node.quasis.reduce((acc, quasi, index) => {
      const expression = node.expressions[index] ? evaluate(node.expressions[index], context) : '';
      return acc + quasi.value.cooked + expression;
    }, '');
  }

  // For unsupported node types or if evaluation is not possible
  return null;
}

/**
 * 测试是否是恒定值
 * @param expression
 * @returns {null|boolean}
 */
function forever_test(expression){
  try {
    const ast = parser.parseExpression(expression);
    const evalResult = evaluate(ast);
    if(typeof evalResult === 'boolean') {
      return evalResult;
    }else {
      return null;
    }
  }catch (error) {
    return null;
  } finally {
  }
}

/**
 * 判断指定的path中是否包含了target_str_array在内的所有的字符串
 * @param path
 * @param target_str_array
 * @returns {boolean}
 */
function path_have_target_str_arr(path,target_str_array){
  let target_str_array_tmp = JSON.parse(JSON.stringify(target_str_array));
  path.traverse({
      StringLiteral(subPath) {
        for(let idx = 0; idx < target_str_array_tmp.length; idx++){
          try {
            if(subPath.node.value === target_str_array_tmp[idx]){
              target_str_array_tmp.splice(idx,1);
              break;
            }
          }catch(e){
          }
        }

      }
    }
  );
  return target_str_array_tmp.length === 0;
}

/**
 * 寻找指定的函数，通过判断函数中指定的字符串   以及这个函数中没有子block
 * @param ast
 * @param target_str_array
 * @param dir_del 是否直接删除
 */
function delete_func_bystr(ast,target_str_array,dir_del){
  let need_del_path = null;
  traverse(ast, {
    BlockStatement(path){
      if(!path_have_target_str_arr(path,target_str_array)){
        return ;
      }
      if(dir_del){
        path.replaceInline([]);
        return;
      }
      // 下面需要进行判断
      // 寻找到的逻辑是上层的保护函数都是一个匿名函数，并且这个匿名函数会被另外一个有名字的函数调用，这个函数只有一个apply的字符串，如果是，这删除这两个函数中的内容
      /**
       *   const _0x5c4e17 = function () {
       *     let _0x16787c = true;
       *     return function (_0xdd651, _0x2e22e9) {
       *       const _0x2cdb06 = _0x16787c ? function () {
       *         if (_0x2e22e9) {
       *           const _0x32109b = _0x2e22e9["apply"](_0xdd651, arguments);
       *           return _0x2e22e9 = null, _0x32109b;
       *         }
       *       } : function () {};
       *       return _0x16787c = false, _0x2cdb06;
       *     };
       *   }();
       *   (function () {
       *     _0x5c4e17(this, function () {
       *       const _0x9255b9 = new RegExp("function *\\( *\\)"),
       *         _0x2cb730 = new RegExp("\\+\\+ *(?:[a-zA-Z_$][0-9a-zA-Z_$]*)", "i"),
       *         _0x210329 = _0x1e71af("init");
       *       !_0x9255b9["test"](_0x210329 + "chain") || !_0x2cb730["test"](_0x210329 + "input") ? _0x210329("0") : _0x1e71af();
       *     })();
       *   })();
       */
      if(path.parent !== null && path.parent.type === "FunctionExpression"
        && path.parentPath.parent !== null && path.parentPath.parent.type === "CallExpression"
        && path.parentPath.parent.arguments.length === 2 && path.parentPath.parent.arguments[0].type === "ThisExpression"
      ){
        // 此时的path.parentPath.parent.callee 就是需要删除的函数。并且当前这个block也需要删除
        let del_func_name = path.parentPath.parent.callee.name;
        // 下面遍历删除这个函数赋值
        traverse(ast,{
          VariableDeclarator(subPath){
            if(subPath.node.id.type === "Identifier" && subPath.node.id.name === del_func_name && subPath.node.init !== null && subPath.node.init.type === "CallExpression"){
              subPath.replaceInline([]);
            }
          }
        });
        // 删除这个函数
        need_del_path = path.parentPath.parentPath;
      }
    }
  });
  if(need_del_path !== null){
    need_del_path.replaceWith(
      t.functionExpression(
        null, // 匿名函数
        [],   // 没有参数
        t.blockStatement([]) // 空的函数体
      ));
  }
}

function optimizeAST(ast) {
}

// function removeUnusedVariables(path) {
//   const bindings = path.scope.getAllBindings();
//
//   Object.keys(bindings).forEach(name => {
//     const binding = bindings[name];
//     if (!binding.referenced) {
//       if (t.isVariableDeclarator(binding.path.node)) {
//         binding.path.remove();
//       } else if (t.isFunctionDeclaration(binding.path.node)) {
//         binding.path.remove();
//       }
//     }
//   });
// }

function renameLocalVariablesAndArg(ast) {
  traverse(ast, {
    Function(path) {
      // Rename all parameters
      path.get('params').forEach(paramPath => {
        const paramName = paramPath.node.name;
        const newParamName = "arg"+path.scope.generateUid("_");
        path.scope.rename(paramName, newParamName);
      });
      // Rename all local variables
      path.traverse({
        VariableDeclaration(variablePath) {
          variablePath.get('declarations').forEach(declaration => {
            const localVarName = declaration.node.id.name;
            const newLocalVarName = "var"+path.scope.generateUid("_");
            path.scope.rename(localVarName, newLocalVarName);
          });
        }
      });
    }
  });
}


/**
 * Optimize JavaScript code by removing unused variables, functions, and empty function calls.
 * @param {string} code - The JavaScript source code to optimize.
 * @returns {Promise<string>} - A promise that resolves to the optimized JavaScript code.
 */
async function optimizeJavaScriptCode(code) {
  try {
    const result = await minify(code, {
      compress: {
        dead_code: true, // Remove unreachable code
        unused: true,    // Drop unreferenced functions and variables
        toplevel: true,  // Optimize top-level scope
      },
      output: {
        beautify: true,   // Format code in a readable way
        comments: false,  // Remove comments
      },
      mangle: false, // Prevent variable name mangling
    });

    return result.code;
  } catch (error) {
    console.error('Error during code optimization:', error);
    throw error;
  }
}

module.exports = {
  path_have_target_str_arr,
  forever_test,
  delete_func_bystr,
  optimizeAST,
  renameLocalVariablesAndArg,
  optimizeJavaScriptCode
};
