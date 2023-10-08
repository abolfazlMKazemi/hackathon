const { createClient } = require("@nebula-contrib/nebula-nodejs");
const { TransactionParser } = require("./libs/transaction");
const { Utility } = require("./libs/utility");
const { BitcoinUtility } = require("./libs/bitcoin.utility");
const _ = require("lodash");
const async = require("async");
const request = require("request");
const { JsonDB, Config } = require("node-json-db");
const dotenv = require("dotenv");

dotenv.config();
const db = new JsonDB(new Config(".config.json", true, true));

let qCount = 0;
let lastQCount = 0;
let txCount = 0;
let lastTxCount = 0;
let lastTime = new Date().getTime();

function showQps() {
  const spendSeconds = (new Date().getTime() - lastTime) / 1000;
  lastTime = new Date().getTime();
  const qps = (qCount - lastQCount) / spendSeconds;
  const tps = (txCount - lastTxCount) / spendSeconds;
  if (qps > 0 || tps > 0) {
    console.log("qps", qps.toFixed(1), "tps", tps.toFixed(1));
  }

  lastQCount = qCount;
  lastTxCount = txCount;
  setTimeout(() => {
    showQps();
  }, 10000);
}
showQps();

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
async function nebulaExecute(query) {
  try {
    return await nebulaClient.execute(query);
  } catch (e) {
    console.log(e);
    throw e;
  }
}

async function callRpc(method, params) {
  return new Promise((resolve, reject) => {
    const postData = {
      jsonrpc: "1.0",
      method: method,
      params,
      id: "1",
    };
    request.post(
      `http://${process.env.RPC_HOST}:${process.env.RPC_PORT}/`,
      {
        json: true,
        headers: {
          "Content-Type": "application/json",
        },
        timeout: 20000,
        auth: {
          username: process.env.RPC_USER_NAME,
          pass: process.env.RPC_PASSWORD,
        },
        body: postData,
      },
      (err, resp, body) => {
        if (err) {
          console.log(err);
          reject(err);

          return;
        }
        if (body?.error) {
          console.log(body);
          reject(new Error(body.error));

          return;
        }
        if (resp && resp.statusCode !== 200) {
          console.log(resp.statusMessage);
          reject(new Error(resp.statusMessage));

          return;
        }

        resolve(body.result);
      }
    );
  });
}

