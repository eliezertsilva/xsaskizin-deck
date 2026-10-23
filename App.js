import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert, Animated, AppState, KeyboardAvoidingView, Modal, Platform, Pressable,
  ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useKeepAwake } from 'expo-keep-awake';
import * as Haptics from 'expo-haptics';
import { obs } from './src/obs';
import { CAM, moveCamera, resetCamCache } from './src/camera';
import {
  loadCfg, saveCfg, loadLayout, saveLayout, loadCamCorner, saveCamCorner, sceneCfg,
} from './src/store';

const C = {
  bg: '#17130D', card: '#241d14', card2: '#2e2518', red: '#B53A24', red2: '#d4482f',
  cream: '#F4E4BE', mut: '#9c8d6d', ok: '#6fbf73', off: '#3a1d17',
};

const buzz = () => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); };

const fmt = (ms) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return (h ? h + ':' : '') + String(m).padStart(h ? 2 : 1, '0') + ':' + String(s % 60).padStart(2, '0');
};

function Tile({ icon, title, sub, active, dim, live, small, onPress, onLongPress, badge, style }) {
  return (
    <Pressable
      onPress={() => { buzz(); onPress && onPress(); }}
      onLongPress={onLongPress}
      style={({ pressed }) => [
        s.tile, small && s.tileSmall, active && s.tileActive, live && s.tileLive,
        dim && s.tileDim, pressed && { transform: [{ scale: 0.96 }] }, style,
      ]}
    >
      {icon ? <Text style={s.tileIcon}>{icon}</Text> : null}
      <Text style={s.tileTitle} numberOfLines={2}>{title}</Text>
      {sub ? <Text style={[s.tileSub, active && { color: C.cream }]} numberOfLines={1}>{sub}</Text> : null}
      {badge ? <View style={s.badge}><Text style={s.badgeTxt}>{badge}</Text></View> : null}
    </Pressable>
  );
}

function Section({ title, edit, shown, onToggle, children }) {
  return (
    <View style={{ marginTop: 18 }}>
      <View style={s.secHead}>
        <Text style={s.h2}>{title}</Text>
        {edit && onToggle ? (
          <Pressable onPress={() => { buzz(); onToggle(); }} style={[s.secToggle, shown ? s.secOn : s.secOff]}>
            <Text style={s.secToggleTxt}>{shown ? '👁 visível nesta cena' : '🚫 oculta nesta cena'}</Text>
          </Pressable>
        ) : null}
      </View>
      <View style={[!shown && edit && { opacity: 0.45 }]}>{children}</View>
    </View>
  );
}

