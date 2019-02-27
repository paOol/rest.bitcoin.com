/*
  Mocks used for unit tests that interact with slpjs.
*/

"use strict"

const sinon = require("sinon")
const proxyquire = require("proxyquire")

class BitboxNetwork {
  constructor() {}

  async getAllSlpBalancesAndUtxos(address) {
    return {
      satoshis_available_bch: 9996891,
      satoshis_in_slp_baton: 546,
      satoshis_in_slp_token: 546,
      satoshis_in_invalid_token_dag: 0,
      satoshis_in_invalid_baton_dag: 0,
      slpTokenBalances: {
        "7ac7f4bb50b019fe0f5c81e3fc13fc0720e130282ea460768cafb49785eb2796": []
      },
      slpTokenUtxos: {
        "7ac7f4bb50b019fe0f5c81e3fc13fc0720e130282ea460768cafb49785eb2796": []
      },
      slpBatonUtxos: {
        "7ac7f4bb50b019fe0f5c81e3fc13fc0720e130282ea460768cafb49785eb2796": []
      },
      nonSlpUtxos: [{}],
      invalidTokenUtxos: [],
      invalidBatonUtxos: []
    }
  }
}

const slpjs = {
  BitboxNetwork,
  slp: {},
  validator: {}
}

module.exports = slpjs
