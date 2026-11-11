/* @ds-bundle: {"format":4,"namespace":"Split","components":[{"name":"Button"},{"name":"IconButton"},{"name":"ToolRail"},{"name":"Field"},{"name":"Select"},{"name":"SegmentedControl"},{"name":"ColorField"},{"name":"Slider"},{"name":"Avatar"},{"name":"CursorLabel"},{"name":"Panel"},{"name":"TransportBar"},{"name":"TrackHeader"},{"name":"Clip"},{"name":"TimelineRuler"},{"name":"SelectionBox"},{"name":"CaptionOverlay"},{"name":"Logo"},{"name":"Icon"}]} */
(function () {
  var React = window.React;
  var h = React.createElement;
  var useState = React.useState;
  var ICONS = {"select": ["<path d=\"M5.5 3.5l13 7-6 2-2 6.5z\"/>", 0], "pan": ["<path d=\"M12 3v18M3 12h18M9 6l3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3\"/>", 0], "zoom-in": ["<circle cx=\"11\" cy=\"11\" r=\"6.5\"/><path d=\"M20 20l-4.4-4.4M11 8.5v5M8.5 11h5\"/>", 0], "undo": ["<path d=\"M9 14L4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3\"/>", 0], "redo": ["<path d=\"M15 14l5-5-5-5M20 9H10a6 6 0 0 0 0 12h3\"/>", 0], "share": ["<circle cx=\"6\" cy=\"12\" r=\"2.5\"/><circle cx=\"18\" cy=\"6\" r=\"2.5\"/><circle cx=\"18\" cy=\"18\" r=\"2.5\"/><path d=\"M8.2 10.9l7.6-3.8M8.2 13.1l7.6 3.8\"/>", 0], "menu": ["<path d=\"M4 7h16M4 12h16M4 17h16\"/>", 0], "collapse": ["<path d=\"M12 6l-6 6 6 6M19 6l-6 6 6 6\"/>", 0], "chevron-down": ["<path d=\"M6 9l6 6 6-6\"/>", 0], "add": ["<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M12 8v8M8 12h8\"/>", 0], "align-left": ["<path d=\"M4 6h16M4 10h10M4 14h16M4 18h10\"/>", 0], "align-center": ["<path d=\"M4 6h16M7 10h10M4 14h16M7 18h10\"/>", 0], "align-right": ["<path d=\"M4 6h16M10 10h10M4 14h16M10 18h10\"/>", 0], "align-justify": ["<path d=\"M4 6h16M4 10h16M4 14h16M4 18h16\"/>", 0], "plus": ["<path d=\"M12 5v14M5 12h14\"/>", 0], "minus": ["<path d=\"M5 12h14\"/>", 0], "close": ["<path d=\"M6 6l12 12M18 6L6 18\"/>", 0], "text": ["<rect x=\"3.5\" y=\"3.5\" width=\"17\" height=\"17\" rx=\"4\"/><path d=\"M8 9V8h8v1M12 8v8M10 16h4\"/>", 0], "captions": ["<rect x=\"3\" y=\"5\" width=\"18\" height=\"14\" rx=\"3.5\"/><path d=\"M7.5 11h9M7.5 14.5h5\"/>", 0], "shapes": ["<circle cx=\"9\" cy=\"9\" r=\"5\"/><rect x=\"11.5\" y=\"11.5\" width=\"9\" height=\"9\" rx=\"2.5\"/>", 0], "effects": ["<path d=\"M4.5 19.5L15 9M13.5 4l1 2.2 2.2 1-2.2 1-1 2.2-1-2.2-2.2-1 2.2-1zM18 13.5l.7 1.5 1.5.7-1.5.7-.7 1.5-.7-1.5-1.5-.7 1.5-.7z\"/>", 0], "settings": ["<path d=\"M4 7h8M17 7h3M4 17h3M12 17h8\"/><circle cx=\"14.5\" cy=\"7\" r=\"2.5\"/><circle cx=\"9.5\" cy=\"17\" r=\"2.5\"/>", 0], "help": ["<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M9.5 9.5a2.5 2.5 0 1 1 3.6 2.2c-.7.4-1.1.9-1.1 1.8M12 16.8v.2\"/>", 0], "play": ["<path d=\"M7.5 5v14l11.5-7z\"/>", 1], "pause": ["<rect x=\"6\" y=\"5\" width=\"4\" height=\"14\" rx=\"1.2\"/><rect x=\"14\" y=\"5\" width=\"4\" height=\"14\" rx=\"1.2\"/>", 1], "skip-back": ["<path d=\"M6 5v14\"/><path d=\"M19 5.5v13L9 12z\"/>", 1], "skip-forward": ["<path d=\"M18 5v14\"/><path d=\"M5 5.5v13L15 12z\"/>", 1], "split": ["<circle cx=\"6\" cy=\"6.5\" r=\"2.5\"/><circle cx=\"6\" cy=\"17.5\" r=\"2.5\"/><path d=\"M8 8l12 9.5M8 16L20 6.5\"/>", 0], "trim": ["<path d=\"M9 5H6v14h3M15 5h3v14h-3\"/>", 0], "lock": ["<rect x=\"5\" y=\"11\" width=\"14\" height=\"9\" rx=\"2.5\"/><path d=\"M8 11V8a4 4 0 0 1 8 0v3\"/>", 0], "unlock": ["<rect x=\"5\" y=\"11\" width=\"14\" height=\"9\" rx=\"2.5\"/><path d=\"M8 11V8a4 4 0 0 1 7.6-1.7\"/>", 0], "eye": ["<path d=\"M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z\"/><circle cx=\"12\" cy=\"12\" r=\"2.8\"/>", 0], "eye-off": ["<path d=\"M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z\"/><circle cx=\"12\" cy=\"12\" r=\"2.8\"/><path d=\"M4 4l16 16\"/>", 0], "grip": ["<circle cx=\"9\" cy=\"6\" r=\"1.3\"/><circle cx=\"15\" cy=\"6\" r=\"1.3\"/><circle cx=\"9\" cy=\"12\" r=\"1.3\"/><circle cx=\"15\" cy=\"12\" r=\"1.3\"/><circle cx=\"9\" cy=\"18\" r=\"1.3\"/><circle cx=\"15\" cy=\"18\" r=\"1.3\"/>", 1], "volume": ["<path d=\"M4 10v4h3.5l4.5 4V6L7.5 10z\"/><path d=\"M15.5 9.5a3.5 3.5 0 0 1 0 5M18 7a7 7 0 0 1 0 10\"/>", 0], "music": ["<path d=\"M9 17.5V6l10-2v11.5\"/><circle cx=\"7\" cy=\"17.5\" r=\"2\"/><circle cx=\"17\" cy=\"15.5\" r=\"2\"/>", 0], "video": ["<rect x=\"3\" y=\"5\" width=\"18\" height=\"14\" rx=\"3.5\"/><path d=\"M10.5 9.5v5l4-2.5z\"/>", 0], "image": ["<rect x=\"3\" y=\"4\" width=\"18\" height=\"16\" rx=\"3.5\"/><circle cx=\"9\" cy=\"9.5\" r=\"1.5\"/><path d=\"M4 17l5-4.5 4 3.5 3-2.5 4 3\"/>", 0], "trash": ["<path d=\"M4.5 7h15M10 7V4.8h4V7M6.5 7l1 12.2h9l1-12.2M10.2 11v5M13.8 11v5\"/>", 0], "check": ["<path d=\"M5 12.5l4.5 4.5L19 7.5\"/>", 0], "alert": ["<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M12 7.5v5.5M12 16.5v.2\"/>", 0], "warning": ["<path d=\"M12 4l9 16H3z\"/><path d=\"M12 10v4.5M12 17.4v.2\"/>", 0], "info": ["<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M12 11v5.5M12 7.8v.2\"/>", 0], "export": ["<path d=\"M12 15V4M7.5 8.5L12 4l4.5 4.5M5 14v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4\"/>", 0]};
  var LOGO = {"mark": "<g fill=\"none\" class=\"sp-ink-s\" stroke-width=\"6.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" transform=\"translate(0 1.5)\"><path d=\"M22.6 20H14v11h8.6\"/><path d=\"M22.6 42H14\"/></g><g fill=\"none\" class=\"sp-acc-s\" stroke-width=\"6.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" transform=\"translate(0 -1.5)\"><path d=\"M33.4 20H42\"/><path d=\"M33.4 31H42v11h-8.6\"/></g><path d=\"M28 11V54\" class=\"sp-ink-s\" stroke-width=\"1.8\" fill=\"none\"/><path d=\"M24 4.5h8v3.5l-4 3.5-4-3.5z\" class=\"sp-ink-f sp-ink-s\" stroke-width=\"1.2\" stroke-linejoin=\"round\"/>", "wm": "<g transform=\"translate(-237.86507936507937 -34.43650793650795) scale(22.126984126984127)\"><g fill=\"none\" class=\"sp-ink-s\" stroke-width=\"6.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" transform=\"translate(0 1.5)\"><path d=\"M22.6 20H14v11h8.6\"/><path d=\"M22.6 42H14\"/></g><g fill=\"none\" class=\"sp-acc-s\" stroke-width=\"6.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" transform=\"translate(0 -1.5)\"><path d=\"M33.4 20H42\"/><path d=\"M33.4 31H42v11h-8.6\"/></g><path d=\"M28 11V54\" class=\"sp-ink-s\" stroke-width=\"1.8\" fill=\"none\"/><path d=\"M24 4.5h8v3.5l-4 3.5-4-3.5z\" class=\"sp-ink-f sp-ink-s\" stroke-width=\"1.2\" stroke-linejoin=\"round\"/></g><g transform=\"translate(0 1000)\"><path class=\"sp-ink-f\" d=\"M921.9609523809524 204V-493H1045.9609523809524V-361L1015.9609523809524 -351Q1028.9609523809524 -410 1055.4609523809524 -443.0Q1081.9609523809524 -476 1115.9609523809524 -489.5Q1149.9609523809524 -503 1186.9609523809524 -503Q1251.9609523809524 -503 1299.4609523809524 -469.5Q1346.9609523809524 -436 1371.9609523809524 -378.0Q1396.9609523809524 -320 1396.9609523809524 -246Q1396.9609523809524 -166 1368.9609523809524 -108.5Q1340.9609523809524 -51 1292.9609523809524 -20.5Q1244.9609523809524 10 1186.9609523809524 10Q1147.9609523809524 10 1112.9609523809524 -6.0Q1077.9609523809524 -22 1053.4609523809524 -54.5Q1028.9609523809524 -87 1019.9609523809524 -137L1045.9609523809524 -133V204ZM1152.9609523809524 -104Q1189.9609523809524 -104 1216.4609523809524 -121.5Q1242.9609523809524 -139 1257.9609523809524 -171.0Q1272.9609523809524 -203 1272.9609523809524 -246Q1272.9609523809524 -290 1257.9609523809524 -322.0Q1242.9609523809524 -354 1216.4609523809524 -371.5Q1189.9609523809524 -389 1152.9609523809524 -389Q1116.9609523809524 -389 1090.4609523809524 -371.0Q1063.9609523809524 -353 1049.4609523809524 -321.5Q1034.9609523809524 -290 1034.9609523809524 -246Q1034.9609523809524 -203 1049.4609523809524 -171.0Q1063.9609523809524 -139 1090.4609523809524 -121.5Q1116.9609523809524 -104 1152.9609523809524 -104Z M1602.9609523809524 10Q1551.9609523809524 10 1518.9609523809524 -21.0Q1485.9609523809524 -52 1485.9609523809524 -119V-697H1608.9609523809524V-143Q1608.9609523809524 -122 1618.9609523809524 -113.5Q1628.9609523809524 -105 1644.9609523809524 -105Q1652.9609523809524 -105 1661.9609523809524 -106.5Q1670.9609523809524 -108 1680.9609523809524 -111V-5Q1659.9609523809524 3 1639.4609523809524 6.5Q1618.9609523809524 10 1602.9609523809524 10Z M1756.9609523809524 0V-493H1880.9609523809524V0Z M2182.960952380952 10Q2142.960952380952 10 2108.960952380952 -5.0Q2074.960952380952 -20 2054.460952380952 -54.0Q2033.9609523809524 -88 2033.9609523809524 -145V-608L2159.960952380952 -675V-179Q2159.960952380952 -136 2171.460952380952 -114.0Q2182.960952380952 -92 2216.960952380952 -92Q2226.960952380952 -92 2239.460952380952 -94.0Q2251.960952380952 -96 2266.960952380952 -100V-5Q2245.960952380952 3 2224.960952380952 6.5Q2203.960952380952 10 2182.960952380952 10ZM1943.9609523809524 -396V-493H2266.960952380952V-396Z\"/><path class=\"sp-acc-f\" d=\"M1752.9609523809524 -569V-697H1885.9609523809524V-569Z\"/></g>", "wmvb": "0 0 2303 1260", "ratio": 1.8277467876039304, "icon": "<rect width=\"256\" height=\"256\" rx=\"58\" fill=\"#0a0a0b\"/><g transform=\"translate(50.3 44) scale(2.8)\"><g fill=\"none\" stroke=\"#f6f6f8\" stroke-width=\"6.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" transform=\"translate(0 1.5)\"><path d=\"M22.6 20H14v11h8.6\"/><path d=\"M22.6 42H14\"/></g><g fill=\"none\" stroke=\"#6aa3ff\" stroke-width=\"6.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" transform=\"translate(0 -1.5)\"><path d=\"M33.4 20H42\"/><path d=\"M33.4 31H42v11h-8.6\"/></g><path d=\"M28 11V54\" stroke=\"#f6f6f8\" stroke-width=\"1.8\" fill=\"none\"/><path d=\"M24 4.5h8v3.5l-4 3.5-4-3.5z\" fill=\"#f6f6f8\" stroke=\"#f6f6f8\" stroke-width=\"1.2\" stroke-linejoin=\"round\"/></g>"};

  function cx() {
    var o = [];
    for (var i = 0; i < arguments.length; i++) if (arguments[i]) o.push(arguments[i]);
    return o.join(' ');
  }
  function omit(p, keys) {
    var o = {};
    for (var k in p) if (keys.indexOf(k) < 0) o[k] = p[k];
    return o;
  }
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function fmt(sec) { sec = Math.max(0, Math.round(sec)); return pad(Math.floor(sec / 3600)) + ':' + pad(Math.floor(sec / 60) % 60) + ':' + pad(sec % 60); }

  /* ---------- Icon ---------- */
  function Icon(p) {
    var d = ICONS[p.name] || ['', 0];
    var s = p.size || 20;
    return h('svg', {
      className: cx('sp-icon', p.className), viewBox: '0 0 24 24', width: s, height: s,
      fill: d[1] ? 'currentColor' : 'none', stroke: 'currentColor', strokeWidth: p.strokeWidth || 1.5,
      strokeLinecap: 'round', strokeLinejoin: 'round',
      role: p.title ? 'img' : undefined, 'aria-label': p.title || undefined, 'aria-hidden': p.title ? undefined : 'true',
      focusable: 'false', dangerouslySetInnerHTML: { __html: d[0] }
    });
  }

  /* ---------- Button ---------- */
  function Button(p) {
    var v = p.variant || 'primary', s = p.size || 'md';
    var o = omit(p, ['variant', 'size', 'icon', 'iconEnd', 'children', 'className']);
    o.type = o.type || 'button';
    o.className = cx('sp-btn', 'sp-btn--' + v, 'sp-btn--' + s, p.className);
    var is = s === 'sm' ? 16 : 20;
    return h('button', o,
      p.icon ? h(Icon, { name: p.icon, size: is }) : null,
      p.children != null ? h('span', null, p.children) : null,
      p.iconEnd ? h(Icon, { name: p.iconEnd, size: is }) : null);
  }

  /* ---------- IconButton ---------- */
  function IconButton(p) {
    var s = p.size || 'md';
    var o = omit(p, ['icon', 'label', 'active', 'size', 'className', 'iconSize']);
    o.type = o.type || 'button';
    o['aria-label'] = p.label;
    o.title = p.title || p.label;
    if (p.active !== undefined) o['aria-pressed'] = !!p.active;
    o.className = cx('sp-ibtn', 'sp-ibtn--' + s, p.className);
    return h('button', o, h(Icon, { name: p.icon, size: p.iconSize || (s === 'sm' ? 16 : s === 'lg' ? 24 : 20) }));
  }

  /* ---------- ToolRail ---------- */
  function ToolRail(p) {
    function onKey(e) {
      var k = e.key; if (k !== 'ArrowDown' && k !== 'ArrowUp' && k !== 'Home' && k !== 'End') return;
      var items = Array.prototype.slice.call(e.currentTarget.querySelectorAll('button:not([disabled])'));
      var i = items.indexOf(document.activeElement); if (i < 0) return;
      var n = k === 'ArrowDown' ? i + 1 : k === 'ArrowUp' ? i - 1 : k === 'Home' ? 0 : items.length - 1;
      items[(n + items.length) % items.length].focus(); e.preventDefault();
    }
    return h('div', { className: cx('sp-rail', p.className), role: 'toolbar', 'aria-orientation': 'vertical', 'aria-label': p.label || 'Tools', onKeyDown: onKey }, p.children);
  }
  function ToolRailItem(p) { return h(IconButton, Object.assign({ size: 'lg' }, p, { className: cx('sp-rail__item', p.className) })); }

  /* ---------- Field ---------- */
  function Field(p) {
    var ip = {};
    if (p.onChange) { ip.value = p.value; ip.onChange = p.onChange; } else { ip.defaultValue = p.value; }
    var common = Object.assign({ className: 'sp-field__input', 'aria-label': p.label || p.caption, placeholder: p.placeholder, disabled: p.disabled, id: p.id, name: p.name }, ip);
    var control = p.multiline
      ? h('textarea', Object.assign({ rows: p.rows || 2 }, common))
      : h('input', Object.assign({ type: p.type || 'text', inputMode: p.type === 'number' ? 'decimal' : undefined, min: p.min, max: p.max, step: p.step }, common));
    return h('div', { className: cx('sp-field', p.className) },
      h('div', { className: cx('sp-field__box', p.multiline && 'sp-field__box--multi') },
        control,
        p.unit ? h('span', { className: 'sp-field__unit', 'aria-hidden': 'true' }, p.unit) : null,
        p.stepper ? h('span', { className: 'sp-field__step', 'aria-hidden': 'true' }, h(Icon, { name: 'chevron-down', size: 14 })) : null),
      p.caption ? h('span', { className: 'sp-field__cap' }, p.caption) : null);
  }

  /* ---------- Select ---------- */
  function Select(p) {
    var ip = {};
    if (p.onChange) { ip.value = p.value; ip.onChange = p.onChange; } else { ip.defaultValue = p.value; }
    return h('div', { className: cx('sp-select', p.className) },
      h('select', Object.assign({ 'aria-label': p.label, disabled: p.disabled, id: p.id }, ip),
        (p.options || []).map(function (o) { var v = typeof o === 'string' ? o : o.value; var l = typeof o === 'string' ? o : o.label; return h('option', { key: v, value: v }, l); })),
      h(Icon, { name: 'chevron-down', size: 16 }));
  }

  /* ---------- SegmentedControl ---------- */
  function SegmentedControl(p) {
    var opts = p.options || [];
    var st = useState(p.defaultValue !== undefined ? p.defaultValue : (opts[0] && opts[0].value));
    var val = p.value !== undefined ? p.value : st[0];
    function set(v) { if (p.value === undefined) st[1](v); if (p.onChange) p.onChange(v); }
    function onKey(e) {
      var d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0; if (!d) return;
      var i = 0; opts.forEach(function (o, j) { if (o.value === val) i = j; });
      var n = opts[(i + d + opts.length) % opts.length]; set(n.value); e.preventDefault();
      var btns = e.currentTarget.querySelectorAll('[role=radio]'); var t = btns[(i + d + opts.length) % opts.length]; if (t) t.focus();
    }
    return h('div', { className: cx('sp-seg', p.className), role: 'radiogroup', 'aria-label': p.label, onKeyDown: onKey },
      opts.map(function (o) {
        var on = o.value === val;
        return h('button', { key: o.value, type: 'button', role: 'radio', 'aria-checked': on, tabIndex: on ? 0 : -1, 'aria-label': o.label || undefined, title: o.title || o.label, className: 'sp-seg__item', onClick: function () { set(o.value); } },
          o.icon ? h(Icon, { name: o.icon, size: 18 }) : o.text);
      }));
  }

  /* ---------- ColorField ---------- */
  function ColorField(p) {
    return h('div', { className: cx('sp-color', p.className) },
      h('div', { className: 'sp-field__box sp-color__main' },
        h('button', { type: 'button', className: 'sp-swatch', 'aria-label': (p.label || 'Colour') + ' swatch, open picker', style: { background: p.value } }),
        h('input', { className: 'sp-field__input', 'aria-label': (p.label || 'Colour') + ' hex', defaultValue: String(p.value || '').replace('#', '').toUpperCase(), spellCheck: false, style: { fontVariantNumeric: 'tabular-nums' } }),
        h('span', { className: 'sp-field__unit', 'aria-hidden': 'true' }, 'hex')),
      p.opacity !== undefined ? h('div', { className: 'sp-field__box sp-color__alpha' },
        h('input', { className: 'sp-field__input', 'aria-label': (p.label || 'Colour') + ' opacity percent', defaultValue: p.opacity + '%' }),
        h('span', { className: 'sp-field__step', 'aria-hidden': 'true' }, h(Icon, { name: 'chevron-down', size: 14 }))) : null);
  }

  /* ---------- Slider ---------- */
  function Slider(p) {
    var min = p.min != null ? p.min : 0, max = p.max != null ? p.max : 100;
    var st = useState(p.defaultValue != null ? p.defaultValue : min);
    var v = p.value != null ? p.value : st[0];
    var pct = ((v - min) / (max - min)) * 100;
    return h('input', {
      type: 'range', className: cx('sp-slider', p.className), min: min, max: max, step: p.step || 1, value: v, 'aria-label': p.label,
      'aria-valuetext': p.valueText, disabled: p.disabled, style: { '--pct': pct + '%' },
      onChange: function (e) { var n = Number(e.target.value); if (p.value == null) st[1](n); if (p.onChange) p.onChange(n); }
    });
  }

  /* ---------- Avatar ---------- */
  function initials(n) { return String(n || '?').split(/\s+/).slice(0, 2).map(function (w) { return w.charAt(0).toUpperCase(); }).join(''); }
  function Avatar(p) {
    return h('span', { className: cx('sp-avatar', p.className), role: 'img', 'aria-label': p.name, title: p.name, style: { '--c': 'var(--' + (p.color || 'collab-1') + ')', '--s': (p.size || 28) + 'px' } },
      p.src ? h('img', { src: p.src, alt: '' }) : initials(p.name));
  }
  function AvatarStack(p) {
    return h('span', { className: cx('sp-avatars', p.className), role: 'group', 'aria-label': p.label || 'People in this project' },
      (p.people || []).map(function (a, i) { return h(Avatar, { key: i, name: a.name, src: a.src, color: a.color || 'collab-' + ((i % 4) + 1), size: p.size }); }));
  }

  /* ---------- CursorLabel ---------- */
  function CursorLabel(p) {
    return h('div', { className: cx('sp-cursor', p.className), style: Object.assign({ '--c': 'var(--' + (p.color || 'collab-1') + ')' }, p.style) },
      h('svg', { width: 18, height: 18, viewBox: '0 0 18 18', 'aria-hidden': 'true', focusable: 'false' }, h('path', { d: 'M2 1.5l13 6.2-5.4 1.9L7.6 15z', fill: 'var(--c)', stroke: 'var(--text-on-accent)', strokeWidth: 1, strokeLinejoin: 'round' })),
      h('span', { className: 'sp-cursor__tag' }, p.name));
  }

  /* ---------- Panel ---------- */
  function Panel(p) {
    return h('section', { className: cx('sp-panel', p.className), 'aria-label': p.title, style: p.style },
      h('header', { className: 'sp-panel__head' },
        h('h2', { className: 'sp-panel__title' }, p.title),
        p.onCollapse !== undefined ? h(IconButton, { icon: 'collapse', label: 'Collapse ' + String(p.title).toLowerCase() + ' panel', size: 'sm', onClick: p.onCollapse }) : null),
      h('div', { className: 'sp-panel__body' }, p.children));
  }
  function PanelSection(p) { return h('div', { className: cx('sp-panel__section', p.className) }, p.children); }
  function PanelRow(p) {
    return h('div', { className: cx('sp-row', p.inline && 'sp-row--inline'), role: 'group', 'aria-label': p.label },
      h('div', { className: 'sp-row__label', 'aria-hidden': 'true' }, p.label),
      h('div', { className: cx('sp-row__body', p.inline && 'sp-row__body--inline') }, p.children));
  }

  /* ---------- TransportBar ---------- */
  function TransportBar(p) {
    var playing = !!p.playing;
    var cur = p.current || '00:00:18', tot = p.total || '00:01:13';
    return h('div', { className: cx('sp-transport', p.className), role: 'toolbar', 'aria-label': 'Playback and timeline' },
      h('div', { className: 'sp-transport__l' },
        h(Button, { variant: 'ghost', size: 'sm', iconEnd: 'chevron-down', 'aria-label': 'Playback speed ' + (p.speed || '1x') }, h('span', { className: 'sp-transport__muted' }, 'Playback speed:'), ' ', p.speed || '1x'),
        h(Button, { variant: 'secondary', size: 'sm', icon: 'split', onClick: p.onSplit }, 'Split')),
      h('div', { className: 'sp-transport__c' },
        h(IconButton, { icon: 'skip-back', label: 'Jump to start', onClick: p.onPrev }),
        h(IconButton, { icon: playing ? 'pause' : 'play', label: playing ? 'Pause' : 'Play', size: 'lg', onClick: p.onPlayPause }),
        h('span', { className: 'sp-timecode', role: 'timer', 'aria-label': 'Current time ' + cur + ' of ' + tot }, cur, h('span', { className: 'sp-timecode__total' }, ' / ' + tot)),
        h(IconButton, { icon: 'skip-forward', label: 'Jump to end', onClick: p.onNext })),
      h('div', { className: 'sp-transport__r' },
        h(Button, { variant: 'ghost', size: 'sm', icon: 'volume', 'aria-label': 'Volume ' + (p.volume || '80%') }, p.volume || '80%'),
        h('span', { className: 'sp-transport__rule', 'aria-hidden': 'true' }),
        h(IconButton, { icon: 'minus', label: 'Zoom out timeline', size: 'sm' }),
        h('span', { className: 'sp-transport__zoom' }, h(Slider, { label: 'Timeline zoom', defaultValue: p.zoom != null ? p.zoom : 40 })),
        h(IconButton, { icon: 'plus', label: 'Zoom in timeline', size: 'sm' }),
        h(Button, { variant: 'ghost', size: 'sm' }, 'Fit timeline')));
  }

  /* ---------- Timeline ---------- */
  function TrackHeader(p) {
    var nm = p.name || 'Track';
    return h('div', { className: cx('sp-track-head', p.className), role: 'group', 'aria-label': nm },
      h(IconButton, { icon: 'grip', label: 'Reorder ' + nm, size: 'sm', iconSize: 16 }),
      h('span', { className: 'sp-track-head__name' }, nm),
      h(IconButton, { icon: p.locked ? 'lock' : 'unlock', label: (p.locked ? 'Unlock ' : 'Lock ') + nm, active: !!p.locked, size: 'sm', iconSize: 16, onClick: p.onToggleLock }),
      h(IconButton, { icon: p.hidden ? 'eye-off' : 'eye', label: (p.hidden ? 'Show ' : 'Hide ') + nm, active: !!p.hidden, size: 'sm', iconSize: 16, onClick: p.onToggleHidden }));
  }
  function TrackLane(p) { return h('div', { className: cx('sp-lane', p.className), style: Object.assign({ width: p.width }, p.style), role: 'group', 'aria-label': p.label }, p.children); }

  var KIND = { shape: ['shapes', 'Shape'], text: ['text', 'Text'], caption: ['captions', 'Subtitles'], video: ['video', 'Video'], audio: ['music', 'Audio'] };
  function wave(seed, n) {
    var a = seed || 7, bars = [];
    for (var i = 0; i < n; i++) {
      a = (a + 0x6D2B79F5) | 0; var t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; var r = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      var hh = 4 + r * 14; bars.push(h('rect', { key: i, x: i * 5, y: 11 - hh / 2, width: 2.5, height: hh, rx: 1.25 }));
    }
    return bars;
  }
  function Clip(p) {
    var k = KIND[p.kind] || KIND.shape, kind = KIND[p.kind] ? p.kind : 'shape';
    var o = omit(p, ['kind', 'label', 'selected', 'left', 'width', 'className', 'thumbnails', 'seed', 'style', 'children']);
    o.type = 'button';
    o.className = cx('sp-clip', 'sp-clip--' + kind, p.className);
    o['aria-pressed'] = !!p.selected;
    o['aria-label'] = p['aria-label'] || (k[1] + ' clip, ' + p.label);
    o.style = Object.assign({ left: p.left, width: p.width }, p.style);
    var body = [h(Icon, { key: 'i', name: k[0], size: 16, className: 'sp-clip__icon' })];
    if (kind === 'video') {
      body.push(h('span', { key: 't', className: 'sp-clip__thumbs', 'aria-hidden': 'true' }, (p.thumbnails || []).map(function (s, i) { return h('img', { key: i, src: s, alt: '' }); })));
    } else {
      body.push(h('span', { key: 'l', className: 'sp-clip__label' }, p.label));
      if (kind === 'audio') body.push(h('svg', { key: 'w', className: 'sp-clip__wave', width: '100%', height: 22, 'aria-hidden': 'true', preserveAspectRatio: 'none' }, wave(p.seed, Math.max(8, Math.floor(((p.width || 200) - 120) / 5)))));
    }
    if (p.selected) { body.push(h('span', { key: 'hl', className: 'sp-clip__handle sp-clip__handle--l', 'aria-hidden': 'true' })); body.push(h('span', { key: 'hr', className: 'sp-clip__handle sp-clip__handle--r', 'aria-hidden': 'true' })); }
    return h('button', o, body);
  }

  function TimelineRuler(p) {
    var secs = p.seconds || 75, px = p.pxPerSecond || 15.6, every = p.labelEvery || 5;
    var st = useState(p.time != null ? p.time : 0);
    var t = p.time != null ? p.time : st[0];
    function seek(v) { v = Math.max(0, Math.min(secs, v)); if (p.time == null) st[1](v); if (p.onSeek) p.onSeek(v); }
    function onKey(e) {
      var step = e.shiftKey ? 5 : 1;
      if (e.key === 'ArrowRight') seek(t + step); else if (e.key === 'ArrowLeft') seek(t - step);
      else if (e.key === 'Home') seek(0); else if (e.key === 'End') seek(secs); else return; e.preventDefault();
    }
    var ticks = [];
    for (var s = 0; s <= secs; s++) {
      var major = s % every === 0, x = s * px + 0.5;
      ticks.push(h('line', { key: 'l' + s, x1: x, x2: x, y1: major ? 14 : 20, y2: 28, stroke: 'currentColor', strokeWidth: 1, opacity: major ? 0.9 : 0.5 }));
      if (major) ticks.push(h('text', { key: 't' + s, x: x + 4, y: 11 }, s === 0 ? '0s' : s === 60 ? '1m' : s < 60 ? pad(s) : pad(s - 60)));
    }
    return h('div', {
      className: cx('sp-ruler', p.className), role: 'slider', tabIndex: 0, 'aria-label': 'Timeline position', 'aria-valuemin': 0, 'aria-valuemax': secs, 'aria-valuenow': Math.round(t), 'aria-valuetext': fmt(t),
      style: { width: secs * px + 1 }, onKeyDown: onKey,
      onClick: function (e) { var r = e.currentTarget.getBoundingClientRect(); seek((e.clientX - r.left) / px); }
    }, h('svg', { width: secs * px + 1, height: 28, 'aria-hidden': 'true' }, ticks));
  }
  function Playhead(p) {
    return h('div', { className: cx('sp-playhead', p.className), style: { left: p.x }, 'aria-hidden': 'true' },
      h('svg', { width: 14, height: 14, viewBox: '0 0 14 14', focusable: 'false' }, h('path', { d: 'M1 1.5h12v6L7 13 1 7.5z', fill: 'currentColor', stroke: 'currentColor', strokeWidth: 1, strokeLinejoin: 'round' })),
      h('span', { className: 'sp-playhead__line' }));
  }

  /* ---------- Canvas ---------- */
  function SelectionBox(p) {
    var hs = ['tl', 'tm', 'tr', 'ml', 'mr', 'bl', 'bm', 'br'];
    return h('div', { className: cx('sp-sel', p.className), style: Object.assign({ left: p.x, top: p.y, width: p.width, height: p.height }, p.style) },
      p.children,
      hs.map(function (k) { return h('span', { key: k, className: 'sp-sel__h sp-sel__h--' + k, 'aria-hidden': 'true' }); }));
  }
  function CaptionOverlay(p) { return h('div', { className: cx('sp-caption', p.className), style: p.style }, p.children); }

  /* ---------- Logo ---------- */
  function Logo(p) {
    var v = p.variant || 'wordmark', h2 = p.height || (v === 'wordmark' ? 36 : 40);
    var common = { className: cx('sp-logo', p.className), role: 'img', 'aria-label': 'Split', focusable: 'false' };
    if (v === 'mark') return h('svg', Object.assign({ viewBox: '0 0 56 58', height: h2, width: h2 * 56 / 58, dangerouslySetInnerHTML: { __html: LOGO.mark } }, common));
    if (v === 'app-icon') return h('svg', Object.assign({ viewBox: '0 0 256 256', height: h2, width: h2, dangerouslySetInnerHTML: { __html: LOGO.icon } }, common));
    return h('svg', Object.assign({ viewBox: LOGO.wmvb, height: h2, width: h2 * LOGO.ratio, dangerouslySetInnerHTML: { __html: LOGO.wm } }, common));
  }

  window.Split = {
    Icon: Icon, Button: Button, IconButton: IconButton, ToolRail: ToolRail, ToolRailItem: ToolRailItem, Field: Field, Select: Select,
    SegmentedControl: SegmentedControl, ColorField: ColorField, Slider: Slider, Avatar: Avatar, AvatarStack: AvatarStack, CursorLabel: CursorLabel,
    Panel: Panel, PanelSection: PanelSection, PanelRow: PanelRow, TransportBar: TransportBar, TrackHeader: TrackHeader, TrackLane: TrackLane,
    Clip: Clip, TimelineRuler: TimelineRuler, Playhead: Playhead, SelectionBox: SelectionBox, CaptionOverlay: CaptionOverlay, Logo: Logo
  };
})();
