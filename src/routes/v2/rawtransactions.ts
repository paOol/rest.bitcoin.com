"use strict"

import * as express from "express"
const router = express.Router()
import axios from "axios"
import { IRequestConfig } from "./interfaces/IRequestConfig"
import { IResponse } from "./interfaces/IResponse"
const routeUtils = require("./route-utils")
const logger = require("./logging.js")

// Used to convert error messages to strings, to safely pass to users.
const util = require("util")
util.inspect.defaultOptions = { depth: 1 }

const FREEMIUM_INPUT_SIZE = 20

const BitboxHTTP = axios.create({
  baseURL: process.env.RPC_BASEURL
})
const username = process.env.RPC_USERNAME
const password = process.env.RPC_PASSWORD


const requestConfig: IRequestConfig = {
  method: "post",
  auth: {
    username: username,
    password: password
  },
  data: {
    jsonrpc: "1.0"
  }
}

router.get("/", root)
router.get(
  "/decodeRawTransaction/:hex",
  decodeRawTransactionSingle
)
router.post(
  "/decodeRawTransaction",
  decodeRawTransactionBulk
)
router.get("/decodeScript/:hex", decodeScript)
router.post(
  "/getRawTransaction",
  getRawTransactionBulk
)
router.get(
  "/getRawTransaction/:txid",
  getRawTransactionSingle
)
router.post(
  "/sendRawTransaction",
  sendRawTransaction
)

function root(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  return res.json({ status: "rawtransactions" })
}

// Decode transaction hex into a JSON object.
// GET
async function decodeRawTransactionSingle(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  try {
    const hex = req.params.hex

    // Throw an error if hex is empty.
    if (!hex || hex === "") {
      res.status(400)
      return res.json({ error: "hex can not be empty" })
    }

    const {
      BitboxHTTP,
      username,
      password,
      requestConfig
    } = routeUtils.setEnvVars()

    requestConfig.data.id = "decoderawtransaction"
    requestConfig.data.method = "decoderawtransaction"
    requestConfig.data.params = [hex]

    const response = await BitboxHTTP(requestConfig)
    return res.json(response.data.result)
  } catch (err) {
    // Attempt to decode the error message.
    const { msg, status } = routeUtils.decodeError(err)
    if (msg) {
      res.status(status)
      return res.json({ error: msg })
    }

    // Write out error to error log.
    //logger.error(`Error in rawtransactions/decodeRawTransaction: `, err)

    res.status(500)
    return res.json({ error: util.inspect(err) })
  }
}

async function decodeRawTransactionBulk(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  try {
    let hexes = req.body.hexes

    if (!Array.isArray(hexes)) {
      res.status(400)
      return res.json({ error: "hexes must be an array" })
    }

    if (hexes.length > FREEMIUM_INPUT_SIZE) {
      res.status(400)
      return res.json({
        error: `Array too large. Max ${FREEMIUM_INPUT_SIZE} hexes`
      })
    }

    const results = []

    // Validate each element in the address array.
    for (let i = 0; i < hexes.length; i++) {
      const thisHex = hexes[i]

      // Reject if id is empty
      if (!thisHex || thisHex === "") {
        res.status(400)
        return res.json({ error: "Encountered empty hex" })
      }
    }

    const {
      BitboxHTTP,
      username,
      password,
      requestConfig
    } = routeUtils.setEnvVars()

    // Loop through each height and creates an array of requests to call in parallel
    const promises = hexes.map(async (hex: any) => {
      requestConfig.data.id = "decoderawtransaction"
      requestConfig.data.method = "decoderawtransaction"
      requestConfig.data.params = [hex]

      return await BitboxHTTP(requestConfig)
    })

    // Wait for all parallel Insight requests to return.
    const axiosResult: Array<any> = await axios.all(promises)

    // Retrieve the data part of the result.
    const result = axiosResult.map(x => x.data.result)

    res.status(200)
    return res.json(result)

    /*
    // Loop through each hex and creates an array of requests to call in parallel
    hexes = hexes.map(async (hex: any) => {
      if (!hex || hex === "") {
        res.status(400)
        return res.json({ error: "Encountered empty hex" })
      }

      const {
        BitboxHTTP,
        username,
        password,
        requestConfig
      } = routeUtils.setEnvVars()

      requestConfig.data.id = "decoderawtransaction"
      requestConfig.data.method = "decoderawtransaction"
      requestConfig.data.params = [hex]

      return await BitboxHTTP(requestConfig)
    })

    const result: Array<any> = []
    return axios.all(hexes).then(
      axios.spread((...args) => {
        args.forEach((arg: any) => {
          if (arg) {
            result.push(arg.data.result)
          }
        })
        res.status(200)
        return res.json(result)
      })
    )
*/
  } catch (err) {
    // Attempt to decode the error message.
    const { msg, status } = routeUtils.decodeError(err)
    if (msg) {
      res.status(status)
      return res.json({ error: msg })
    }

    // Write out error to error log.
    //logger.error(`Error in rawtransactions/getRawTransaction: `, err)

    res.status(500)
    return res.json({ error: util.inspect(err) })
  }
}

