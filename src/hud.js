// DOM heads-up display. Everything here is display only; game state lives in the client.
import { WEAPONS } from '../shared/weapons.js';

const $ = (id) => document.getElementById(id);

function esc(s) {
  const d = document.createElement('span');
  d.textContent = s;
  return d.innerHTML;
}

export class Hud {
  constructor() {
    this.el = {
      hud: $('hud'), hp: $('hp'), mag: $('mag'), reserve: $('reserve'), weaponName: $('weaponName'),
      timer: $('timer'), myKills: $('myKills'), leader: $('leader'), killfeed: $('killfeed'),
      chatlog: $('chatlog'), chatbox: $('chatbox'), chatInput: $('chatInput'), crosshair: $('crosshair'),
      hitmarker: $('hitmarker'), damageRing: $('damageRing'), scope: $('scope'), aimName: $('aimName'),
      death: $('death'), deathBy: $('deathBy'), deathTimer: $('deathTimer'), scoreboard: $('scoreboard'),
      sbBody: $('sbBody'), sbTimer: $('sbTimer'), loadout: $('loadout'), matchEnd: $('matchEnd'),
      meWinner: $('meWinner'), meList: $('meList'), meNext: $('meNext'), ping: $('ping'),
      reloadBar: $('reloadBar'), toast: $('toast'), slot1: $('slot1'), slot2: $('slot2'), slot3: $('slot3'),
      xhPreview: $('xhPreview'), votePanel: $('votePanel'), voteTitle: $('voteTitle'), voteSub: $('voteSub'), voteCount: $('voteCount'),
    };
    this.lastHp = -1;
    this.lastAmmo = '';
    this.lastTimer = '';
    this.xh = { style: 'dynamic', gap: 4 };
  }

  show(on) {
    this.el.hud.classList.toggle('hidden', !on);
  }

  setHp(hp) {
    if (hp === this.lastHp) return;
    this.lastHp = hp;
    this.el.hp.textContent = Math.max(0, Math.round(hp));
    this.el.hp.parentElement.classList.toggle('low', hp <= 25);
  }

  /** slot: 1 primary, 2 pistol, 3 knife */
  setAmmo(weaponId, mag, reserve, slot) {
    const key = `${weaponId}|${mag}|${reserve}|${slot}`;
    if (key === this.lastAmmo) return;
    this.lastAmmo = key;
    this.el.weaponName.textContent = WEAPONS[weaponId].name.toUpperCase();
    const knife = slot === 3;
    this.el.mag.textContent = knife ? '—' : mag;
    this.el.reserve.parentElement.style.display = knife ? 'none' : '';
    this.el.reserve.textContent = reserve;
    this.el.mag.parentElement.classList.toggle('empty', !knife && mag === 0);
    this.el.slot1.classList.toggle('on', slot === 1);
    this.el.slot2.classList.toggle('on', slot === 2);
    this.el.slot3.classList.toggle('on', slot === 3);
  }

  setTimer(seconds) {
    const s = Math.max(0, Math.ceil(seconds));
    const txt = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    if (txt === this.lastTimer) return;
    this.lastTimer = txt;
    this.el.timer.textContent = txt;
    this.el.timer.classList.toggle('low', s <= 30);
    this.el.sbTimer.textContent = txt;
  }

  setScores(myKills, leaderName, leaderKills) {
    this.el.myKills.textContent = myKills;
    this.el.leader.textContent = leaderName ? `${leaderName} · ${leaderKills}` : '—';
  }

  /** Apply the player's crosshair settings to the HUD crosshair and the settings preview. */
  applyCrosshair(cfg) {
    this.xh = cfg;
    for (const el of [this.el.crosshair, this.el.xhPreview]) {
      if (!el) continue;
      el.style.setProperty('--xh-color', cfg.color);
      el.style.setProperty('--len', `${cfg.len}px`);
      el.style.setProperty('--th', `${cfg.th}px`);
      el.style.setProperty('--gap', `${cfg.gap}px`);
      el.style.setProperty('--xh-alpha', cfg.alpha);
      el.style.setProperty('--xh-outline', cfg.outline ? '0 0 0 1px rgba(0, 0, 0, 0.75)' : 'none');
      el.classList.toggle('with-dot', cfg.dot || cfg.len === 0);
      el.classList.toggle('no-lines', cfg.len === 0);
    }
  }

  /** spreadPx: extra gap from current inaccuracy (ignored for a static crosshair). */
  setCrosshair(spreadPx, sniper) {
    const extra = this.xh.style === 'static' ? 0 : spreadPx;
    this.el.crosshair.style.setProperty('--gap', `${Math.round(Math.min(80, this.xh.gap + extra))}px`);
    this.el.crosshair.classList.toggle('sniper', sniper);
  }

  /** Vote panel; v = server vote info or null. */
  vote(v, voted, secondsLeft) {
    this.el.votePanel.classList.toggle('hidden', !v);
    if (!v) return;
    this.el.voteTitle.textContent = v.kind === 'kickbots' ? 'Vote: kick all bots?' : 'Vote: bring the bots back?';
    this.el.voteSub.textContent = `Called by ${v.by} · ${Math.max(0, Math.ceil(secondsLeft))}s left`;
    this.el.voteCount.textContent = `Yes ${v.yes} · No ${v.no} · needs ${v.need}`;
    this.el.votePanel.classList.toggle('voted', voted);
  }

