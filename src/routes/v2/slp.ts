"use strict"

import * as express from "express"
const router = express.Router()
import axios from "axios"
import { IRequestConfig } from "./interfaces/IRequestConfig"
const routeUtils = require("./route-utils")
const logger = require("./logging.js")
const strftime = require("strftime")

const FREEMIUM_INPUT_SIZE = 20

// Used to convert error messages to strings, to safely pass to users.
const util = require("util")
util.inspect.defaultOptions = { depth: 5 }

// Instantiate BITBOX
const BITBOXCli = require("bitbox-sdk/lib/bitbox-sdk").default
const BITBOX = new BITBOXCli()

const SLPSDK = require("slp-sdk/lib/SLP").default
const SLP = new SLPSDK()

// Instantiate SLPJS.
const slp = require("slpjs")
const slpjs = new slp.Slp(BITBOX)
const utils = slp.Utils

// SLP tx db (LevelDB for caching)
const level = require("level")
const slpTxDb = level("./slp-tx-db")

// Setup JSON RPC
const BitboxHTTP = axios.create({
  baseURL: process.env.RPC_BASEURL
})
const username = process.env.RPC_USERNAME
const password = process.env.RPC_PASSWORD

// Setup REST and TREST URLs used by slpjs
// Dev note: this allows for unit tests to mock the URL.
if(!process.env.REST_URL) process.env.REST_URL = `https://rest.bitcoin.com/v2/`
if(!process.env.TREST_URL) process.env.TREST_URL = `https://trest.bitcoin.com/v2/`

router.get("/", root)
router.get("/list", list)
router.get("/list/:tokenId", listSingleToken)
router.post("/list", listBulkToken)
router.get("/balancesForAddress/:address", balancesForAddress)
router.get("/balance/:address/:tokenId", balancesForAddressByTokenID)
router.get("/convert/:address", convertAddressSingle)
router.post("/convert", convertAddressBulk)
router.post("/validateTxid", validateBulk)
router.get("/txDetails/:txid", txDetails)

if (process.env.NON_JS_FRAMEWORK && process.env.NON_JS_FRAMEWORK === "true") {
  router.get(
    "/createTokenType1/:fundingAddress/:fundingWif/:tokenReceiverAddress/:batonReceiverAddress/:bchChangeReceiverAddress/:decimals/:name/:symbol/:documentUri/:documentHash/:initialTokenQty",
    createTokenType1
  )
  router.get(
    "/mintTokenType1/:fundingAddress/:fundingWif/:tokenReceiverAddress/:batonReceiverAddress/:bchChangeReceiverAddress/:tokenId/:additionalTokenQty",
    mintTokenType1
  )
  router.get(
    "/sendTokenType1/:fundingAddress/:fundingWif/:tokenReceiverAddress/:bchChangeReceiverAddress/:tokenId/:amount",
    sendTokenType1
  )
  router.get(
    "/burnTokenType1/:fundingAddress/:fundingWif/:bchChangeReceiverAddress/:tokenId/:amount",
    burnTokenType1
  )
  router.get(
    "/burnAllTokenType1/:fundingAddress/:fundingWif/:bchChangeReceiverAddress/:tokenId",
    burnAllTokenType1
  )
}

// Retrieve raw transactions details from the full node.
// TODO: move this function to a separate support library.
// TODO: Add unit tests for this function.
async function getRawTransactionsFromNode(txids: string[]) {
  try {
    const {
      BitboxHTTP,
      username,
      password,
      requestConfig
    } = routeUtils.setEnvVars()

    const txPromises = txids.map(async txid => {
      // Check slpTxDb
      try {
        if (slpTxDb.isOpen()) {
          const rawTx = await slpTxDb.get(txid)
          return rawTx
        }
      } catch (err) {}

      requestConfig.data.id = "getrawtransaction"
      requestConfig.data.method = "getrawtransaction"
      requestConfig.data.params = [txid, 0]

      const response = await BitboxHTTP(requestConfig)
      const result = response.data.result

      // Insert to slpTxDb
      try {
        if (slpTxDb.isOpen()) {
          await slpTxDb.put(txid, result)
        }
      } catch (err) {
        console.log("Error inserting to slpTxDb", err)
      }

      return result
    })

    const results = await axios.all(txPromises)
    return results
  } catch (err) {
    throw err
  }
}

