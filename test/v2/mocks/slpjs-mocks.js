/*
  Mocks used for unit tests that interact with slpjs.
*/

"use strict"

const sinon = require("sinon")

class BitboxNetwork {
  constructor() {}
}

const slpjs = {
  BitboxNetwork,
  slp: {},
  validator: {}
}
