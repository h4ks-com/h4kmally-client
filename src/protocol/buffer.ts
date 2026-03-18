/** Helper for reading binary messages from the server. */
export class Reader {
  private view: DataView;
  private buf: Uint8Array;
  public offset: number;

  constructor(data: ArrayBuffer) {
    this.view = new DataView(data);
    this.buf = new Uint8Array(data);
    this.offset = 0;
  }

  get length(): number {
    return this.buf.length;
  }

  readUint8(): number {
    const v = this.view.getUint8(this.offset);
    this.offset += 1;
    return v;
  }

  readInt16(): number {
    const v = this.view.getInt16(this.offset, true);
    this.offset += 2;
    return v;
  }

  readUint16(): number {
    const v = this.view.getUint16(this.offset, true);
    this.offset += 2;
    return v;
  }

  readInt32(): number {
    const v = this.view.getInt32(this.offset, true);
    this.offset += 4;
    return v;
  }

  readUint32(): number {
    const v = this.view.getUint32(this.offset, true);
    this.offset += 4;
    return v;
  }

  readFloat32(): number {
    const v = this.view.getFloat32(this.offset, true);
    this.offset += 4;
    return v;
  }

  readFloat64(): number {
    const v = this.view.getFloat64(this.offset, true);
    this.offset += 8;
    return v;
  }

  /** Read a null-terminated UTF-8 string. */
  readStringUTF8(): string {
    const start = this.offset;
    while (this.offset < this.buf.length && this.buf[this.offset] !== 0) {
      this.offset++;
    }
    const bytes = this.buf.slice(start, this.offset);
    this.offset++; // skip null terminator
    return new TextDecoder("utf-8").decode(bytes);
  }
}

/** Helper for building binary messages to send to the server. */
export class Writer {
  private buf: Uint8Array;
  private view: DataView;
  public offset: number;

  constructor(initialSize: number = 64) {
    this.buf = new Uint8Array(initialSize);
    this.view = new DataView(this.buf.buffer);
    this.offset = 0;
  }

  private ensure(bytes: number) {
    if (this.offset + bytes > this.buf.length) {
      const newBuf = new Uint8Array(Math.max(this.buf.length * 2, this.offset + bytes));
      newBuf.set(this.buf);
      this.buf = newBuf;
      this.view = new DataView(this.buf.buffer);
    }
  }

  writeUint8(v: number) {
    this.ensure(1);
    this.view.setUint8(this.offset, v);
    this.offset += 1;
  }

  writeInt32(v: number) {
    this.ensure(4);
    this.view.setInt32(this.offset, v, true);
    this.offset += 4;
  }

  writeUint32(v: number) {
    this.ensure(4);
    this.view.setUint32(this.offset, v, true);
    this.offset += 4;
  }

  /** Write a null-terminated UTF-8 string. */
  writeStringUTF8(s: string) {
    const encoded = new TextEncoder().encode(s);
    this.ensure(encoded.length + 1);
    this.buf.set(encoded, this.offset);
    this.offset += encoded.length;
    this.buf[this.offset] = 0;
    this.offset += 1;
  }

  /** Return a trimmed copy of the written data. */
  build(): ArrayBuffer {
    return this.buf.buffer.slice(0, this.offset);
  }
}