// Create a validator for validating SLP transactions.
function createValidator(network: string, getRawTransactions: any = null): any {
  let tmpBITBOX: any

  if (network === "mainnet") {
    tmpBITBOX = new BITBOXCli({ restURL: process.env.REST_URL })
  } else {
    tmpBITBOX = new BITBOXCli({ restURL: process.env.TREST_URL })
  }

  const slpValidator: any = new slp.LocalValidator(
    tmpBITBOX,
    getRawTransactions
      ? getRawTransactions
      : tmpBITBOX.RawTransactions.getRawTransaction.bind(this)
  )

  return slpValidator
}

// Instantiate the local SLP validator.
const slpValidator = createValidator(
  process.env.NETWORK,
  getRawTransactionsFromNode
)

// Instantiate the bitboxproxy class in SLPJS.
const bitboxproxy = new slp.BitboxNetwork(BITBOX, slpValidator)

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

function root(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  return res.json({ status: "slp" })
}

async function list(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  try {
    const query = {
      v: 3,
      q: {
        find: { "out.h1": "534c5000", "out.s3": "GENESIS" },
        limit: 1000
      }
    }

    const s = JSON.stringify(query)
    const b64 = Buffer.from(s).toString("base64")
    const url = `${process.env.BITDB_URL}q/${b64}`

    // Get data from BitDB.
    const tokenRes = await axios.get(url)

    let formattedTokens: Array<any> = []

    if (tokenRes.data.u.length) {
      tokenRes.data.u.forEach((token: any) => {
        let div = "1"
        for (let i = 0; i < parseInt(token.out[0].h8); i++) {
          div += "0"
        }

        formattedTokens.push({
          id: token.tx.h,
          timestamp: token.blk
            ? strftime("%Y-%m-%d %H:%M", new Date(token.blk.t * 1000))
            : "unconfirmed",
          symbol: token.out[0].s4,
          name: token.out[0].s5,
          documentUri: token.out[0].s6,
          documentHash: token.out[0].h7,
          decimals: parseInt(token.out[0].h8),
          initialTokenQty: parseInt(token.out[0].h10, 16) / parseInt(div)
        })
      })
    }

    if (tokenRes.data.c.length) {
      tokenRes.data.c.forEach((token: any) => {
        let div = "1"
        for (let i = 0; i < parseInt(token.out[0].h8); i++) {
          div += "0"
        }

        formattedTokens.push({
          id: token.tx.h,
          timestamp: token.blk
            ? strftime("%Y-%m-%d %H:%M", new Date(token.blk.t * 1000))
            : "unconfirmed",
          symbol: token.out[0].s4,
          name: token.out[0].s5,
          documentUri: token.out[0].s6,
          documentHash: token.out[0].h7,
          decimals: parseInt(token.out[0].h8),
          initialTokenQty: parseInt(token.out[0].h10, 16) / parseInt(div)
        })
      })
    }

    res.json(formattedTokens)

    return formattedTokens
  } catch (err) {
    const { msg, status } = routeUtils.decodeError(err)
    if (msg) {
      res.status(status)
      return res.json({ error: msg })
    }
    res.status(500)
    return res.json({ error: `Error in /list: ${err.message}` })
  }
}

async function listSingleToken(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  try {
    let tokenId = req.params.tokenId

    if (!tokenId || tokenId === "") {
      res.status(400)
      return res.json({ error: "tokenId can not be empty" })
    }

    const t = await lookupToken(tokenId)

    res.status(200)
    return res.json(t)
  } catch (err) {
    const { msg, status } = routeUtils.decodeError(err)
    if (msg) {
      res.status(status)
      return res.json({ error: msg })
    }
    res.status(500)
    return res.json({ error: `Error in /list/:tokenId: ${err.message}` })
  }
}

