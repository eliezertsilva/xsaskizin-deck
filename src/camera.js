// Troca de canto da coluna da câmera (câmera + moldura + painel do chat) na cena Gameplay.
import { obs } from './obs';

export const CAM = {
  scene: 'Gameplay',
  w: 367, h: 206, m: 32, gap: 12, panelH: 527, chatOff: { x: 19, y: 67 },
  parts: ['Webcam', 'Patrocinador DS'],
  panel: 'Painel Chat (anim)',
  chat: 'Chat (Twitch + TikTok)',
};

// Itens que trocam de lado quando a coluna vai para a direita.
const SIDE = {
  'LivePix': { r: { x: 1730, y: 838 }, l: { x: 20, y: 838 } },
  'Meta': { r: { x: 1250, y: 960 }, l: { x: 200, y: 960 } },
  'Maratona LivePix': { r: { x: 1518, y: 20 }, l: { x: 24, y: 20 } },
  'Enquete LivePix': { r: { x: 1456, y: 330 }, l: { x: 24, y: 330 } },
};

function targets(c) {
  const left = c[1] === 'l';
  const x = left ? CAM.m : 1920 - CAM.m - CAM.w;
  const y = c[0] === 't' ? CAM.m : 1080 - CAM.m - CAM.h;
  const py = c[0] === 't' ? y + CAM.h + CAM.gap : y - CAM.gap - CAM.panelH;
  const t = {};
  CAM.parts.forEach((n) => { t[n] = { x, y, bw: CAM.w, bh: CAM.h }; });
  t[CAM.panel] = { x, y: py };
  t[CAM.chat] = { x: x + CAM.chatOff.x, y: py + CAM.chatOff.y };
  Object.keys(SIDE).forEach((n) => { t[n] = left ? SIDE[n].r : SIDE[n].l; });
  return t;
}

let ids = {};
export function resetCamCache() { ids = {}; }

async function itemId(name) {
  if (ids[name]) return ids[name];
  const r = await obs.req('GetSceneItemId', { sceneName: CAM.scene, sourceName: name });
  ids[name] = r.sceneItemId;
  return ids[name];
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function moveCamera(corner) {
  const tg = targets(corner);
  const names = Object.keys(tg);
  const items = [];
  for (const n of names) {
    try {
      const id = await itemId(n);
      const t = await obs.req('GetSceneItemTransform', { sceneName: CAM.scene, sceneItemId: id });
      items.push({ id, from: { x: t.sceneItemTransform.positionX, y: t.sceneItemTransform.positionY }, to: tg[n] });
    } catch (e) {
      // item não existe nessa cena: ignora
    }
  }
  if (!items.length) throw { comment: 'Cena Gameplay não encontrada' };
  const N = 12;
  for (let k = 1; k <= N; k++) {
    const e = 1 - Math.pow(1 - k / N, 3);
    await Promise.all(items.map((it) => {
      const tr = {
        positionX: it.from.x + (it.to.x - it.from.x) * e,
        positionY: it.from.y + (it.to.y - it.from.y) * e,
      };
      if (it.to.bw && k === 1) { tr.boundsWidth = it.to.bw; tr.boundsHeight = it.to.bh; }
      return obs.req('SetSceneItemTransform', { sceneName: CAM.scene, sceneItemId: it.id, sceneItemTransform: tr }).catch(() => null);
    }));
    await sleep(25);
  }
}