// Decode a raw transaction from hex to assembly.
// GET
async function decodeScript(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  try {
    const hex = req.params.hex

    // Throw an error if hex is empty.
    if (!hex || hex === "") {
      res.status(400)
      return res.json({ error: "hex can not be empty" })
    }

    const {
      BitboxHTTP,
      username,
      password,
      requestConfig
    } = routeUtils.setEnvVars()

    requestConfig.data.id = "decodescript"
    requestConfig.data.method = "decodescript"
    requestConfig.data.params = [hex]

    const response = await BitboxHTTP(requestConfig)
    return res.json(response.data.result)
  } catch (err) {
    // Attempt to decode the error message.
    const { msg, status } = routeUtils.decodeError(err)
    if (msg) {
      res.status(status)
      return res.json({ error: msg })
    }

    // Write out error to error log.
    //logger.error(`Error in rawtransactions/decodeScript: `, err)

    res.status(500)
    return res.json({ error: util.inspect(err) })
  }
}

// Retrieve raw transactions details from the full node.
async function getRawTransactionsFromNode(txid: string, verbose: number) {
  try {
    const {
      BitboxHTTP,
      username,
      password,
      requestConfig
    } = routeUtils.setEnvVars()

    requestConfig.data.id = "getrawtransaction"
    requestConfig.data.method = "getrawtransaction"
    requestConfig.data.params = [txid, verbose]

    const response = await BitboxHTTP(requestConfig)

    return response.data.result
  } catch (err) {
    throw err
  }
}

// Get a JSON object breakdown of transaction details.
// POST
async function getRawTransactionBulk(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  try {
    let verbose = 0
    if (req.body.verbose) verbose = 1

    let txids = req.body.txids
    if (!Array.isArray(txids)) {
      res.status(400)
      return res.json({ error: "txids must be an array" })
    }
    if (txids.length > FREEMIUM_INPUT_SIZE) {
      res.status(400)
      return res.json({
        error: `Array too large. Max ${FREEMIUM_INPUT_SIZE} txids`
      })
    }

    // stub response object
    let returnResponse: IResponse = {
      status: 100,
      json: {
        error: ""
      }
    }

    // Validate each txid in the array.
    for (let i = 0; i < txids.length; i++) {
      const txid = txids[i]

      if (!txid || txid === "") {
        res.status(400)
        return res.json({ error: `Encountered empty TXID` })
      }

      if (txid.length !== 64) {
        res.status(400)
        return res.json({
          error: `parameter 1 must be of length 64 (not ${txid.length})`
        })
      }
    }

    // Loop through each txid and create an array of promises
    const promises = txids.map(async (txid: any) => {
      return getRawTransactionsFromNode(txid, verbose)
    })

    // Wait for all parallel promises to return.
    const axiosResult: Array<any> = await axios.all(promises)

    res.status(200)
    return res.json(axiosResult)
  } catch (err) {
    // Attempt to decode the error message.
    const { msg, status } = routeUtils.decodeError(err)
    if (msg) {
      res.status(status)
      return res.json({ error: msg })
    }

    // Write out error to error log.
    //logger.error(`Error in rawtransactions/getRawTransaction: `, err)

    res.status(500)
    return res.json({ error: util.inspect(err) })
  }
}