async function listBulkToken(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  try {
    let tokenIds = req.body.tokenIds

    // Reject if tokenIds is not an array.
    if (!Array.isArray(tokenIds)) {
      res.status(400)
      return res.json({
        error: "tokenIds needs to be an array. Use GET for single tokenId."
      })
    }

    // Enforce no more than 20 txids.
    if (tokenIds.length > FREEMIUM_INPUT_SIZE) {
      res.status(400)
      return res.json({
        error: `Array too large. Max ${FREEMIUM_INPUT_SIZE} tokenIds`
      })
    }

    // Lookup each token in the array
    const tokens = []
    for (let i = 0; i < tokenIds.length; i++) {
      const tokenId = tokenIds[i]

      // Validate each element.
      if (!tokenId || tokenId === "") {
        res.status(400)
        return res.json({ error: `Empty tokenId encountered in entry ${i}` })
      }

      const thisToken = await lookupToken(tokenId)
      tokens.push(thisToken)
    }

    res.status(200)
    return res.json(tokens)
  } catch (err) {
    const { msg, status } = routeUtils.decodeError(err)
    if (msg) {
      res.status(status)
      return res.json({ error: msg })
    }
    res.status(500)
    return res.json({ error: `Error in /list/:tokenId: ${err.message}` })
  }
}

// This is a utility function in order to keep code DRY. It is used by the
// single and bulk list*Token functions.
async function lookupToken(tokenId) {
  try {
    const query = {
      v: 3,
      q: {
        find: { "out.h1": "534c5000", "out.s3": "GENESIS" },
        limit: 1000
      }
    }

    const s = JSON.stringify(query)
    const b64 = Buffer.from(s).toString("base64")
    const url = `${process.env.BITDB_URL}q/${b64}`

    const tokenRes = await axios.get(url)

    //console.log(`tokenRes.data: ${util.inspect(tokenRes.data)}`)
    //console.log(`tokenRes.data: ${JSON.stringify(tokenRes.data,null,2)}`)

    let formattedTokens: Array<any> = []

    if (tokenRes.data.u.length) {
      tokenRes.data.u.forEach((token: any) => {
        let div = "1"
        for (let i = 0; i < parseInt(token.out[0].h8); i++) {
          div += "0"
        }

        formattedTokens.push({
          id: token.tx.h,
          timestamp: token.blk
            ? strftime("%Y-%m-%d %H:%M", new Date(token.blk.t * 1000))
            : "unconfirmed",
          symbol: token.out[0].s4,
          name: token.out[0].s5,
          documentUri: token.out[0].s6,
          documentHash: token.out[0].h7,
          decimals: parseInt(token.out[0].h8),
          initialTokenQty: parseInt(token.out[0].h10, 16) / parseInt(div)
        })
      })
    }

    if (tokenRes.data.c.length) {
      tokenRes.data.c.forEach((token: any) => {
        let div = "1"
        for (let i = 0; i < parseInt(token.out[0].h8); i++) {
          div += "0"
        }

        formattedTokens.push({
          id: token.tx.h,
          timestamp: strftime("%Y-%m-%d %H:%M", new Date(token.blk.t * 1000)),
          symbol: token.out[0].s4,
          name: token.out[0].s5,
          documentUri: token.out[0].s6,
          documentHash: token.out[0].h7,
          decimals: parseInt(token.out[0].h8),
          initialTokenQty: parseInt(token.out[0].h10, 16) / parseInt(div)
        })
      })
    }

    //console.log(`formattedTokens: ${JSON.stringify(formattedTokens,null,2)}`)

    let t
    formattedTokens.forEach((token: any) => {
      if (token.id === tokenId) t = token
    })

    // If token could not be found.
    if (t === undefined) {
      t = {
        id: "not found"
      }
    }

    return t
  } catch (err) {
    //console.log(`Error in slp.ts/lookupToken()`)
    throw err
  }
}