  setScope(on) {
    this.el.scope.classList.toggle('on', on);
    this.el.crosshair.style.visibility = on ? 'hidden' : 'visible';
  }

  hitmarker(headshot, kill) {
    const h = this.el.hitmarker;
    h.classList.remove('show', 'hs', 'kill');
    void h.offsetWidth;
    if (headshot) h.classList.add('hs');
    if (kill) h.classList.add('kill');
    h.classList.add('show');
  }

  damageFrom(angle) {
    const a = document.createElement('div');
    a.className = 'dmg-arc';
    a.style.transform = `rotate(${angle}rad)`;
    this.el.damageRing.appendChild(a);
    setTimeout(() => a.remove(), 1000);
  }

  toast(text, kind = '') {
    const t = this.el.toast;
    t.className = '';
    void t.offsetWidth;
    t.textContent = text;
    t.className = `show ${kind}`;
  }

  aimName(name) {
    if (name) this.el.aimName.textContent = name;
    this.el.aimName.classList.toggle('show', !!name);
  }

  reload(progress) {
    const on = progress !== null;
    this.el.reloadBar.classList.toggle('on', on);
    if (on) this.el.reloadBar.firstElementChild.style.width = `${Math.round(progress * 100)}%`;
  }

  ping(ms, offline) {
    this.el.ping.textContent = offline ? 'OFFLINE PRACTICE' : `PING ${Math.round(ms)} ms`;
  }

  killfeed(killer, victim, weaponId, headshot, mine) {
    const row = document.createElement('div');
    row.className = `kf${mine ? ' me' : ''}`;
    const w = WEAPONS[weaponId]?.name || '';
    row.innerHTML = `${killer ? `<span class="k">${esc(killer)}</span>` : ''}<span class="w">${esc(w)}</span>${headshot ? '<span class="hs">◉ HS</span>' : ''}<span class="v">${esc(victim)}</span>`;
    this.el.killfeed.prepend(row);
    while (this.el.killfeed.children.length > 6) this.el.killfeed.lastChild.remove();
    setTimeout(() => row.remove(), 6000);
  }

  chat(name, text, sys = false) {
    const row = document.createElement('div');
    row.className = `chatline${sys ? ' sys' : ''}`;
    row.innerHTML = sys ? esc(text) : `<b>${esc(name)}:</b> ${esc(text)}`;
    this.el.chatlog.appendChild(row);
    while (this.el.chatlog.children.length > 8) this.el.chatlog.firstChild.remove();
  }

  openChat(on) {
    this.el.chatbox.classList.toggle('hidden', !on);
    this.el.chatlog.classList.toggle('open', on);
    if (on) {
      this.el.chatInput.value = '';
      this.el.chatInput.focus();
    } else {
      this.el.chatInput.blur();
    }
  }

  death(on, killerName, weaponId, headshot) {
    this.el.death.classList.toggle('hidden', !on);
    if (on) {
      const w = WEAPONS[weaponId]?.name || '';
      this.el.deathBy.innerHTML = killerName
        ? `by <b>${esc(killerName)}</b> · ${esc(w)}${headshot ? ' · <span class="hs">headshot</span>' : ''}`
        : '';
    }
  }

  deathTimer(seconds) {
    this.el.deathTimer.textContent = seconds > 0 ? `Respawning in ${seconds.toFixed(1)}s` : 'Respawning…';
  }

  scoreboard(on, rows, myId) {
    this.el.scoreboard.classList.toggle('hidden', !on);
    if (!on) return;
    this.el.sbBody.innerHTML = rows
      .map((p, i) => {
        const hs = p.kills ? Math.round((p.hs / p.kills) * 100) : 0;
        const cls = [p.id === myId ? 'me' : '', p.alive ? '' : 'dead'].join(' ');
        return `<tr class="${cls}"><td>${i + 1}</td><td class="l">${esc(p.name)}${p.bot ? '<span class="bot">BOT</span>' : ''}</td><td>${p.kills}</td><td>${p.deaths}</td><td>${hs}%</td><td>${p.bot ? '—' : p.ping}</td></tr>`;
      })
      .join('');
  }

  loadout(on) {
    this.el.loadout.classList.toggle('hidden', !on);
  }

  matchEnd(on, results, myId, nextIn) {
    this.el.matchEnd.classList.toggle('hidden', !on);
    if (!on) return;
    const top = results[0];
    this.el.meWinner.innerHTML = top ? `Winner: <b>${esc(top.name)}</b> with ${top.kills} kills` : '';
    this.el.meList.innerHTML = results
      .slice(0, 8)
      .map((p) => `<li class="${p.id === myId ? 'me' : ''}">${esc(p.name)} — ${p.kills} / ${p.deaths}</li>`)
      .join('');
    this.el.meNext.textContent = `Next match in ${Math.max(0, Math.ceil(nextIn))}s`;
  }
}
