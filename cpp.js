/* cpp.js - translates the supported C++ subset into JavaScript so it can run in the browser. */

function cppToJs(src) {
  src = src.replace(/^[ \t]*#.*$/gm, "");
  var toks = [], i = 0, n = src.length, ws = "", c, j;
  while (i < n) {
    c = src.charAt(i);
    if (/\s/.test(c)) { ws += c; i++; continue; }
    if (c === "/" && src.charAt(i + 1) === "/") { while (i < n && src.charAt(i) !== "\n") i++; continue; }
    if (c === "/" && src.charAt(i + 1) === "*") {
      var e = src.indexOf("*/", i + 2); if (e < 0) e = n - 2;
      ws += src.slice(i, e + 2).replace(/[^\n]/g, ""); i = e + 2; continue;
    }
    if (c === '"' || c === "'") {
      j = i + 1;
      while (j < n && src.charAt(j) !== c) { if (src.charAt(j) === "\\") j++; j++; }
      toks.push({ k: "str", v: src.slice(i, j + 1), ws: ws }); ws = ""; i = j + 1; continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      j = i; while (j < n && /[A-Za-z0-9_]/.test(src.charAt(j))) j++;
      toks.push({ k: "id", v: src.slice(i, j), ws: ws }); ws = ""; i = j; continue;
    }
    if (/[0-9]/.test(c) || (c === "." && /[0-9]/.test(src.charAt(i + 1)))) {
      var mm = /^(0[xX][0-9a-fA-F]+|\d*\.?\d+(?:[eE][+-]?\d+)?)[fFlLuU]*/.exec(src.slice(i));
      toks.push({ k: "num", v: mm[1], ws: ws }); ws = ""; i += mm[0].length; continue;
    }
    var two = src.substr(i, 2);
    if (["->", "::", "<<", "<=", ">=", "==", "!=", "&&", "||", "++", "--", "+=", "-=", "*=", "/=", "%="].indexOf(two) >= 0) {
      toks.push({ k: "op", v: two, ws: ws }); ws = ""; i += 2; continue;
    }
    toks.push({ k: "op", v: c, ws: ws }); ws = ""; i++;
  }

  // pass 1: simple word and operator swaps
  var t1 = [];
  for (i = 0; i < toks.length; i++) {
    var t = toks[i];
    if (t.v === "std" && toks[i + 1] && toks[i + 1].v === "::") { i++; if (toks[i + 1]) toks[i + 1].ws = t.ws + toks[i + 1].ws; continue; }
    if (t.v === "using" && toks[i + 1] && toks[i + 1].v === "namespace") {
      while (i < toks.length && toks[i].v !== ";") i++;
      continue;
    }
    if (t.v === "->") t = { k: "op", v: ".", ws: t.ws };
    else if (t.v === "nullptr" || t.v === "NULL") t = { k: "id", v: "null", ws: t.ws };
    t1.push(t);
  }
  toks = t1;

  var QUAL = { "const": 1, "static": 1, "constexpr": 1, "inline": 1, "unsigned": 1, "signed": 1 };
  var BASE = { "int": 1, "long": 1, "short": 1, "float": 1, "double": 1, "bool": 1, "char": 1, "auto": 1, "string": 1, "size_t": 1, "void": 1, "Enemy": 1, "Item": 1, "Unit": 1, "Hero": 1 };

  function text(a, b) { var r = ""; for (var q = a; q < b; q++) r += toks[q].ws + toks[q].v; return r; }
  function matching(open, close, from) {
    var d = 0;
    for (var q = from; q < toks.length; q++) {
      if (toks[q].v === open) d++;
      else if (toks[q].v === close) { d--; if (d === 0) return q; }
    }
    return -1;
  }
  function typeAt(p) {
    var q = p, saw = false, vec = false;
    while (q < toks.length) {
      var w = toks[q];
      if (w.k === "id" && QUAL[w.v]) { if (w.v === "unsigned" || w.v === "signed") saw = true; q++; continue; }
      if (w.k === "id" && BASE[w.v]) { saw = true; q++; continue; }
      if (w.v === "vector" && toks[q + 1] && toks[q + 1].v === "<") {
        var d = 0, r = q + 1;
        do { if (toks[r].v === "<") d++; else if (toks[r].v === ">") d--; r++; } while (r < toks.length && d > 0);
        saw = true; vec = true; q = r; continue;
      }
      break;
    }
    if (!saw) return null;
    while (q < toks.length && (toks[q].v === "*" || toks[q].v === "&" || toks[q].v === "&&" || toks[q].v === "const")) q++;
    if (!toks[q] || toks[q].k !== "id") return null;
    return { name: q, vec: vec };
  }

  var out = [], brace = 0, atStart = true, parens = [], hasMain = false, p = 0;
  function emit(w, v) { out.push(w + v); }
  while (p < toks.length) {
    var tk = toks[p];
    var forInit = out.length && parens.length && parens[parens.length - 1] && toks[p - 1] && toks[p - 1].v === "(";
    if (atStart || forInit) {
      // cout << a << b << endl;
      if (tk.v === "cout" && toks[p + 1] && toks[p + 1].v === "<<") {
        var q = p + 1, pieces = [], cur = [], depth = 0, endl = false;
        while (q < toks.length && !(toks[q].v === ";" && depth === 0)) {
          if (toks[q].v === "(") depth++; else if (toks[q].v === ")") depth--;
          if (toks[q].v === "<<" && depth === 0) { if (cur.length) pieces.push(cur); cur = []; }
          else cur.push(q);
          q++;
        }
        if (cur.length) pieces.push(cur);
        var parts = [];
        pieces.forEach(function (idx) {
          if (idx.length === 1 && toks[idx[0]].v === "endl") { endl = true; return; }
          parts.push(text(idx[0], idx[idx.length - 1] + 1).trim());
        });
        emit(tk.ws, "__print([" + parts.join(", ") + "], " + endl + ")");
        p = q; atStart = false; continue;
      }
      var ty = typeAt(p);
      if (ty) {
        var after = toks[ty.name + 1] ? toks[ty.name + 1].v : "";
        if (after === "(" && brace === 0 && !parens.length) {
          var close = matching("(", ")", ty.name + 1);
          if (close < 0) throw new SyntaxError("Missing ) in function declaration.");
          var params = [], a = ty.name + 2, depthP = 0, pstart = a;
          for (var z = a; z <= close; z++) {
            var zv = toks[z].v;
            if (zv === "(" || zv === "[") depthP++;
            else if ((zv === ")" || zv === "]") && z < close) depthP--;
            if ((zv === "," && depthP === 0) || z === close) {
              if (z > pstart) {
                var eq = -1, last = -1;
                for (var y = pstart; y < z; y++) { if (toks[y].v === "=" && eq < 0) eq = y; }
                var lim = eq < 0 ? z : eq;
                for (var y2 = pstart; y2 < lim; y2++) if (toks[y2].k === "id") last = y2;
                var isVoidOnly = z - pstart === 1 && toks[pstart].v === "void";
                if (last >= 0 && !isVoidOnly && !(BASE[toks[last].v] && lim - pstart === 1)) {
                  params.push(toks[last].v + (eq < 0 ? "" : " =" + text(eq + 1, z)));
                }
              }
              pstart = z + 1;
            }
          }
          var nx = close + 1;
          while (toks[nx] && toks[nx].v === "const") nx++;
          if (toks[nx] && toks[nx].v === ";") { p = nx + 1; atStart = true; continue; }
          if (toks[ty.name].v === "main") hasMain = true;
          emit(tk.ws, "function " + toks[ty.name].v + "(" + params.join(", ") + ") ");
          p = nx; atStart = false; continue;
        }
        var rangeFor = parens.length && parens[parens.length - 1] && after === ":";
        emit(tk.ws, rangeFor ? "const" : "let");
        emit(toks[ty.name].ws || " ", toks[ty.name].v);
        p = ty.name + 1;
        if (rangeFor) { emit(toks[p].ws, "of"); p++; }
        else if (ty.vec) {
          if (after === ";" || after === ",") emit(" ", "= __vec()");
          else if (after === "=" && toks[p + 1] && toks[p + 1].v === "{") {
            var cb = matching("{", "}", p + 1);
            if (cb > 0) { emit(" ", "= __vec([" + text(p + 2, cb) + "])"); p = cb + 1; }
          }
        }
        atStart = false; continue;
      }
    }
    if (tk.v === "(") parens.push(toks[p - 1] && toks[p - 1].v === "for");
    else if (tk.v === ")") parens.pop();
    if (tk.v === "{") brace++;
    else if (tk.v === "}") brace--;
    emit(tk.ws, tk.v);
    atStart = (tk.v === ";" && !(parens.length)) || tk.v === "{" || tk.v === "}";
    if (tk.v === ";" && parens.length) atStart = false;
    p++;
  }
  var js = out.join("");
  if (hasMain) js += "\nmain();";
  return js;
}
