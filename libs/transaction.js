const bitcore = require("bitcore-lib");
const utility = require("./utility");

class TransactionParser {
  static isScriptHashOut(buf) {
    return (
      buf.length === 23 &&
      buf[0] === 169 &&
      buf[1] === 0x14 &&
      buf[buf.length - 1] === 135
    );
  }
  static fromRaw(raw) {
    const transaction = new bitcore.Transaction(raw);
    const lockTime = transaction.getLockTime();
    return {
      txid: transaction.id,
      hex: raw,
      time: Math.floor(new Date().getTime() / 1000),
      locktime: !lockTime
        ? undefined
        : typeof lockTime === "number"
        ? lockTime
        : lockTime.getTime(),
      size: Math.floor(raw.length / 2),
      vin: transaction.inputs.map((inp) => {
        const buffer = inp._scriptBuffer || inp.script.toBuffer();
        const hex = buffer.toString("hex");
        return {
          txid: inp.prevTxId.toString("hex"),
          vout: inp.outputIndex,
          sequence: inp.sequenceNumber,
          script: hex,
          witnesses: inp.witnesses
            ? inp.witnesses.map((witness) => witness.toString("hex"))
            : undefined,
          coinbase:
            inp.outputIndex === 4294967295 && !inp.script ? hex : undefined,
        };
      }),
      vout: transaction.outputs.map((out, index) => {
        var _a, _b, _c, _d, _e;
        const buffer = out._scriptBuffer || out.script.toBuffer();
        const hex = buffer.toString("hex");
        const type = (
          (_a = out.script) === null || _a === void 0
            ? void 0
            : _a.isPublicKeyOut()
        )
          ? "pubkey"
          : (
              (_b = out.script) === null || _b === void 0
                ? void 0
                : _b.isMultisigOut()
            )
          ? "multisig"
          : (
              (_c = out.script) === null || _c === void 0
                ? void 0
                : _c.isPublicKeyHashOut()
            )
          ? "pubkeyhash"
          : TransactionParser.isScriptHashOut(buffer)
          ? "scripthash"
          : (
              (_d = out.script) === null || _d === void 0
                ? void 0
                : _d.isWitnessProgram()
            )
          ? out.script.getAddressInfo().type
          : buffer[0] === 0x6a && out.satoshis === 0
          ? "nulldata"
          : "nonstandard";
        return {
          n: index,
          satoshis: out.satoshis,
          scriptPubKey: {
            reqSigs:
              type === "pubkey" ||
              type === "multisig" ||
              type === "pubkeyhash" ||
              type === "taproot" ||
              type === "witnesscripthash" ||
              type === "witnesspubkeyhash"
                ? (_e = out.script) === null || _e === void 0
                  ? void 0
                  : _e.getSignatureOperationsCount(true)
                : -1,
            type,
            script: hex,
          },
          scripthash: bitcore.crypto.Hash.sha256(buffer)
            .reverse()
            .toString("hex"),
        };
      }),
    };
  }
  static isOpOutput(script) {
    if (
      (script && script.indexOf("006a") === 0) ||
      script.indexOf("6a") === 0
    ) {
      return true;
    }
    return false;
  }
  static outputScriptToASM(hex) {
    try {
      const output = new bitcore.Script(hex);
      return output.toASM();
    } catch (e) {
      common_1.Logger.error(`hex=${hex} can not to parse.`);
      return "";
    }
  }
  static outputScriptToText(hex) {
    try {
      return Buffer.from(hex, "hex").toString("utf-8");
    } catch (e) {
      return "";
    }
  }
  static keyFromSplit(txid, n) {
    if (!txid || n === undefined) {
      return undefined;
    }
    const key = Buffer.from(
      `${txid}${utility.Utility.fixSize(n.toString(16), 8)}`,
      "hex"
    );
    return key;
  }
  static fromKey(key) {
    if (!key) {
      return undefined;
    }
    const txid = key.toString("hex").slice(0, 64);
    const n = parseInt(key.toString("hex").slice(-8), 16);
    return { txid, n };
  }
  static fromKeyAsSingleString(key) {
    const fromKey = TransactionParser.fromKey(key);
    return `${fromKey.txid}_${fromKey.n}`;
  }
}

exports.TransactionParser = TransactionParser;
