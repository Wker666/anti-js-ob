const parse = require('@babel/parser');
const fs = require('fs');
const traverse = require('@babel/traverse').default;
const generator = require('@babel/generator').default;
const types = require('@babel/types');
const lodash = require('lodash');
const { executeEval, callEvalFunction } = require('./evalFile');
const { forever_test, delete_func_bystr, path_have_target_str_arr, optimizeAST } = require('./utils');
const Logger = require('./Logger');

const logger = new Logger();

class anti_ob {
  constructor(jscode, output_filepath,stub_func_pattern) {
    this.output_filepath =output_filepath;
    this.stub_func_pattern = stub_func_pattern;
    this.array_func_name = ""; // 寻找的数组函数
    this.decode_func_name = ""; // 寻找的解密函数
    this.array_func_node = null; // 数组函数node
    this.decode_func_node = null; // 解密函数node
    this.any_func_parent_path = null; // 匿名函数的parent path
    this.any_func_path = null; // 匿名函数的path
    this.decode_val_declaration = null; // 数组函数变量
    this.decode_val_declaration_name = "" // 数组函数变量名

    // 下面是来对抗一些保护的，通过关键字符串和子块个数进行定位，这个和版本关联性很强
    this.protect_map = {
      "disable_console": {
        str_array:["log","warn","error","exception","trace","return (function() ","{}.constructor(\"return this\")( )",");"],
        dir_del : false,
      },
      "protection": {
        str_array:["init","test","chain","function *\\( *\\)"],
        dir_del : false,
      },
      "protection2": {
        str_array:["constructor","debu","gger","call","action","apply","stateObject","length"],
        dir_del : true,
      },
      "self_defending": {
        str_array:["toString","search","(((.+)+)+)+$","constructor"],
        dir_del : false,
      },
      "domain_lock": {
        str_array:["return (function() "  , "{}.constructor(\"return this\")( )" , ");","replace","split","length"],
        dir_del : false,
      },
    }
    this.ast = parse.parse(jscode);
  }

