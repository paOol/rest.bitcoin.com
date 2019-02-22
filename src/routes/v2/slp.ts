"use strict"

import * as express from "express"
const router = express.Router()
import axios from "axios"
import { IRequestConfig } from "./interfaces/IRequestConfig"
const routeUtils = require("./route-utils")
const logger = require("./logging.js")
const strftime = require("strftime")
import * as Bitcore from 'bitcore-lib-cash';
const rawtransactions = require("./rawtransactions")

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
//const slp = require("/home/trout/work/bch/slpjs")
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
    tmpBITBOX = new BITBOXCli({ restURL: "https://rest.bitcoin.com/v2/" })
  } else {
    tmpBITBOX = new BITBOXCli({ restURL: "https://trest.bitcoin.com/v2/" })
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
//console.log(`bitboxproxy: ${util.inspect(bitboxproxy)}`)

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
    for(let i=0; i < tokenIds.length; i++) {
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
  } catch(err) {
    //console.log(`Error in slp.ts/lookupToken()`)
    throw err
  }
}

async function balancesForAddress(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  try {
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
      tmpBITBOX = new BITBOXCli({ restURL: "https://rest.bitcoin.com/v2/" })
    } else {
      tmpBITBOX = new BITBOXCli({ restURL: "https://trest.bitcoin.com/v2/" })
    }

    const tmpbitboxNetwork = new slp.BitboxNetwork(tmpBITBOX, slpValidator)

    const slpAddr = utils.toSlpAddress(req.params.address)
    const balances = await tmpbitboxNetwork.getAllSlpBalancesAndUtxos(slpAddr)
    if (balances.slpTokenBalances) {
      let keys = Object.keys(balances.slpTokenBalances)
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

async function balancesForAddressByTokenID(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  try {
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
      tmpBITBOX = new BITBOXCli({ restURL: "https://rest.bitcoin.com/v2/" })
    } else {
      tmpBITBOX = new BITBOXCli({ restURL: "https://trest.bitcoin.com/v2/" })
    }

    const tmpbitboxNetwork = new slp.BitboxNetwork(tmpBITBOX, slpValidator)

    const slpAddr = utils.toSlpAddress(req.params.address)
    const balances = await tmpbitboxNetwork.getAllSlpBalancesAndUtxos(slpAddr)
    if (balances.slpTokenBalances) {
      let keys = Object.keys(balances.slpTokenBalances)
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
      for (let result of axiosResult) {
        if (result.tokenId === req.params.tokenId) {
          return res.json(result)
        }
      }
      return res.json("No balance for this address and tokenId")
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
  for(let i=0; i < addresses.length; i++) {
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

async function txDetails(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  try {
    const txid = req.params.txid
    //const txhex = req.params.txhex

    // Get normal BCH details on the transaction.
    //const txObj = await transaction.transactionsFromInsight(txid)
    const txObj = await rawtransactions.getRawTransactionsFromNode(txid, 1)
    //console.log(`txObj: ${util.inspect(txObj)}`)
    //console.log(`txObj.vout: ${util.inspect(txObj.vout)}`)
    //console.log(`txObj.vout[2].scriptPubKey: ${util.inspect(txObj.vout[2].scriptPubKey)}`)

    // Get the TX Hex from the TXID
    //console.log(`txhex: ${util.inspect(txhex)}`)

    // Create a Bitcore transaction object from the raw hex
    const txn = new Bitcore.Transaction(txObj.hex)

    // parse the SLP output
    const slpOut = slpjs.parseSlpOutputScript(txn.outputs[0]._scriptBuffer)
    //console.log(`slpOut: ${util.inspect(slpOut)}`)

    // Get token info from the tokenId
    const tokenId = slpOut.tokenIdHex
    //console.log(`tokenId: ${tokenId}`)
    const thisToken = await lookupToken(tokenId)
    //console.log(`thisToken: ${util.inspect(thisToken)}`)

    // Add the token info to the tx object.
    txObj.tokenInfo = thisToken

    //console.log(`slpOut.sendOutputs: ${util.inspect(slpOut.sendOutputs)}`)
    //console.log(`slpOut.sendOutputs[0].c: ${util.inspect(slpOut.sendOutputs[0].toFixed()/Math.pow(10,thisToken.decimals))}`)
    //console.log(`slpOut.sendOutputs[1].c: ${util.inspect(slpOut.sendOutputs[1].toFixed()/Math.pow(10,thisToken.decimals))}`)
    //console.log(`slpOut.sendOutputs[2].c: ${util.inspect(slpOut.sendOutputs[2].toFixed()/Math.pow(10,thisToken.decimals))}`)
    //console.log(`slpOut.genesisOrMintQuantity.c: ${util.inspect(slpOut.genesisOrMintQuantity.c)}`)

    // Dev Note: Assuming output values from slpjs.parseSlpOutputScript() always
    // line up with the output values from transaction.transactionsFromInsight().
    // They should, since they are based on the same TXID and TX hex.
    for(let i=0; i < slpOut.sendOutputs.length; i++) {
      // Convert the SLP information to a floating point number.
      const thisTokenTransfer = slpOut.sendOutputs[i].toFixed()/Math.pow(10,thisToken.decimals)

      // Add the token quantity to the tx data.
      txObj.vout[i].tokens = thisTokenTransfer
    }

    // Create array of input metadata.
    const vin = []
    for(let i=0; i < txObj.vin.length; i++) {
      let addr = 'unknown' // default value
      let tokenQty = 'unknown' // default value

      // Need to add logic here to detect address and token inputs.

      vin.push({
        address: addr,
        tokensIn: tokenQty
      })
    }

    // Create an array of output metadata.
    const vout = []
    for(let i=0; i < txObj.vout.length; i++) {
      let addr = 'unknown' // default value
      let tokenQty = 'unknown' // default value

      const thisVout = txObj.vout[i]

      // Capture data if it exists.
      try {
        if(thisVout.scriptPubKey.addresses) addr = thisVout.scriptPubKey.addresses
        if(thisVout.tokens) tokenQty = thisVout.tokens
      } catch(e) {}

      vout.push({
        address: addr,
        tokensOut: tokenQty
      })
    }

    // Consolidate the metadata.
    const result = {
      inputs: vin,
      outputs: vout,
      symbol: txObj.tokenInfo.symbol,
      tokenId: txObj.tokenInfo.id,
      decimals: txObj.tokenInfo.decimals
    }



    //return await slpValidator.isValidSlpTxid(txid)
    return result
  } catch (err) {
    console.log(`Error in tokenTransfer(): `, err)

    /*
    // Attempt to decode the error message.
    const { msg, status } = routeUtils.decodeError(err)
    if (msg) {
      res.status(status)
      return res.json({ error: msg })
    }
    */

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
    txDetails
  }
}
