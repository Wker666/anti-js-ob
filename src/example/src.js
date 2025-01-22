class CryptoUtility {
  // Base64 encode
  static base64Encode(input) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    let str = '';
    let i = 0;

    while (i < input.length) {
      const char1 = input.charCodeAt(i++);
      const char2 = i < input.length ? input.charCodeAt(i++) : NaN;
      const char3 = i < input.length ? input.charCodeAt(i++) : NaN;

      const byte1 = char1 >> 2;
      const byte2 = ((char1 & 3) << 4) | (char2 >> 4);
      const byte3 = ((char2 & 15) << 2) | (char3 >> 6);
      const byte4 = char3 & 63;

      str += chars[byte1];
      str += isNaN(char2) ? '=' : chars[byte2];
      str += isNaN(char3) ? '=' : chars[byte3];
      str += isNaN(char3) ? '=' : chars[byte4];
    }

    return str;
  }

  // XOR encryption
  static xorEncrypt(input, key) {
    let result = '';
    for (let i = 0; i < input.length; i++) {
      // XOR each character with the key
      result += String.fromCharCode(input.charCodeAt(i) ^ key.charCodeAt(i % key.length));
    }
    return result;
  }

  // XXTEA encryption
  static xxteaEncrypt(input, key) {
    // Use an existing implementation, for simplicity we assume a function xxteaEncrypt is available
    // For a real scenario, you might need to import a library or write a full implementation
    return XXTEA.encryptToString(input, key);
  }

  // XXTEA decryption
  static xxteaDecrypt(input, key) {
    return XXTEA.decryptToString(input, key);
  }
}

// Example usage:
const originalText = "Hello, World!";
const key = "secret";

// Base64 encoding
const base64Encoded = CryptoUtility.base64Encode(originalText);
console.log("Base64 Encoded:", base64Encoded);

// XOR encryption
const xorEncrypted = CryptoUtility.xorEncrypt(originalText, key);
console.log("XOR Encrypted:", xorEncrypted);

// XOR decryption (just XOR again with the same key)
const xorDecrypted = CryptoUtility.xorEncrypt(xorEncrypted, key);
console.log("XOR Decrypted:", xorDecrypted);

// For XXTEA, assuming XXTEA library is included in your environment
try {
  const xxteaEncrypted = CryptoUtility.xxteaEncrypt(originalText, key);
  console.log("XXTEA Encrypted:", xxteaEncrypted);

  const xxteaDecrypted = CryptoUtility.xxteaDecrypt(xxteaEncrypted, key);
  console.log("XXTEA Decrypted:", xxteaDecrypted);
} catch (e) {
  console.log("XXTEA encryption needs an external library or implementation.");
}

function sum(...numbers) {
  return numbers.reduce((total, num) => total + num, 0);
}

console.log(sum(1, 2, 3)); // 6
console.log(sum(4, 5, 6, 7)); // 22
