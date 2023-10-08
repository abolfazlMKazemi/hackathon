const { createClient } = require("@nebula-contrib/nebula-nodejs");
const { BitcoinUtility } = require("./libs/bitcoin.utility");
const _ = require("lodash");
const async = require("async");
const request = require("request");
const dotenv = require("dotenv");
dotenv.config();

const options = {
  servers: [process.env.NEBULA_SERVER],
  userName: process.env.NEBULA_USER,
  password: process.env.NEBULA_PASSWORD,
  space: process.env.NEBULA_SPACE,
  poolSize: 2,
  bufferSize: 20000,
  executeTimeout: 28000,
  pingInterval: 3000,
};
const nebulaClient = createClient(options);

async function scripthashHistory(scripthash, limit) {
  return new Promise((resolve, reject) => {
    request.get(
      `https://btc.blockread.io/scripthash/${scripthash}/history?limit=${limit}`,
      { json: true },
      (err, resp, body) => {
        if (err) {
          return reject(err);
        }
        if (resp.statusCode !== 200) {
          return reject(new Error(resp.statusMessage));
        }
        return resolve(body);
      }
    );
  });
}

async function addressHistory(address, limit) {
  const scripthash = BitcoinUtility.scripthashOfAddress(address);
  const result = await scripthashHistory(scripthash, limit);
  return Object.assign({ address: address }, result);
}

async function relationBetweenMultipleNebulaKeys(
  originNebulaKeys,
  targetNebulaKeys,
  maxDepth
) {
  const command = `FIND SHORTEST PATH WITH PROP FROM 
    ${originNebulaKeys.map((key) => `"${key}"`).join(",")} TO ${targetNebulaKeys
    .map((key) => `"${key}"`)
    .join(",")} 
    OVER * UPTO ${maxDepth} STEPS YIELD path AS result;`;
  const results = await nebulaClient.execute(command);

  return results;
}

async function relationBetweenTransactions(
  originTransactionsIds,
  targetsTransactionsIds,
  maxDepth
) {
  const nebulaOriginTransactionsKeys = originTransactionsIds.map(
    (txid) => `${txid}_FFFFFFFF`
  );

  const nebulaTargetsTransactionsKeys = targetsTransactionsIds.map(
    (txid) => `${txid}_FFFFFFFF`
  );

  return await relationBetweenMultipleNebulaKeys(
    nebulaOriginTransactionsKeys,
    nebulaTargetsTransactionsKeys,
    maxDepth
  );
}

async function relation(originAddress, targetAddress, historyLimit, maxDepth) {
  const histories = await async.parallel({
    originAddressHistory: async () => {
      return addressHistory(originAddress, historyLimit);
    },
    targetAddressHistory: async () => {
      return addressHistory(targetAddress, historyLimit);
    },
  });
  const destTransactionsIds = histories.originAddressHistory.history.map(
    (h) => h.txid
  );
  const targetTransactionsIds = histories.targetAddressHistory.history.map(
    (h) => h.txid
  );
  const relations = await relationBetweenTransactions(
    destTransactionsIds,
    targetTransactionsIds,
    maxDepth
  );
  return {
    origin: {
      address: originAddress,
      transactions: destTransactionsIds,
    },
    target: {
      address: targetAddress,
      transactions: targetTransactionsIds,
    },
    paths: _.uniqBy(
      relations.data.result.map((rel) => ({
        src: rel.src.vid.split("_")[0],
        path: rel.steps
          .filter((s) => s.dst.tags[0].name === "transaction")
          .map((s) => s.dst.vid.split("_")[0]),
      })),
      (path) => [path.src, ...path.path].join(",")
    ),
  };
}

const express = require("express");
const app = express();
const port = +process.env.API_PORT;

app.get("/relation/:origin/:target", async (req, res) => {
  const result = await relation(
    req.params.origin,
    req.params.target,
    req.query.history_limit ? +req.query.history_limit : 10,
    req.query.depth ? +req.query.depth : 10
  );
  res.send(result);
});

app.listen(port, "0.0.0.0", () => {
  console.log(`Bitcoin address relation app listening on port ${port}`);
});
