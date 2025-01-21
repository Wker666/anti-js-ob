<template>
  <div id="app">
    <div class="header">
      <h1>加密/解密工具</h1>
    </div>
    
    <div class="content-wrapper">
      <div class="main-content">
        <form @submit.prevent>
          <div class="form-row">
            <div class="input-group">
              <label for="message">消息内容:</label>
              <input type="text" v-model="message" id="message" required>
            </div>
            
            <div class="method-select">
              <label for="method">加密方式:</label>
              <select v-model="selectedMethod" id="method">
                <option value="DES">DES</option>
                <option value="AES">AES</option>
                <option value="MD5">MD5</option>
                <option value="SHA1">SHA1</option>
                <option value="SHA256">SHA256</option>
                <option value="SHA512">SHA512</option>
                <option value="RIPEMD160">RIPEMD160</option>
                <option value="RC4">RC4</option>
                <option value="Triple-DES">Triple DES</option>
                <option value="Base64">Base64</option>
                <option value="XOR">XOR</option>
                <option value="XXTEA">XXTEA</option>
              </select>
            </div>

            <div class="key-input" v-if="needsKey">
              <label for="key">密钥:</label>
              <input type="text" v-model="secretKey" id="key" placeholder="请输入密钥">
            </div>

            <div class="button-group">
              <button type="button" @click="encrypt" :disabled="!canEncrypt">加密</button>
              <button type="button" @click="decrypt" :disabled="!canDecrypt">解密</button>
            </div>
          </div>
        </form>
      </div>

      <div class="result-section">
        <h2>处理结果</h2>
        <div class="result-container" :class="{ error: isError }">
          <p class="result-text">{{ output || '等待处理...' }}</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import CryptoJS from 'crypto-js';

