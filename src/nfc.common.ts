export interface NdefListenerOptions {
  /**
   * iOS only (for now).
   * Default false.
   */
  stopAfterFirstRead?: boolean;
  /**
   * On iOS the scan UI can show a scan hint (fi. "Scan a tag").
   * By default no hint is shown.
   */
  scanHint?: string;
}


export interface WriteTagOptions {
  sector: number;
  buffer: Uint8Array
}

export interface NfcTagData {
  id?: Array<number>;
  data: Array<Array<number>>
  read(sector: number, blocks: number[]): Array<Array<number>>
}

export interface NfcNdefRecord {
  id: Array<number>;
  tnf: number;
  type: number;
  payload: string;
  payloadAsHexString: string;
  payloadAsStringWithPrefix: string;
  payloadAsString: string;
}

export interface NfcNdefData extends NfcTagData {
  message: Array<NfcNdefRecord>;
  /**
   * Android only
   */
  type?: string;
  /**
   * Android only
   */
  maxSize?: number;
  /**
   * Android only
   */
  writable?: boolean;
  /**
   * Android only
   */
  canMakeReadOnly?: boolean;
}

export interface OnTagDiscoveredOptions {
  /**
   * On iOS the scan UI can show a message (fi. "Scan a tag").
   * By default no message is shown.
   */
  message?: string;
}

export interface NfcApi {
  available(): Promise<boolean>;
  enabled(): Promise<boolean>;
  writeTag(arg: WriteTagOptions): Promise<any>;
  /**
   * Set to null to remove the listener.
   */
  setOnTagDiscoveredListener(
    sector: number,
    blocks: number[],
    callback: (data: NfcTagData) => void
  ): Promise<any>;
}

// this was done to generate a nice API for our users
export class Nfc implements NfcApi {
  available(): Promise<boolean> {
    return new Promise((resolve) => resolve(false));
  }

  enabled(): Promise<boolean> {
    return new Promise((resolve) => resolve(false));
  }

  setOnTagDiscoveredListener(
    sector: number,
    blocks: number[],
    callback: (data: NfcTagData) => void
  ): Promise<any> {
    return new Promise((resolve, reject) => reject("unimplemented"));
  }

  writeTag(arg: WriteTagOptions): Promise<any> {
    return new Promise((resolve, reject) => reject("unimplemented"));
  }
}
