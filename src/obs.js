// Cliente mínimo do OBS WebSocket v5.
import { b64sha } from './sha256';

// General(1) + Scenes(4) + Inputs(8) + Outputs(64) + SceneItems(128)
const SUBSCRIPTIONS = 1 | 4 | 8 | 64 | 128;

export class OBSClient {
  constructor() {
    this.ws = null;
    this.rid = 0;
    this.pending = {};
    this.listeners = new Set();
    this.status = 'idle'; // idle | connecting | on | auth | off
    this.cfg = null;
    this.retryTimer = null;
    this.manualClose = false;
  }

  on(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit(type, data) {
    this.listeners.forEach((fn) => {
      try { fn(type, data); } catch (e) {}
    });
  }

  setStatus(s, detail) {
    this.status = s;
    this.emit('status', { status: s, detail });
  }

  connect(cfg) {
    this.cfg = cfg;
    this.manualClose = false;
    clearTimeout(this.retryTimer);
    this.cleanup();
    if (!cfg || !cfg.host) { this.setStatus('off', 'Configure o endereço do PC'); return; }
    this.setStatus('connecting');
    let ws;
    try {
      ws = new WebSocket(`ws://${cfg.host}:${cfg.port || 4455}`, 'obswebsocket.json');
    } catch (e) {
      this.scheduleRetry();
      return;
    }
    this.ws = ws;
    ws.onmessage = (ev) => this.onMessage(ev);
    ws.onclose = (ev) => {
      if (this.ws !== ws) return;
      this.rejectAll('Sem conexão');
      if (ev && ev.code === 4009) { this.setStatus('auth', 'Senha incorreta'); return; }
      this.setStatus('off', 'Sem OBS');
      if (!this.manualClose) this.scheduleRetry();
    };
    ws.onerror = () => {};
  }

  scheduleRetry() {
    clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => this.connect(this.cfg), 2500);
  }

  cleanup() {
    if (this.ws) {
      const old = this.ws;
      this.ws = null;
      try { old.close(); } catch (e) {}
    }
    this.rejectAll('Reconectando');
  }

  disconnect() {
    this.manualClose = true;
    clearTimeout(this.retryTimer);
    this.cleanup();
    this.setStatus('off', 'Desconectado');
  }

  rejectAll(msg) {
    Object.values(this.pending).forEach((p) => { clearTimeout(p.t); p.rej({ comment: msg }); });
    this.pending = {};
  }

  send(op, d) {
    if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify({ op, d }));
  }

  onMessage(ev) {
    let m;
    try { m = JSON.parse(ev.data); } catch (e) { return; }
    const d = m.d || {};
    if (m.op === 0) {
      const ident = { rpcVersion: 1, eventSubscriptions: SUBSCRIPTIONS };
      if (d.authentication) {
        const secret = b64sha((this.cfg.pass || '') + d.authentication.salt);
        ident.authentication = b64sha(secret + d.authentication.challenge);
      }
      this.send(1, ident);
    } else if (m.op === 2) {
      this.setStatus('on');
    } else if (m.op === 5) {
      this.emit('event', { type: d.eventType, data: d.eventData || {} });
    } else if (m.op === 7) {
      const p = this.pending[d.requestId];
      if (!p) return;
      delete this.pending[d.requestId];
      clearTimeout(p.t);
      if (d.requestStatus && d.requestStatus.result) p.res(d.responseData || {});
      else p.rej(d.requestStatus || { comment: 'Erro' });
    }
  }

  req(type, data) {
    return new Promise((res, rej) => {
      if (!this.ws || this.ws.readyState !== 1 || this.status !== 'on') { rej({ comment: 'Sem conexão' }); return; }
      const id = String(++this.rid);
      const t = setTimeout(() => {
        if (this.pending[id]) { delete this.pending[id]; rej({ comment: 'Tempo esgotado' }); }
      }, 8000);
      this.pending[id] = { res, rej, t };
      this.send(6, { requestType: type, requestId: id, requestData: data || {} });
    });
  }
}

export const obs = new OBSClient();