  /**
   * Step1. 这是第一步，得到对应的解密函数，这个解密函数很关键，是后面我们进行优化的一个基础
   * 寻找 匿名函数 解密函数 数组函数 数组函数变量
   */
  find_decode() {
    let that = this;
    // 下面寻找匿名函数，匿名函数中的第一个参数是数组函数，函数中的某个变量被赋值为函数，这个函数是解密函数。
    traverse(this.ast, {
      CallExpression(path) {
        let node = path.node;
        // 匿名函数的参数是两个，第一个参数是Identifier 第二个参数是Literal
        if (node.callee.type === "FunctionExpression" && node.arguments.length === 2 && node.arguments[0].type === "Identifier" && node.arguments[1].type === "NumericLiteral") {
          // 匿名函数中包含了  push  shift
          if(!path_have_target_str_arr(path,['push','shift'])){
            return;
          }
          // 第一个参数就是数组函数
          that.array_func_name = node.arguments[0].name;
          that.any_func_parent_path = path.parent;
          that.any_func_path = path;
        }
      },
    });
    // 下面寻找解密函数，解密函数需要是在匿名函数中多次被调用的函数，并且需要在前面被赋值，并且满足stub函数前缀，参数是数字的
    let callCount = {};
    // 存储每个 cur_node_name 调用次数的对象
    this.any_func_path.traverse({
      CallExpression(stub_path) {
        // 检查是否为符合条件的 CallExpression
        if (stub_path.node.callee.type === "Identifier" && stub_path.node.arguments.length === 1 && stub_path.node.arguments[0].type === "NumericLiteral") {
          // 获取当前的函数名称（callee 为 Identifier 类型）
          let cur_node_name = stub_path.node.callee.name;
          // 更新函数调用次数
          if (callCount[cur_node_name]) {
            callCount[cur_node_name]++;
          } else {
            callCount[cur_node_name] = 1;
          }
        }
      }
    });
    // 找到调用次数最多的函数
    let mostCalledFunc = null;
    let maxCalls = 0;
    for (let funcName in callCount) {
      if (callCount[funcName] > maxCalls) {
        maxCalls = callCount[funcName];
        mostCalledFunc = funcName;
      }
    }
    // 因为在匿名函数中  解密函数被赋值给了一个局部变量 所以给局部变量赋值的init其实就是解密函数
    this.any_func_path.traverse({
      VariableDeclarator(stub_path) {
        // 检查是否为符合条件的 VariableDeclarator
        if (stub_path.node.id.type === "Identifier" && stub_path.node.init.type === "Identifier" && stub_path.node.id.name === mostCalledFunc) {
          // 此处说明找到解密函数
          that.decode_func_name = stub_path.node.init.name;
        }
      }
    });

    if (this.array_func_name.startsWith(this.stub_func_pattern) && this.decode_func_name.startsWith(this.stub_func_pattern)) {
      traverse(this.ast, {
        FunctionDeclaration(path) {
          if (path.node.id.name === that.array_func_name) {
            that.array_func_node = path.node;
          } else if (path.node.id.name === that.decode_func_name) {
            that.decode_func_node = path.node;
          }
        },
      });
    }
    // 判断一下是否找到了对应的三个函数
    if (this.array_func_node == null || this.decode_func_node == null || this.any_func_parent_path == null) {
      return false;
    }
    /**
     * 此处三个函数都已经得到了
     * 此处还需要找到一个全局变量赋值，这个全局变量赋值是得到解密函数，虽然大部分时候用不到，但是有的时候匿名函数被拼接到了js代码中，用,分割的时候会出现问题
     * 例如console.log("aaa") 没有引号的时候就会出现
     * }(_0x166d, 0xcf79d), console[_0xe3bfb1(0x19b)](_0xe3bfb1(0x196)), console[_0xe3bfb1(0x19b)]('aaa'), console['log'](_0xe3bfb1(0x196)), console[_0xe3bfb1(0x19b)](_0xe3bfb1(0x196)), console['log']('aaa'), console[_0xe3bfb1(0x19b)]('aaa'));
     * 所以最好找到这个全局变量的赋值
     * */
    traverse(this.ast, {
      VariableDeclaration(path) {
        if (path.parent.type === "Program" && path.node.declarations.length === 1 && path.node.declarations[0].type === "VariableDeclarator"
          && path.node.declarations[0].init !== null && path.node.declarations[0].init.type === "Identifier" && path.node.declarations[0].init.name === that.decode_func_name
        ) {
          that.decode_val_declaration = path.node;
          that.decode_val_declaration_name = path.node.declarations[0].id.name;
        }
      }
    });
    /**
     * 在匿名函数后面可能会跟随一些函数，如果调用的话呢可能会导致eval产生的连带问题，最好的解决办法是提取出来自己构造匿名函数
     * 这里构造一个callExpression
     */
    let code;
    let any_new_path = lodash.cloneDeep(this.any_func_path);
    any_new_path.replaceWith(
      types.callExpression(
        types.parenthesizedExpression(this.any_func_path.node.callee),
        this.any_func_path.node.arguments
      )
    );
    // decode_val_declaration有的时候没有，但是暂且忽略
    if (that.decode_val_declaration != null) {
      code = generator({
        type: 'File',
        start: 0,
        end: 0,
        program: {
          type: 'Program',
          body: [this.array_func_node, this.decode_func_node, this.decode_val_declaration, any_new_path.node],
          sourceType: 'script',
        },
      }).code;
    }else{
      logger.warn("not found decode_val_declaration, skip...");
      code = generator({
        type: 'File',
        start: 0,
        end: 0,
        program: {
          type: 'Program',
          body: [this.array_func_node, this.decode_func_node, any_new_path.node],
          sourceType: 'script',
        },
      }).code;
    }
    try {
      if(!executeEval(code,this.decode_func_name)) return false;
    } catch (err) {
      logger.error(err);
      return false;
    }
    this.decode_data_fun = callEvalFunction;
    return true;
  }

  /**
   * Step2. 第二步，删除对应的解密函数，因为没有用了，而且还会干扰后面的数据解密
   */
  delete_decode() {
    // 删除解密函数 数组函数 匿名函数
    let that = this;
    traverse(this.ast, {
      CallExpression(path) {
        if (path === that.any_func_path) {
          path.remove();
        }
      },
      FunctionDeclaration(path) {
        if (that.array_func_node === path.node || that.decode_func_node === path.node) {
          path.remove();
        }
      },
      VariableDeclaration(path) {
        if (that.decode_val_declaration === path.node) {
          path.remove();
        }
      }
    });
  }