export default function App() {
  useKeepAwake();
  const [cfg, setCfg] = useState(null);
  const [status, setStatus] = useState({ status: 'idle' });
  const [scenes, setScenes] = useState([]);
  const [cur, setCur] = useState('');
  const [out, setOut] = useState({ live: false, rec: false, liveT0: 0, recT0: 0 });
  const [audio, setAudio] = useState([]);
  const [items, setItems] = useState([]);
  const [layout, setLayout] = useState(null);
  const [edit, setEdit] = useState(false);
  const [settings, setSettings] = useState(false);
  const [corner, setCorner] = useState('tl');
  const [, setTick] = useState(0);
  const [toastTxt, setToastTxt] = useState('');
  const toastAnim = useRef(new Animated.Value(0)).current;
  const curRef = useRef('');
  curRef.current = cur;

  const toast = useCallback((t) => {
    setToastTxt(t);
    Animated.sequence([
      Animated.timing(toastAnim, { toValue: 1, duration: 180, useNativeDriver: true }),
      Animated.delay(2000),
      Animated.timing(toastAnim, { toValue: 0, duration: 250, useNativeDriver: true }),
    ]).start();
  }, [toastAnim]);
  const err = useCallback((e) => toast(e && e.comment ? e.comment : 'Erro'), [toast]);

  /* ---------- carga inicial ---------- */
  useEffect(() => {
    (async () => {
      const [c, l, cc] = await Promise.all([loadCfg(), loadLayout(), loadCamCorner()]);
      setCfg(c); setLayout(l); setCorner(cc);
      if (c.host) obs.connect(c); else setSettings(true);
    })();
    const t = setInterval(() => setTick((x) => x + 1), 1000);
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active' && obs.status !== 'on' && obs.status !== 'connecting' && obs.cfg) obs.connect(obs.cfg);
    });
    return () => { clearInterval(t); sub.remove(); obs.disconnect(); };
  }, []);

  /* ---------- leitura do OBS ---------- */
  const refreshScenes = useCallback(async () => {
    try {
      const d = await obs.req('GetSceneList');
      setCur(d.currentProgramSceneName);
      setScenes(d.scenes.map((x) => x.sceneName).reverse().filter((n) => !n.startsWith('[')));
      return d.currentProgramSceneName;
    } catch (e) { return curRef.current; }
  }, []);

  const refreshStatus = useCallback(async () => {
    const o = { live: false, rec: false, liveT0: 0, recT0: 0 };
    try { const st = await obs.req('GetStreamStatus'); o.live = st.outputActive; o.liveT0 = st.outputActive ? Date.now() - st.outputDuration : 0; } catch (e) {}
    try { const r = await obs.req('GetRecordStatus'); o.rec = r.outputActive; o.recT0 = r.outputActive ? Date.now() - r.outputDuration : 0; } catch (e) {}
    setOut(o);
  }, []);

  const refreshAudio = useCallback(async () => {
    try {
      const l = await obs.req('GetInputList');
      const res = await Promise.all(l.inputs.map(async (i) => {
        try { const m = await obs.req('GetInputMute', { inputName: i.inputName }); return { name: i.inputName, muted: m.inputMuted }; }
        catch (e) { return null; }
      }));
      setAudio(res.filter(Boolean).sort((a, b) => a.name.localeCompare(b.name)));
    } catch (e) {}
  }, []);

  const refreshItems = useCallback(async (scene) => {
    const sc = scene || curRef.current;
    if (!sc) return;
    try {
      const d = await obs.req('GetSceneItemList', { sceneName: sc });
      setItems(d.sceneItems.slice().reverse()
        .filter((i) => !i.sourceName.startsWith('[NSI'))
        .map((i) => ({ id: i.sceneItemId, name: i.sourceName, on: i.sceneItemEnabled })));
    } catch (e) {}
  }, []);

  const refreshAll = useCallback(async () => {
    resetCamCache();
    const [sc] = await Promise.all([refreshScenes(), refreshStatus(), refreshAudio()]);
    refreshItems(sc);
  }, [refreshScenes, refreshStatus, refreshAudio, refreshItems]);

  useEffect(() => obs.on((type, data) => {
    if (type === 'status') {
      setStatus(data);
      if (data.status === 'on') refreshAll();
      if (data.status === 'auth') setSettings(true);
      return;
    }
    const { type: t, data: d } = data;
    if (t === 'CurrentProgramSceneChanged') { setCur(d.sceneName); refreshItems(d.sceneName); }
    else if (t === 'SceneListChanged' || t === 'SceneNameChanged') { resetCamCache(); refreshScenes(); }
    else if (t === 'StreamStateChanged' || t === 'RecordStateChanged') { refreshStatus(); }
    else if (t === 'InputMuteStateChanged') { setAudio((a) => a.map((x) => (x.name === d.inputName ? { ...x, muted: d.inputMuted } : x))); }
    else if (t === 'InputCreated' || t === 'InputRemoved' || t === 'InputNameChanged') { refreshAudio(); refreshItems(); }
    else if (t === 'SceneItemEnableStateChanged') {
      if (d.sceneName === curRef.current) setItems((it) => it.map((x) => (x.id === d.sceneItemId ? { ...x, on: d.sceneItemEnabled } : x)));
    } else if (t === 'SceneItemCreated' || t === 'SceneItemRemoved' || t === 'SceneItemListReindexed') {
      resetCamCache();
      if (d.sceneName === curRef.current) refreshItems();
    }
  }), [refreshAll, refreshItems, refreshScenes, refreshStatus, refreshAudio]);

  /* ---------- layout por cena ---------- */
  const updLayout = (fn) => {
    setLayout((l) => { const n = fn(JSON.parse(JSON.stringify(l))); saveLayout(n); return n; });
  };
  const updScene = (scene, fn) => updLayout((l) => {
    l.scenes[scene] = fn(sceneCfg(l, scene));
    return l;
  });
  const toggleIn = (arr, v) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  /* ---------- ações ---------- */
  const doLive = () => {
    if (out.live) {
      Alert.alert('Encerrar a live?', 'A transmissão vai parar agora.', [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Encerrar', style: 'destructive', onPress: () => obs.req('ToggleStream').catch(err) },
      ]);
    } else obs.req('ToggleStream').catch(err);
  };
  const doCam = async (c) => {
    try { await moveCamera(c); setCorner(c); saveCamCorner(c); toast('Câmera movida ✓'); }
    catch (e) { resetCamCache(); err(e); }
  };

  if (!cfg || !layout) return <View style={s.root} />;

  const sc = sceneCfg(layout, cur);
  const st = status.status;
  const pill = st === 'on' ? ['on', 'OBS conectado'] : st === 'auth' ? ['err', 'Senha incorreta'] : st === 'connecting' ? ['', 'Conectando…'] : ['err', status.detail || 'Sem OBS'];
  const visScenes = edit ? scenes : scenes.filter((n) => !layout.hiddenScenes.includes(n));
  const visAudio = edit ? audio : audio.filter((a) => sc.audio.includes(a.name));
  const visItems = edit ? items : items.filter((i) => !sc.hiddenSources.includes(i.name));
  const hasCam = cur === CAM.scene;

  return (
    <View style={s.root}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={s.scroll}>
        <View style={s.header}>
          <Text style={s.logo}>x<Text style={{ color: C.red2 }}>Saskizin</Text> Deck</Text>
          <View style={s.pill}>
            <View style={[s.dot, pill[0] === 'on' && s.dotOn, pill[0] === 'err' && s.dotErr]} />
            <Text style={s.pillTxt}>{pill[1]}</Text>
          </View>
          <Pressable onPress={() => { buzz(); setEdit((e) => !e); }} style={[s.iconBtn, edit && { backgroundColor: C.red }]}>
            <Text style={s.iconTxt}>✎</Text>
          </Pressable>
          <Pressable onPress={() => { buzz(); setSettings(true); }} style={s.iconBtn}>
            <Text style={s.iconTxt}>⚙</Text>
          </Pressable>
        </View>

        {edit ? (
          <View style={s.banner}>
            <Text style={s.bannerTitle}>Editando: {cur || '—'}</Text>
            <Text style={s.bannerTxt}>Toque nos botões para mostrar ou esconder. Áudio e fontes valem só para esta cena; cenas ocultas valem para todas. Toque em ✎ de novo para terminar.</Text>
          </View>
        ) : null}

        <Section title="Cenas" edit={edit} shown>
          <View style={s.grid}>
            {visScenes.length ? visScenes.map((n) => {
              const hidden = layout.hiddenScenes.includes(n);
              return (
                <Tile
                  key={n} icon="▶" title={n}
                  sub={edit ? (hidden ? 'oculta' : 'visível') : n === cur ? 'NO AR' : 'toque para trocar'}
                  active={!edit && n === cur} dim={edit && hidden}
                  onPress={() => (edit
                    ? updLayout((l) => { l.hiddenScenes = toggleIn(l.hiddenScenes, n); return l; })
                    : obs.req('SetCurrentProgramScene', { sceneName: n }).catch(err))}
                />
              );
            }) : <Text style={s.empty}>{st === 'on' ? 'Nenhuma cena' : 'Aguardando OBS…'}</Text>}
          </View>
        </Section>

        {sc.stream || edit ? (
          <Section title="Transmissão" edit={edit} shown={sc.stream} onToggle={() => updScene(cur, (x) => ({ ...x, stream: !x.stream }))}>
            <View style={s.grid}>
              <Tile icon="●" title={out.live ? 'Encerrar live' : 'Iniciar live'} sub={out.live ? 'NO AR · ' + fmt(Date.now() - out.liveT0) : 'parada'} live={out.live} onPress={edit ? null : doLive} />
              <Tile icon="⏺" title={out.rec ? 'Parar gravação' : 'Gravar'} sub={out.rec ? '● ' + fmt(Date.now() - out.recT0) : 'parada'} live={out.rec} onPress={edit ? null : () => obs.req('ToggleRecord').catch(err)} />
              <Tile icon="✂" title="Salvar clipe" sub="replay buffer" onPress={edit ? null : () => obs.req('SaveReplayBuffer').then(() => toast('Clipe salvo ✓')).catch(() => toast('Ative o Replay Buffer no OBS'))} />
            </View>
          </Section>
        ) : null}

        {hasCam && (sc.cam || edit) ? (
          <Section title="Câmera" edit={edit} shown={sc.cam} onToggle={() => updScene(cur, (x) => ({ ...x, cam: !x.cam }))}>
            <View style={s.camGrid}>
              {[['tl', '↖', 'superior esquerdo'], ['tr', '↗', 'superior direito'], ['bl', '↙', 'inferior esquerdo'], ['br', '↘', 'inferior direito']].map(([k, ic, lb]) => (
                <Tile key={k} icon={ic} title="" sub={lb} active={corner === k} style={s.camTile} onPress={edit ? null : () => doCam(k)} />
              ))}
            </View>
          </Section>
        ) : null}

        {visAudio.length || edit ? (
          <Section title="Áudio" edit={edit} shown>
            <View style={s.grid}>
              {visAudio.map((a) => {
                const chosen = sc.audio.includes(a.name);
                return (
                  <Tile
                    key={a.name} small icon={a.muted ? '🔇' : '🔊'} title={a.name}
                    sub={edit ? (chosen ? '✓ aparece' : 'oculto') : a.muted ? 'MUDO' : 'ligado'}
                    dim={edit && !chosen} style={!edit && a.muted ? { backgroundColor: C.off } : null}
                    onPress={() => (edit
                      ? updScene(cur, (x) => ({ ...x, audio: toggleIn(x.audio, a.name) }))
                      : obs.req('ToggleInputMute', { inputName: a.name }).catch(err))}
                  />
                );
              })}
              {!visAudio.length ? <Text style={s.empty}>Nenhuma fonte de áudio</Text> : null}
            </View>
          </Section>
        ) : null}

        {visItems.length || edit ? (
          <Section title="Fontes da cena" edit={edit} shown>
            <View style={s.grid}>
              {visItems.map((i) => {
                const hidden = sc.hiddenSources.includes(i.name);
                return (
                  <Tile
                    key={i.id} small title={i.name}
                    sub={edit ? (hidden ? 'oculto no deck' : '✓ aparece') : i.on ? 'visível' : 'oculta'}
                    active={!edit && i.on} dim={edit ? hidden : !i.on}
                    onPress={() => (edit
                      ? updScene(cur, (x) => ({ ...x, hiddenSources: toggleIn(x.hiddenSources, i.name) }))
                      : obs.req('SetSceneItemEnabled', { sceneName: cur, sceneItemId: i.id, sceneItemEnabled: !i.on }).catch(err))}
                  />
                );
              })}
              {!visItems.length ? <Text style={s.empty}>Sem fontes</Text> : null}
            </View>
          </Section>
        ) : null}

        {edit && cur ? (
          <View style={{ marginTop: 22, gap: 10 }}>
            <Pressable style={s.wideBtn} onPress={() => {
              buzz();
              Alert.alert('Copiar layout', `Usar o layout de "${cur}" em todas as cenas?`, [
                { text: 'Cancelar', style: 'cancel' },
                { text: 'Copiar', onPress: () => updLayout((l) => { const base = sceneCfg(l, cur); scenes.forEach((n) => { l.scenes[n] = { ...base, cam: n === CAM.scene ? base.cam : false }; }); return l; }) },
              ]);
            }}>
              <Text style={s.wideTxt}>Copiar este layout para todas as cenas</Text>
            </Pressable>
            <Pressable style={[s.wideBtn, { backgroundColor: C.card2 }]} onPress={() => { buzz(); updLayout((l) => { delete l.scenes[cur]; return l; }); }}>
              <Text style={s.wideTxt}>Restaurar o padrão desta cena</Text>
            </Pressable>
          </View>
        ) : null}
        <View style={{ height: 40 }} />
      </ScrollView>

      <Animated.View pointerEvents="none" style={[s.toast, { opacity: toastAnim, transform: [{ translateY: toastAnim.interpolate({ inputRange: [0, 1], outputRange: [30, 0] }) }] }]}>
        <Text style={s.toastTxt}>{toastTxt}</Text>
      </Animated.View>

      <SettingsModal
        visible={settings} cfg={cfg} status={st}
        onClose={() => setSettings(false)}
        onSave={async (c) => { setCfg(c); await saveCfg(c); setSettings(false); obs.connect(c); }}
      />
    </View>
  );
}

