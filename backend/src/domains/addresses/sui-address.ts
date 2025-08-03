import { hexToUint8Array, uint8ArrayToHex } from '@1inch/byte-utils';
import { hexlify } from 'ethers';
import { UINT_160_MAX } from '@1inch/fusion-sdk';
import * as Sdk from '@1inch/cross-chain-sdk';
import { AddressComplement } from './address-complement';

export class SuiAddress implements Sdk.AddressLike {
  private readonly buf: Uint8Array;

  constructor(value: string) {
    try {
      if (value === '0x2') {
        value = '0x02';
      }
      
      const tempBuf = hexToUint8Array(value);
      if (tempBuf.length > 32) {
        throw '';
      }

      // Pad with forward zeros if length is less than 32
      if (tempBuf.length < 32) {
        this.buf = new Uint8Array(32);
        this.buf.set(tempBuf, 32 - tempBuf.length);
      } else {
        this.buf = tempBuf;
      }
    } catch {
      throw new Error(`${value} is not a valid address.`);
    }
  }

  static fromString(str: string): SuiAddress {
    return new SuiAddress(str);
  }

  /**
   * @see splitToParts
   */
  static fromParts(parts: [AddressComplement, Sdk.EvmAddress]): SuiAddress {
    const highBits = parts[0].inner;
    const lowBits = parts[1].toBigint();
    const address = (highBits << 160n) | lowBits;

    return SuiAddress.fromBigInt(address);
  }

  static fromUnknown(val: unknown): SuiAddress {
    if (!val) {
      throw new Error('invalid address');
    }

    if (typeof val === 'string') {
      return new SuiAddress(val);
    }

    if (typeof val === 'bigint') {
      return SuiAddress.fromBigInt(val);
    }

    if (
      typeof val === 'object' &&
      'toBuffer' in val &&
      typeof val.toBuffer === 'function'
    ) {
      const buffer = val.toBuffer();

      if (buffer instanceof Buffer || buffer instanceof Uint8Array) {
        return SuiAddress.fromBuffer(buffer);
      }
    }

    throw new Error('invalid address');
  }

  static fromBuffer(buf: Buffer | Uint8Array): SuiAddress {
    return new SuiAddress(uint8ArrayToHex(buf));
  }

  static fromBigInt(val: bigint): SuiAddress {
    const buffer = hexToUint8Array('0x' + val.toString(16).padStart(64, '0'));

    return SuiAddress.fromBuffer(buffer);
  }

  public nativeAsZero(): this {
    return this;
  }

  public zeroAsNative(): this {
    return this;
  }

  toString(): string {
    return uint8ArrayToHex(this.buf);
  }

  toJSON(): string {
    return this.toString();
  }

  public toBuffer(): Buffer {
    return Buffer.from(this.buf);
  }

  public equal(other: Sdk.AddressLike): boolean {
    return this.toBuffer().equals(other.toBuffer());
  }

  public isNative(): boolean {
    return true;
  }

  public isZero(): boolean {
    return false;
  }

  public toHex(): `0x${string}` {
    return hexlify(this.toBuffer()) as `0x${string}`;
  }

  public toBigint(): bigint {
    return BigInt(uint8ArrayToHex(this.buf));
  }

  public splitToParts(): [AddressComplement, Sdk.EvmAddress] {
    const bn = this.toBigint();

    return [
      new AddressComplement(bn >> 160n),
      Sdk.EvmAddress.fromBigInt(bn & UINT_160_MAX),
    ];
  }
}
