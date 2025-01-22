const fs = require('fs');
const {anti_ob} = require('./anti-ob');

let anti_param = {
  file_name: 'example/code.js', // 被混淆的文件名
  output_file_name: "example/decode.js", // 输出的文件名
  stub_func_pattern: "", // 混淆使用的前缀，没有则留空即可

  anti_array_ob:true, // 对抗数据函数和数组数据
  anti_flat_ob:true, // 对抗平坦化
  anti_junk_code:true, // 对抗垃圾代码
  anti_unicode_encode:true, // 对抗unicode编码
  anti_protect:true, // 对抗反调试 控制台禁止输出 自我保护 域名锁定
  optimize_var_param: true, // 优化变量和参数
};

const aob = new anti_ob(fs.readFileSync(anti_param.file_name, {encoding: 'utf-8'}), anti_param.output_file_name,anti_param.stub_func_pattern);
aob.allin(anti_param);
