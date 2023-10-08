const _ = require("lodash");
exports.MAX_INT32 = Math.pow(2, 31) - 1;
class Utility {
  static async wait(mil) {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve();
      }, mil);
    });
  }
  static chunkWeight(array, weight, weightCalc) {
    const copy = [...array];
    const result = [];
    let temp = [];
    while (copy.length > 0) {
      temp.push(copy.shift());
      if (_.sum(temp.map((x) => weightCalc(x))) > weight) {
        if (temp.length === 1) {
          result.push([...temp]);
          temp = [];
        } else {
          copy.unshift(temp.pop());
          result.push([...temp]);
          temp = [];
        }
      }
    }
    if (temp.length > 0) {
      result.push([...temp]);
    }
    return result;
  }
  static fixSize(inp, length, fillWith) {
    if (typeof inp !== "number" && typeof inp !== "string") {
      throw new Error(`Type of ${inp} must be number or string.`);
    }
    if (inp.toString().length === length) {
      return inp.toString();
    }
    if (inp.toString().length > length) {
      throw new Error(
        `Current length ${inp} = ${
          inp.toString().length
        } exceed length ${length}`
      );
    }
    if (typeof inp === "number") {
      return (
        _.repeat(fillWith || "0", length - inp.toString().length) +
        inp.toString()
      );
    }
    if (typeof inp === "string") {
      if (inp.indexOf("0x") === 0) {
        return (
          "0x" + _.repeat(fillWith || "0", length - inp.length) + inp.slice(2)
        );
      }
      if (
        inp.split("").filter((c) => "0123456789abcdefABCDEF".indexOf(c) > -1)
          .length === inp.length
      ) {
        return _.repeat("0", length - inp.length) + inp.toString();
      }
      return (
        _.repeat(fillWith === undefined ? " " : fillWith, length - inp.length) +
        inp.toString()
      );
    }
  }
  static generateRandomHex(size, containZero = true) {
    return [...Array(size)]
      .map(() =>
        Math.floor(
          containZero ? Math.random() * 16 : Math.random() * 15 + 1
        ).toString(16)
      )
      .join("");
  }

  static intToHex(num) {
    return Utility.fixSize(num.toString(16), 8, "0");
  }
}
exports.Utility = Utility;
