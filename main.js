/* main.js - the interface: drawing on the canvas, playback, editor, buttons, saved progress. */

(function () {
  var T = 48, SCALE = 2;
  var cv = document.getElementById("stage"), ctx = cv.getContext("2d");
  var $ = function (id) { return document.getElementById(id); };
  var codeEl = $("code"), runBtn = $("runBtn"), resetBtn = $("resetBtn");
  var reduced = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;

  var cur = 0, unlocked = 0, cleared = {}, speed = 1;

  // ---------- optional synthesized sound effects ----------
  // AudioContext is created/resumed from a user click (Run / Play / Test Sound)
  // because browsers block audio until the player interacts with the page.
  var soundEnabled = true, soundContext = null, lastSoundFrame = -1;

  function unlockSound() {
    try {
      var AudioCtor = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtor) return false;
      if (!soundContext) soundContext = new AudioCtor();
      if (soundContext.state === "suspended") soundContext.resume();
      return true;
    } catch (e) { return false; }
  }

  function tone(startHz, endHz, duration, wave, volume) {
    if (!soundEnabled || !unlockSound() || !soundContext) return;
    try {
      var now = soundContext.currentTime;
      var osc = soundContext.createOscillator();
      var gain = soundContext.createGain();
      osc.type = wave || "sine";
      osc.frequency.setValueAtTime(Math.max(35, startHz), now);
      osc.frequency.exponentialRampToValueAtTime(Math.max(35, endHz), now + duration);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(volume || 0.12, now + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      osc.connect(gain);
      gain.connect(soundContext.destination);
      osc.start(now);
      osc.stop(now + duration + 0.02);
    } catch (e) { /* Sound is optional; never interrupt gameplay. */ }
  }

  function playGameSound(kind) {
    if (!soundEnabled) return;
    if (kind === "move") tone(330, 245, 0.075, "triangle", 0.07);
    else if (kind === "hit") tone(190, 75, 0.14, "square", 0.11);
    else if (kind === "hurt") tone(145, 55, 0.2, "sawtooth", 0.12);
    else if (kind === "gem") { tone(660, 880, 0.11, "sine", 0.1); setTimeout(function(){ tone(880, 1180, 0.12, "sine", 0.09); }, 85); }
    else if (kind === "potion") { tone(440, 660, 0.13, "sine", 0.1); setTimeout(function(){ tone(660, 990, 0.16, "sine", 0.09); }, 90); }
    else if (kind === "win") {
      tone(523, 784, 0.16, "triangle", 0.11);
      setTimeout(function(){ tone(659, 988, 0.18, "triangle", 0.11); }, 140);
      setTimeout(function(){ tone(784, 1175, 0.28, "triangle", 0.11); }, 290);
    } else if (kind === "lose") {
      tone(260, 180, 0.2, "triangle", 0.1);
      setTimeout(function(){ tone(180, 90, 0.28, "triangle", 0.1); }, 170);
    } else if (kind === "click") tone(520, 720, 0.055, "sine", 0.06);
  }

  function playFrameSounds(frame, previous) {
    if (!soundEnabled || !frame) return;
    var effects = frame.fx || [];
    // Give priority to meaningful game events over the footstep sound.
    if (effects.some(function(f){ return f.k === "hurt"; })) playGameSound("hurt");
    else if (effects.some(function(f){ return f.k === "hit"; })) playGameSound("hit");
    else if (effects.some(function(f){ return f.k === "pick" && f.t === "potion"; })) playGameSound("potion");
    else if (effects.some(function(f){ return f.k === "pick" && f.t === "gem"; })) playGameSound("gem");
    else if (previous && frame.h && previous.h &&
             (frame.h.x !== previous.h.x || frame.h.y !== previous.h.y)) playGameSound("move");
  }
  var profile = { xp: 0, coins: 0, records: {} };
  var STORIES = [
    ["The kingdom's beacon has gone dark. Find the ancient portal and enter the forest.", "MOVEMENT + COORDINATES"],
    ["Blue crystals are the only fuel that can relight the beacon. Recover every gem.", "FUNCTIONS + PATHFINDING"],
    ["The forest guardians have turned hostile. Learn to make decisions before every strike.", "CONDITIONALS + POINTERS"],
    ["A canyon full of monsters blocks the old trade road. Repetition is your advantage.", "WHILE LOOPS + VECTORS"],
    ["The wolf pack has overrun the frontier. Watch your health and use supplies wisely.", "LOGIC + RESOURCE MANAGEMENT"],
    ["The Ogre Keep holds the kingdom's final seal. Defeat its guardians, recover the relics and escape.", "COMBINED C++ SKILLS"]
  ];
  var play = null;            // {frames, idx, start, res}
  var shown = null;           // frames pair currently drawn
  var idleFrame = null;
  var evalOK = true;
  try { new Function("return 1")(); } catch (e) { evalOK = false; }

  function store(key, val) {
    try { if (val === undefined) return localStorage.getItem(key); localStorage.setItem(key, val); } catch (e) {}
    return null;
  }

  function saveProfile() { store("hs:profile", JSON.stringify(profile)); updateProfileUI(); }
  function updateProfileUI() {
    var xp = profile.xp || 0;
    var stars = Object.keys(profile.records || {}).reduce(function(n,k){return n + (profile.records[k].stars || 0);},0);
    $("xpTxt").textContent = xp; $("coinTxt").textContent = profile.coins || 0;
    $("rankTxt").textContent = Math.floor(xp / 100) + 1;
    $("starTxt").textContent = stars + " / " + (LEVELS.length * 3);
  }
  function awardMission(levelIndex, res) {
    var old = profile.records[levelIndex] || { stars: 0, bestTurns: 9999, claimed: false };
    var hp = res.frames[res.frames.length - 1].h.hp, ratio = hp / LEVELS[levelIndex].hp;
    var stars = ratio >= 0.7 ? 3 : ratio >= 0.35 ? 2 : 1;
    var first = !old.claimed, improved = stars > old.stars;
    var xp = first ? 35 + stars * 15 : (improved ? (stars-old.stars)*10 : 0);
    var coins = first ? 10 + stars * 5 : (improved ? (stars-old.stars)*3 : 0);
    profile.xp += xp; profile.coins += coins;
    profile.records[levelIndex] = { stars: Math.max(old.stars,stars), bestTurns: Math.min(old.bestTurns,res.turns), claimed: true };
    saveProfile(); return {stars:stars,xp:xp,coins:coins};
  }

  function makeFn(src) {
    if (evalOK) return new Function("hero", "__tick", "__vec", "__print", src);
    var err = null, prev = window.onerror;
    window.onerror = function (m) { err = m; return true; };
    window.__heroFn = null;
    var s = document.createElement("script");
    s.textContent = "window.__heroFn=function(hero,__tick,__vec,__print){\n" + src + "\n};";
    document.head.appendChild(s);
    s.remove();
    window.onerror = prev;
    if (err || !window.__heroFn) throw new SyntaxError(String(err || "Your code could not be read.").replace(/^Uncaught\s*(SyntaxError:)?\s*/, ""));
    return window.__heroFn;
  }

  /* ---------- drawing ---------- */
  function sizeCanvas(L) {
    cv.width = L.w * T * SCALE;
    cv.height = L.h * T * SCALE;
    cv.style.aspectRatio = L.w + " / " + L.h;
  }
  function rect(c, x, y, w, h) { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); }

  function drawGround(L) {
    for (var y = 0; y < L.h; y++) for (var x = 0; x < L.w; x++) {
      rect(((x + y) & 1) ? "#2d4535" : "#325039", x * T, y * T, T, T);
      var h = (x * 7 + y * 13) % 5;
      if (h === 0) { rect("#3f6148", x * T + 10, y * T + 30, 3, 6); rect("#3f6148", x * T + 16, y * T + 33, 3, 5); }
      if (h === 2) { rect("#27402f", x * T + 30, y * T + 12, 4, 3); }
    }
  }
  function drawWalls(L) {
    L.walls.forEach(function (w) {
      var x = w[0] * T, y = w[1] * T;
      rect("#363d52", x, y, T, T);
      rect("#4f5974", x, y + 6, T, T - 6);
      rect("#7a86a6", x, y, T, 12);
      rect("#657291", x, y + 12, T, 2);
      ctx.fillStyle = "#3d455d";
      ctx.fillRect(x + 6, y + 22, 16, 2); ctx.fillRect(x + 26, y + 34, 16, 2); ctx.fillRect(x + 22, y + 22, 2, 12);
    });
  }
  function drawExit(L, ms) {
    if (!L.exit) return;
    var cx = L.exit[0] * T + T / 2, cy = L.exit[1] * T + T / 2;
    var p = reduced ? 0 : Math.sin(ms / 300) * 2;
    ctx.fillStyle = "rgba(71,209,180,.22)";
    ctx.beginPath(); ctx.ellipse(cx, cy, 22 + p, 22 + p, 0, 0, 7); ctx.fill();
    ctx.fillStyle = "#0e3f38";
    ctx.beginPath(); ctx.ellipse(cx, cy, 16, 19, 0, 0, 7); ctx.fill();
    ctx.strokeStyle = "#47d1b4"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.ellipse(cx, cy, 16, 19, 0, 0, 7); ctx.stroke();
    ctx.strokeStyle = "#9af2de"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(cx, cy, 8, 10, 0, 0.5, 5); ctx.stroke();
  }
  function drawLabels(L) {
    ctx.font = "9px 'JetBrains Mono', monospace";
    ctx.fillStyle = "rgba(255,255,255,.34)";
    ctx.textBaseline = "top";
    for (var x = 0; x < L.w; x++) ctx.fillText(String(x), x * T + 3, 2);
    ctx.textBaseline = "bottom";
    for (var y = 1; y < L.h; y++) ctx.fillText(String(y), 3, y * T + T - 2);
  }
  function drawGem(x, y, ms, a) {
    var b = reduced ? 0 : Math.sin(ms / 260 + x) * 2;
    ctx.globalAlpha = a;
    var cx = x * T + T / 2, cy = y * T + T / 2 + b;
    ctx.fillStyle = "rgba(0,0,0,.25)"; ctx.beginPath(); ctx.ellipse(cx, y * T + 38, 9, 3, 0, 0, 7); ctx.fill();
    ctx.fillStyle = "#35bde0";
    ctx.beginPath(); ctx.moveTo(cx, cy - 12); ctx.lineTo(cx + 10, cy - 2); ctx.lineTo(cx, cy + 12); ctx.lineTo(cx - 10, cy - 2); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#8be8ff";
    ctx.beginPath(); ctx.moveTo(cx, cy - 12); ctx.lineTo(cx + 10, cy - 2); ctx.lineTo(cx, cy - 2); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#e8fbff"; ctx.fillRect(cx - 5, cy - 6, 3, 3);
    ctx.globalAlpha = 1;
  }
  function drawPotion(x, y, ms, a) {
    var b = reduced ? 0 : Math.sin(ms / 300 + y) * 2;
    ctx.globalAlpha = a;
    var cx = x * T + T / 2, cy = y * T + T / 2 + b;
    ctx.fillStyle = "rgba(0,0,0,.25)"; ctx.beginPath(); ctx.ellipse(cx, y * T + 38, 9, 3, 0, 0, 7); ctx.fill();
    rect("#d9d2c0", cx - 4, cy - 14, 8, 6);
    rect("#8c5a2b", cx - 5, cy - 17, 10, 4);
    rect("#ef6a5b", cx - 10, cy - 8, 20, 18);
    rect("#ff9d90", cx - 7, cy - 5, 4, 8);
    rect("#b8453a", cx - 10, cy + 6, 20, 4);
    ctx.globalAlpha = 1;
  }

  function drawHero(px, py, face, a, ms, moving) {
    var cx = px + T / 2, cy = py + T / 2 + 2 + (moving && !reduced ? Math.abs(Math.sin(ms / 70)) * -2 : 0);
    ctx.save(); ctx.globalAlpha = a; ctx.translate(cx, cy); ctx.scale(face, 1);
    ctx.fillStyle = "rgba(0,0,0,.28)"; ctx.beginPath(); ctx.ellipse(0, 16, 12, 4, 0, 0, 7); ctx.fill();
    rect("#2f6fd0", -9, -4, 18, 18);
    rect("#58a6ff", -9, -4, 18, 5);
    rect("#1e4a94", -9, 10, 18, 4);
    rect("#f0c9a0", -6, -14, 12, 11);
    rect("#f0b43c", -8, -18, 16, 6);
    rect("#fbd57a", -8, -18, 16, 2);
    rect("#f0b43c", -2, -22, 4, 5);
    rect("#2a1d00", 1, -10, 2, 3);
    rect("#cfd5e3", 9, -8, 3, 20);
    rect("#f0b43c", 7, 4, 7, 3);
    ctx.restore();
  }
  function drawEnemy(t, px, py, a, face) {
    var cx = px + T / 2, cy = py + T / 2 + 2;
    ctx.save(); ctx.globalAlpha = a; ctx.translate(cx, cy); ctx.scale(face, 1);
    ctx.fillStyle = "rgba(0,0,0,.28)"; ctx.beginPath(); ctx.ellipse(0, 16, t === "ogre" ? 17 : 12, 4, 0, 0, 7); ctx.fill();
    if (t === "munchkin") {
      rect("#5faa56", -11, -6, 22, 20);
      rect("#7bc96f", -11, -6, 22, 6);
      rect("#d9d2c0", -10, -12, 4, 7); rect("#d9d2c0", 6, -12, 4, 7);
      rect("#ef6a5b", -6, -2, 4, 4); rect("#ef6a5b", 3, -2, 4, 4);
      rect("#27402f", -5, 6, 10, 2);
    } else if (t === "ogre") {
      rect("#9a5a3a", -16, -10, 32, 26);
      rect("#b9744f", -16, -10, 32, 8);
      rect("#6e3b25", -16, 12, 32, 4);
      rect("#f0c9a0", -9, -20, 18, 12);
      rect("#2a1d00", -6, -16, 4, 3); rect("#2a1d00", 3, -16, 4, 3);
      rect("#fff3d6", -7, -10, 3, 4); rect("#fff3d6", 5, -10, 3, 4);
      rect("#7a5a3c", 12, -14, 4, 24);
    } else {
      rect("#8b93a6", -14, -2, 28, 14);
      rect("#aab2c4", -14, -2, 28, 5);
      rect("#8b93a6", 8, -10, 10, 11);
      rect("#6c7488", 8, -14, 3, 5); rect("#6c7488", 14, -14, 3, 5);
      rect("#ef6a5b", 14, -6, 3, 3);
      rect("#6c7488", -18, 0, 5, 3);
      rect("#6c7488", -10, 10, 4, 6); rect("#6c7488", 6, 10, 4, 6);
    }
    ctx.restore();
  }
  function bar(px, py, frac, w, c) {
    rect("#0b0d13", px + (T - w) / 2 - 1, py + 1, w + 2, 6);
    rect(c, px + (T - w) / 2, py + 2, Math.max(0, w * frac), 4);
  }
  function bubble(px, py, text) {
    ctx.font = "600 12px 'IBM Plex Sans', sans-serif";
    var w = ctx.measureText(text).width + 16, x = Math.max(2, Math.min(cv.width / SCALE - w - 2, px + T / 2 - w / 2)), y = Math.max(2, py - 36);
    ctx.fillStyle = "#f4f6fb"; ctx.fillRect(x, y, w, 22);
    ctx.fillRect(px + T / 2 - 4, y + 22, 8, 6);
    ctx.fillStyle = "#11141c"; ctx.textBaseline = "middle"; ctx.fillText(text, x + 8, y + 11);
  }
  function floatText(txt, x, y, t, color) {
    ctx.font = "700 14px 'Pixelify Sans', monospace";
    ctx.globalAlpha = Math.max(0, 1 - t * 0.7);
    ctx.fillStyle = "#0b0d13"; ctx.textBaseline = "middle";
    ctx.fillText(txt, x + 1, y - t * 16 + 1);
    ctx.fillStyle = color; ctx.fillText(txt, x, y - t * 16);
    ctx.globalAlpha = 1;
  }

  function render(a, b, t, ms) {
    var L = LEVELS[cur];
    ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
    ctx.clearRect(0, 0, L.w * T, L.h * T);
    drawGround(L); drawExit(L, ms); drawWalls(L); drawLabels(L);
    var bi = {}; b.i.forEach(function (i) { bi[i.id] = 1; });
    a.i.forEach(function (i) {
      var al = bi[i.id] ? 1 : 1 - t;
      if (i.t === "gem") drawGem(i.x, i.y, ms, al); else drawPotion(i.x, i.y, ms, al);
    });

    var draws = [];
    b.e.forEach(function (eb, k) {
      var ea = a.e[k];
      var alive = eb.hp > 0, wasAlive = ea.hp > 0;
      if (!alive && !wasAlive) return;
      var al = alive ? 1 : 1 - t;
      var x = ea.x + (eb.x - ea.x) * t, y = ea.y + (eb.y - ea.y) * t;
      var face = (b.h.x < x) ? -1 : 1;
      draws.push({ y: y, fn: function () {
        drawEnemy(eb.t, x * T, y * T, al, face);
        if (alive && eb.hp < eb.m) bar(x * T, y * T - 6, eb.hp / eb.m, 28, "#ef6a5b");
      } });
    });
    var hx = a.h.x + (b.h.x - a.h.x) * t, hy = a.h.y + (b.h.y - a.h.y) * t;
    var moving = (a.h.x !== b.h.x || a.h.y !== b.h.y) && t < 1;
    draws.push({ y: hy, fn: function () {
      var dead = b.h.hp <= 0;
      drawHero(hx * T, hy * T, b.h.face, dead ? 0.45 : 1, ms, moving);
      bar(hx * T, hy * T - 10, b.h.hp / LEVELS[cur].hp, 30, "#47d1b4");
    } });
    draws.sort(function (p, q) { return p.y - q.y; }).forEach(function (d) { d.fn(); });

    if (b.h.say) bubble(hx * T, hy * T - 10, b.h.say);

    b.fx.forEach(function (f) {
      if (f.x < 0 || f.y < 0 || f.x >= L.w || f.y >= L.h) return;
      var px = f.x * T, py = f.y * T;
      if (f.k === "hit") {
        ctx.globalAlpha = 1 - t; ctx.strokeStyle = "#fff3d6"; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(px + T / 2, py + T / 2, 8 + t * 16, 0, 7); ctx.stroke(); ctx.globalAlpha = 1;
        floatText("-" + f.n, px + T / 2 - 8, py + 8, t, "#ffd36b");
      } else if (f.k === "hurt") {
        ctx.globalAlpha = 0.45 * (1 - t); rect("#ef6a5b", px, py, T, T); ctx.globalAlpha = 1;
        floatText("-" + f.n, px + T / 2 - 8, py + 6, t, "#ff8a7a");
      } else if (f.k === "bump") {
        ctx.globalAlpha = 1 - t; ctx.strokeStyle = "#ef6a5b"; ctx.lineWidth = 3; ctx.strokeRect(px + 4, py + 4, T - 8, T - 8); ctx.globalAlpha = 1;
      } else if (f.k === "pick") {
        ctx.globalAlpha = 1 - t; ctx.strokeStyle = f.t === "potion" ? "#ff9d90" : "#8be8ff"; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(px + T / 2, py + T / 2, 6 + t * 18, 0, 7); ctx.stroke(); ctx.globalAlpha = 1;
        if (f.n) floatText("+" + f.n, px + T / 2 - 8, py + 8, t, "#7df0cf");
      }
    });
    shown = b;
    hud(b);
  }

  function hud(f) {
    var L = LEVELS[cur], pct = Math.max(0, f.h.hp / L.hp);
    $("hpFill").style.width = (pct * 100) + "%";
    $("hpFill").style.background = pct > 0.5 ? "#47d1b4" : pct > 0.25 ? "#f0b43c" : "#ef6a5b";
    $("hpTxt").textContent = f.h.hp + "/" + L.hp;
    $("gemTxt").textContent = f.gm ? f.g + "/" + f.gm : "-";
    $("foeTxt").textContent = f.km ? f.k + "/" + f.km + " down" : "-";
    $("turnTxt").textContent = f.n + "/" + (L.maxTurns || 150);
  }

  /* ---------- playback loop ---------- */
  var STEP_MS = 300;
  function loop(ms) {
    try {
      if (play) {
        var dur = STEP_MS / speed;
        var elapsed = Math.max(0, ms - play.start);
        var idx = Math.floor(elapsed / dur);
        if (idx !== lastSoundFrame) {
          var priorIndex = Math.max(0, idx - 1);
          if (idx > 0) playFrameSounds(play.frames[idx], play.frames[priorIndex]);
          lastSoundFrame = idx;
        }
        if (idx >= play.frames.length - 1) {
          var last = play.frames[play.frames.length - 1];
          var prev = play.frames[Math.max(0, play.frames.length - 2)];
          render(prev, last, 1, ms);
          var res = play.res;
          play = null;
          finish(res);
        } else {
          render(play.frames[idx], play.frames[idx + 1], Math.min(1, (elapsed - idx * dur) / dur), ms);
        }
      } else if (idleFrame) {
        render(idleFrame, idleFrame, 1, ms);
      }
    } catch (err) {
      if (window.console) console.error(err);
      if (play) { var r2 = play.res; play = null; try { finish(r2); } catch (e2) {} }
    }
    requestAnimationFrame(loop);
  }

  /* ---------- UI state ---------- */
  function setLog(kind, chip, msg, actions) {
    var log = $("log");
    log.dataset.kind = kind;
    $("logChip").textContent = chip;
    $("logMsg").textContent = msg;
    var box = $("logActions");
    box.textContent = "";
    (actions || []).forEach(function (a) {
      var b = document.createElement("button");
      b.type = "button"; b.className = "btn " + (a.cls || ""); b.textContent = a.label; b.addEventListener("click", a.fn);
      box.appendChild(b);
    });
  }

  function buildNav() {
    var nav = $("levelNav");
    nav.textContent = "";
    LEVELS.forEach(function (L, i) {
      var b = document.createElement("button");
      b.type = "button"; b.textContent = String(L.id);
      b.setAttribute("aria-label", "Level " + L.id + ": " + L.name);
      b.title = L.name;
      if (i > unlocked) { b.disabled = true; b.title = "Clear level " + i + " to unlock"; }
      if (cleared[i]) b.classList.add("done");
      if (i === cur) b.setAttribute("aria-current", "true");
      b.addEventListener("click", function () { stop(); loadLevel(i); });
      nav.appendChild(b);
    });
  }

  function loadLevel(i) {
    cur = i;
    var L = LEVELS[i];
    sizeCanvas(L);
    $("lvlLabel").textContent = "Level " + L.id + " of " + LEVELS.length;
    $("lvlName").textContent = L.name;
    $("lvlBrief").textContent = L.brief;
    $("lvlHint").textContent = L.hint;
    $("storyTxt").textContent = STORIES[i][0];
    $("conceptTxt").textContent = STORIES[i][1];
    var record = profile.records[i];
    $("lvlLabel").textContent = "CHAPTER " + (i + 1) + " • LEVEL " + L.id + " OF " + LEVELS.length + (record ? " • " + "★".repeat(record.stars) + "☆".repeat(3-record.stars) : "");
    var saved = store("hs:code:" + L.id);
    codeEl.value = saved !== null && saved !== undefined ? saved : L.starter;
    idleFrame = simulate(L, "", null).frames[0];
    setLog("info", "Ready", "Edit the code, then press Run. Your hero follows it one turn at a time.");
    buildNav();
  }

  function stop() {
    play = null;
    runBtn.textContent = "Run";
    runBtn.dataset.running = "false";
  }

  function run() {
    if (play) { stop(); setLog("info", "Stopped", "Playback stopped. Edit the code and run again."); return; }
    var L = LEVELS[cur];
    store("hs:code:" + L.id, codeEl.value);
    var res;
    try { res = simulate(L, buildMissionSource(codeEl.value), makeFn); }
    catch (e) { res = { status: "incomplete", error: String(e && e.message || e), frames: [idleFrame], remaining: [], turns: 0 }; }
    setLog("info", "Running", "Following your code...");
    runBtn.textContent = "Stop";
    runBtn.dataset.running = "true";
    var frames = res.frames.length > 1 ? res.frames : [res.frames[0], res.frames[0]];
    if (res.frames.length <= 1) { stop(); render(res.frames[0], res.frames[0], 1, 0); finish(res); return; }
    lastSoundFrame = -1;
    play = { frames: frames, start: performance.now(), res: res };
  }

  function finish(res) {
    stop();
    var L = LEVELS[cur];
    idleFrame = res.frames[res.frames.length - 1];
    var tail = res.output && res.output.length ? "\n\nProgram output:\n" + res.output.join("\n") : "";
    function log(kind, chip, msg, acts) { setLog(kind, chip, msg + tail, acts); }
    if (res.error) {
      log("error", res.status === "lost" ? "Hero fell" : "Code error", res.error + (res.turns ? "\n\nYour hero played " + res.turns + " turns before this happened." : ""));
      return;
    }
    if (res.status === "won") {
      playGameSound("win");
      var reward = awardMission(cur, res);
      cleared[cur] = true;
      if (cur + 1 > unlocked && cur + 1 < LEVELS.length) unlocked = cur + 1;
      store("hs:progress", JSON.stringify({ unlocked: unlocked, cleared: cleared }));
      buildNav();
      var acts = [];
      if (cur + 1 < LEVELS.length) acts.push({ label: "Next level", cls: "good", fn: function () { loadLevel(cur + 1); } });
      acts.push({ label: "Replay", fn: run });
      var rewardLine = "Rating: " + "★".repeat(reward.stars) + "☆".repeat(3-reward.stars) + " • +" + reward.xp + " XP • +" + reward.coins + " coins.";
      log("win", "Mission cleared", rewardLine + "\n" + (cur + 1 < LEVELS.length
        ? "Completed in " + res.turns + " turns. The next region is now within reach."
        : "Completed in " + res.turns + " turns. The Lost Kingdom is restored! Replay missions to improve your stars."), acts);
    } else if (res.status === "lost") {
      playGameSound("lose");
      log("fail", "Hero fell", "Your hero ran out of health. Fight one foe at a time, heal with potions, and avoid walking past enemies you have not defeated.");
    } else if (res.status === "timeout") {
      log("fail", "Out of turns", "The turn limit (" + (L.maxTurns || 150) + ") ran out. Look for a loop that never ends, or a route that wastes steps.");
    } else {
      log("fail", "Not finished", "Your code ended, but " + (res.remaining.length ? res.remaining.join(", ") : "the goal is not complete") + ". Add more commands or a loop.");
    }
  }

  /* ---------- menu, settings and custom function workshop ---------- */
  var homeScreen = $("homeScreen"), modalBackdrop = $("modalBackdrop"), modalContent = $("modalContent");
  var customFunctions = [];
  try { customFunctions = JSON.parse(store("hs:functions") || "[]") || []; } catch (e) { customFunctions = []; }
  function saveFunctions() { store("hs:functions", JSON.stringify(customFunctions)); }
  function esc(s) { return String(s).replace(/[&<>"']/g, function(c){ return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]; }); }
  function showModal(html) { modalContent.innerHTML = html; modalBackdrop.hidden = false; }
  function closeModal() { modalBackdrop.hidden = true; modalContent.innerHTML = ""; }
  function showHome() { stop(); homeScreen.hidden = false; document.body.classList.add("menu-open"); }
  function startGame() { homeScreen.hidden = true; document.body.classList.remove("menu-open"); }
  function showProfile() {
    var stars = 0;
    Object.keys(profile.records || {}).forEach(function(k){ stars += profile.records[k].stars || 0; });
    var cards = LEVELS.map(function(L,i){
      var r = profile.records[i], mark = r ? "★".repeat(r.stars)+"☆".repeat(3-r.stars) : "☆☆☆";
      return '<div class="modal-card"><strong>CHAPTER '+(i+1)+' · '+esc(L.name)+'</strong><p>'+mark+' · '+(r ? "Best: "+r.bestTurns+" turns" : "Not cleared yet")+'</p></div>';
    }).join("");
    showModal('<h2 class="modal-title" id="modalTitle">PLAYER PROFILE</h2><p class="modal-subtitle">Your journey through the Lost Kingdom.</p><div class="modal-grid"><div class="modal-card"><strong>ADVENTURER RANK</strong><p>Rank '+(Math.floor((profile.xp||0)/100)+1)+'</p></div><div class="modal-card"><strong>EXPERIENCE</strong><p>'+(profile.xp||0)+' XP</p></div><div class="modal-card"><strong>COINS</strong><p>'+(profile.coins||0)+'</p></div><div class="modal-card"><strong>STARS EARNED</strong><p>'+stars+' / '+(LEVELS.length*3)+'</p></div></div><h3 class="modal-title" style="font-size:18px;margin-top:24px">MISSION RECORD</h3><div class="modal-grid">'+cards+'</div>');
  }
  function showSettings() {
    var settings = {};
    try { settings = JSON.parse(store("hs:settings") || "{}"); } catch(e) {}
    showModal('<h2 class="modal-title" id="modalTitle">SETTINGS</h2><p class="modal-subtitle">Tune the game to your preferred play style.</p><div class="setting-row"><div><label for="settingSpeed">Playback speed</label><small>How quickly your hero moves during code playback.</small></div><select id="settingSpeed"><option value="1">1× Normal</option><option value="2">2× Fast</option><option value="4">4× Very fast</option></select></div><div class="setting-row"><div><label for="settingTheme">Game theme</label><small>Choose the color atmosphere.</small></div><select id="settingTheme"><option value="dark">Midnight</option><option value="forest">Forest</option></select></div><div class="setting-row"><div><label for="settingMotion">Reduce motion</label><small>Limit animated effects.</small></div><input id="settingMotion" type="checkbox"></div><div class="setting-row"><div><label for="settingSound">Sound effects</label><small>Movement, combat, pickups and mission result sounds.</small></div><div style="display:flex;gap:8px;align-items:center"><input id="settingSound" type="checkbox"><button class="modal-btn" type="button" id="testSoundBtn">Test sound</button></div></div><div class="setting-row"><div><label>Saved progress</label><small>Reset rank, rewards and unlocked chapters on this browser.</small></div><button class="modal-btn danger" id="resetProgressBtn">Reset progress</button></div><p class="function-message" id="settingsMessage"></p><button class="modal-btn" id="saveSettingsBtn">Save settings</button>');
    $("settingSpeed").value = String(settings.speed || speed);
    $("settingTheme").value = settings.theme || "dark";
    $("settingMotion").checked = !!settings.reduceMotion;
    $("settingSound").checked = settings.sound !== false;
    $("testSoundBtn").addEventListener("click", function(){
      soundEnabled = $("settingSound").checked;
      if (soundEnabled) { unlockSound(); playGameSound("win"); }
    });
    $("saveSettingsBtn").addEventListener("click", function(){
      settings = {speed:+$("settingSpeed").value,theme:$("settingTheme").value,reduceMotion:$("settingMotion").checked,sound:$("settingSound").checked};
      soundEnabled = settings.sound;
      speed = settings.speed; store("hs:settings",JSON.stringify(settings));
      document.body.classList.toggle("forest-theme",settings.theme==="forest");
      document.body.classList.toggle("reduce-motion",settings.reduceMotion);
      document.querySelectorAll(".speed button").forEach(function(b){b.setAttribute("aria-pressed",String(+b.dataset.speed===speed));});
      $("settingsMessage").textContent = "Settings saved.";
    });
    $("resetProgressBtn").addEventListener("click", function(){
      if (!window.confirm("Reset all Hero Script progress, rewards and saved mission code? This cannot be undone.")) return;
      profile={xp:0,coins:0,records:{}}; unlocked=0; cleared={};
      store("hs:profile",JSON.stringify(profile)); store("hs:progress",JSON.stringify({unlocked:0,cleared:{}}));
      for(var i=1;i<=LEVELS.length;i++){ try{localStorage.removeItem("hs:code:"+i);}catch(e){} }
      updateProfileUI(); loadLevel(0); $("settingsMessage").textContent="Progress reset. Your custom function library was kept.";
    });
  }
  function pythonToCpp(source) {
    var lines = source.replace(/\r/g,"").split("\n"), out=[], stack=[], started=false;
    function closeTo(indent) { while(stack.length && stack[stack.length-1] >= indent){ out.push("  ".repeat(stack.length)+"}"); stack.pop(); } }
    for(var i=0;i<lines.length;i++){
      var raw=lines[i]; if(!raw.trim() || /^\s*#/.test(raw)) continue;
      var indent=(raw.match(/^\s*/)[0].replace(/\t/g,"    ")).length, line=raw.trim();
      if(!started){
        var def=/^def\s+([A-Za-z_]\w*)\s*\((.*?)\)\s*:$/.exec(line);
        if(!def) throw new Error("Python workshop expects a function starting with: def function_name(...):");
        var params=def[2].trim()?def[2].split(",").map(function(x){return "int "+x.trim().split("=")[0].trim();}).join(", "):"";
        var returnType = /\breturn\s+[^;\n]+/.test(source) ? "auto " : "void ";
        out.push(returnType+def[1]+"("+params+") {"); stack.push(indent); started=true; continue;
      }
      closeTo(indent);
      var pad="  ".repeat(stack.length), converted=line;
      var iff=/^if\s+(.+):$/.exec(line), elif=/^elif\s+(.+):$/.exec(line), wh=/^while\s+(.+):$/.exec(line);
      var fr=/^for\s+(\w+)\s+in\s+range\((\w+)\):$/.exec(line);
      if(iff) { converted="if ("+iff[1]+") {"; stack.push(indent); }
      else if(elif) { converted="else if ("+elif[1]+") {"; stack.push(indent); }
      else if(line==="else:") { converted="else {"; stack.push(indent); }
      else if(wh) { converted="while ("+wh[1]+") {"; stack.push(indent); }
      else if(fr) { converted="for (int "+fr[1]+" = 0; "+fr[1]+" < "+fr[2]+"; "+fr[1]+"++) {"; stack.push(indent); }
      else if(line==="pass") continue;
      else {
        converted=converted.replace(/\bTrue\b/g,"true").replace(/\bFalse\b/g,"false").replace(/\bNone\b/g,"nullptr");
        if(/^return\b/.test(converted) || /^[A-Za-z_]\w*\s*=/.test(converted) || /\)$/.test(converted)) {
          if(/^[A-Za-z_]\w*\s*=/.test(converted)) converted="int "+converted;
          if(!/[;{}]$/.test(converted)) converted+=";";
        } else throw new Error("Unsupported Python statement on line "+(i+1)+": "+line);
      }
      out.push(pad+converted);
    }
    while(stack.length){out.push("  ".repeat(stack.length)+"}");stack.pop();}
    if(!started) throw new Error("Write a Python function beginning with def.");
    return out.join("\n");
  }
  function functionWorkshop() {
    showModal('<h2 class="modal-title" id="modalTitle">FUNCTION WORKSHOP</h2><p class="modal-subtitle">Create your own reusable helper function. Save it here, then insert it into a mission.</p><div class="function-form"><label>Function name<input id="fnName" placeholder="e.g. collectGem" value="collectGem"></label><label>Language<select id="fnLanguage"><option value="cpp">C++</option><option value="python">Python</option></select></label><label>Function code<textarea id="fnSource" spellcheck="false">void collectGem(int x, int y) {\n  hero.moveXY(x, y);\n}</textarea></label><div class="function-toolbar"><button class="modal-btn" id="saveFunctionBtn">Save function</button><button class="modal-btn secondary" id="insertFunctionBtn">Insert into current level</button><button class="modal-btn secondary" id="sampleFunctionBtn">Load example</button></div><p class="function-message" id="functionMessage">Supported subset: helper functions, parameters, calls, return, if/else, while and range loops.</p></div><div class="function-list" id="functionList"></div>');
    function renderFunctions(){
      $("functionList").innerHTML=customFunctions.length?customFunctions.map(function(fn,i){return '<div class="function-item"><div><strong>'+esc(fn.name)+'</strong><small>'+esc(fn.language.toUpperCase())+' · saved helper</small></div><div class="function-toolbar"><button class="modal-btn secondary" data-load="'+i+'">Edit</button><button class="modal-btn danger" data-delete="'+i+'">Delete</button></div></div>';}).join(""):'<p class="modal-subtitle">No saved functions yet. Create your first helper above.</p>';
      $("functionList").querySelectorAll("[data-load]").forEach(function(b){b.addEventListener("click",function(){var fn=customFunctions[+b.dataset.load];$("fnName").value=fn.name;$("fnLanguage").value=fn.language;$("fnSource").value=fn.source;});});
      $("functionList").querySelectorAll("[data-delete]").forEach(function(b){b.addEventListener("click",function(){customFunctions.splice(+b.dataset.delete,1);saveFunctions();renderFunctions();});});
    }
    $("fnLanguage").addEventListener("change",function(){
      $("editorFileLabel").textContent="hero.cpp";
      $("fnSource").value=$("fnLanguage").value==="python"?"def collect_gem(x, y):\n    hero.moveXY(x, y)":"void collectGem(int x, int y) {\n  hero.moveXY(x, y);\n}";
    });
    $("sampleFunctionBtn").addEventListener("click",function(){
      $("fnName").value=$("fnLanguage").value==="python"?"heal_if_needed":"healIfNeeded";
      $("fnSource").value=$("fnLanguage").value==="python"?"def heal_if_needed():\n    if hero.health < 6:\n        hero.say(\"Find a potion!\")":"void healIfNeeded() {\n  if (hero.health < 6) {\n    hero.say(\"Find a potion!\");\n  }\n}";
      $("functionMessage").textContent="Example loaded. Save it or insert it into your current mission.";
    });
    $("saveFunctionBtn").addEventListener("click",function(){
      try{
        var name=$("fnName").value.trim(), lang=$("fnLanguage").value, source=$("fnSource").value;
        if(!/^[A-Za-z_]\w*$/.test(name)) throw new Error("Use a valid function name (letters, numbers and underscores).");
        var cpp=lang==="python"?pythonToCpp(source):source;
        if(!/\b"+name+"\s*\(/.test(cpp) && lang==="cpp") { /* syntax validation below is authoritative */ }
        var js=cppToJs(cpp); new Function("hero","__tick","__vec","__print",js);
        var item={name:name,language:lang,source:source,cpp:cpp};
        var at=customFunctions.findIndex(function(x){return x.name===name;});
        if(at>=0) customFunctions[at]=item; else customFunctions.push(item);
        saveFunctions(); renderFunctions(); $("functionMessage").textContent="Saved "+name+"(). You can insert it into a mission now.";
      }catch(err){$("functionMessage").textContent="Could not save: "+err.message;}
    });
    $("insertFunctionBtn").addEventListener("click",function(){
      try{
        var lang=$("fnLanguage").value, cpp=lang==="python"?pythonToCpp($("fnSource").value):$("fnSource").value;
        new Function("hero","__tick","__vec","__print",cppToJs(cpp));
        var current=codeEl.value, mainAt=current.search(/\bint\s+main\s*\(/);
        if(mainAt<0) throw new Error("Current mission code needs an int main() function.");
        codeEl.value=current.slice(0,mainAt)+cpp+"\n\n"+current.slice(mainAt);
        store("hs:code:"+LEVELS[cur].id,codeEl.value);
        $("functionMessage").textContent="Inserted into hero.cpp before main(). Call your helper inside main(), for example "+$("fnName").value+"(2, 3);";
      }catch(err){$("functionMessage").textContent="Could not insert: "+err.message;}
    });
    renderFunctions();
  }
  function buildMissionSource(source) {
    var missing = customFunctions.filter(function(fn) {
      var declaration = new RegExp("\\b(?:void|int|auto|bool|float|double|string)\\s+" + fn.name + "\\s*\\(");
      return !declaration.test(source);
    }).map(function(fn) { return fn.cpp; });
    return missing.join("\n\n") + "\n\n" + source;
  }
  $("playGameBtn").addEventListener("click",function(){ unlockSound(); playGameSound("click"); startGame(); });
  $("openFunctionsBtn").addEventListener("click",functionWorkshop);
  $("openProfileBtn").addEventListener("click",showProfile);
  $("openSettingsBtn").addEventListener("click",showSettings);
  $("backMenuBtn").addEventListener("click",showHome);
  $("closeModalBtn").addEventListener("click",closeModal);
  modalBackdrop.addEventListener("click",function(e){if(e.target===modalBackdrop)closeModal();});
  try {
    var settings=JSON.parse(store("hs:settings")||"{}");
    speed=settings.speed||1;
    soundEnabled=settings.sound!==false;
    document.body.classList.toggle("forest-theme",settings.theme==="forest");
    document.body.classList.toggle("reduce-motion",!!settings.reduceMotion);
    document.querySelectorAll(".speed button").forEach(function(b){b.setAttribute("aria-pressed",String(+b.dataset.speed===speed));});
  } catch(e) {}

  /* ---------- wiring ---------- */
  runBtn.addEventListener("click", function(){ unlockSound(); playGameSound("click"); run(); });
  var armed = null;
  resetBtn.addEventListener("click", function () {
    if (!armed) {
      resetBtn.textContent = "Click again to reset";
      armed = setTimeout(function () { armed = null; resetBtn.textContent = "Reset code"; }, 2500);
      return;
    }
    clearTimeout(armed); armed = null; resetBtn.textContent = "Reset code";
    stop();
    codeEl.value = LEVELS[cur].starter;
    store("hs:code:" + LEVELS[cur].id, codeEl.value);
    idleFrame = simulate(LEVELS[cur], "", null).frames[0];
    setLog("info", "Ready", "Starter code restored.");
  });
  codeEl.addEventListener("input", function () { store("hs:code:" + LEVELS[cur].id, codeEl.value); });
  var tabFree = false;
  codeEl.addEventListener("keydown", function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); run(); return; }
    if (e.key === "Escape") { tabFree = true; return; }
    if (e.key === "Tab" && !e.shiftKey && !tabFree) {
      e.preventDefault();
      var s = codeEl.selectionStart, en = codeEl.selectionEnd;
      codeEl.value = codeEl.value.slice(0, s) + "  " + codeEl.value.slice(en);
      codeEl.selectionStart = codeEl.selectionEnd = s + 2;
    } else if (e.key !== "Tab") tabFree = false;
  });
  document.querySelectorAll(".speed button").forEach(function (b) {
    b.addEventListener("click", function () {
      speed = +b.dataset.speed;
      document.querySelectorAll(".speed button").forEach(function (o) { o.setAttribute("aria-pressed", String(o === b)); });
    });
  });
  cv.addEventListener("pointermove", function (e) {
    var r = cv.getBoundingClientRect(), L = LEVELS[cur];
    var x = Math.floor((e.clientX - r.left) / r.width * L.w), y = Math.floor((e.clientY - r.top) / r.height * L.h);
    $("cursor").textContent = "tile " + x + ", " + y;
  });
  cv.addEventListener("pointerleave", function () { $("cursor").textContent = ""; });

  try { var savedProfile = JSON.parse(store("hs:profile") || "null"); if (savedProfile) profile = Object.assign(profile, savedProfile); } catch (e) {}
  updateProfileUI();
  try {
    var pr = JSON.parse(store("hs:progress") || "null");
    if (pr) { unlocked = Math.min(LEVELS.length - 1, pr.unlocked || 0); cleared = pr.cleared || {}; }
  } catch (e) {}
  loadLevel(Math.min(unlocked, LEVELS.length - 1));
  requestAnimationFrame(loop);
})();
