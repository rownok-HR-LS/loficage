// Transport to the game: a WebSocket to the real server, or an in-browser Game for offline practice.
// Also keeps an estimate of server time for interpolation and lag compensation.

export function serverUrl() {
  const q = new URLSearchParams(location.search).get('server');
  if (q) return q;
  if (import.meta.env.VITE_SERVER_URL) return import.meta.env.VITE_SERVER_URL;
  return `ws://${location.hostname || 'localhost'}:2567`;
}

export function httpUrl(ws) {
  return ws.replace(/^ws/, 'http');
}

/** Ping the HTTP endpoint (this is also what wakes a sleeping free server). */
export async function checkServer(timeoutMs = 4000) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(httpUrl(serverUrl()), { signal: ctl.signal, cache: 'no-store' });
    const j = await r.json();
    return { ok: !!j.ok, players: j.players, max: j.max };
  } catch {
    return { ok: false };
  } finally {
    clearTimeout(timer);
  }
}

export class Net {
  constructor() {
    this.handlers = new Map();
    this.offset = 0; // serverTime - localTime
    this.rtt = 0.05;
    this.samples = [];
    this.ws = null;
    this.local = null;
    this.open = false;
    this.pingTimer = null;
  }

  on(type, fn) {
    this.handlers.set(type, fn);
  }

  localNow() {
    return performance.now() / 1000;
  }

  serverNow() {
    return this.localNow() + this.offset;
  }

  dispatch(msg) {
    if (msg.t === 'pong') {
      const now = this.localNow();
      const rtt = Math.max(0, now - msg.c);
      this.samples.push({ rtt, offset: msg.s + rtt / 2 - now });
      if (this.samples.length > 8) this.samples.shift();
      const best = this.samples.reduce((a, b) => (b.rtt < a.rtt ? b : a));
      this.rtt = this.rtt * 0.7 + rtt * 0.3;
      this.offset = best.offset;
      return;
    }
    if (this.queue) {
      this.queue.push(msg);
      return;
    }
    if (msg.t === 'welcome') {
      this.offset = msg.st - this.localNow();
      this.queue = []; // hold everything after welcome until the client is listening
    }
    this.handlers.get(msg.t)?.(msg);
  }

  /** Deliver messages held since welcome. */
  flush() {
    const q = this.queue || [];
    this.queue = null;
    for (const m of q) this.dispatch(m);
  }

  send(obj) {
    if (this.local) {
      this.local.message(obj);
    } else if (this.ws && this.ws.readyState === 1) {
      this.ws.send(JSON.stringify(obj));
    }
  }

  startPings() {
    const ping = () => this.send({ t: 'ping', c: this.localNow(), rtt: this.rtt });
    ping();
    setTimeout(ping, 300);
    setTimeout(ping, 700);
    this.pingTimer = setInterval(ping, 2000);
  }

  /** Connect over WebSocket; resolves when open. */
  connect(url, timeoutMs = 75000) {
    return new Promise((resolve, reject) => {
      const deadline = performance.now() + timeoutMs;
      const attempt = () => {
        const ws = new WebSocket(url);
        let opened = false;
        ws.onopen = () => {
          opened = true;
          this.ws = ws;
          this.open = true;
          this.startPings();
          resolve();
        };
        ws.onmessage = (e) => {
          try {
            this.dispatch(JSON.parse(e.data));
          } catch {
            /* ignore malformed */
          }
        };
        ws.onclose = () => {
          if (opened) {
            this.open = false;
            clearInterval(this.pingTimer);
            this.handlers.get('disconnect')?.();
          } else if (performance.now() < deadline) {
            setTimeout(attempt, 2500); // free servers can take ~a minute to wake up
          } else {
            reject(new Error('Server did not answer'));
          }
        };
      };
      attempt();
    });
  }

  /** Offline practice: run the authoritative game in this tab. */
  async connectLocal() {
    const { Game } = await import('../shared/game.js');
    const game = new Game({ now: () => performance.now() / 1000 });
    const conn = { send: (m) => queueMicrotask(() => this.dispatch(m)), close() {} };
    this.local = game.connect(conn);
    this.game = game;
    game.start();
    this.offset = 0;
    this.open = true;
  }

  close() {
    clearInterval(this.pingTimer);
    this.handlers.clear();
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
    }
    if (this.local) {
      this.local.close();
      this.game.stop();
    }
    this.ws = null;
    this.local = null;
    this.open = false;
  }
}
