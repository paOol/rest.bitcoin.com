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