// Get a JSON object breakdown of transaction details.
// GET
async function getRawTransactionSingle(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  try {
    let verbose = 0
    if (req.query.verbose === "true") verbose = 1

    const txid = req.params.txid
    if (!txid || txid === "") {
      res.status(400)
      return res.json({ error: "txid can not be empty" })
    }
    console.log('txid', txid);

    const data = await getRawTransactionsFromNode(txid, verbose)

    return res.json(data)
  } catch (err) {
    // Attempt to decode the error message.
    const { msg, status } = routeUtils.decodeError(err)
    if (msg) {
      res.status(status)
      return res.json({ error: msg })
    }

    // Write out error to error log.
    //logger.error(`Error in rawtransactions/getRawTransaction: `, err)

    res.status(500)
    return res.json({ error: util.inspect(err) })
  }
}

// Transmit a raw transaction to the BCH network.
async function sendRawTransaction(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  try {
    // Validation
    const hexes = req.body.hexes

    // Reject if input is not an array.
    if (!Array.isArray(hexes)) {
      res.status(400)
      return res.json({ error: "hex must be an array" })
    }

    // Reject if there are too many elements in the array.
    if (hexes.length > FREEMIUM_INPUT_SIZE) {
      res.status(400)
      return res.json({
        error: `Array too large. Max ${FREEMIUM_INPUT_SIZE} hexes`
      })
    }

    // Validate each element
    for (let i = 0; i < hexes.length; i++) {
      const hex = hexes[i]

      if (hex === "") {
        res.status(400)
        return res.json({
          error: `Encountered empty hex`
        })
      }
    }

    const {
      BitboxHTTP,
      username,
      password,
      requestConfig
    } = routeUtils.setEnvVars()

    // Dev Note CT 1/31/2019:
    // Sending the 'sendrawtrnasaction' RPC call to a full node in parallel will
    // not work. Testing showed that the full node will return the same TXID for
    // different TX hexes. I believe this is by design, to prevent double spends.
    // In parallel, we are essentially asking the node to broadcast a new TX before
    // it's finished broadcast the previous one. Serial execution is required.

    // How to send TX hexes in parallel the WRONG WAY:
    /*
    // Collect an array of promises.
    const promises = hexes.map(async (hex: any) => {
      requestConfig.data.id = "sendrawtransaction"
      requestConfig.data.method = "sendrawtransaction"
      requestConfig.data.params = [hex]

      return await BitboxHTTP(requestConfig)
    })

    // Wait for all parallel Insight requests to return.
    const axiosResult: Array<any> = await axios.all(promises)

    // Retrieve the data part of the result.
    const result = axiosResult.map(x => x.data.result)
    */

    // Sending them serially.
    const result = []
    for (let i = 0; i < hexes.length; i++) {
      const hex = hexes[i]

      requestConfig.data.id = "sendrawtransaction"
      requestConfig.data.method = "sendrawtransaction"
      requestConfig.data.params = [hex]

      const rpcResult = await BitboxHTTP(requestConfig)

      result.push(rpcResult.data.result)
    }

    res.status(200)
    return res.json(result)
  } catch (err) {
    // Attempt to decode the error message.
    const { msg, status } = routeUtils.decodeError(err)
    if (msg) {
      res.status(status)
      return res.json({ error: msg })
    }

    res.status(500)
    return res.json({ error: util.inspect(err) })
  }
}

module.exports = {
  router,
  testableComponents: {
    root,
    decodeRawTransactionSingle,
    decodeRawTransactionBulk,
    decodeScript,
    getRawTransactionBulk,
    getRawTransactionSingle,
    sendRawTransaction
  }
}