  /**
   * Step3. 第三步，解密数据，通过寻找所有调用解密函数的部分，解密对应的数据
   */
  decode_data() {
    let that = this;
    /**
     * 1. 找到所有 = 的操作，例如 _0x12f81f = _0x28e0，其中_0x28e0作为解密函数，这里需要注意_0x12f81f的调用也可能存在，并且还可能存在 tmp = _0x12f81f的这种操作，所以需要找到所有
     * 但是直接遍历ast找到的所有 = 操作可能因为作用域的情况出错，但是这种情况比较少，暂时不去考虑这种情况
     * 注意，找到所有的更新，不能简单的使用 == ，应该是判断是否是在数组中
     * */
    const all_decode_func = new Set();
    // 使用 Set 来确保列表中的解密函数名唯一
    all_decode_func.add(this.decode_func_name);
    if(this.decode_val_declaration != null) {
      all_decode_func.add(this.decode_val_declaration_name);
    }

    traverse(this.ast, {
      VariableDeclarator(path) {
        // 检查左侧是否是标识符，右侧是否是标识符
        if (path.node.id.type === "Identifier" && // 左侧是标识符
          path.node.init && path.node.init.type === "Identifier" && // 右侧是标识符
          all_decode_func.has(path.node.init.name)// 左侧变量名称是否已存在于 all_decode_func 中
        ) {
          all_decode_func.add(path.node.id.name);
          // 添加
        }
      }
    });
    /**
     * 2. 遍历所有需要解密的部分，然后调用解密函数进行解密
     * */
    traverse(this.ast, {
      CallExpression(path) {
        if (path.node.callee.type === "Identifier" && all_decode_func.has(path.node.callee.name)) {
          if (path.node.arguments.length === 1 && path.node.arguments[0].type === "NumericLiteral") {
            // 判断是否只有一个参数，并且该参数是一个数字字面量
            const encryptedValue = path.node.arguments[0].value;
            // 解密数据
            let decryptedValue = that.decode_data_fun(encryptedValue);
            // 确保解密后的结果是一个字符串
            if (typeof decryptedValue === 'string') {
              // 替换 CallExpression 为解密后的 StringLiteral
              path.replaceWith({
                type: "StringLiteral",
                // 使用 StringLiteral 类型替换 CallExpression
                value: decryptedValue,
                // 解密后的字符串
              });
              logger.log(`解密结果：${decryptedValue}`);
            }
          } else {
            // 此处可能的情况是，但是前面删除了，理论上此处不应该有了，所以运行到这里应该是有一定的错误
            /**
             * function _0x28e0(_0x56079e, _0x58f1c1) {
             *   var _0x2416f6 = _0x2416();
             *   return _0x28e0 = function(_0x28e0b6, _0x57f864) {
             *     _0x28e0b6 = _0x28e0b6 - 0xf4;
             *     var _0x49acea = _0x2416f6[_0x28e0b6];
             *     return _0x49acea;
             *   }
             *     ,
             *     _0x28e0(_0x56079e, _0x58f1c1);
             * }
             * */
            logger.error("some fail decode happen when deocde data");
          }
        }
      }
    });
    /**
     * 3. 删除所有的解密函数赋值，因为前面已经删除了三个ob函数
     * */
    traverse(this.ast, {
      VariableDeclarator(path) {
        if (all_decode_func.has(path.node.id.name)) path.remove();
      }
    });
  }


