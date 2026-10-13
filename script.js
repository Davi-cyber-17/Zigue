(() => {
  'use strict';

  /* =====================================================================
   *  DAMA BRASILEIRA — 8x8, captura obrigatória, lei da maioria,
   *  peças comuns capturam para trás, damas de longo alcance.
   *  Online: salas por código, conexão direta entre os jogadores (PeerJS/WebRTC).
   * ===================================================================== */

  const ROOM_PREFIX = 'zigue-br-';
  const NO_PROGRESS_LIMIT = 40; // 20 lances de cada lado só com damas e sem captura = empate

  /* ---------- Utilitários ---------- */
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const inB = (r, c) => r >= 0 && r < 8 && c >= 0 && c < 8;
  const same = (a, b) => !!a && !!b && a[0] === b[0] && a[1] === b[1];
  const key = (r, c) => r * 8 + c;
  const DIRS = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
  const other = (c) => (c === 'w' ? 'r' : 'w');
  const colorOf = (v) => (v > 0 ? 'w' : v < 0 ? 'r' : null);
  const isKing = (v) => Math.abs(v) === 2;

  let toastTimer;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2800);
  }

  function showScreen(id) {
    $$('.screen').forEach((s) => s.classList.toggle('active', s.id === id));
  }

  function showModal(title, text, buttons) {
    $('#modal-title').textContent = title;
    $('#modal-text').textContent = text;
    const box = $('#modal-actions');
    box.innerHTML = '';
    buttons.forEach((b) => {
      const el = document.createElement('button');
      el.className = 'btn ' + (b.cls || '');
      el.textContent = b.label;
      el.addEventListener('click', () => {
        if (!b.keep) hideModal();
        if (b.onClick) b.onClick(el);
      });
      box.appendChild(el);
    });
    $('#modal').classList.add('show');
  }
  function hideModal() { $('#modal').classList.remove('show'); }

  /* =====================================================================
   *  REGRAS
   * ===================================================================== */

  function newBoard() {
    const b = Array.from({ length: 8 }, () => Array(8).fill(0));
    for (let r = 0; r < 3; r++) for (let c = 0; c < 8; c++) if ((r + c) % 2 === 1) b[r][c] = -1; // magenta em cima
    for (let r = 5; r < 8; r++) for (let c = 0; c < 8; c++) if ((r + c) % 2 === 1) b[r][c] = 1;  // ciano embaixo
    return b;
  }

  // Sequências de captura a partir de (r,c). A peça é "levantada" do tabuleiro durante a busca;
  // peças capturadas continuam no tabuleiro até o fim do lance (não podem ser saltadas duas vezes).
  function genCaptures(board, r, c) {
    const piece = board[r][c];
    const color = colorOf(piece);
    const king = isKing(piece);
    const promoRow = color === 'w' ? 0 : 7;
    const results = [];
    const captured = new Set();
    board[r][c] = 0;

    function dfs(cr, cc, steps, caps) {
      let found = false;
      for (const [dr, dc] of DIRS) {
        if (!king) {
          const er = cr + dr, ec = cc + dc, lr = cr + 2 * dr, lc = cc + 2 * dc;
          if (!inB(lr, lc)) continue;
          const ev = board[er][ec];
          if (ev !== 0 && colorOf(ev) !== color && !captured.has(key(er, ec)) && board[lr][lc] === 0) {
            found = true;
            captured.add(key(er, ec));
            dfs(lr, lc, [...steps, [lr, lc]], [...caps, [er, ec]]);
            captured.delete(key(er, ec));
          }
        } else {
          let nr = cr + dr, nc = cc + dc;
          while (inB(nr, nc) && board[nr][nc] === 0) { nr += dr; nc += dc; }
          if (!inB(nr, nc)) continue;
          const ev = board[nr][nc];
          if (colorOf(ev) === color || captured.has(key(nr, nc))) continue;
          let lr = nr + dr, lc = nc + dc;
          while (inB(lr, lc) && board[lr][lc] === 0) {
            found = true;
            captured.add(key(nr, nc));
            dfs(lr, lc, [...steps, [lr, lc]], [...caps, [nr, nc]]);
            captured.delete(key(nr, nc));
            lr += dr; lc += dc;
          }
        }
      }
      if (!found && steps.length > 0) {
        const last = steps[steps.length - 1];
        results.push({ from: [r, c], steps, caps, promote: !king && last[0] === promoRow });
      }
    }

    dfs(r, c, [], []);
    board[r][c] = piece;
    return results;
  }

  function genSimple(board, r, c) {
    const piece = board[r][c];
    const color = colorOf(piece);
    const res = [];
    if (isKing(piece)) {
      for (const [dr, dc] of DIRS) {
        let nr = r + dr, nc = c + dc;
        while (inB(nr, nc) && board[nr][nc] === 0) {
          res.push({ from: [r, c], steps: [[nr, nc]], caps: [], promote: false });
          nr += dr; nc += dc;
        }
      }
    } else {
      const fwd = color === 'w' ? -1 : 1;
      const promoRow = color === 'w' ? 0 : 7;
      for (const dc of [-1, 1]) {
        const nr = r + fwd, nc = c + dc;
        if (inB(nr, nc) && board[nr][nc] === 0) {
          res.push({ from: [r, c], steps: [[nr, nc]], caps: [], promote: nr === promoRow });
        }
      }
    }
    return res;
  }

  function legalMoves(board, color) {
    const caps = [];
    const simples = [];
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        if (colorOf(board[r][c]) !== color) continue;
        caps.push(...genCaptures(board, r, c));
        simples.push(...genSimple(board, r, c));
      }
    }
    if (caps.length) {
      const max = Math.max(...caps.map((m) => m.caps.length)); // lei da maioria
      return caps.filter((m) => m.caps.length === max);
    }
    return simples;
  }

  function applyMove(board, m) {
    const [fr, fc] = m.from;
    const [tr, tc] = m.steps[m.steps.length - 1];
    let piece = board[fr][fc];
    board[fr][fc] = 0;
    for (const [cr, cc] of m.caps) board[cr][cc] = 0;
    if (m.promote) piece = piece > 0 ? 2 : -2;
    board[tr][tc] = piece;
  }

  /* =====================================================================
   *  ESTADO DA PARTIDA
   * ===================================================================== */

  let G = null;

  function newGame(mode, myColor = 'w') {
    G = {
      mode,               // 'local' | 'online'
      myColor,            // só no online
      board: newBoard(),
      turn: 'w',
      moves: [],
      selected: null,
      chosen: [],
      last: null,
      over: false,
      winner: null,
      reason: '',
      noProgress: 0,
      captured: { w: 0, r: 0 },
      names: { w: 'Ciano', r: 'Magenta' },
      history: [],
      rematch: { me: false, opp: false },
      animate: false,
    };
    G.moves = legalMoves(G.board, G.turn);
  }

  const isMyTurn = () => !!G && !G.over && (G.mode === 'local' || G.turn === G.myColor);

  function candidates() {
    return G.moves.filter(
      (m) => same(m.from, G.selected) && G.chosen.every((s, i) => same(m.steps[i], s))
    );
  }

  function onSquare(r, c) {
    if (!G || G.over || !isMyTurn()) return;
    const v = G.board[r][c];

    if (G.selected) {
      const cands = candidates();
      const next = cands.filter((m) => same(m.steps[G.chosen.length], [r, c]));
      if (next.length) {
        G.chosen.push([r, c]);
        const done = next.find((m) => m.steps.length === G.chosen.length);
        if (done) { commitMove(done, false); return; }
        render();
        return;
      }
      if (G.chosen.length > 0) return; // no meio de uma captura múltipla
      if (same(G.selected, [r, c])) { G.selected = null; render(); return; }
    }

    if (colorOf(v) === G.turn) {
      const movable = G.moves.some((m) => same(m.from, [r, c]));
      if (movable) {
        G.selected = [r, c];
        G.chosen = [];
      } else {
        G.selected = null;
        const mustCapture = G.moves[0] && G.moves[0].caps.length;
        toast(mustCapture ? 'Captura obrigatória: faça a jogada que captura mais peças.' : 'Essa peça não tem jogadas.');
      }
    } else {
      G.selected = null;
      G.chosen = [];
    }
    render();
  }

  function snapshot() {
    return {
      board: G.board.map((row) => row.slice()),
      turn: G.turn,
      captured: { ...G.captured },
      noProgress: G.noProgress,
      last: G.last,
    };
  }

  function commitMove(m, fromRemote) {
    const mover = G.turn;
    const piece = G.board[m.from[0]][m.from[1]];

    if (G.mode === 'local') G.history.push(snapshot());
    if (G.mode === 'online' && !fromRemote) {
      send({ t: 'move', m: { from: m.from, steps: m.steps, caps: m.caps, promote: m.promote } });
    }

    applyMove(G.board, m);
    G.captured[mover] += m.caps.length;
    G.last = { from: m.from, to: m.steps[m.steps.length - 1] };
    G.animate = true;

    if (m.caps.length || !isKing(piece)) G.noProgress = 0;
    else G.noProgress++;

    G.selected = null;
    G.chosen = [];
    G.turn = other(mover);
    G.moves = legalMoves(G.board, G.turn);

    if (G.moves.length === 0) finish(mover, 'sem-jogadas');
    else if (G.noProgress >= NO_PROGRESS_LIMIT) finish(null, 'empate');
    render();
  }

  function finish(winner, reason) {
    if (G.over) return;
    G.over = true;
    G.winner = winner;
    G.reason = reason;
    G.selected = null;
    G.chosen = [];
    showResult();
  }

  function resultTitle() {
    if (G.winner === null) return 'Empate';
    if (G.mode === 'online') return G.winner === G.myColor ? 'Você venceu! 🎉' : 'Você perdeu';
    return G.winner === 'w' ? 'Ciano venceu! 🎉' : 'Magenta venceu! 🎉';
  }

  function resultText() {
    const loser = G.winner ? other(G.winner) : null;
    switch (G.reason) {
      case 'sem-jogadas':
        return `${G.names[loser]} ficou sem peças ou sem jogadas.`;
      case 'empate':
        return '20 lances de cada lado só com damas e sem captura.';
      case 'desistencia':
        return `${G.names[loser]} desistiu da partida.`;
      case 'saiu':
        return 'O oponente saiu da sala.';
      default:
        return '';
    }
  }

  function showResult() {
    const buttons = [];
    if (G.mode === 'online') {
      buttons.push({ label: 'Revanche', cls: 'primary', keep: true, onClick: requestRematch });
    } else {
      buttons.push({ label: 'Novo jogo', cls: 'primary', onClick: startLocal });
    }
    buttons.push({ label: 'Ver tabuleiro' });
    buttons.push({ label: 'Menu', onClick: goMenu });
    showModal(resultTitle(), resultText(), buttons);
  }

  /* =====================================================================
   *  RENDER
   * ===================================================================== */

  function render() {
    if (!G) return;
    const boardEl = $('#board');
    boardEl.innerHTML = '';

    const flip = G.mode === 'online' && G.myColor === 'r';
    const myTurn = isMyTurn();
    const movable = new Set();
    const targets = new Set();
    const ghosts = new Set();

    if (myTurn) {
      G.moves.forEach((m) => movable.add(key(m.from[0], m.from[1])));
      if (G.selected) {
        const cands = candidates();
        cands.forEach((m) => {
          const s = m.steps[G.chosen.length];
          if (s) targets.add(key(s[0], s[1]));
        });
        if (G.chosen.length && cands[0]) {
          cands[0].caps.slice(0, G.chosen.length).forEach((p) => ghosts.add(key(p[0], p[1])));
        }
      }
    }

    const animate = G.animate;
    G.animate = false;

    for (let i = 0; i < 8; i++) {
      for (let j = 0; j < 8; j++) {
        const r = flip ? 7 - i : i;
        const c = flip ? 7 - j : j;
        const sq = document.createElement('div');
        sq.className = 'sq ' + ((r + c) % 2 === 1 ? 'dark' : 'light');
        sq.dataset.r = r;
        sq.dataset.c = c;

        if (G.last && (same(G.last.from, [r, c]) || same(G.last.to, [r, c]))) sq.classList.add('last');
        if (targets.has(key(r, c))) sq.classList.add('target');
        if (G.chosen.some((s) => same(s, [r, c]))) sq.classList.add('path');

        const v = G.board[r][c];
        if (v) {
          const p = document.createElement('div');
          p.className = 'piece ' + (v > 0 ? 'white' : 'red') + (isKing(v) ? ' king' : '');
          if (G.selected && same(G.selected, [r, c])) p.classList.add('selected');
          else if (movable.has(key(r, c))) p.classList.add('movable');
          if (ghosts.has(key(r, c))) p.classList.add('ghost');
          if (animate && G.last && same(G.last.to, [r, c])) p.classList.add('landed');
          sq.appendChild(p);
        }
        boardEl.appendChild(sq);
      }
    }

    // Barras dos jogadores
    const topColor = flip ? 'w' : 'r';
    const botColor = flip ? 'r' : 'w';
    fillBar('#pbar-top', topColor);
    fillBar('#pbar-bot', botColor);

    // Status
    $('#status').textContent = statusText();
    updateConnBadge();

    // Controles
    const undo = $('#btn-undo');
    undo.hidden = G.mode !== 'local';
    undo.disabled = G.history.length === 0;
    const act = $('#btn-action');
    if (G.over) {
      act.textContent = G.mode === 'online' ? 'Revanche' : 'Novo jogo';
      act.classList.remove('danger');
    } else {
      act.textContent = G.mode === 'online' ? 'Desistir' : 'Reiniciar';
      act.classList.toggle('danger', G.mode === 'online');
    }
  }

  function fillBar(sel, color) {
    const el = $(sel);
    const you = G.mode === 'online' && color === G.myColor ? ' (você)' : '';
    $('.pname', el).textContent = G.names[color] + you;
    $('.pcap', el).textContent = `Capturou ${G.captured[color]}`;
    $('.chip', el).className = 'chip ' + (color === 'w' ? 'white' : 'red');
    el.classList.toggle('active', !G.over && G.turn === color);
  }

  function statusText() {
    if (G.over) return resultTitle();
    const mine = isMyTurn();
    let t;
    if (G.mode === 'online') t = mine ? 'Sua vez' : `Vez de ${G.names[G.turn]}`;
    else t = G.turn === 'w' ? 'Vez do Ciano' : 'Vez do Magenta';
    if (G.chosen.length) return 'Continue a captura…';
    if (mine && G.moves.length && G.moves[0].caps.length) t += ' • captura obrigatória';
    return t;
  }

  /* =====================================================================
   *  MODO LOCAL
   * ===================================================================== */

  function startLocal() {
    newGame('local');
    hideModal();
    showScreen('screen-game');
    render();
  }

  function undo() {
    if (!G || G.mode !== 'local' || !G.history.length) return;
    const s = G.history.pop();
    G.board = s.board;
    G.turn = s.turn;
    G.captured = s.captured;
    G.noProgress = s.noProgress;
    G.last = s.last;
    G.over = false;
    G.winner = null;
    G.selected = null;
    G.chosen = [];
    G.moves = legalMoves(G.board, G.turn);
    hideModal();
    render();
  }

  function onAction() {
    if (!G) return;
    if (G.over) {
      if (G.mode === 'online') requestRematch(); else startLocal();
      return;
    }
    if (G.mode === 'local') {
      showModal('Reiniciar partida?', 'O progresso atual será perdido.', [
        { label: 'Reiniciar', cls: 'primary', onClick: startLocal },
        { label: 'Cancelar' },
      ]);
    } else {
      showModal('Desistir da partida?', 'Seu oponente será declarado vencedor.', [
        {
          label: 'Desistir', cls: 'danger', onClick: () => {
            send({ t: 'resign' });
            finish(other(G.myColor), 'desistencia');
            render();
          },
        },
        { label: 'Continuar jogando' },
      ]);
    }
  }

  function goMenu() {
    netCleanup();
    G = null;
    hideModal();
    setLobbyState('idle');
    showScreen('screen-menu');
  }

  /* =====================================================================
   *  MODO ONLINE (salas)
   * ===================================================================== */

  const Net = { peer: null, conn: null, role: null, code: null, started: false, myName: '', oppName: '', oppGone: false, hb: null, lastSeen: 0 };

  // Servidores STUN + relé TURN. O TURN faz a conexão funcionar mesmo quando os dois
  // aparelhos estão em redes que bloqueiam conexão direta (ex.: celular no 4G/5G e PC no Wi-Fi).
  // O relé abaixo é um serviço público gratuito; para uso sério, troque pelas credenciais do seu próprio TURN.
  const PEER_OPTIONS = {
    debug: 1,
    config: {
      iceCandidatePoolSize: 4,
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun.cloudflare.com:3478' },
        { urls: 'stun:global.stun.twilio.com:3478' },
        {
          urls: [
            'turn:openrelay.metered.ca:80',
            'turn:openrelay.metered.ca:443',
            'turn:openrelay.metered.ca:443?transport=tcp',
          ],
          username: 'openrelayproject',
          credential: 'openrelayproject',
        },
      ],
    },
  };

  // Mantém a tela do celular acesa durante a partida online
  let wakeLock = null;
  async function keepAwake() {
    try {
      if ('wakeLock' in navigator && !wakeLock) {
        wakeLock = await navigator.wakeLock.request('screen');
        wakeLock.addEventListener('release', () => { wakeLock = null; });
      }
    } catch (e) { /* sem suporte ou negado */ }
  }
  function releaseWake() {
    try { wakeLock && wakeLock.release(); } catch (e) { /* ignora */ }
    wakeLock = null;
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && G && G.mode === 'online' && !G.over) keepAwake();
  });

  // Batimento: detecta conexão instável e mostra o estado na sala
  function startHeartbeat() {
    stopHeartbeat();
    Net.lastSeen = Date.now();
    Net.hb = setInterval(() => { send({ t: 'ping' }); updateConnBadge(); }, 3000);
    updateConnBadge();
  }
  function stopHeartbeat() { clearInterval(Net.hb); Net.hb = null; }

  function updateConnBadge() {
    const b = $('#room-badge');
    if (!b) return;
    const online = !!G && G.mode === 'online';
    b.hidden = !online;
    if (!online) return;
    const stable = !!(Net.conn && Net.conn.open) && Date.now() - Net.lastSeen < 12000;
    b.classList.toggle('off', Net.oppGone);
    b.classList.toggle('warn', !stable && !Net.oppGone);
    $('.badge-room', b).textContent = 'Sala ' + (Net.code || '');
    $('.badge-state', b).textContent = Net.oppGone ? 'desconectado' : stable ? 'conectado' : 'conexão instável';
  }

  const sanitizeName = (n) => String(n || '').replace(/\s+/g, ' ').trim().slice(0, 16);

  function myName() {
    const n = sanitizeName($('#inp-name').value) || 'Jogador';
    try { localStorage.setItem('dama-nome', n); } catch (e) { /* ignora */ }
    return n;
  }

  function genCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sem 0/O, 1/I
    let s = '';
    for (let i = 0; i < 5; i++) s += chars[Math.floor(Math.random() * chars.length)];
    return s;
  }

  function send(msg) {
    if (Net.conn && Net.conn.open) {
      try { Net.conn.send(msg); } catch (e) { /* ignora */ }
    }
  }

  function netCleanup() {
    const { conn, peer } = Net;
    Net.conn = null; Net.peer = null;
    Net.role = null; Net.code = null;
    Net.started = false; Net.oppGone = false; Net.oppName = '';
    stopHeartbeat();
    releaseWake();
    try { conn && conn.close(); } catch (e) { /* ignora */ }
    try { peer && peer.destroy(); } catch (e) { /* ignora */ }
  }

  function peerAvailable() {
    if (typeof Peer === 'undefined') {
      toast('Não foi possível carregar o PeerJS. Verifique sua conexão com a internet.');
      return false;
    }
    return true;
  }

  function setLobbyState(state, code) {
    const form = $('#lobby-form');
    const wait = $('#lobby-wait');
    form.hidden = state !== 'idle';
    wait.hidden = state === 'idle';
    $('#wait-actions').hidden = state !== 'waiting';
    if (state === 'creating') {
      $('#wait-label').textContent = 'Criando sala…';
      $('#room-code').textContent = '·····';
      $('#wait-hint').textContent = 'Aguarde um instante.';
    } else if (state === 'waiting') {
      $('#wait-label').textContent = 'Sala criada. Código da sala:';
      $('#room-code').textContent = code;
      $('#wait-hint').textContent = 'Envie o código ou o link ao seu oponente. Aguardando ele entrar…';
    } else if (state === 'joining') {
      $('#wait-label').textContent = 'Entrando na sala…';
      $('#room-code').textContent = code;
      $('#wait-hint').textContent = 'Conectando ao anfitrião.';
    }
  }

  function createRoom() {
    if (!peerAvailable()) return;
    netCleanup();
    Net.myName = myName();
    setLobbyState('creating');

    const code = genCode();
    const peer = new Peer(ROOM_PREFIX + code, PEER_OPTIONS);
    Net.peer = peer;
    Net.role = 'host';
    Net.code = code;

    peer.on('open', () => { if (Net.peer === peer) setLobbyState('waiting', code); });

    peer.on('connection', (conn) => {
      if (Net.peer !== peer) return;
      if (Net.conn && Net.conn.open) { // sala cheia
        const reject = () => { try { conn.send({ t: 'full' }); } catch (e) { /* ignora */ } setTimeout(() => conn.close(), 400); };
        if (conn.open) reject(); else conn.on('open', reject);
        return;
      }
      Net.conn = conn;
      setupConn(conn);
    });

    peer.on('disconnected', () => { try { if (Net.peer === peer && !peer.destroyed) peer.reconnect(); } catch (e) { /* ignora */ } });

    peer.on('error', (err) => {
      if (err.type === 'unavailable-id') { createRoom(); return; } // código em uso: tenta outro
      handlePeerError(err);
    });
  }

  function joinRoom() {
    const code = $('#inp-code').value.trim().toUpperCase();
    if (code.length < 4) { toast('Digite o código da sala.'); return; }
    if (!peerAvailable()) return;
    netCleanup();
    Net.myName = myName();
    setLobbyState('joining', code);

    const peer = new Peer(PEER_OPTIONS);
    Net.peer = peer;
    Net.role = 'guest';
    Net.code = code;

    peer.on('open', () => {
      if (Net.peer !== peer) return;
      const conn = peer.connect(ROOM_PREFIX + code, { reliable: true });
      Net.conn = conn;
      setupConn(conn);
      setTimeout(() => {
        if (Net.conn === conn && !Net.started) {
          toast('Não foi possível entrar na sala. Confira o código e tente de novo.');
          netCleanup();
          setLobbyState('idle');
        }
      }, 25000);
    });

    peer.on('error', handlePeerError);
  }

  function setupConn(conn) {
    const hello = () => { if (Net.role === 'guest') send({ t: 'hello', name: Net.myName }); };
    if (conn.open) hello(); else conn.on('open', hello);
    conn.on('data', (d) => { if (conn === Net.conn) onData(d); });
    conn.on('close', () => { if (conn === Net.conn) onOpponentLeft(); });
    conn.on('error', () => { if (conn === Net.conn) onOpponentLeft(); });
  }

  function handlePeerError(err) {
    const msgs = {
      'peer-unavailable': 'Sala não encontrada. Confira o código.',
      'network': 'Sem conexão com o servidor de salas.',
      'server-error': 'Erro no servidor de salas. Tente novamente.',
      'socket-error': 'Erro de conexão com o servidor de salas.',
      'socket-closed': 'Conexão com o servidor de salas encerrada.',
      'browser-incompatible': 'Seu navegador não suporta conexão online (WebRTC).',
    };
    toast(msgs[err.type] || 'Erro de conexão: ' + err.type);
    if (!Net.started) { netCleanup(); setLobbyState('idle'); }
  }

  function startOnline(myColor, whiteName, redName) {
    newGame('online', myColor);
    G.names.w = whiteName;
    G.names.r = redName;
    Net.started = true;
    Net.oppGone = false;
    startHeartbeat();
    keepAwake();
    hideModal();
    showScreen('screen-game');
    render();
    toast(myColor === 'w' ? 'Você joga de Ciano e começa.' : 'Você joga de Magenta.');
  }

  function onData(d) {
    if (!d || typeof d !== 'object') return;
    Net.lastSeen = Date.now();
    switch (d.t) {
      case 'full':
        toast('Esta sala já está cheia.');
        netCleanup();
        setLobbyState('idle');
        break;

      case 'hello': // host recebe o nome do convidado e inicia a partida
        if (Net.role !== 'host' || Net.started) return;
        Net.oppName = sanitizeName(d.name) || 'Oponente';
        startOnline('w', Net.myName, Net.oppName);
        send({ t: 'start', name: Net.myName });
        break;

      case 'start': // convidado recebe o nome do anfitrião
        if (Net.role !== 'guest' || Net.started) return;
        Net.oppName = sanitizeName(d.name) || 'Oponente';
        startOnline('r', Net.oppName, Net.myName);
        break;

      case 'move':
        onRemoteMove(d.m);
        break;

      case 'resign':
        if (G && !G.over) { finish(G.myColor, 'desistencia'); render(); }
        break;

      case 'rematch':
        if (!G || !G.over) return;
        G.rematch.opp = true;
        if (G.rematch.me) restartOnline();
        else {
          $('#modal-text').textContent = `${Net.oppName} quer a revanche!`;
          toast(`${Net.oppName} quer a revanche!`);
        }
        break;
    }
  }

  function onRemoteMove(m) {
    if (!G || G.over || G.mode !== 'online' || G.turn === G.myColor || !m || !Array.isArray(m.steps)) return;
    const legal = G.moves.find(
      (x) => same(x.from, m.from) && x.steps.length === m.steps.length && x.steps.every((s, i) => same(s, m.steps[i]))
    );
    if (!legal) { toast('Jogada inválida recebida do oponente.'); return; }
    commitMove(legal, true);
  }

  function requestRematch() {
    if (!G || !G.over || G.mode !== 'online') return;
    if (!Net.conn || !Net.conn.open || Net.oppGone) { toast('O oponente saiu da sala.'); return; }
    G.rematch.me = true;
    send({ t: 'rematch' });
    if (G.rematch.opp) { restartOnline(); return; }
    $('#modal-text').textContent = 'Aguardando o oponente aceitar a revanche…';
    toast('Revanche enviada.');
  }

  function restartOnline() {
    // na revanche as cores se invertem
    const prev = G.names;
    const newColor = other(G.myColor);
    startOnline(newColor, prev.r, prev.w);
  }

  function onOpponentLeft() {
    Net.oppGone = true;
    if (G && G.mode === 'online' && Net.started) {
      if (!G.over) { finish(G.myColor, 'saiu'); render(); }
      else toast('O oponente saiu da sala.');
    } else if (Net.role === 'guest') {
      toast('A sala foi fechada.');
      netCleanup();
      setLobbyState('idle');
    }
  }

  async function copyText(text, okMsg) {
    try {
      await navigator.clipboard.writeText(text);
      toast(okMsg);
    } catch (e) {
      window.prompt('Copie manualmente:', text);
    }
  }

  function roomLink() {
    return location.href.split('?')[0].split('#')[0] + '?sala=' + Net.code;
  }

  /* =====================================================================
   *  EVENTOS
   * ===================================================================== */

  $('#board').addEventListener('click', (e) => {
    const sq = e.target.closest('.sq');
    if (sq) onSquare(+sq.dataset.r, +sq.dataset.c);
  });

  $('#btn-local').addEventListener('click', startLocal);
  $('#btn-online').addEventListener('click', () => { setLobbyState('idle'); showScreen('screen-lobby'); });
  $('#lobby-back').addEventListener('click', goMenu);
  $('#btn-create').addEventListener('click', createRoom);
  $('#btn-join').addEventListener('click', joinRoom);
  $('#inp-code').addEventListener('keydown', (e) => { if (e.key === 'Enter') joinRoom(); });
  $('#btn-cancel').addEventListener('click', () => { netCleanup(); setLobbyState('idle'); });
  $('#btn-copy-code').addEventListener('click', () => copyText(Net.code, 'Código copiado.'));
  $('#btn-copy-link').addEventListener('click', () => copyText(roomLink(), 'Link copiado.'));

  $('#btn-menu').addEventListener('click', () => {
    if (G && !G.over) {
      showModal('Voltar ao menu?', G.mode === 'online' ? 'Você sairá da sala e perderá a partida.' : 'A partida atual será perdida.', [
        { label: 'Voltar ao menu', cls: 'danger', onClick: goMenu },
        { label: 'Continuar jogando' },
      ]);
    } else goMenu();
  });
  $('#btn-undo').addEventListener('click', undo);
  $('#btn-action').addEventListener('click', onAction);

  // Nome salvo e entrada por link (?sala=CODIGO)
  try { $('#inp-name').value = localStorage.getItem('dama-nome') || ''; } catch (e) { /* ignora */ }
  const params = new URLSearchParams(location.search);
  const codeFromLink = (params.get('sala') || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
  if (codeFromLink) {
    $('#inp-code').value = codeFromLink;
    setLobbyState('idle');
    showScreen('screen-lobby');
  }

  window.addEventListener('beforeunload', () => { try { Net.conn && Net.conn.close(); } catch (e) { /* ignora */ } });
})();
