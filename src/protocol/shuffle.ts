/**
 * SIG 0.0.1 Shuffle Table — opcode obfuscation.
 * The server sends a 256-byte forward table after the version string.
 * Forward[logical] = wire.
 * Inverse[wire] = logical.
 */
export class ShuffleTable {
  forward: Uint8Array;
  inverse: Uint8Array;

  constructor(forward: Uint8Array) {
    if (forward.length !== 256) throw new Error("Shuffle table must be 256 bytes");
    this.forward = forward;
    this.inverse = new Uint8Array(256);
    for (let i = 0; i < 256; i++) {
      this.inverse[forward[i]] = i;
    }
  }

  /** Encode a logical opcode to wire byte (used for sending). */
  encode(logicalOp: number): number {
    return this.forward[logicalOp];
  }

  /** Decode a wire byte to logical opcode (used for receiving). */
  decode(wireOp: number): number {
    return this.inverse[wireOp];
  }
}