  /**
   * 处理函数的数组ob对抗
   */
  anti_array_ob(){
    // 下面处理函数的一个基本混淆
    traverse(this.ast, {
      BlockStatement(path){
        if(path.node.body.length > 1 && path.node.body[0].type === "VariableDeclaration") {  //  && path.node.body[0].kind === "const"
          // 寻找是否存在一个declaration满足map的形式
          // 测试过程中发现其实第一个就是，虽然有的不是，但是经过上面的解密函数的清洗之后都是第一个
          /**
           *     const t = m, c = {
           *             '\x48\x4d\x42\x46\x41': function (e, f) {
           *                 return e !== f;
           *             },
           *             '\x62\x61\x57\x77\x63': t(0xf2),
           *             '\x66\x73\x4a\x56\x6d': t(0xd0)
           *         }, d = c[t(0xf4)];
           *     例如上面这个 t = m虽然是第一个，但是t = m本质上是一个解密函数的赋值，在上面已经清洗过了
           */
          let decode_declarator = path.node.body[0].declarations[0];
          if((path.node.body[0].declarations.length < 1 || decode_declarator.type !== "VariableDeclarator" || decode_declarator.init === null || decode_declarator.init.type !== "ObjectExpression")){
            return;
          }

          // 此处说明满足
          /**
           * function factorial(_0xe0a75b) {
           *   const _0x66d805 = {
           *     'VQBvl': function (_0x290d09, _0xb6e6cc) {
           *       return _0x290d09 === _0xb6e6cc;
           *     },
           *     'oxICI': function (_0xbe39c3, _0x5682b0) {
           *       return _0xbe39c3 * _0x5682b0;
           *     },
           *     'cmkby': function (_0x586e04, _0x7fc1b3) {
           *       return _0x586e04 - _0x7fc1b3;
           *     }
           *   };
           *   if (_0xe0a75b === 0x0 || _0x66d805["VQBvl"](_0xe0a75b, 0x1)) return 0x1;
           *   return _0x66d805["oxICI"](_0xe0a75b, factorial(_0x66d805["cmkby"](_0xe0a75b, 0x1)));
           * }
           * */
            // 此处找到映射，下面可以直接使用对应的path
          let PropertyMap = {};
          path.traverse({
            Property(subPath){
              // 需要确保是第一个
              if(decode_declarator.init === subPath.parent && subPath.node.key.type === "StringLiteral"){
                PropertyMap[subPath.node.key.value] = subPath;
              }
            }
          });
          // 下面我们需要会通过这个数组替换掉函数中的一些使用
          let decode_array_body = decode_declarator.init;
          let decode_array_name = decode_declarator.id.name;
          logger.log("maybe find a array ob ...");
          // 这个变量表明是否是真正的数组混淆，只有真正替换了的才能算作是数组混淆
          let replace_is_right = false;
          // Step1. 进行替换
          path.traverse({
            // 处理函数类型的
            CallExpression(subPath){
              let MemberExpressionNode = subPath.node.callee;
              if(MemberExpressionNode.type !== "MemberExpression") return;
              if (MemberExpressionNode.object.name === decode_array_name && MemberExpressionNode.property.type === "StringLiteral") {
                const funcName = MemberExpressionNode.property.value;
                // 找到对应的函数体或者数据
                let PropertyBody = decode_array_body.properties.find(prop => prop.key.value === funcName);
                let PropertyPath = PropertyMap[funcName];
                if(PropertyPath == null){
                  return;
                }
                if (PropertyBody.value.type === "FunctionExpression") {
                  // 下面是函数类型的
                  let funcBody = PropertyBody.value;
                  let param_idx = 0;
                  let arg_map = {};
                  // 遍历过程中是否存在没有处理的，没有处理的就直接返回
                  let PropertyBodyError = false;
                  funcBody.params.forEach((param) => {
                    if(param.type === "Identifier") {
                      arg_map[param.name] = subPath.node.arguments[param_idx++];
                    }else if(param.type === "RestElement"){
                      // 可变参数
                      arg_map[param.argument.name] = subPath.node.arguments[param_idx++].argument;
                    }else{
                      PropertyBodyError = true;
                      logger.error(`error forEach PropertyBody params. ${param.type}`);
                    }
                  });
                  if(PropertyBodyError) return;

                  // 获取函数体中的返回值部分，只考虑单个return的情况
                  // 第一层body是BlockStm 下面才是RetuurnStatement
                  if(funcBody.body.body.length === 1 && funcBody.body.body[0].type === "ReturnStatement"){
                    // 此处不能这样拷贝，太慢了
                    // const PropertyPathCopy = lodash.cloneDeep(PropertyPath);
                    let ProCode = "let a = " + generator(funcBody).code; // 此处得到
                    let PropertyPathCopy = parse.parse(ProCode);
                    // 此处比较特殊，我们不可以直接在traverse中进行替换，因为可能出现参数名成和替换的参数值名重复，我们需要获取到对应的一个替换map，退出之后进行替换
                    // 其他的不需要是因为都是简单替换
                    let replaceMap = {};
                    for (const key of Object.keys(arg_map)) replaceMap[key] = [];
                    traverse(PropertyPathCopy,{
                      Identifier(subInnerPath){
                        if(arg_map[subInnerPath.node.name] !== undefined){
                          replaceMap[subInnerPath.node.name].push(subInnerPath);
                        }
                      }
                    });
                    for (const key of Object.keys(arg_map)){
                      replaceMap[key].forEach((subInnerPathCopy, _) => {
                        subInnerPathCopy.replaceWith(arg_map[key]);
                      });
                    }
                    replace_is_right = true;
                    subPath.replaceWith(PropertyPathCopy.program.body[0].declarations[0].init.body.body[0].argument);
                  }
                }
              }
            },
            MemberExpression(subPath) {
              // 判断是否是数组调用形式，例如 _0x66d805["VQBvl"]
              if (subPath.node.object.name === decode_array_name && subPath.node.property.type === "StringLiteral") {
                const funcName = subPath.node.property.value;
                // 找到对应的函数体或者数据
                let PropertyBody = decode_array_body.properties.find(prop => prop.key.value === funcName);
                let PropertyPath = PropertyMap[funcName];
                if(PropertyPath == null){
                  return;
                }
                if(PropertyBody.value.type === "StringLiteral"){
                  // 下面是字符串类型的
                  replace_is_right = true;
                  subPath.replaceWith(PropertyBody.value);
                }
              }
            }
          });
          // 如果没有替换则直接返回
          if(!replace_is_right){
            logger.warn("is not a array ob.");
            return;
          }
          logger.log("find one array ob ...");
          // Step2. 检查函数是否还存在使用的情况，如果不存在则删除
          // 这个是所有的还在使用的key
          let all_use_keys = new Set();
          path.traverse({
            MemberExpression(subPath){
              if(subPath.node.object.type === "Identifier" && subPath.node.object.name === decode_array_name && subPath.node.property.type === "StringLiteral" )
                all_use_keys.add(subPath.node.property.value);
            }
          });
          // Step3. 判断是否还有使用，将不使用的字段进行删除
          path.traverse({
            Property(subPath){
              if(decode_declarator.init === subPath.parent && subPath.node.key.type === "StringLiteral"
                && !all_use_keys.has(subPath.node.key.value)
              ){
                subPath.remove();
              }
            }
          });

          // Step4. 如果这个数组只出现了一次（也就是赋值的时候出现的），则直接删除这个字段
          let found_times = 0;
          path.traverse({
            Identifier(subPath){
              if(subPath.node.name === decode_array_name) found_times++;
            }
          });
          if(found_times <= 1){
            path.traverse({
              VariableDeclarator(subPath){
                if(decode_declarator === subPath.node){
                  subPath.remove();
                }
              }
            });
          }
        }
      }
    });

  }

