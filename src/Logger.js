const winston = require('winston');

class Logger {
  constructor() {
    this.isLoggingEnabled = true; // 日志开关，默认开启

    this.logger = winston.createLogger({
      level: 'info', // 默认日志级别
      format: winston.format.combine(
        winston.format.colorize(),  // 彩色输出
        winston.format.simple()     // 简单格式
      ),
      transports: [
        new winston.transports.Console() // 将日志输出到控制台
      ]
    });
  }

  toggleLogging(state) {
    this.isLoggingEnabled = state;
  }

  log(message) {
    if (this.isLoggingEnabled) {
      this.logger.log('info', `[+] ${message}`); // 使用 'info' 级别输出
    }
  }

  info(message) {
    if (this.isLoggingEnabled) {
      this.logger.info(`[+] ${message}`);
    }
  }

  warn(message) {
    if (this.isLoggingEnabled) {
      this.logger.warn(`[-] ${message}`);
    }
  }

  error(message) {
    if (this.isLoggingEnabled) {
      this.logger.error(`[-] ${message}`);
    }
  }
}

module.exports = Logger;
