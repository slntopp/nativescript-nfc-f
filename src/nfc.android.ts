import { AndroidActivityEventData, AndroidActivityNewIntentEventData, AndroidApplication, Application, Utils } from "@nativescript/core";
import { NfcApi, NfcTagData, WriteTagOptions } from "./nfc.common";

declare let Array: any;

let onTagDiscoveredListener: (data: NfcTagData) => void = null;

function byteArrayToJSArray(bytes): Array<number> {
  let result = [];
  for (let i = 0; i < bytes.length; i++) {
    result.push(bytes[i]);
  }
  return result;
}

function bytesToHexString(bytes): string {
  let dec,
    hexstring,
    bytesAsHexString = "";
  for (let i = 0; i < bytes.length; i++) {
    if (bytes[i] >= 0) {
      dec = bytes[i];
    } else {
      dec = 256 + bytes[i];
    }
    hexstring = dec.toString(16);
    // zero padding
    if (hexstring.length === 1) {
      hexstring = "0" + hexstring;
    }
    bytesAsHexString += hexstring;
  }
  return bytesAsHexString;
}

export class MCTag implements NfcTagData {

  constructor(public id: Array<number>, private mc: globalAndroid.nfc.tech.MifareClassic) { }

  read(sector: number, blocks: number[]): Array<Array<number>> {

    if (blocks.length == 0) throw "No Blocks given"

    let mc = this.mc
    mc.connect()

    MCTag.authorize(mc, sector)

    let first = mc.sectorToBlock(sector)
    let result: number[][] = [];
    for (let block of blocks) {
      try {
        let part = mc.transceive([0x30, first + block])
        result.push(byteArrayToJSArray(part))
      } catch (e) {
        console.error(e)
        throw `Error while reading block ${first + block}`
      }
    }

    mc.close()

    return result;
  }

  static authorize(mc: globalAndroid.nfc.tech.MifareClassic, sector: number) {
    let auth = false
    if (mc.authenticateSectorWithKeyA(sector, android.nfc.tech.MifareClassic.KEY_MIFARE_APPLICATION_DIRECTORY)) {
      auth = true
    } else if (mc.authenticateSectorWithKeyA(sector, android.nfc.tech.MifareClassic.KEY_DEFAULT)) {
      auth = true
    } else if (mc.authenticateSectorWithKeyA(sector, android.nfc.tech.MifareClassic.KEY_NFC_FORUM)) {
      auth = true
    }

    if (!auth) {
      throw "Can't authenticate sector"
    }
  }
}


export class NfcIntentHandler {
  public savedIntent: android.content.Intent = null;

  constructor() { }

  parseMessage(): void {
    const activity =
      Application.android.foregroundActivity ||
      Application.android.startActivity;
    let intent = activity.getIntent();
    if (intent === null || this.savedIntent === null) {
      return;
    }

    let action = intent.getAction();
    if (action === null) {
      return;
    }

    let tag = intent.getParcelableExtra(
      android.nfc.NfcAdapter.EXTRA_TAG
    ) as android.nfc.Tag;
    if (!tag) {
      return;
    }

    let mc = android.nfc.tech.MifareClassic.get(tag);
    if (mc === null) {
      console.log("Tech Provider is empty")
      return
    }

    if (onTagDiscoveredListener === null) {
      console.log(
        "Tag discovered, but no listener was set via setOnTagDiscoveredListener"
      );
    } else {
      onTagDiscoveredListener(
        new MCTag(byteArrayToJSArray(tag.getId()), mc)
      )
    }

    intent.setAction("");
  }
}

export const nfcIntentHandler = new NfcIntentHandler();

export class Nfc implements NfcApi {
  private pendingIntent: android.app.PendingIntent;
  private intentFilters: any;
  private techLists: any;
  private static firstInstance = true;
  private created = false;
  private started = false;
  private intent: android.content.Intent;
  private nfcAdapter: android.nfc.NfcAdapter;