  /**
   * 处理函数平坦化控制流
   */
  anti_flat_ob(){
    // 下面是处理平坦化的，针对性非常强，但凡版本之类的不太正确，就有可能无法进行恢复
    traverse(this.ast, {
      BlockStatement(path) {
        let flat_array = [];
        // 此处不能使用traverse，因为可能很多包含的情况
        let path_node = path.node;
        if(path_node.body.length > 1
        && path_node.body[0].type === "VariableDeclaration" && path_node.body[0].declarations.length > 0
        && path_node.body[0].declarations[0].type === "VariableDeclarator" && path_node.body[0].declarations[0].init != null
        && path_node.body[0].declarations[0].init.type === "CallExpression"){
          let CallExpressionNode = path_node.body[0].declarations[0].init;

          if(CallExpressionNode.callee.type === "MemberExpression" &&
            CallExpressionNode.callee.object.type === "StringLiteral"
            && CallExpressionNode.callee.property.type === "StringLiteral" && CallExpressionNode.callee.property.value === "split") {
            // 继续确认 判断是否能够正常split
            if(CallExpressionNode.arguments.length === 1 && CallExpressionNode.arguments[0].type === "StringLiteral"
              && CallExpressionNode.callee.object.value.indexOf(CallExpressionNode.arguments[0].value)){
              flat_array = CallExpressionNode.callee.object.value.split(CallExpressionNode.arguments[0].value);
            }

          }
        }
        if(flat_array.length === 0){
          return;
        }
        path.traverse({
          WhileStatement(inner_path){
            // 判断是否是固定的表达式
            if(!forever_test(generator(inner_path.node.test).code)){return ;}
            if(inner_path.node.body.type !== "BlockStatement" || inner_path.node.body.body.length !== 2)
              return;
            // 有两个stm
            if(inner_path.node.body.body[0].type !== "SwitchStatement" || inner_path.node.body.body[1].type !== "BreakStatement")
              return;
            let switchStm = inner_path.node.body.body[0];
            let caseList = switchStm.cases;
            let caseMap = {};
            for (const node of caseList) {
              caseMap[node.test.value] = node.consequent;
            }
            let resultBody = [];
            flat_array.map(targetIdx => {
              if(caseMap[targetIdx] === undefined){
                // 此处没有，暂时先跳过 正常不会这个样子的
                return ;
              }

              let targetBody = caseMap[targetIdx];
              // 删除ContinueStatement块(continue语句)
              if (types.isContinueStatement(targetBody[targetBody.length - 1]))
                targetBody.pop();
              resultBody = resultBody.concat(targetBody)
            });
            inner_path.replaceInline(resultBody);
          }
        });
      }
    });
  }