async function processTransactions(transactions) {
  console.log(
    `process, txs=${transactions.length} inputs=${_.sumBy(
      transactions,
      (tx) => tx.vin.length
    )} outputs=${_.sumBy(transactions, (tx) => tx.vout.length)}`
  );
  const chunks = Utility.chunkWeight(
    transactions,
    5000,
    (tx) => tx.vin.length + tx.vout.length
  );

  await async.eachLimit(chunks, 1, async (transactions) => {
    //console.log(transactions.length);
    const transactionsVertexesQuery = `INSERT VERTEX transaction(create_time) VALUES ${transactions
      .map((tx) => {
        const txKey = `${tx.txid}_FFFFFFFF`;

        return `"${txKey}":(${Number(tx.time)})`;
      })
      .join(",")}`;

    const outputsVertexesQueryElements = transactions
      .map((tx) => {
        return tx.vout.map((out, n) => {
          const outputKey = `${tx.txid}_${Utility.intToHex(Number(n))}`;

          return `"${outputKey}":(${Number(
            out.n
          )},${BitcoinUtility.outputCodeOfType(out.scriptPubKey.type)})`;
        });
      })
      .flat();
    const outputsVertexesQueries = _.chunk(
      outputsVertexesQueryElements,
      20000
    ).map((chunk) => `INSERT VERTEX output(n,type) VALUES ${chunk.join(",")}`);

    const inputsEdgesQueryElements = transactions
      .map((tx) => {
        const txKey = `${tx.txid}_FFFFFFFF`;
        return tx.vin.map((inp, index) => {
          return `"${inp.txid}_${Utility.intToHex(
            Number(inp.vout)
          )}"->"${txKey}":(${index})`; //,${BitcoinUtility.outputCodeOfType(inp.type)})`;
        });
      })
      .flat();
    const inputsEdgesQueries = _.chunk(inputsEdgesQueryElements, 20000).map(
      (chunk) => `INSERT EDGE inp(n) VALUES ${chunk.join(",")}`
    );
    const outputsEdgesQueryElements = transactions
      .map((tx) => {
        const txKey = `${tx.txid}_FFFFFFFF`;
        return tx.vout.map((out, n) => {
          const outputKey = `${tx.txid}_${Utility.intToHex(Number(n))}`;
          return `"${txKey}"->"${outputKey}":(${Number(
            out.n
          )},${BitcoinUtility.outputCodeOfType(out.scriptPubKey.type)})`;
        });
      })
      .flat();
    const outputsEdgesQueries = _.chunk(outputsEdgesQueryElements, 20000).map(
      (chunk) => `INSERT EDGE out(n,type) VALUES ${chunk.join(",")}`
    );

    await async.parallel({
      transactionsVertexes: async () => {
        await nebulaExecute(transactionsVertexesQuery);
      },
      outputsVertexes: async () => {
        await async.eachLimit(
          outputsVertexesQueries,
          5,
          async (outputsVertexesQuery) => {
            await nebulaExecute(outputsVertexesQuery);
          }
        );
      },
    });

    await async.parallel({
      inputsEdge: async () => {
        await async.eachLimit(
          inputsEdgesQueries,
          5,
          async (inputsEdgesQuery) => {
            await nebulaExecute(inputsEdgesQuery);
          }
        );
      },
      outputsEdge: async () => {
        await async.eachLimit(
          outputsEdgesQueries,
          5,
          async (outputsEdgesQuery) => {
            await nebulaExecute(outputsEdgesQuery);
          }
        );
      },
    });
  });

  txCount += transactions.length;
  qCount += _.sumBy(
    transactions,
    (tx) => 1 + tx.vin.length + tx.vout.length * 2
  );
}

async function getBlockHash(height) {
  const hash = await callRpc("getblockhash", [height]);

  return hash;
}

async function getBlockHeader(hash) {
  const header = await callRpc("getblockheader", [hash]);

  return header;
}

async function getBlockHeaders(from, count) {
  const heights = [];
  for (let height = from; height < from + count; height++) {
    heights.push(height);
  }
  const headers = await async.mapLimit(heights, 20, async (height) => {
    const hash = await getBlockHash(height);
    const header = await getBlockHeader(hash);

    return header;
  });

  return headers;
}

async function getBlock(hash) {
  const block = await callRpc("getblock", [hash, 2]);

  return block;
}

async function getBlocks(headers) {
  const blocks = await async.mapLimit(headers, 20, async (header) => {
    const block = await getBlock(header.hash);

    return block;
  });

  return blocks;
}

const LIMIT = 1000;
async function loop(start) {
  if (start === undefined) {
    try {
      const current = await db.getData("/config/current");
      start = current + 1;
    } catch (e) {
      if (e.toString().indexOf("Can't find dataPath") > -1) {
        await db.push("/config/current", 0);
        start = 0;
      }
    }
  }

  const info = await callRpc("getblockchaininfo");
  if (start > info.blocks) {
    await Utility.wait(10 * 1000);
    return loop(start);
  }
  const headers = await getBlockHeaders(start, LIMIT);

  const chunks = Utility.chunkWeight(headers, 10000, (header) => header.num_tx);
  await async.eachLimit(chunks, 1, async (chunk) => {
    console.log(
      "current =",
      chunk[0].height,
      "txs =",
      _.sumBy(chunk, (header) => header.nTx)
    );
    const blocks = await getBlocks(chunk);
    const txs = blocks.map((block) => block.tx).flat();
    await processTransactions(
      txs.map((tx) => TransactionParser.fromRaw(tx.hex))
    );
  });
  await db.push("/config/current", headers[headers.length - 1].height);
  loop(headers[headers.length - 1].height + 1);
}

loop();