// Retrieve token balances for all tokens for a single address.
async function balancesForAddress(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  try {
    // Validate the input data.
    let address = req.params.address
    if (!address || address === "") {
      res.status(400)
      return res.json({ error: "address can not be empty" })
    }

    // Ensure the input is a valid BCH address.
    try {
      let cash = utils.toCashAddress(address)
    } catch (err) {
      res.status(400)
      return res.json({
        error: `Invalid BCH address. Double check your address is valid: ${address}`
      })
    }

    // Prevent a common user error. Ensure they are using the correct network address.
    let cashAddr = utils.toCashAddress(address)
    const networkIsValid = routeUtils.validateNetwork(cashAddr)
    if (!networkIsValid) {
      res.status(400)
      return res.json({
        error: `Invalid network. Trying to use a testnet address on mainnet, or vice versa.`
      })
    }

    let isMainnet = SLP.Address.isMainnetAddress(address)
    let tmpBITBOX: any

    if (isMainnet) {
      tmpBITBOX = new BITBOXCli({ restURL: process.env.REST_URL })
    } else {
      tmpBITBOX = new BITBOXCli({ restURL: process.env.TREST_URL })
    }

    // Initialize slpjs with BITBOX and our local validator.
    const tmpbitboxNetwork = new slp.BitboxNetwork(tmpBITBOX, slpValidator)

    // Convert input to an simpleledger: address.
    const slpAddr = utils.toSlpAddress(req.params.address)

    // Get balances and utxos for the address of interest.
    const balances = await tmpbitboxNetwork.getAllSlpBalancesAndUtxos(slpAddr)

    // If balances for this address exist, continue processing.
    if (balances.slpTokenBalances) {

      // An array of txids, each representing a token class possed by this address.
      let keys = Object.keys(balances.slpTokenBalances)

      // Query the token information for each token class found.
      const axiosPromises = keys.map(async (key: any) => {
        let tokenMetadata: any = await tmpbitboxNetwork.getTokenInformation(key)

        return {
          tokenId: key,
          balance: balances.slpTokenBalances[key]
            .div(10 ** tokenMetadata.decimals)
            .toString(),
          decimalCount: tokenMetadata.decimals
        }
      })

      // Wait for all parallel promises to return.
      const axiosResult: Array<any> = await axios.all(axiosPromises)
      return res.json(axiosResult)

    // If no balances for this address exist, exit.
    } else {
      return res.json("No balances for this address")
    }
  } catch (err) {
    //console.log(`Error object: ${util.inspect(err)}`)

    // Decode the error message.
    const { msg, status } = routeUtils.decodeError(err)
    if (msg) {
      res.status(status)
      return res.json({ error: msg })
    }

    res.status(500)
    return res.json({
      error: `Error in /balancesForAddress/:address: ${err.message}`
    })
  }
}