export default {
  data() {
    return {
      message: '',
      output: '',
      selectedMethod: 'DES',
      secretKey: 'mySecretKey123',
      isError: false
    };
  },
  computed: {
    needsKey() {
      return ['DES', 'AES', 'RC4', 'Triple-DES', 'XOR', 'XXTEA'].includes(this.selectedMethod);
    },
    canEncrypt() {
      return this.message && (!this.needsKey || this.secretKey);
    },
    canDecrypt() {
      return this.message && (!this.needsKey || this.secretKey) && 
             ['DES', 'AES', 'RC4', 'Triple-DES', 'Base64', 'XOR', 'XXTEA'].includes(this.selectedMethod);
    }
  },
  methods: {
    // XOR 加密/解密实现
    xorCipher(text, key) {
      let result = '';
      for(let i = 0; i < text.length; i++) {
        result += String.fromCharCode(text.charCodeAt(i) ^ key.charCodeAt(i % key.length));
      }
      return result;
    },

    // XXTEA 实现
    xxteaEncrypt(text, key) {
      // 确保文本和密钥长度足够
      while (key.length < 16) key += key;
      key = key.slice(0, 16);

      const v = this.strToLongs(text);
      const k = this.strToLongs(key);
      const n = v.length;

      if (n < 1) return text;

      const z = v[n - 1], y = v[0];
      let mx, e, p, q = Math.floor(6 + 52/n);
      let sum = 0;
      const delta = 0x9E3779B9;

      while (q-- > 0) {
        sum += delta;
        e = sum >>> 2 & 3;
        for (p = 0; p < n - 1; p++) {
          mx = (((v[p + 1] >>> 5) ^ (v[p] << 2)) + ((v[p] >>> 3) ^ (v[p + 1] << 4))) ^ ((sum ^ v[p]) + (k[(p & 3) ^ e] ^ v[p + 1]));
          v[p] += mx;
        }
        mx = (((v[0] >>> 5) ^ (v[n - 1] << 2)) + ((v[n - 1] >>> 3) ^ (v[0] << 4))) ^ ((sum ^ v[n - 1]) + (k[(n - 1) & 3 ^ e] ^ v[0]));
        v[n - 1] += mx;
      }

      return this.longsToStr(v);
    },

    xxteaDecrypt(text, key) {
      // 确保文本和密钥长度足够
      while (key.length < 16) key += key;
      key = key.slice(0, 16);

      const v = this.strToLongs(text);
      const k = this.strToLongs(key);
      const n = v.length;

      if (n < 1) return text;

      const z = v[n - 1], y = v[0];
      const delta = 0x9E3779B9;
      let q = Math.floor(6 + 52/n);
      let sum = delta * q;
      let mx, e, p;

      while (sum !== 0) {
        e = sum >>> 2 & 3;
        for (p = n - 1; p > 0; p--) {
          mx = (((v[p - 1] >>> 5) ^ (v[p] << 2)) + ((v[p] >>> 3) ^ (v[p - 1] << 4))) ^ ((sum ^ v[p]) + (k[(p & 3) ^ e] ^ v[p - 1]));
          v[p] -= mx;
        }
        mx = (((v[0] >>> 5) ^ (v[n - 1] << 2)) + ((v[n - 1] >>> 3) ^ (v[0] << 4))) ^ ((sum ^ v[n - 1]) + (k[(n - 1) & 3 ^ e] ^ v[0]));
        v[0] -= mx;
        sum -= delta;
      }

      return this.longsToStr(v);
    },

    strToLongs(str) {
      const len = str.length;
      const padding = 4 - (len % 4);
      if (padding !== 4) {
        str = str + '\0'.repeat(padding);
      }
      
      const result = new Array(Math.ceil(str.length / 4));
      for (let i = 0; i < result.length; i++) {
        result[i] = (str.charCodeAt(i * 4)) |
                   (str.charCodeAt(i * 4 + 1) << 8) |
                   (str.charCodeAt(i * 4 + 2) << 16) |
                   (str.charCodeAt(i * 4 + 3) << 24);
      }
      return result;
    },

    longsToStr(longs) {
      let str = '';
      for (let i = 0; i < longs.length; i++) {
        str += String.fromCharCode(
          longs[i] & 0xFF,
          (longs[i] >>> 8) & 0xFF,
          (longs[i] >>> 16) & 0xFF,
          (longs[i] >>> 24) & 0xFF
        );
      }
      // 移除填充的空字符
      return str.replace(/\0+$/, '');
    },

    encrypt() {
      this.isError = false;
      try {
        switch(this.selectedMethod) {
          case 'DES':
            const desEncrypted = CryptoJS.DES.encrypt(this.message, this.secretKey);
            this.output = desEncrypted.toString();
            break;
          case 'AES':
            const aesEncrypted = CryptoJS.AES.encrypt(this.message, this.secretKey);
            this.output = aesEncrypted.toString();
            break;
          case 'MD5':
            this.output = CryptoJS.MD5(this.message).toString();
            break;
          case 'SHA1':
            this.output = CryptoJS.SHA1(this.message).toString();
            break;
          case 'SHA256':
            this.output = CryptoJS.SHA256(this.message).toString();
            break;
          case 'SHA512':
            this.output = CryptoJS.SHA512(this.message).toString();
            break;
          case 'RIPEMD160':
            this.output = CryptoJS.RIPEMD160(this.message).toString();
            break;
          case 'RC4':
            const rc4Encrypted = CryptoJS.RC4.encrypt(this.message, this.secretKey);
            this.output = rc4Encrypted.toString();
            break;
          case 'Triple-DES':
            const trippleDesEncrypted = CryptoJS.TripleDES.encrypt(this.message, this.secretKey);
            this.output = trippleDesEncrypted.toString();
            break;
          case 'Base64':
            const wordArray = CryptoJS.enc.Utf8.parse(this.message);
            this.output = CryptoJS.enc.Base64.stringify(wordArray);
            break;
          case 'XOR':
            this.output = btoa(this.xorCipher(this.message, this.secretKey));
            break;
          case 'XXTEA':
            this.output = btoa(this.xxteaEncrypt(this.message, this.secretKey));
            break;
        }
      } catch (e) {
        this.isError = true;
        this.output = "加密失败：" + e.message;
      }
    },
    decrypt() {
      this.isError = false;
      try {
        let decrypted;
        switch(this.selectedMethod) {
          case 'DES':
            decrypted = CryptoJS.DES.decrypt(this.message, this.secretKey);
            this.output = decrypted.toString(CryptoJS.enc.Utf8);
            break;
          case 'AES':
            decrypted = CryptoJS.AES.decrypt(this.message, this.secretKey);
            this.output = decrypted.toString(CryptoJS.enc.Utf8);
            break;
          case 'RC4':
            decrypted = CryptoJS.RC4.decrypt(this.message, this.secretKey);
            this.output = decrypted.toString(CryptoJS.enc.Utf8);
            break;
          case 'Triple-DES':
            decrypted = CryptoJS.TripleDES.decrypt(this.message, this.secretKey);
            this.output = decrypted.toString(CryptoJS.enc.Utf8);
            break;
          case 'Base64':
            const parsedWordArray = CryptoJS.enc.Base64.parse(this.message);
            this.output = parsedWordArray.toString(CryptoJS.enc.Utf8);
            break;
          case 'XOR':
            this.output = this.xorCipher(atob(this.message), this.secretKey);
            break;
          case 'XXTEA':
            this.output = this.xxteaDecrypt(atob(this.message), this.secretKey);
            break;
          default:
            throw new Error("该加密方式不支持解密");
        }
      } catch (e) {
        this.isError = true;
        this.output = "解密失败：" + e.message;
      }
    }
  }
};
</script>

