const bitcoin = require("bitcoinjs-lib");
const bitcore = require("bitcore-lib");
const tinySecp256k1 = require("tiny-secp256k1");
bitcoin.initEccLib(tinySecp256k1);

class BitcoinUtility {
  static get OutputTypes() {
    return [
      "pubkeyhash",
      "publickey",
      "multisig",
      "nonstandard",
      "nulldata",
      "scripthash",
    ];
  }
  static outputCodeOfType(type) {
    return BitcoinUtility.OutputTypes.indexOf(type);
  }
  static scripthashOfAddress(address) {
    const script = bitcoin.address.toOutputScript(address);
    const hash = bitcore.crypto.Hash.sha256(script);
    const reversedHash = Buffer.from(hash.reverse());
    const scripthash = reversedHash.toString("hex");
    return scripthash;
  }
  static addressOfScript(script, network) {
    return new bitcore.Script(script).toAddress(network).toString();
  }
  static publicKeyHashFromAddress(address) {
    return bitcore.Script.fromAddress(address).toASM().split(" ")[2];
  }
}
exports.BitcoinUtility = BitcoinUtility;