  constructor() {
    this.intentFilters = [];
    this.techLists = Array.create("[Ljava.lang.String;", 0);

    this.initNfcAdapter();

    // note: once peer2peer is supported, handle possible pending push messages here

    // only wire these events once
    if (Nfc.firstInstance) {
      Nfc.firstInstance = false;

      // The Nfc adapter may not yet be ready, in case the class was instantiated in a very early stage of the app.
      Application.android.on(
        AndroidApplication.activityCreatedEvent,
        (args: AndroidActivityEventData) => {
          this.initNfcAdapter();
        }
      );

      Application.android.on(
        AndroidApplication.activityPausedEvent,
        (args: AndroidActivityEventData) => {
          let pausingNfcAdapter = android.nfc.NfcAdapter.getDefaultAdapter(
            args.activity
          );
          if (pausingNfcAdapter !== null) {
            try {
              this.nfcAdapter.disableForegroundDispatch(args.activity);
            } catch (e) {
              console.log(
                "Illegal State Exception stopping NFC. Assuming application is terminating."
              );
            }
          }
        }
      );

      Application.android.on(
        AndroidApplication.activityResumedEvent,
        (args: AndroidActivityEventData) => {
          let resumingNfcAdapter = android.nfc.NfcAdapter.getDefaultAdapter(
            args.activity
          );
          if (resumingNfcAdapter !== null && !args.activity.isFinishing()) {
            this.started = true;
            resumingNfcAdapter.enableForegroundDispatch(
              args.activity,
              this.pendingIntent,
              this.intentFilters,
              this.techLists
            );
            // handle any pending intent
            nfcIntentHandler.parseMessage();
          }
        }
      );

      // fired when a new tag is scanned
      Application.android.on(
        AndroidApplication.activityNewIntentEvent,
        (args: AndroidActivityNewIntentEventData) => {
          nfcIntentHandler.savedIntent = this.intent;
          nfcIntentHandler.parseMessage();
        }
      );
    }
  }

  public available(): Promise<boolean> {
    return new Promise((resolve, reject) => {
      let nfcAdapter = android.nfc.NfcAdapter.getDefaultAdapter(
        Utils.android.getApplicationContext()
      );
      resolve(nfcAdapter !== null);
    });
  }

  public enabled(): Promise<boolean> {
    return new Promise((resolve, reject) => {
      let nfcAdapter = android.nfc.NfcAdapter.getDefaultAdapter(
        Utils.android.getApplicationContext()
      );
      resolve(nfcAdapter !== null && nfcAdapter.isEnabled());
    });
  }

  public setOnTagDiscoveredListener(
    callback: (data: NfcTagData) => void
  ): Promise<any> {
    return new Promise<void>((resolve, reject) => {
      onTagDiscoveredListener = callback;
      resolve();
    });
  }

  public writeTag(arg: WriteTagOptions): Promise<any> {
    return new Promise<void>((resolve, reject) => {
      try {
        if (!arg) {
          reject("Nothing passed to write");
          return;
        }

        const intent =
          Application.android.foregroundActivity.getIntent() ||
          nfcIntentHandler.savedIntent;
        if (!intent) {
          reject("Can't write to tag; didn't receive an intent");
          return;
        }

        let tag = intent.getParcelableExtra(
          android.nfc.NfcAdapter.EXTRA_TAG
        ) as android.nfc.Tag;
        if (!tag) {
          reject("No tag found to write to");
          return;
        }

        let mc = android.nfc.tech.MifareClassic.get(tag);
        if (mc === null) {
          console.log("Tech Provider is empty")
          return
        }

        console.log(arg.buffer)
        let commands: Array<Uint8Array> = []
        const chunkSize = 16;
        for (let i = 0; i < arg.buffer.length; i += chunkSize) {
          let chunk = arg.buffer.slice(i, i + chunkSize);
          commands.push(chunk)
        }
        console.log(commands)

        mc.connect()

        MCTag.authorize(mc, arg.sector)
        let block = mc.sectorToBlock(arg.sector)
        console.log('starting from block', block)
        try {
          commands.forEach((cmd) => {
            let buf = new Uint8Array(2 + cmd.length)
            buf.set([0xA0, block], 0)
            buf.set(cmd, 2)
            console.log("writing", cmd)
            let r = mc.transceive(buf)
            console.log("transceive result", r[0])
            block++
          })
        } catch (e) {
          console.error("Error transceive on block", block, e)
          reject(e)
          return
        }

        mc.close()

        resolve()
      } catch (ex) {
        reject(ex);
      }
    });
  }

  private initNfcAdapter() {
    if (!this.created) {
      const activity =
        Application.android.foregroundActivity ||
        Application.android.startActivity;
      if (activity) {
        this.created = true;
        this.intent = new android.content.Intent(activity, activity.getClass());
        this.intent.addFlags(
          android.content.Intent.FLAG_ACTIVITY_SINGLE_TOP |
          android.content.Intent.FLAG_ACTIVITY_CLEAR_TOP
        );
        this.pendingIntent = android.app.PendingIntent.getActivity(
          activity,
          0,
          this.intent,
          0
        );

        // The adapter must be started with the foreground activity.
        // This allows to start it as soon as possible but only once.
        const foregroundActivity = Application.android.foregroundActivity;
        this.nfcAdapter = android.nfc.NfcAdapter.getDefaultAdapter(
          Utils.android.getApplicationContext()
        );
        if (!this.started && this.nfcAdapter !== null && foregroundActivity) {
          this.started = true;
          this.nfcAdapter.enableForegroundDispatch(
            foregroundActivity,
            this.pendingIntent,
            this.intentFilters,
            this.techLists
          );
          // handle any pending intent
          nfcIntentHandler.parseMessage();
        }
      }
    }
  }

}