<style scoped>
#app {
  font-family: Avenir, Helvetica, Arial, sans-serif;
  color: #2c3e50;
  max-width: 1400px;
  margin: 0 auto;
  padding: 20px;
}

.header {
  background-color: #1a73e8;
  color: white;
  padding: 15px 30px;
  border-radius: 12px 12px 0 0;
  margin-bottom: 0;
  text-align: center;
  display: flex;
  justify-content: center;
  align-items: center;
}

.header h1 {
  margin: 0;
  font-size: clamp(1.2em, 4vw, 1.8em);
  color: white;
  white-space: nowrap;
  line-height: 1.2;
}

.content-wrapper {
  display: flex;
  gap: 20px;
  background-color: #f8f9fa;
  padding: 20px;
  border-radius: 0 0 12px 12px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);
}

.main-content {
  flex: 3;
  min-width: 0;
}

.form-row {
  display: flex;
  flex-direction: column;
  gap: 15px;
}

.input-group, .method-select, .key-input {
  width: 100%;
}

label {
  display: block;
  font-weight: 600;
  margin-bottom: 8px;
  color: #444;
  font-size: 0.9em;
}

input, select {
  width: 100%;
  padding: 10px;
  border: 2px solid #ddd;
  border-radius: 6px;
  font-size: 0.9em;
  transition: all 0.3s ease;
}

input:focus, select:focus {
  outline: none;
  border-color: #1a73e8;
  box-shadow: 0 0 0 2px rgba(26, 115, 232, 0.2);
}

.button-group {
  display: flex;
  gap: 10px;
  margin-top: 10px;
}

button {
  flex: 1;
  padding: 10px 20px;
  font-size: 0.9em;
  font-weight: 600;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.3s ease;
  white-space: nowrap;
}

button:first-child {
  background-color: #1a73e8;
  color: white;
  border: none;
}

button:last-child {
  background-color: #34a853;
  color: white;
  border: none;
}

button:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
}

button:disabled {
  background-color: #e0e0e0;
  cursor: not-allowed;
  transform: none;
}

.result-section {
  flex: 2;
  min-width: 300px;
  display: flex;
  flex-direction: column;
  border-left: 1px solid #ddd;
  padding-left: 20px;
}

.result-section h2 {
  color: #1a73e8;
  margin: 0 0 15px 0;
  font-size: 1.2em;
}

.result-container {
  background-color: white;
  padding: 15px;
  border-radius: 8px;
  border: 2px solid #e0e0e0;
  flex-grow: 1;
  display: flex;
  align-items: center;
}

.result-text {
  margin: 0;
  word-break: break-all;
  font-family: monospace;
  font-size: 1em;
  width: 100%;
}

.error {
  border-color: #d93025;
  background-color: rgba(217, 48, 37, 0.05);
}

.error .result-text {
  color: #d93025;
}

@media (max-width: 900px) {
  .content-wrapper {
    flex-direction: column;
  }

  .result-section {
    border-left: none;
    border-top: 1px solid #ddd;
    padding-left: 0;
    padding-top: 20px;
    margin-top: 20px;
  }

  .result-container {
    min-height: 100px;
  }
}

@media (max-width: 600px) {
  #app {
    padding: 10px;
  }

  .header {
    padding: 12px 15px;
  }

  .content-wrapper {
    padding: 15px;
  }

  .button-group {
    flex-direction: column;
  }
}
</style>
