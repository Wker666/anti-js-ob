## anti-ob
用来对抗 `javascript-obfuscator`
```bash
npm i
```

目前支持的对抗形式
1. 数据加密
2. 数组混淆控制流程
3. 控制流平坦化
4. 垃圾代码
5. unicode字符串
6. 控制台保护 自我保护 域名绑定 反调试

编辑 `main.js` 中 `anti_param` 相关参数运行即可。

## 思路
其实整体思路非常直接，目前 js-ob 4.1.1 版本的主要形式是 一个自执行的匿名函数用来初始化 一个数组函数 一个解密函数，某些情况下还会出现一个全局变量来引用数组函数。

我们找出上面的四个关键内容之后就可以得到解密函数，得到解密函数之后就有了一个整体的相对较完善的ast，目前状态大概率可以看到其中有关的关键字符串，但是逻辑相当混乱。

其中逻辑混乱的原因处于数组混淆的控制流，其中会将一些基础操作拆分到一个局部变量中，通过局部变量的方式获取数据或者得到操作以及函数调用，这部分修复之后大概率逻辑就已经出来了。

下面就是常规的解混淆，平坦化相对很简单处理，js的ob给人一种对不对抗都无所谓的感觉，仅仅靠一个字符串分割的方式进行索引，直接拆开就好。

垃圾代码会插入一些恒定表达式，然后加入一些乱七八糟的代码，主要的形式时 三元表达式和if语句，目前处理的一些相对简单的可以直接算出结果的表达式（大部分都是），然后进行优化

unicode 没什么好说的，直接还原就好

各种保护其实就是插入到了一些必走的流程中的匿名函数，找到特征删除掉即可。

整体来说js的混淆相对于其他的语言是比较简单对抗的。

## 测试

编辑 `example/src.js` 文件 ，执行 `example/ob.js` 文件将会得到code.js，其中的保护是全开的，之后解混淆 执行main.js即可。

## 实际环境测试

在test-vue/test-eny目录下编写了一个测试的vue项目，
```bash
cd src/example/test-vue/test-eny
npm i 
npm run build
```
执行 `example/test-vue/open-server.js` 文件启动3000端口进行测试。

进行混淆：
```bash
javascript-obfuscator src/example/test-vue/test-eny/dist/assets  --config src/obfuscator-config.json --output  src/example/test-vue/test-eny/dist/assets
```

此处也是保护全开，具体配置见 `src/obfuscator-config.json`

之后打开网址，保存加密之后的js，之后放到code.js中进行解密处理。

解密之后的内容可以通过chrome的脚本替换更改，之后就可以hook了。

