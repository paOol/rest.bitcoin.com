export interface AddressDetailsInterface {
  balance: number;
  balanceSat: number;
  totalReceived: number;
  totalReceivedSat: number;
  totalSent: number;
  totalSentSat: number;
  unconfirmedBalance: number;
  unconfirmedBalanceSat: number;
  unconfirmedTxApperances: number;
  txApperances: number;
  transactions: string[];
  legacyAddress: string;
  cashAddress: string;
  slpAddress: string;
  addrStr?: string;
  currentPage: number;
  pagesTotal: number;
}

export interface AddressUTXOsInterface {
  utxos: UTXOsInterface[];
  legacyAddress: string;
  cashAddress: string;
  slpAddress: string;
  scriptPubKey: string;
}

export interface UTXOsInterface {
  txid: string;
  vout: number;
  amount: number;
  satoshis: number;
  height: number;
  confirmations: number;
  address?: string;
  scriptPubKey?: string;
}

export interface AddressTransactionsInterface {
  pagesTotal: number;
  txs: TransactionsInterface[];
  legacyAddress: string;
  cashAddress: string;
  slpAddress: string;
  currentPage: number;
}

export interface TransactionsInterface {
  txid: string;
  version: number;
  locktime: number;
  vin: VinInterface[];
  vout: VoutInterface[];
  blockhash: string;
  blockheight: number;
  confirmations: number;
  time: number;
  blocktime: number;
  valueOut: number;
  size: number;
  valueIn: number;
  fees: number;
  legacyAddress: string;
  cashAddress: string;
  slpAddress: string;
  currentPage: number;
}

export interface VinInterface {
  txid: string;
  vout: number;
  sequence: number;
  n: number;
  scriptSig: {
    hex: string;
    asm: string;
  };
  addr: string;
  valueSat: number;
  value: number;
  doubleSpentTxID: null;
}

export interface VoutInterface {
  value: string;
  n: number;
  scriptPubKey: {
    hex: string;
    asm: string;
    addresses: string[];
    type: string;
  };
  spentTxId: null;
  spentIndex: null;
  spentHeight: null;
}

export interface BlockInterface {
  hash: string;
  size: number;
  height: number;
  version: number;
  merkleroot: string;
  tx: string[];
  time: number;
  nonce: number;
  bits: string;
  difficulty: number;
  chainwork: string;
  confirmations: number;
  previousblockhash: string;
  nextblockhash: string;
  reward: number;
  isMainChain: true;
  poolInfo: {
    poolName: string;
    url: string;
  };
}

export interface BlockchainInfoInterface {
  chain: string;
  blocks: number;
  headers: number;
  bestblockhash: string;
  difficulty: number;
  mediantime: number;
  verificationprogress: number;
  chainwork: string;
  size_on_disk: number;
  pruned: boolean;
  softforks: SoftForkInterface[];
  warnings: string;
}

export interface SoftForkInterface {
  id: string;
  version: number;
  reject: {
    status: boolean;
  };
}

export interface VerboseBlockHeaderInterface {
  hash: string;
  confirmations: number;
  height: number;
  version: number;
  versionHex: string;
  merkleroot: string;
  time: number;
  mediantime: number;
  nonce: number;
  bits: string;
  difficulty: number;
  chainwork: string;
  previousblockhash: string;
  nextblockhash: string;
}

export interface ChainTipsInterface {
  height: number;
  hash: string;
  branchlen: number;
  status: string;
}

export interface MempoolEntryInterface {
  size: number;
  fee: number;
  modifiedfee: number;
  time: number;
  height: number;
  startingpriority: number;
  currentpriority: number;
  descendantcount: number;
  descendantsize: number;
  descendantfees: number;
  ancestorcount: number;
  ancestorsize: number;
  ancestorfees: number;
  depends: string[];
}

export interface MempoolInfoInterface {
  size: number;
  bytes: number;
  usage: number;
  maxmempool: number;
  mempoolminfee: number;
}

export interface RawMempoolInterface {
  txid: {
    size: number;
    fee: number;
    modifiedfee: number;
    time: number;
    height: number;
    startingpriority: number;
    currentpriority: number;
    descendantcount: number;
    descendantsize: number;
    descendantfees: number;
    ancestorcount: number;
    ancestorsize: number;
    ancestorfees: number;
    depends: string[];
  };
}

export interface TXOutInterface {
  bestblock: string;
  confirmations: number;
  value: number;
  scriptPubKey: {
    asm: string;
    hex: string;
    reqSigs: number;
    type: string;
    addresses: string[];
  };
  coinbase: boolean;
}