// Retrieve token balances for a single token class, for a single address.
async function balancesForAddressByTokenID(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  try {

    // Validate input data.
    let address: string = req.params.address
    if (!address || address === "") {
      res.status(400)
      return res.json({ error: "address can not be empty" })
    }

    let tokenId: string = req.params.tokenId
    if (!tokenId || tokenId === "") {
      res.status(400)
      return res.json({ error: "tokenId can not be empty" })
    }

    // Ensure the input is a valid BCH address.
    try {
      let cash = utils.toCashAddress(address)
    } catch (err) {
      res.status(400)
      return res.json({
        error: `Invalid BCH address. Double check your address is valid: ${address}`
      })
    }

    // Prevent a common user error. Ensure they are using the correct network address.
    let cashAddr = utils.toCashAddress(address)
    const networkIsValid = routeUtils.validateNetwork(cashAddr)
    if (!networkIsValid) {
      res.status(400)
      return res.json({
        error: `Invalid network. Trying to use a testnet address on mainnet, or vice versa.`
      })
    }

    let isMainnet = SLP.Address.isMainnetAddress(address)
    let tmpBITBOX: any

    if (isMainnet) {
      tmpBITBOX = new BITBOXCli({ restURL: process.env.REST_URL })
    } else {
      tmpBITBOX = new BITBOXCli({ restURL: process.env.TREST_URL })
    }

    // Initialize slpjs with BITBOX and our local validator.
    const tmpbitboxNetwork = new slp.BitboxNetwork(tmpBITBOX, slpValidator)

    // Convert input to an simpleledger: address.
    const slpAddr = utils.toSlpAddress(req.params.address)

    // Get balances and utxos for the address of interest.
    const balances = await tmpbitboxNetwork.getAllSlpBalancesAndUtxos(slpAddr)

    // If balances for this address exist, continue processing.
    if (balances.slpTokenBalances) {

      // An array of txids, each representing a token class possed by this address.
      let keys = Object.keys(balances.slpTokenBalances)

      // Query the token information for each token class found.
      const axiosPromises = keys.map(async (key: any) => {

        let tokenMetadata: any = await tmpbitboxNetwork.getTokenInformation(key)

        return {
          tokenId: key,
          balance: balances.slpTokenBalances[key]
            .div(10 ** tokenMetadata.decimals)
            .toString(),
          decimalCount: tokenMetadata.decimals
        }
      })

      // Wait for all parallel promises to return.
      const axiosResult: Array<any> = await axios.all(axiosPromises)

      // Loop through the returned token classes for this address
      for (let result of axiosResult) {
        // Return the token class of interest.
        if (result.tokenId === req.params.tokenId) {
          return res.json(result)
        }
      }

      return res.json("No balance for this address and tokenId")

    // If no balances for this address exist, exit.
    } else {
      return res.json("No balance for this address and tokenId")
    }
  } catch (err) {
    //console.log(`Error object: ${util.inspect(err)}`)

    // Decode the error message.
    const { msg, status } = routeUtils.decodeError(err)
    if (msg) {
      res.status(status)
      return res.json({ error: msg })
    }

    res.status(500)
    return res.json({
      error: `Error in /balance/:address/:tokenId: ${err.message}`
    })
  }
}

async function convertAddressSingle(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  try {
    let address = req.params.address

    // Validate input
    if (!address || address === "") {
      res.status(400)
      return res.json({ error: "address can not be empty" })
    }

    const slpAddr = SLP.Address.toSLPAddress(address)

    const obj: {
      [slpAddress: string]: any
      cashAddress: any
      legacyAddress: any
    } = {
      slpAddress: "",
      cashAddress: "",
      legacyAddress: ""
    }
    obj.slpAddress = slpAddr
    obj.cashAddress = SLP.Address.toCashAddress(slpAddr)
    obj.legacyAddress = BITBOX.Address.toLegacyAddress(obj.cashAddress)

    res.status(200)
    return res.json(obj)
  } catch (err) {
    const { msg, status } = routeUtils.decodeError(err)
    if (msg) {
      res.status(status)
      return res.json({ error: msg })
    }
    res.status(500)
    return res.json({
      error: `Error in /address/convert/:address: ${err.message}`
    })
  }
}

async function convertAddressBulk(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  let addresses = req.body.addresses

  // Reject if hashes is not an array.
  if (!Array.isArray(addresses)) {
    res.status(400)
    return res.json({
      error: "addresses needs to be an array. Use GET for single address."
    })
  }

  // Enforce no more than 20 txids.
  if (addresses.length > FREEMIUM_INPUT_SIZE) {
    res.status(400)
    return res.json({
      error: `Array too large. Max ${FREEMIUM_INPUT_SIZE} addresses`
    })
  }

  // Convert each address in the array.
  const convertedAddresses = []
  for (let i = 0; i < addresses.length; i++) {
    const address = addresses[i]

    // Validate input
    if (!address || address === "") {
      res.status(400)
      return res.json({ error: "address can not be empty" })
    }

    const slpAddr = SLP.Address.toSLPAddress(address)

    const obj: {
      [slpAddress: string]: any
      cashAddress: any
      legacyAddress: any
    } = {
      slpAddress: "",
      cashAddress: "",
      legacyAddress: ""
    }
    obj.slpAddress = slpAddr
    obj.cashAddress = SLP.Address.toCashAddress(slpAddr)
    obj.legacyAddress = BITBOX.Address.toLegacyAddress(obj.cashAddress)

    convertedAddresses.push(obj)
  }

  res.status(200)
  return res.json(convertedAddresses)
}

