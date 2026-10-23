// Persistência: endereço/porta e layout no AsyncStorage, senha no SecureStore.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

const K_CFG = 'deck_cfg';
const K_LAYOUT = 'deck_layout';
const K_PASS = 'deck_pass';
const K_CAM = 'deck_cam';

export async function loadCfg() {
  let cfg = { host: '', port: 4455, pass: '' };
  try { Object.assign(cfg, JSON.parse((await AsyncStorage.getItem(K_CFG)) || '{}')); } catch (e) {}
  try { cfg.pass = (await SecureStore.getItemAsync(K_PASS)) || ''; } catch (e) {}
  return cfg;
}

export async function saveCfg(cfg) {
  try { await AsyncStorage.setItem(K_CFG, JSON.stringify({ host: cfg.host, port: cfg.port })); } catch (e) {}
  try {
    if (cfg.pass) await SecureStore.setItemAsync(K_PASS, cfg.pass);
    else await SecureStore.deleteItemAsync(K_PASS);
  } catch (e) {}
}

export const EMPTY_LAYOUT = { hiddenScenes: [], scenes: {} };

export async function loadLayout() {
  try {
    const l = JSON.parse((await AsyncStorage.getItem(K_LAYOUT)) || 'null');
    if (l && typeof l === 'object') return { ...EMPTY_LAYOUT, ...l, scenes: l.scenes || {} };
  } catch (e) {}
  return { ...EMPTY_LAYOUT };
}

export async function saveLayout(layout) {
  try { await AsyncStorage.setItem(K_LAYOUT, JSON.stringify(layout)); } catch (e) {}
}

export async function loadCamCorner() {
  try { return (await AsyncStorage.getItem(K_CAM)) || 'tl'; } catch (e) { return 'tl'; }
}

export async function saveCamCorner(c) {
  try { await AsyncStorage.setItem(K_CAM, c); } catch (e) {}
}

// Configuração padrão de cada cena (usada até você editar).
export function sceneCfg(layout, scene) {
  const base = {
    stream: true,
    cam: scene === 'Gameplay',
    audio: [], // áudio começa vazio: você escolhe o que aparece
    hiddenSources: [],
  };
  return { ...base, ...((layout.scenes || {})[scene] || {}) };
}
