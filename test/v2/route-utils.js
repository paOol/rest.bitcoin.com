/*
  Unit tests for the route-utils.js library
*/

"use strict"

const assert = require("chai").assert

// Used for debugging.
const util = require("util")
util.inspect.defaultOptions = { depth: 1 }

// Mocking data.
const { mockReq, mockRes, mockNext } = require("./mocks/express-mocks")

// Libraries under test
const routeUtils = require("../../dist/routes/v2/route-utils")

let req, res, next

describe("#route-utils", () => {
  // Setup the mocks before each test.
  beforeEach(() => {
    // Mock the req and res objects used by Express routes.
    req = mockReq
    res = mockRes
    next = mockNext

    // Explicitly reset the parmas and body.
    req.params = {}
    req.body = {}
    req.query = {}
  })

  describe("#validateArraySize", () => {
    it("should return true for freemium tier if array size less than the limit", () => {
      req.locals.proLimit = false
      const array = [1, 2, 3, 4, 5]

      const result = routeUtils.validateArraySize(req, array)

      assert.equal(result, true)
    })

    it("should return false for freemium tier if array size greater than the limit", () => {
      req.locals.proLimit = false

      const array = []
      for (let i = 0; i < 25; i++) array.push(i)

      const result = routeUtils.validateArraySize(req, array)

      assert.equal(result, false)
    })

    it("should return true for pro tier if array size less than the limit", () => {
      req.locals.proLimit = true

      const array = []
      for (let i = 0; i < 65; i++) array.push(i)

      const result = routeUtils.validateArraySize(req, array)

      assert.equal(result, true)
    })

    it("should return false for pro tier if array size greater than the limit", () => {
      req.locals.proLimit = true

      const array = []
      for (let i = 0; i < 200; i++) array.push(i)

      const result = routeUtils.validateArraySize(req, array)

      assert.equal(result, false)
    })
  })
})