  /**
   * 处理垃圾代码
   */
  anti_junk_code(){
    let that = this;
    // 第一个处理的是永真表达式和永假表达式
    /**
     * 1. 三元表达式
     * 2. if
     * */
    traverse(this.ast, {
      ConditionalExpression(path){
        let test = path.node.test;
        const {code} = generator(test);
        logger.log("test ConditionalExpression: " + code);
        let ret = forever_test(code);
        if(ret == null){
          logger.warn("is not forever code.");
        }else{
          logger.info("is forever code: "+ code);
          try {
            path.replaceWith(ret ? path.node.consequent : path.node.alternate);
          }catch (err){
            logger.error(err);
            logger.error("skip this ConditionalExpression replace.");
          }
        }
      },
      IfStatement(path){
        let test = path.node.test;
        const {code} = generator(test);
        logger.log("test IfStatement: " + code);
        let ret = forever_test(code);
        if(ret == null){
          logger.warn("is not forever code.");
        }else{
          logger.info("is forever code: "+ code);
          try {
            path.replaceWith(ret ? path.node.consequent : path.node.alternate);
          }catch (err){
            logger.error(err);
            logger.error("skip this IfStatement replace.");
          }
        }
      }
    });
    // 处理一些表达式为恒定值的部分
    /**
     * 1. UnaryExpression类型的， js ob非常喜欢  ![] 类型
     * */
    traverse(this.ast, {
      UnaryExpression(path){
        return ;   // 这里考虑不完善   此处不可以这么简单的进行判断
        const { code } = generator(path.node);
        logger.log("test UnaryExpression: " + code);
        let ret = forever_test(code);
        if (ret == null) {
          logger.warn("is not forever code.");
        } else {
          logger.info("is forever code: "+ code);
          path.replaceWith({
            type: 'BooleanLiteral',
            value: ret,
          });
        }
      }
    });

    /**
     * 下面是一些基础优化，针对于所有的代码的，包括上面各种anti产生的垃圾代码
     */
    optimizeAST(this.ast);

  }

  /**
   * 处理unicode编码
   */
  anti_unicode_encode(){
    traverse(this.ast, {
      StringLiteral(path) {
        if(path.node.extra !== undefined){
          path.replaceWith({
            type: "StringLiteral",
            value: path.node.value,
          });
        }
      }
    });
  }

  /**
   * 处理一些保护函数，删除这些保护函数
   * 控制台输出 反调试  绑定域名。。。
   */
  anti_protect(){
    Object.keys(this.protect_map).forEach(key => {
      logger.log("start anti-" + key);
      delete_func_bystr(this.ast,this.protect_map[key].str_array,this.protect_map[key].dir_del);
    });
  }

  /**
   * 一键处理
   */
  allin(anti_param){
    logger.log("start gen decode function.");
    if (!this.find_decode()) {
      logger.error("decode function gen error.");
      return;
    }
    logger.log("complete gen decode function.");
    logger.log("start delete decode function.");
    this.delete_decode();
    logger.log("complete delete decode function.");
    logger.log("start decode data.");
    this.decode_data();
    logger.log("complete decode data.");
    if(anti_param.anti_array_ob){
      logger.log("start anti_array_ob.");
      this.anti_array_ob();
      logger.log("complete anti_array_ob.");
    }
    if(anti_param.anti_flat_ob){
      logger.log("start anti_flat_ob.");
      this.anti_flat_ob();
      logger.log("complete anti_flat_ob.");
    }
    if(anti_param.anti_junk_code){
      logger.log("start anti_junk_code.");
      this.anti_junk_code();
      logger.log("complete anti_junk_code.");
    }
    if(anti_param.anti_unicode_encode){
      logger.log("start anti_unicode_encode.");
      this.anti_unicode_encode();
      logger.log("complete anti_unicode_encode.");
    }
    if(anti_param.anti_protect){
      logger.log("start anti_protect.");
      this.anti_protect();
      logger.log("complete anti_protect.");
    }
    this.output_file();
  }

  /**
   * 将ast输出到文件
   */
  output_file(){
    fs.writeFile(this.output_filepath, generator(this.ast,{
      // 禁用 Unicode 转义
      jsescOption: {
        minimal: true
      }
    }).code, (err) => {
      if (err) {
        logger.error('写入文件时发生错误:' + err);
      } else {
        logger.log(`文件已成功写入到 ${this.output_filepath}`);
      }
    });
  }

}

module.exports = {
  anti_ob
};
