// imports
import axios, { AxiosResponse } from 'axios';
import * as cashAccountClass from 'cashaccounts';
import * as express from 'express';
import * as util from 'util';
import { CashAccountInterface } from './interfaces/RESTInterfaces';
import logger = require('./logging.js');
import routeUtils = require('./route-utils');
import wlogger = require('../../util/winston-logging');

// consts
const router: express.Router = express.Router();
const cashAccounts: cashAccountClass = new cashAccountClass(
  process.env.CASHACCOUNT_LOOKUPSERVER
);

// Used for processing error messages before sending them to the user.
util.inspect.defaultOptions = { depth: 1 };

// Connect the route endpoints to their handler functions.
router.get('/', root);
router.get('/lookup/:account/:number/:collision?', lookup);

// Root API endpoint. Simply acknowledges that it exists.
function root(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
): express.Response {
  return res.json({ status: 'cashaccount' });
}

function formHandle(account: string, number: string, collision: string) {
  const handle = `${account}#${number}${
    collision !== undefined ? '.' + collision : ''
  }`;
  return handle;
}

function isCashAccount(handle: string) {
  return cashAccounts.isCashAccount(handle);
}

// GET handler for cash account lookup
async function lookup(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
): Promise<express.Response> {
  try {
    const {
      account,
      number,
      collision
    }: { account: string; number: string; collision: string } = req.params;

    const handle: string = formHandle(account, number, collision);
    const valid: boolean = isCashAccount(handle);

    if (!valid) {
      return res.status(500).json({ error: 'Not a valid CashAccount' });
    }

    let lookup: CashAccountInterface = await cashAccounts.trustedLookup(handle);
    if (lookup === undefined) {
      return res.status(500).json({
        error: 'No account could be found with the requested parameters.'
      });
    }

    // Return the retrieved address information.
    res.status(200);
    return res.json(lookup);
  } catch (err) {
    // Attempt to decode the error message.
    const { msg, status } = routeUtils.decodeError(err);
    if (msg) {
      res.status(status);
      return res.json({ error: msg });
    }

    wlogger.error(`Error in cashaccounts.ts/lookup().`, err);

    res.status(500);
    return res.json({ error: util.inspect(err) });
  }
}

module.exports = {
  router,
  lookupableComponents: {
    root,
    lookup
  }
};
