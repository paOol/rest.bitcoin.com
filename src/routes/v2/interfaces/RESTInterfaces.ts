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