async function validateBulk(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  try {
    const txids = req.body.txids

    // Reject if address is not an array.
    if (!Array.isArray(txids)) {
      res.status(400)
      return res.json({ error: "txids needs to be an array" })
    }

    // Enforce no more than 20 txids.
    if (txids.length > FREEMIUM_INPUT_SIZE) {
      res.status(400)
      return res.json({
        error: `Array too large. Max ${FREEMIUM_INPUT_SIZE} txids`
      })
    }

    logger.debug(`Executing slp/validate with these txids: `, txids)

    // Validate each txid
    const validatePromises = txids.map(async txid => {
      try {
        // Dev note: must call module.exports to allow stubs in unit tests.
        const isValid = await module.exports.testableComponents.isValidSlpTxid(
          txid
        )

        let tmp: any = {
          txid: txid,
          valid: isValid ? true : false
        }
        return tmp
      } catch (err) {
        //console.log(`err obj: ${util.inspect(err)}`)
        //console.log(`err.response.data: ${util.inspect(err.response.data)}`)
        throw err
      }
    })

    // Filter array to only valid txid results
    const validateResults = await axios.all(validatePromises)
    const validTxids = validateResults.filter(result => result)

    res.status(200)
    return res.json(validTxids)
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

// Returns a Boolean if the input TXID is a valid SLP TXID.
async function isValidSlpTxid(txid: string): Promise<boolean> {
  const isValid = await slpValidator.isValidSlpTxid(txid)
  return isValid
}

// Below are functions which are enabled for teams not using our javascript SDKs which still need to create txs
// These should never be enabled on our public REST API

async function createTokenType1(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  let fundingAddress = req.params.fundingAddress
  if (!fundingAddress || fundingAddress === "") {
    res.status(400)
    return res.json({ error: "fundingAddress can not be empty" })
  }

  let fundingWif = req.params.fundingWif
  if (!fundingWif || fundingWif === "") {
    res.status(400)
    return res.json({ error: "fundingWif can not be empty" })
  }

  let tokenReceiverAddress = req.params.tokenReceiverAddress
  if (!tokenReceiverAddress || tokenReceiverAddress === "") {
    res.status(400)
    return res.json({ error: "tokenReceiverAddress can not be empty" })
  }

  let batonReceiverAddress = req.params.batonReceiverAddress
  if (!batonReceiverAddress || batonReceiverAddress === "") {
    res.status(400)
    return res.json({ error: "batonReceiverAddress can not be empty" })
  }

  let bchChangeReceiverAddress = req.params.bchChangeReceiverAddress
  if (!bchChangeReceiverAddress || bchChangeReceiverAddress === "") {
    res.status(400)
    return res.json({ error: "bchChangeReceiverAddress can not be empty" })
  }

  let decimals = req.params.decimals
  if (!decimals || decimals === "") {
    res.status(400)
    return res.json({ error: "decimals can not be empty" })
  }

  let name = req.params.name
  if (!name || name === "") {
    res.status(400)
    return res.json({ error: "name can not be empty" })
  }

  let symbol = req.params.symbol
  if (!symbol || symbol === "") {
    res.status(400)
    return res.json({ error: "symbol can not be empty" })
  }

  let documentUri = req.params.documentUri
  if (!documentUri || documentUri === "") {
    res.status(400)
    return res.json({ error: "documentUri can not be empty" })
  }

  let documentHash = req.params.documentHash
  if (!documentHash || documentHash === "") {
    res.status(400)
    return res.json({ error: "documentHash can not be empty" })
  }

  let initialTokenQty = req.params.initialTokenQty
  if (!initialTokenQty || initialTokenQty === "") {
    res.status(400)
    return res.json({ error: "initialTokenQty can not be empty" })
  }

  let token = await SLP.TokenType1.create({
    fundingAddress: fundingAddress,
    fundingWif: fundingWif,
    tokenReceiverAddress: tokenReceiverAddress,
    batonReceiverAddress: batonReceiverAddress,
    bchChangeReceiverAddress: bchChangeReceiverAddress,
    decimals: decimals,
    name: name,
    symbol: symbol,
    documentUri: documentUri,
    documentHash: documentHash,
    initialTokenQty: initialTokenQty
  })

  res.status(200)
  return res.json(token)
}

async function mintTokenType1(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  let fundingAddress = req.params.fundingAddress
  if (!fundingAddress || fundingAddress === "") {
    res.status(400)
    return res.json({ error: "fundingAddress can not be empty" })
  }

  let fundingWif = req.params.fundingWif
  if (!fundingWif || fundingWif === "") {
    res.status(400)
    return res.json({ error: "fundingWif can not be empty" })
  }

  let tokenReceiverAddress = req.params.tokenReceiverAddress
  if (!tokenReceiverAddress || tokenReceiverAddress === "") {
    res.status(400)
    return res.json({ error: "tokenReceiverAddress can not be empty" })
  }

  let batonReceiverAddress = req.params.batonReceiverAddress
  if (!batonReceiverAddress || batonReceiverAddress === "") {
    res.status(400)
    return res.json({ error: "batonReceiverAddress can not be empty" })
  }

  let bchChangeReceiverAddress = req.params.bchChangeReceiverAddress
  if (!bchChangeReceiverAddress || bchChangeReceiverAddress === "") {
    res.status(400)
    return res.json({ error: "bchChangeReceiverAddress can not be empty" })
  }

  let tokenId = req.params.tokenId
  if (!tokenId || tokenId === "") {
    res.status(400)
    return res.json({ error: "tokenId can not be empty" })
  }

  let additionalTokenQty = req.params.additionalTokenQty
  if (!additionalTokenQty || additionalTokenQty === "") {
    res.status(400)
    return res.json({ error: "additionalTokenQty can not be empty" })
  }

  let mint = await SLP.TokenType1.mint({
    fundingAddress: fundingAddress,
    fundingWif: fundingWif,
    tokenReceiverAddress: tokenReceiverAddress,
    batonReceiverAddress: batonReceiverAddress,
    bchChangeReceiverAddress: bchChangeReceiverAddress,
    tokenId: tokenId,
    additionalTokenQty: additionalTokenQty
  })

  res.status(200)
  return res.json(mint)
}

async function sendTokenType1(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  let fundingAddress = req.params.fundingAddress
  if (!fundingAddress || fundingAddress === "") {
    res.status(400)
    return res.json({ error: "fundingAddress can not be empty" })
  }

  let fundingWif = req.params.fundingWif
  if (!fundingWif || fundingWif === "") {
    res.status(400)
    return res.json({ error: "fundingWif can not be empty" })
  }

  let tokenReceiverAddress = req.params.tokenReceiverAddress
  if (!tokenReceiverAddress || tokenReceiverAddress === "") {
    res.status(400)
    return res.json({ error: "tokenReceiverAddress can not be empty" })
  }

  let bchChangeReceiverAddress = req.params.bchChangeReceiverAddress
  if (!bchChangeReceiverAddress || bchChangeReceiverAddress === "") {
    res.status(400)
    return res.json({ error: "bchChangeReceiverAddress can not be empty" })
  }

  let tokenId = req.params.tokenId
  if (!tokenId || tokenId === "") {
    res.status(400)
    return res.json({ error: "tokenId can not be empty" })
  }

  let amount = req.params.amount
  if (!amount || amount === "") {
    res.status(400)
    return res.json({ error: "amount can not be empty" })
  }
  let send = await SLP.TokenType1.send({
    fundingAddress: fundingAddress,
    fundingWif: fundingWif,
    tokenReceiverAddress: tokenReceiverAddress,
    bchChangeReceiverAddress: bchChangeReceiverAddress,
    tokenId: tokenId,
    amount: amount
  })

  res.status(200)
  return res.json(send)
}

async function burnTokenType1(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  let fundingAddress = req.params.fundingAddress
  if (!fundingAddress || fundingAddress === "") {
    res.status(400)
    return res.json({ error: "fundingAddress can not be empty" })
  }

  let fundingWif = req.params.fundingWif
  if (!fundingWif || fundingWif === "") {
    res.status(400)
    return res.json({ error: "fundingWif can not be empty" })
  }

  let bchChangeReceiverAddress = req.params.bchChangeReceiverAddress
  if (!bchChangeReceiverAddress || bchChangeReceiverAddress === "") {
    res.status(400)
    return res.json({ error: "bchChangeReceiverAddress can not be empty" })
  }

  let tokenId = req.params.tokenId
  if (!tokenId || tokenId === "") {
    res.status(400)
    return res.json({ error: "tokenId can not be empty" })
  }

  let amount = req.params.amount
  if (!amount || amount === "") {
    res.status(400)
    return res.json({ error: "amount can not be empty" })
  }

  let burn = await SLP.TokenType1.burn({
    fundingAddress: fundingAddress,
    fundingWif: fundingWif,
    tokenId: tokenId,
    amount: amount,
    bchChangeReceiverAddress: bchChangeReceiverAddress
  })

  res.status(200)
  return res.json(burn)
}

async function burnAllTokenType1(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  let fundingAddress = req.params.fundingAddress
  if (!fundingAddress || fundingAddress === "") {
    res.status(400)
    return res.json({ error: "fundingAddress can not be empty" })
  }

  let fundingWif = req.params.fundingWif
  if (!fundingWif || fundingWif === "") {
    res.status(400)
    return res.json({ error: "fundingWif can not be empty" })
  }

  let bchChangeReceiverAddress = req.params.bchChangeReceiverAddress
  if (!bchChangeReceiverAddress || bchChangeReceiverAddress === "") {
    res.status(400)
    return res.json({ error: "bchChangeReceiverAddress can not be empty" })
  }

  let tokenId = req.params.tokenId
  if (!tokenId || tokenId === "") {
    res.status(400)
    return res.json({ error: "tokenId can not be empty" })
  }

  let burnAll = await SLP.TokenType1.burnAll({
    fundingAddress: fundingAddress,
    fundingWif: fundingWif,
    tokenId: tokenId,
    bchChangeReceiverAddress: bchChangeReceiverAddress
  })

  res.status(200)
  return res.json(burnAll)
}

async function txDetails(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  try {
    // Validate input parameter
    const txid = req.params.txid
    if (!txid || txid === "") {
      res.status(400)
      return res.json({ error: "txid can not be empty" })
    }

    if (txid.length !== 64) {
      res.status(400)
      return res.json({error: "This is not a txid"})
    }

    // Create a local instantiation of BITBOX
    let tmpBITBOX
    if(process.env.NETWORK === "testnet")
      tmpBITBOX = new BITBOXCli({ restURL: process.env.TREST_URL })
    else
      tmpBITBOX = new BITBOXCli({ restURL: process.env.REST_URL })

    // Initialize slpjs with BITBOX and our local validator.
    const tmpbitboxNetwork = new slp.BitboxNetwork(tmpBITBOX, slpValidator)

    // Get TX info + token info
    const result = await tmpbitboxNetwork.getTransactionDetails(txid)

    //return await slpValidator.isValidSlpTxid(txid)
    return result
  } catch (err) {
    //console.log(`Error in tokenTransfer(): `, err)

    // Attempt to decode the error message.
    const { msg, status } = routeUtils.decodeError(err)
    if (msg) {
      res.status(status)
      return res.json({ error: msg })
    }

    // Handle corner case of mis-typted txid
    if(err.error.indexOf('Not found') > -1) {
      res.status(400)
      return res.json({ error: 'TXID not found'})
    }

    res.status(500)
    return res.json({ error: util.inspect(err) })
  }
}

module.exports = {
  router,
  testableComponents: {
    root,
    list,
    listSingleToken,
    listBulkToken,
    balancesForAddress,
    balancesForAddressByTokenID,
    convertAddressSingle,
    convertAddressBulk,
    validateBulk,
    isValidSlpTxid,
    createTokenType1,
    mintTokenType1,
    sendTokenType1,
    burnTokenType1,
    burnAllTokenType1,
    txDetails
  }
}
