import { type Server as HttpServer, type IncomingMessage } from 'node:http';
import { createHash } from 'node:crypto';
import type { Duplex } from 'node:stream';

/* ------------------------------------------------------------------
 * 最小 WebSocket 服务器（RFC 6455 子集）
 *
 * 为什么不用 ws 包：本项目的联机只需要「小 JSON 文本帧 + 心跳 + 断线检测」，
 * 用 Node 原生实现约 150 行即可，省掉一个依赖，也避免安装源不稳定带来的阻塞。
 * 支持：文本帧、分片重组、ping/pong、close、126/127 长度扩展。
 * 不支持： permessage-deflate 压缩、二进制帧（收到也按文本处理）。
 * ------------------------------------------------------------------ */

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

export const OPEN = 1;
export const CLOSED = 3;

export interface MiniSocket {
  readyState: number;
  send(data: string): void;
  ping(): void;
  close(): void;
  terminate(): void;
  onMessage: ((data: string) => void) | null;
  onClose: (() => void) | null;
  onError: (() => void) | null;
  /** 客户端 IP，便于日志排查 */
  readonly remoteAddress: string;
}

class SocketImpl implements MiniSocket {
  readyState = OPEN;
  onMessage: ((data: string) => void) | null = null;
  onClose: (() => void) | null = null;
  onError: (() => void) | null = null;
  readonly remoteAddress: string;

  private buf: Buffer = Buffer.alloc(0);
  /** 分片重组缓冲 */
  private fragments: Buffer[] = [];
  private fragmentOpcode = 0;

  constructor(private readonly socket: Duplex, remoteAddress: string) {
    this.remoteAddress = remoteAddress;
    socket.on('data', (chunk: Buffer) => this.onData(chunk));
    socket.on('close', () => this.finish());
    socket.on('error', () => {
      this.onError?.();
      this.finish();
    });
    socket.on('end', () => this.finish());
  }

  send(data: string): void {
    if (this.readyState !== OPEN) return;
    try {
      this.socket.write(encodeFrame(0x1, Buffer.from(data, 'utf8')));
    } catch {
      this.finish();
    }
  }

  /** 把 upgrade 时已读到的残留字节喂进解析流程 */
  pushData(chunk: Buffer): void {
    if (chunk.length > 0) this.onData(chunk);
  }

  ping(): void {
    if (this.readyState !== OPEN) return;
    try {
      this.socket.write(encodeFrame(0x9, Buffer.alloc(0)));
    } catch {
      this.finish();
    }
  }

  close(): void {
    if (this.readyState !== OPEN) return;
    this.readyState = 2;
    try {
      this.socket.write(encodeFrame(0x8, Buffer.alloc(0)));
      this.socket.end();
    } catch {
      /* 忽略 */
    }
    this.finish();
  }

  terminate(): void {
    try {
      this.socket.destroy();
    } catch {
      /* 忽略 */
    }
    this.finish();
  }

  private finish(): void {
    if (this.readyState === CLOSED) return;
    this.readyState = CLOSED;
    this.onClose?.();
  }

  private onData(chunk: Buffer): void {
    this.buf = this.buf.length === 0 ? chunk : Buffer.concat([this.buf, chunk]);

    // 尽可能把缓冲区里的完整帧都解出来
    for (;;) {
      const frame = readFrame(this.buf);
      if (!frame) break;
      this.buf = this.buf.subarray(frame.consumed);

      if (frame.opcode === 0x8) {
        this.close();
        return;
      }
      if (frame.opcode === 0x9) {
        try {
          this.socket.write(encodeFrame(0xa, frame.payload));
        } catch {
          /* 忽略 */
        }
        continue;
      }
      if (frame.opcode === 0xa) continue;

      // 文本帧 / 二进制帧 / 续帧
      if (frame.opcode === 0x0) {
        this.fragments.push(frame.payload);
      } else {
        this.fragmentOpcode = frame.opcode;
        this.fragments = [frame.payload];
      }
      if (frame.fin) {
        const full = Buffer.concat(this.fragments);
        this.fragments = [];
        void this.fragmentOpcode;
        this.onMessage?.(full.toString('utf8'));
      }
    }
  }
}

interface Frame {
  fin: boolean;
  opcode: number;
  payload: Buffer;
  consumed: number;
}

function readFrame(buf: Buffer): Frame | null {
  if (buf.length < 2) return null;
  const b0 = buf[0];
  const b1 = buf[1];
  const fin = (b0 & 0x80) !== 0;
  const opcode = b0 & 0x0f;
  const masked = (b1 & 0x80) !== 0;
  let len = b1 & 0x7f;
  let offset = 2;

  if (len === 126) {
    if (buf.length < offset + 2) return null;
    len = buf.readUInt16BE(offset);
    offset += 2;
  } else if (len === 127) {
    if (buf.length < offset + 8) return null;
    const big = buf.readBigUInt64BE(offset);
    if (big > BigInt(Number.MAX_SAFE_INTEGER)) return null;
    len = Number(big);
    offset += 8;
  }

  let mask: Buffer | null = null;
  if (masked) {
    if (buf.length < offset + 4) return null;
    mask = buf.subarray(offset, offset + 4);
    offset += 4;
  }
  if (buf.length < offset + len) return null;

  const payload = Buffer.from(buf.subarray(offset, offset + len));
  if (mask) {
    for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i & 3];
  }
  return { fin, opcode, payload, consumed: offset + len };
}

function encodeFrame(opcode: number, payload: Buffer): Buffer {
  const len = payload.length;
  let header: Buffer;
  if (len < 126) {
    header = Buffer.alloc(2);
    header[1] = len;
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  header[0] = 0x80 | opcode; // FIN + opcode，服务器发出的帧不掩码
  return Buffer.concat([header, payload]);
}

/* ------------------------------ 服务器装配 ------------------------------ */

export interface WsServer {
  http: HttpServer;
  close(): void;
}

export function attachWebSocket(
  http: HttpServer,
  path: string,
  onConnection: (socket: MiniSocket, req: IncomingMessage) => void,
): WsServer {
  http.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    const url = req.url ?? '/';
    if (!url.split('?')[0].endsWith(path)) {
      socket.destroy();
      return;
    }
    const key = req.headers['sec-websocket-key'];
    if (typeof key !== 'string') {
      socket.destroy();
      return;
    }
    const accept = createHash('sha1').update(key + GUID).digest('base64');
    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\n' +
        'Upgrade: websocket\r\n' +
        'Connection: Upgrade\r\n' +
        `Sec-WebSocket-Accept: ${accept}\r\n\r\n`,
    );
    const impl = new SocketImpl(socket, req.socket?.remoteAddress ?? '?');
    if (head && head.length > 0) impl.pushData(head);
    onConnection(impl, req);
  });

  return {
    http,
    close() {
      http.close();
    },
  };
}