function SettingsModal({ visible, cfg, status, onClose, onSave }) {
  const [host, setHost] = useState(cfg.host);
  const [port, setPort] = useState(String(cfg.port || 4455));
  const [pass, setPass] = useState(cfg.pass);
  useEffect(() => { if (visible) { setHost(cfg.host); setPort(String(cfg.port || 4455)); setPass(cfg.pass); } }, [visible, cfg]);
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.modalBg}>
        <View style={s.modal}>
          <Text style={s.modalTitle}>Conexão com o OBS</Text>
          {status === 'auth' ? <Text style={[s.label, { color: C.red2 }]}>A senha não confere. Confira em Ferramentas → Configurações do servidor WebSocket.</Text> : null}
          <Text style={s.label}>Endereço do PC (IP na rede Wi-Fi)</Text>
          <TextInput style={s.input} value={host} onChangeText={setHost} placeholder="ex.: 192.168.0.10" placeholderTextColor={C.mut} autoCapitalize="none" autoCorrect={false} keyboardType="numbers-and-punctuation" />
          <Text style={s.label}>Porta do WebSocket</Text>
          <TextInput style={s.input} value={port} onChangeText={setPort} keyboardType="number-pad" />
          <Text style={s.label}>Senha (deixe vazio se não tiver)</Text>
          <TextInput style={s.input} value={pass} onChangeText={setPass} secureTextEntry autoCapitalize="none" autoCorrect={false} />
          <Text style={s.hint}>No PC, o IP aparece em Ferramentas → Configurações do servidor WebSocket → Mostrar informações de conexão.</Text>
          <View style={s.row}>
            <Pressable style={[s.rowBtn, { backgroundColor: C.card2 }]} onPress={onClose}><Text style={s.rowTxt}>Cancelar</Text></Pressable>
            <Pressable style={[s.rowBtn, { backgroundColor: C.red }]} onPress={() => onSave({ host: host.trim(), port: parseInt(port, 10) || 4455, pass })}><Text style={s.rowTxt}>Salvar</Text></Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  scroll: { paddingHorizontal: 14, paddingTop: Platform.OS === 'android' ? 44 : 54, paddingBottom: 30 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  logo: { flex: 1, color: C.cream, fontSize: 20, fontWeight: '800' },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 7, paddingHorizontal: 10, borderRadius: 99, backgroundColor: C.card },
  pillTxt: { color: C.cream, fontSize: 12, fontWeight: '700' },
  dot: { width: 9, height: 9, borderRadius: 5, backgroundColor: C.mut },
  dotOn: { backgroundColor: C.ok },
  dotErr: { backgroundColor: C.red2 },
  iconBtn: { width: 38, height: 38, borderRadius: 12, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center' },
  iconTxt: { color: C.cream, fontSize: 18 },
  banner: { marginTop: 14, padding: 12, borderRadius: 14, borderWidth: 1.5, borderColor: C.red, backgroundColor: '#2a1a12' },
  bannerTitle: { color: C.cream, fontWeight: '800', fontSize: 15 },
  bannerTxt: { color: C.mut, fontSize: 12.5, marginTop: 4, lineHeight: 17 },
  secHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, marginHorizontal: 2 },
  h2: { color: C.mut, fontSize: 12, letterSpacing: 1.6, fontWeight: '700', textTransform: 'uppercase' },
  secToggle: { paddingVertical: 5, paddingHorizontal: 10, borderRadius: 99 },
  secOn: { backgroundColor: C.red },
  secOff: { backgroundColor: C.card2 },
  secToggleTxt: { color: C.cream, fontSize: 11, fontWeight: '700' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  camGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: { flexBasis: '47%', flexGrow: 1, minHeight: 84, borderRadius: 16, backgroundColor: C.card, padding: 12, justifyContent: 'flex-end', gap: 3, borderWidth: 1.5, borderColor: 'transparent' },
  tileSmall: { minHeight: 62 },
  tileActive: { backgroundColor: C.red, borderColor: C.cream },
  tileLive: { backgroundColor: C.red },
  tileDim: { opacity: 0.45 },
  tileIcon: { color: C.cream, fontSize: 22 },
  tileTitle: { color: C.cream, fontSize: 15.5, fontWeight: '700' },
  tileSub: { color: C.mut, fontSize: 11, fontWeight: '500' },
  camTile: { minHeight: 72, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', top: 8, right: 8, backgroundColor: C.cream, borderRadius: 8, paddingHorizontal: 6 },
  badgeTxt: { color: C.bg, fontSize: 10, fontWeight: '800' },
  empty: { color: C.mut, fontSize: 13, paddingVertical: 6 },
  wideBtn: { backgroundColor: C.red, borderRadius: 14, padding: 14, alignItems: 'center' },
  wideTxt: { color: C.cream, fontWeight: '800', fontSize: 14 },
  toast: { position: 'absolute', alignSelf: 'center', bottom: 30, backgroundColor: C.cream, paddingVertical: 10, paddingHorizontal: 16, borderRadius: 12 },
  toastTxt: { color: C.bg, fontWeight: '700', fontSize: 13 },
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.72)', justifyContent: 'center', padding: 18 },
  modal: { backgroundColor: C.card, borderRadius: 20, padding: 20 },
  modalTitle: { color: C.cream, fontSize: 18, fontWeight: '800' },
  label: { color: C.mut, fontSize: 12, fontWeight: '700', marginTop: 12, marginBottom: 5 },
  input: { backgroundColor: C.bg, color: C.cream, borderRadius: 12, borderWidth: 1.5, borderColor: '#4a3d29', padding: 12, fontSize: 16 },
  hint: { color: C.mut, fontSize: 11.5, marginTop: 10, lineHeight: 16 },
  row: { flexDirection: 'row', gap: 10, marginTop: 18 },
  rowBtn: { flex: 1, padding: 13, borderRadius: 12, alignItems: 'center' },
  rowTxt: { color: C.cream, fontWeight: '700', fontSize: 15 },
});
