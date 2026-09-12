import { connect, type Socket } from 'node:net';
import { randomBytes } from 'node:crypto';

/* ------------------------------------------------------------------
 * 最小 WebSocket 客户端（仅用于 scripts/protoTest.ts 端到端测试）
 * 浏览器端用的是原生 WebSocket，不走这里。
 * ------------------------------------------------------------------ */

export interface MiniClient {
  send(text: string): void;
  close(): void;
  onMessage: ((text: string) => void) | null;
  onOpen: (() => void) | null;
  onClose: (() => void) | null;
}

export function connectWs(url: string): Promise<MiniClient> {
  const u = new URL(url);
  const key = randomBytes(16).toString('base64');

  return new Promise((resolve, reject) => {
    const socket: Socket = connect(Number(u.port || 80), u.hostname, () => {
      socket.write(
        `GET ${u.pathname || '/'} HTTP/1.1\r\n` +
          `Host: ${u.host}\r\n` +
          'Upgrade: websocket\r\n' +
          'Connection: Upgrade\r\n' +
          `Sec-WebSocket-Key: ${key}\r\n` +
          'Sec-WebSocket-Version: 13\r\n\r\n',
      );
    });

    let handshaked = false;
    let buf = Buffer.alloc(0);
    const client: MiniClient = {
      send: (text) => socket.write(encodeClientFrame(0x1, Buffer.from(text, 'utf8'))),
      close: () => socket.destroy(),
      onMessage: null,
      onOpen: null,
      onClose: null,
    };

    socket.on('error', (e) => (handshaked ? undefined : reject(e)));
    socket.on('close', () => client.onClose?.());

    socket.on('data', (chunk: Buffer) => {
      buf = buf.length === 0 ? Buffer.from(chunk) : Buffer.concat([buf, chunk]);
      if (!handshaked) {
        const idx = buf.indexOf('\r\n\r\n');
        if (idx < 0) return;
        const head = buf.subarray(0, idx).toString('latin1');
        buf = buf.subarray(idx + 4);
        if (!head.includes('101')) {
          reject(new Error(`握手失败：${head.split('\r\n')[0]}`));
          return;
        }
        handshaked = true;
        client.onOpen?.();
        resolve(client);
      }
      // 解帧
      for (;;) {
        const frame = readServerFrame(buf);
        if (!frame) break;
        buf = buf.subarray(frame.consumed);
        if (frame.opcode === 0x1 || frame.opcode === 0x2) {
          client.onMessage?.(frame.payload.toString('utf8'));
        }
      }
    });
  });
}

function encodeClientFrame(opcode: number, payload: Buffer): Buffer {
  const len = payload.length;
  const mask = randomBytes(4);
  let header: Buffer;
  if (len < 126) {
    header = Buffer.alloc(2);
    header[1] = 0x80 | len;
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[1] = 0x80 | 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[1] = 0x80 | 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  header[0] = 0x80 | opcode;

  const masked = Buffer.from(payload);
  for (let i = 0; i < masked.length; i++) masked[i] ^= mask[i & 3];
  return Buffer.concat([header, mask, masked]);
}

function readServerFrame(buf: Buffer): { opcode: number; payload: Buffer; consumed: number } | null {
  if (buf.length < 2) return null;
  const b0 = buf[0];
  const b1 = buf[1];
  const opcode = b0 & 0x0f;
  const masked = (b1 & 0x80) !== 0;
  let len = b1 & 0x7f;
  let offset = 2;
  if (len === 126) {
    if (buf.length < 4) return null;
    len = buf.readUInt16BE(2);
    offset = 4;
  } else if (len === 127) {
    if (buf.length < 10) return null;
    len = Number(buf.readBigUInt64BE(2));
    offset = 10;
  }
  let mask: Buffer | null = null;
  if (masked) {
    if (buf.length < offset + 4) return null;
    mask = buf.subarray(offset, offset + 4);
    offset += 4;
  }
  if (buf.length < offset + len) return null;
  const payload = Buffer.from(buf.subarray(offset, offset + len));
  if (mask) for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i & 3];
  return { opcode, payload, consumed: offset + len };
}
