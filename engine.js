/* engine.js - the game engine: turns, combat, pathfinding, the hero commands, and the result of a run. */

function guardLoops(src) {
  var out = "", last = 0, n = src.length, re = /\b(while|for)\s*\(/g, m;
  while ((m = re.exec(src))) {
    var j = m.index + m[0].length, depth = 1;
    while (j < n && depth > 0) {
      var c = src.charAt(j);
      if (c === "(") depth++; else if (c === ")") depth--;
      j++;
    }
    var k = j;
    while (k < n && /\s/.test(src.charAt(k))) k++;
    if (src.charAt(k) === "{") {
      out += src.slice(last, k + 1) + " __tick();";
      last = k + 1;
      re.lastIndex = k + 1;
    }
  }
  out += src.slice(last);
  return out.replace(/\bdo\s*\{/g, function (s) { return s + " __tick();"; });
}

function friendly(e) {
  if (!e || !e.message) return String(e);
  var m = String(e.message), r;
  if (e.name === "Error") return m;
  if (e.name === "SyntaxError") return "Compile error: " + m;
  if (e.name === "ReferenceError" && (r = /^(\w+) is not defined$/.exec(m))) return "Compile error: '" + r[1] + "' was not declared in this scope.";
  if (e.name === "TypeError" && (r = /^(.+)\.(\w+) is not a function$/.exec(m))) return "Compile error: '" + r[1] + "' has no member named '" + r[2] + "'.";
  if (e.name === "TypeError" && /Cannot read properties of (null|undefined)/.test(m)) return "Segmentation fault: your code used a nullptr. Check that findNearestEnemy() did not return nullptr before using it.";
  return e.name + ": " + m;
}

function simulate(level, code, makeFn) {
  var ABORT = { abort: true };
  var W = level.w, H = level.h, walls = {};
  level.walls.forEach(function (p) { walls[p[0] + "," + p[1]] = true; });
  var TYPES = { munchkin: { hp: 4, dmg: 1, chase: 0 }, ogre: { hp: 6, dmg: 2, chase: 0 }, wolf: { hp: 4, dmg: 2, chase: 4 } };
  var maxTurns = level.maxTurns || 150;
  var S = { hx: level.hero[0], hy: level.hero[1], hp: level.hp, maxHp: level.hp, face: 1, say: "", over: null, turns: 0, says: 0, ticks: 0, fx: [], frames: [] };
  var enemies = level.enemies.map(function (d, i) {
    var T = TYPES[d[0]];
    return { id: "e" + i, type: d[0], x: d[1], y: d[2], health: T.hp, maxHealth: T.hp, damage: T.dmg, chase: T.chase,
      get alive() { return this.health > 0; } };
  });
  var items = level.items.map(function (d, i) { return { id: "i" + i, type: d[0], x: d[1], y: d[2], taken: false }; });

  function enemyAt(x, y) {
    for (var i = 0; i < enemies.length; i++) if (enemies[i].health > 0 && enemies[i].x === x && enemies[i].y === y) return enemies[i];
    return null;
  }
  function blocked(x, y) { return x < 0 || y < 0 || x >= W || y >= H || !!walls[x + "," + y] || !!enemyAt(x, y); }
  function dist(a, b) { return Math.abs(a.x - b.x) + Math.abs(a.y - b.y); }

  function bfs(sx, sy, tx, ty, pass) {
    if (sx === tx && sy === ty) return [];
    var startKey = sx + "," + sy, prev = {}, seen = {}, q = [[sx, sy]];
    seen[startKey] = true;
    var D = [[1, 0], [0, 1], [-1, 0], [0, -1]];
    for (var qi = 0; qi < q.length; qi++) {
      var c = q[qi];
      for (var d = 0; d < 4; d++) {
        var nx = c[0] + D[d][0], ny = c[1] + D[d][1], key = nx + "," + ny;
        if (seen[key]) continue;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H || walls[key]) continue;
        var isT = nx === tx && ny === ty;
        if (!isT && !pass(nx, ny)) continue;
        seen[key] = true;
        prev[key] = c[0] + "," + c[1];
        if (isT) {
          var path = [], k = key;
          while (k !== startKey) { var p = k.split(","); path.unshift([+p[0], +p[1]]); k = prev[k]; }
          return path;
        }
        q.push([nx, ny]);
      }
    }
    return null;
  }
  function heroPass(x, y) { return !enemyAt(x, y); }

  function goalsMet() {
    return level.goals.every(function (g) {
      if (g === "gems") return items.every(function (i) { return i.type !== "gem" || i.taken; });
      if (g === "enemies") return enemies.every(function (e) { return e.health <= 0; });
      if (g === "exit") return !!level.exit && S.hx === level.exit[0] && S.hy === level.exit[1];
      return true;
    });
  }
  function remaining() {
    var r = [];
    var g = items.filter(function (i) { return i.type === "gem" && !i.taken; }).length;
    var e = enemies.filter(function (x) { return x.health > 0; }).length;
    if (level.goals.indexOf("gems") >= 0 && g) r.push(g + (g === 1 ? " gem" : " gems") + " left");
    if (level.goals.indexOf("enemies") >= 0 && e) r.push(e + (e === 1 ? " foe" : " foes") + " left");
    if (level.goals.indexOf("exit") >= 0 && !(S.hx === level.exit[0] && S.hy === level.exit[1])) r.push("the portal is not reached");
    return r;
  }

  function snap() {
    var gt = 0, gm = 0, kd = 0;
    items.forEach(function (i) { if (i.type === "gem") { gm++; if (i.taken) gt++; } });
    enemies.forEach(function (e) { if (e.health <= 0) kd++; });
    S.frames.push({
      h: { x: S.hx, y: S.hy, hp: S.hp, face: S.face, say: S.say },
      e: enemies.map(function (e) { return { id: e.id, t: e.type, x: e.x, y: e.y, hp: e.health, m: e.maxHealth }; }),
      i: items.filter(function (i) { return !i.taken; }).map(function (i) { return { id: i.id, t: i.type, x: i.x, y: i.y }; }),
      fx: S.fx, n: S.turns, g: gt, gm: gm, k: kd, km: enemies.length
    });
    S.fx = [];
    S.say = "";
  }

  function pickup() {
    items.forEach(function (it) {
      if (!it.taken && it.x === S.hx && it.y === S.hy) {
        it.taken = true;
        var n = 0;
        if (it.type === "potion") { var before = S.hp; S.hp = Math.min(S.maxHp, S.hp + 4); n = S.hp - before; }
        S.fx.push({ k: "pick", x: it.x, y: it.y, t: it.type, n: n });
      }
    });
  }

  function enemyPhase() {
    enemies.forEach(function (en) {
      if (en.health <= 0) return;
      var d = Math.abs(en.x - S.hx) + Math.abs(en.y - S.hy);
      if (d === 1) {
        S.hp -= en.damage;
        S.fx.push({ k: "hurt", x: S.hx, y: S.hy, n: en.damage });
      } else if (en.chase && d <= en.chase) {
        var p = bfs(en.x, en.y, S.hx, S.hy, function (x, y) { return !enemyAt(x, y); });
        if (p && p.length > 1) { en.x = p[0][0]; en.y = p[0][1]; }
      }
    });
  }

  function endTurn() {
    S.turns++;
    enemyPhase();
    if (S.hp <= 0) { S.hp = 0; S.over = "lost"; }
    else if (goalsMet()) S.over = "won";
    snap();
    if (!S.over && S.turns >= maxTurns) S.over = "timeout";
  }
  function guard() { if (S.over) throw ABORT; }
  function tick() {
    if (S.over) throw ABORT;
    if (++S.ticks > 50000) { S.over = "timeout"; throw ABORT; }
  }

  function step(dx, dy) {
    guard();
    var nx = S.hx + dx, ny = S.hy + dy;
    if (dx) S.face = dx > 0 ? 1 : -1;
    if (blocked(nx, ny)) { S.fx.push({ k: "bump", x: nx, y: ny }); endTurn(); return false; }
    S.hx = nx; S.hy = ny;
    pickup();
    endTurn();
    return true;
  }
  function mv(dx, dy, n) {
    n = n === undefined ? 1 : Math.floor(Number(n));
    if (!(n >= 0)) throw new Error("Movement commands need a whole number of steps, like hero.moveRight(3).");
    var all = true;
    for (var i = 0; i < Math.min(n, 60); i++) { if (!step(dx, dy)) { all = false; break; } }
    return all;
  }

  function mkvec(a) {
    a = a || [];
    var m = {
      size: function () { return a.length; }, empty: function () { return a.length === 0; },
      push_back: function (x) { a.push(x); }, pop_back: function () { return a.pop(); },
      back: function () { return a[a.length - 1]; }, front: function () { return a[0]; },
      clear: function () { a.length = 0; }, at: function (i) { return a[i]; }
    };
    Object.keys(m).forEach(function (k) { Object.defineProperty(a, k, { value: m[k], enumerable: false, configurable: true }); });
    return a;
  }
  var outLines = [], outCur = "";
  function print(parts, endl) {
    outCur += parts.map(function (v) { return typeof v === "boolean" ? (v ? "1" : "0") : String(v); }).join("");
    if (endl) { outLines.push(outCur); outCur = ""; }
  }

  var hero = {
    get x() { return S.hx; },
    get y() { return S.hy; },
    get health() { return S.hp; },
    get maxHealth() { return S.maxHp; },
    moveRight: function (n) { return mv(1, 0, n); },
    moveLeft: function (n) { return mv(-1, 0, n); },
    moveDown: function (n) { return mv(0, 1, n); },
    moveUp: function (n) { return mv(0, -1, n); },
    moveXY: function (tx, ty) {
      guard();
      tx = Math.round(Number(tx)); ty = Math.round(Number(ty));
      if (isNaN(tx) || isNaN(ty)) throw new Error("moveXY needs two numbers, like hero.moveXY(5, 3).");
      var p = bfs(S.hx, S.hy, tx, ty, heroPass);
      if (!p || p.length === 0) {
        if (!p) S.fx.push({ k: "bump", x: tx, y: ty });
        endTurn();
        return !!p;
      }
      for (var i = 0; i < p.length; i++) {
        guard();
        if (enemyAt(p[i][0], p[i][1])) { S.fx.push({ k: "bump", x: p[i][0], y: p[i][1] }); endTurn(); return false; }
        if (p[i][0] !== S.hx) S.face = p[i][0] > S.hx ? 1 : -1;
        S.hx = p[i][0]; S.hy = p[i][1];
        pickup();
        endTurn();
      }
      return S.hx === tx && S.hy === ty;
    },
    attack: function (e) {
      guard();
      if (!e || typeof e !== "object" || typeof e.health !== "number" || !("chase" in e)) {
        throw new Error("attack() needs an enemy. findNearestEnemy() returns nullptr when nobody is left, so check it before attacking.");
      }
      if (e.health <= 0) { endTurn(); return false; }
      if (e.x !== S.hx) S.face = e.x > S.hx ? 1 : -1;
      if (dist(e, { x: S.hx, y: S.hy }) === 1) {
        e.health -= 2;
        S.fx.push({ k: "hit", x: e.x, y: e.y, n: 2 });
        endTurn();
        return true;
      }
      var p = bfs(S.hx, S.hy, e.x, e.y, heroPass);
      if (p && p.length > 1) {
        if (p[0][0] !== S.hx) S.face = p[0][0] > S.hx ? 1 : -1;
        S.hx = p[0][0]; S.hy = p[0][1];
        pickup();
        endTurn();
        return true;
      }
      endTurn();
      return false;
    },
    findEnemies: function () { return mkvec(enemies.filter(function (e) { return e.health > 0; })); },
    findNearestEnemy: function () { return hero.findNearest(hero.findEnemies()); },
    findItems: function () { return mkvec(items.filter(function (i) { return !i.taken; })); },
    findGems: function () { return mkvec(items.filter(function (i) { return !i.taken && i.type === "gem"; })); },
    findPotions: function () { return mkvec(items.filter(function (i) { return !i.taken && i.type === "potion"; })); },
    distanceTo: function (t) { return t ? dist(t, { x: S.hx, y: S.hy }) : -1; },
    findNearest: function (list) {
      var best = null, bd = 1e9, me = { x: S.hx, y: S.hy };
      (list || []).forEach(function (t) {
        if (!t || (t.health !== undefined && t.health <= 0) || t.taken) return;
        var d = dist(t, me);
        if (d < bd) { bd = d; best = t; }
      });
      return best;
    },
    say: function (t) {
      guard();
      if (S.says >= 40) return;
      S.says++;
      S.say = String(t).slice(0, 44);
      snap();
    }
  };

  var error = null;
  snap();
  try {
    var js = cppToJs(code);
    var fn = (makeFn || function (c) { return new Function("hero", "__tick", "__vec", "__print", c); })(guardLoops(js));
    fn(hero, tick, mkvec, print);
  } catch (e) {
    if (e !== ABORT) error = friendly(e);
  }
  if (outCur) outLines.push(outCur);
  var status = S.over || "incomplete";
  if (!S.over && goalsMet()) status = "won";
  return { status: status, error: error, frames: S.frames, remaining: remaining(), turns: S.turns, output: outLines };
}
