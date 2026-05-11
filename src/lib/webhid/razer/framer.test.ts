import { describe, it, expect } from 'vitest';
import { RAZER_SPEC } from './spec';
import { buildFrame, computeCrc, parseReply } from './framer';

describe('Razer framer', () => {
  describe('buildFrame', () => {
    it('produces a 91-byte buffer with the correct layout', () => {
      const cmd = RAZER_SPEC.commands.setDpi;
      const frame = buildFrame({
        command: cmd,
        transactionId: 0x3F,
        args: [0x01, 0x03, 0xE8, 0x03, 0xE8, 0, 0],
      });

      expect(frame.length).toBe(91);
      expect(frame[0]).toBe(0);         // HID report id
      expect(frame[1]).toBe(0);         // status
      expect(frame[2]).toBe(0x3F);      // transaction id
      expect(frame[3]).toBe(0);         // remaining hi
      expect(frame[4]).toBe(0);         // remaining lo
      expect(frame[5]).toBe(0);         // protocol type
      expect(frame[6]).toBe(0x07);      // data size (setDpi = 7)
      expect(frame[7]).toBe(0x04);      // command class
      expect(frame[8]).toBe(0x05);      // command id
      expect(frame[9]).toBe(0x01);      // VARSTORE
      expect(frame[10]).toBe(0x03);     // dpi_x_hi (1000 = 0x03E8)
      expect(frame[11]).toBe(0xE8);     // dpi_x_lo
      expect(frame[12]).toBe(0x03);     // dpi_y_hi
      expect(frame[13]).toBe(0xE8);     // dpi_y_lo
      expect(frame[90]).toBe(0);        // reserved
    });

    it('computes CRC as XOR of bytes 3..88 per OpenRazer', () => {
      const cmd = RAZER_SPEC.commands.setDpi;
      const frame = buildFrame({
        command: cmd,
        transactionId: 0x3F,
        args: [0x01, 0x03, 0xE8, 0x03, 0xE8, 0, 0],
      });
      // Reconstruct the CRC from scratch using the spec's range
      const { crcStart, crcEnd, crcStore } = RAZER_SPEC.framing;
      let expected = 0;
      for (let i = crcStart; i <= crcEnd; i++) expected ^= frame[i];
      expect(frame[crcStore]).toBe(expected);
    });

    it('truncates arg arrays longer than 80 bytes', () => {
      const cmd = RAZER_SPEC.commands.setDpi;
      const longArgs = new Array(100).fill(0xAB);
      const frame = buildFrame({ command: cmd, transactionId: 0xFF, args: longArgs });
      // First 80 arg bytes present; byte 89 must be CRC, byte 90 must be 0
      for (let i = 9; i < 89; i++) {
        expect(frame[i]).toBe(0xAB);
      }
      expect(frame[90]).toBe(0);
    });

    it('zero-pads arg arrays shorter than 80 bytes', () => {
      const cmd = RAZER_SPEC.commands.getDpi;
      const frame = buildFrame({ command: cmd, transactionId: 0x3F, args: [0x01] });
      expect(frame[9]).toBe(0x01);
      for (let i = 10; i < 89; i++) {
        expect(frame[i]).toBe(0);
      }
    });
  });

  describe('computeCrc', () => {
    it('XORs the inclusive range', () => {
      const buf = new Uint8Array([0, 0, 0, 0x10, 0x20, 0x30, 0, 0, 0]);
      // XOR 0x10 ^ 0x20 ^ 0x30 = 0
      expect(computeCrc(buf, 3, 5)).toBe(0);

      const buf2 = new Uint8Array([0, 0, 0, 0x10, 0x20]);
      // XOR 0x10 ^ 0x20 = 0x30
      expect(computeCrc(buf2, 3, 4)).toBe(0x30);
    });

    it('returns 0 for empty range', () => {
      const buf = new Uint8Array([0x01, 0x02, 0x03]);
      expect(computeCrc(buf, 5, 4)).toBe(0);
    });
  });

  describe('parseReply', () => {
    it('parses a 91-byte buffer with report id prefix', () => {
      const buf = new Uint8Array(91);
      buf[0] = 0;        // report id
      buf[1] = 0x02;     // status = success
      buf[2] = 0x3F;     // txid
      buf[6] = 0x02;     // data size
      buf[7] = 0x07;     // class
      buf[8] = 0x80;     // id
      buf[9] = 0;        // arg[0]
      buf[10] = 0x80;    // arg[1] (battery level ~50%)
      const reply = parseReply(buf);
      expect(reply.status).toBe(0x02);
      expect(reply.transactionId).toBe(0x3F);
      expect(reply.commandClass).toBe(0x07);
      expect(reply.commandId).toBe(0x80);
      expect(reply.args[1]).toBe(0x80);
    });

    it('parses a 90-byte payload without report id (Chromium receiveFeatureReport shape)', () => {
      const buf = new Uint8Array(90);
      buf[0] = 0x02;
      buf[1] = 0x3F;
      buf[5] = 0x02;
      buf[6] = 0x07;
      buf[7] = 0x80;
      buf[8] = 0;
      buf[9] = 0x80;
      const reply = parseReply(buf);
      expect(reply.status).toBe(0x02);
      expect(reply.transactionId).toBe(0x3F);
      expect(reply.args[1]).toBe(0x80);
    });
  });
});
