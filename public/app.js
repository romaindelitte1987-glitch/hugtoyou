import { actions, zones, decisionMs } from "./rules.js";
import qrcode from "./vendor/qrcode.mjs";

const app = document.querySelector("#app");
const feedback = document.querySelector("#feedback");
const hash = new URLSearchParams(location.hash.slice(1));
const id = hash.get("salon");
let key = hash.get("joueur");
const pendingKeyName = "participant:" + id + ":" + key;
let participantKey = id && key ? sessionStorage.getItem(pendingKeyName) : null;
let state;
let signature = "";
let offset = 0;
let draft = false;
let stopped = false;
let pollTimer;
let feedbackTimer;
let polling = false;
let submitting = false;
let disconnected = false;
let appliedRequest = 0;
let requestNumber = 0;

const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({
  "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"
})[c]);
const button = (action, label, css = "") =>
  '<button type="button" class="' + css + '" data-action="' + action + '">' + label + '</button>';
const show = html => { app.innerHTML = html; };
const panel = (html, css = "") => '<section class="card ' + css + '">' + html + '</section>';
const url = (room, access) => location.origin + "/#salon=" + room + "&joueur=" + access;
const lastSeconds = (until, now) => Math.max(0, Math.ceil((until - now) / 1000));
const clock = seconds => Math.floor(seconds / 60).toString().padStart(2, "0") + ":" + (seconds % 60).toString().padStart(2, "0");

function notify(text, sticky = false) {
  clearTimeout(feedbackTimer);
  feedback.textContent = text;
  if (!sticky) feedbackTimer = setTimeout(() => { feedback.textContent = ""; }, 5000);
}

async function api(action, fields) {
  const response = await fetch("/api", {
    method:"POST", headers:{"content-type":"application/json"}, signal:AbortSignal.timeout(5000),
    body: JSON.stringify({ id, key, action, participantKey, ...fields })
  });
  const data = await response.json();
  if (!response.ok) throw Object.assign(new Error(data.error), { status: response.status });
  return data;
}

function schedule(ms) {
  clearTimeout(pollTimer);
  if (!stopped && state?.phase !== "ended" && id && key) pollTimer = setTimeout(poll, ms);
}

function apply(data, start, number) {
  if (number < appliedRequest) return;
  appliedRequest = number;
  if (data.participantKey) {
    key = data.participantKey;
    history.replaceState(null, "", url(id, key));
    sessionStorage.removeItem(pendingKeyName);
    participantKey = null;
  }
  state = data;
  offset = data.now - (start + Date.now()) / 2;
  render();
  timers();
}

async function poll() {
  if (submitting || polling) return schedule(200);
  polling = true;
  const number = ++requestNumber;
  const start = Date.now();
  try {
    apply(await api("state"), start, number);
    if (disconnected) notify("");
    disconnected = false;
  } catch (error) {
    if (number < requestNumber) return;
    if (error.status === 404) {
      stopped = true;
      notify("");
      show(panel('<h1>Lien expiré</h1><p>Cette invitation a expiré ou a déjà été utilisée. Demande un lien valide à la personne qui t’invite.</p><a class="button" href="/">Accueil</a>', "centered"));
    } else {
      disconnected = true;
      notify("Connexion interrompue. Reconnexion en cours…", true);
    }
  } finally {
    polling = false;
    schedule(document.hidden ? 3000 : 780);
  }
}

async function send(action, fields = {}) {
  if (submitting || stopped) return;
  submitting = true;
  const number = ++requestNumber;
  const start = Date.now();
  try {
    const result = await api(action, fields);
    if (action === "choices") draft = false;
    disconnected = false;
    notify(action === "choices" ? "Choix enregistrés." : "");
    apply(result, start, number);
  } catch (error) {
    notify(error.status ? error.message : "Connexion interrompue. Réessaie dans un instant.");
  } finally {
    submitting = false;
    schedule(200);
  }
}

function landing() {
  show(panel('<div class="art" aria-hidden="true"><span class="heart">♥</span><span class="star">✦</span><span class="star">✧</span></div>' +
    '<h1>HugToYou</h1><p>Choisissez ce que vous aimez donner et recevoir. Puis, à vous de lancer les dés.</p>' +
    button("create", "Créer un salon privé", "primary") + '<small>2 personnes · 30 minutes · Sur invitation</small>', "hero centered"));
}

function join() {
  show(panel('<p class="eyebrow">SALON PRIVÉ</p><h1>Ton prénom</h1><p>Il sera visible par l’autre personne.</p>' +
    '<form id="join"><label for="name">Prénom</label><input id="name" name="name" type="text" autocomplete="given-name" required maxlength="48">' +
    '<button class="primary">Entrer dans le salon</button></form>', "centered"));
}

const choiceModes = {
  both: { label: "Donner et recevoir", next: "receive", icon: '<svg aria-hidden="true" viewBox="0 0 16 16" fill="currentColor"><path fill-rule="evenodd" d="M11.5 15a.5.5 0 0 0 .5-.5V2.707l3.146 3.147a.5.5 0 0 0 .708-.708l-4-4a.5.5 0 0 0-.708 0l-4 4a.5.5 0 1 0 .708.708L11 2.707V14.5a.5.5 0 0 0 .5.5m-7-14a.5.5 0 0 1 .5.5v11.793l3.146-3.147a.5.5 0 0 1 .708.708l-4 4a.5.5 0 0 1-.708 0l-4-4a.5.5 0 0 1 .708-.708L4 13.293V1.5a.5.5 0 0 1 .5-.5"/></svg>' },
  receive: { label: "Recevoir", next: "give", icon: '<svg aria-hidden="true" viewBox="0 0 16 16" fill="currentColor"><path fill-rule="evenodd" d="M.172 15.828a.5.5 0 0 0 .707 0l4.096-4.096V14.5a.5.5 0 1 0 1 0v-3.975a.5.5 0 0 0-.5-.5H1.5a.5.5 0 0 0 0 1h2.768L.172 15.121a.5.5 0 0 0 0 .707M15.828.172a.5.5 0 0 0-.707 0l-4.096 4.096V1.5a.5.5 0 1 0-1 0v3.975a.5.5 0 0 0 .5.5H14.5a.5.5 0 0 0 0-1h-2.768L15.828.879a.5.5 0 0 0 0-.707"/></svg>' },
  give: { label: "Donner", next: "both", icon: '<svg aria-hidden="true" viewBox="0 0 16 16" fill="currentColor"><path fill-rule="evenodd" d="M5.828 10.172a.5.5 0 0 0-.707 0l-4.096 4.096V11.5a.5.5 0 0 0-1 0v3.975a.5.5 0 0 0 .5.5H4.5a.5.5 0 0 0 0-1H1.732l4.096-4.096a.5.5 0 0 0 0-.707m4.344-4.344a.5.5 0 0 0 .707 0l4.096-4.096V4.5a.5.5 0 1 0 1 0V.525a.5.5 0 0 0-.5-.5H11.5a.5.5 0 0 0 0 1h2.768l-4.096 4.096a.5.5 0 0 0 0 .707"/></svg>' },
  none: { label: "Aucun choix enregistré pour cette action", next: "both", icon: '<span aria-hidden="true">—</span>' }
};

function choiceLabel(label, mode) {
  return label + " · " + choiceModes[mode].label;
}

function choices({ give, take, saved }) {
  const legend = ["both", "receive", "give"].map(mode => {
    const { icon, label } = choiceModes[mode];
    return "<li>" + icon + "<span>" + label + "</span></li>";
  }).join("");
  const header = actions.map(([action]) => '<th scope="col">' + action + '</th>').join("");
  const rows = zones.map(([zone], row) => {
    const cells = actions.map(([action], column) => {
      const value = row * actions.length + column;
      const gives = !saved || give.includes(value);
      const receives = !saved || take.includes(value);
      const mode = gives ? (receives ? "both" : "give") : (receives ? "receive" : "none");
      const label = zone + " · " + action;
      return '<td><button type="button" class="choice-toggle" data-action="cycle-choice" data-choice="' +
        value + '" data-label="' + esc(label) + '" data-mode="' + mode + '" aria-label="' +
        esc(choiceLabel(label, mode)) + '">' + choiceModes[mode].icon + '</button></td>';
    }).join("");
    return '<tr><th scope="row">' + zone + '</th>' + cells + '</tr>';
  }).join("");
  return '<ul class="choice-legend" aria-label="Légende des icônes">' + legend + '</ul>' +
    '<table class="choice-table" aria-label="Choix par zone et par action"><thead><tr><th scope="col">Zone</th>' +
    header + '</tr></thead><tbody>' + rows + '</tbody></table>';
}

function cycleChoice(control) {
  const mode = choiceModes[control.dataset.mode].next;
  control.dataset.mode = mode;
  control.innerHTML = choiceModes[mode].icon;
  control.setAttribute("aria-label", choiceLabel(control.dataset.label, mode));
  draft = true;
  lobbyStatus();
}

function selectedChoices(form) {
  const give = [];
  const take = [];
  for (const control of form.querySelectorAll("[data-choice]")) {
    const { choice, mode } = control.dataset;
    if (mode === "both" || mode === "give") give.push(Number(choice));
    if (mode === "both" || mode === "receive") take.push(Number(choice));
  }
  return { give, take };
}

const description = player => !player ? "En attente" : player.ready ? "Prêt à jouer" : player.saved ? "Choix validés" : "Dans le salon";

function lobbyStatus() {
  const { me, other, compatible } = state;
  document.querySelector("#self-status").textContent = description(me);
  document.querySelector("#other-status").textContent = description(other);
  const ready = document.querySelector('[data-action="ready"]');
  if (!ready) return;
  ready.disabled = draft || me.ready || !compatible;
  ready.textContent = me.ready && !draft ? "En attente de " + other.name : "HugToYou";
  document.querySelector("#lobby-hint").textContent = draft || !me.saved
    ? "Appuie sur une icône pour changer ton choix, puis valide le tableau."
    : !other.saved ? "En attente des choix de " + other.name + "."
    : compatible ? "Appuyez tous les deux sur HugToYou pour démarrer."
    : "Il faut au moins une mission compatible dans chaque sens. Ajustez vos choix.";
}

function invitation(invite, now) {
  if (!invite) return "";
  if (invite.expiresAt <= now) {
    return '<div class="invite"><p>L’invitation a expiré.</p>' +
      button("renew-invite", "Créer une nouvelle invitation") + '</div>';
  }
  const link = url(id, invite.key);
  const qr = qrcode(0, "M");
  qr.addData(link);
  qr.make();
  return '<div class="invite"><h2>Inviter l’autre personne</h2>' +
    '<div class="invite-qr">' + qr.createSvgTag({ scalable: true, title: "QR code d’invitation à scanner" }) + '</div>' +
    '<p>Scanne ce code avec l’autre téléphone ou partage le lien.</p>' +
    '<label for="invite">Lien privé</label><input type="text" id="invite" readonly value="' + esc(link) + '">' +
    button("copy", "Copier le lien") + '<p>Invitation à usage unique · expire dans <time id="invite-clock"></time></p></div>';
}

function lobby(now) {
  const { me, other, invite } = state;
  const link = invitation(invite, now);
  const form = other ? '<form id="choices"><h2>Mes choix avec ' + esc(other.name) + '</h2><p id="lobby-hint"></p>' +
    choices(me) +
    '<div class="buttons"><button>Valider mes choix</button>' + button("ready", "HugToYou", "primary") + '</div></form>' : "";
  show(panel('<p class="eyebrow">SALON PRIVÉ</p><h1>À deux</h1><ul class="players"><li>' + esc(me.name) +
    ' (toi)<small id="self-status"></small></li><li>' + esc(other?.name ?? "Autre personne") +
    '<small id="other-status"></small></li></ul>' + link + form));
  lobbyStatus();
}

function dice(values = ["?", "?", "?"], rolling = false) {
  return '<div class="dice' + (rolling ? " rolling" : "") + '">' +
    ["Zone", "Action", "Durée"].map((name, index) => '<div class="die"><small>' + name + '</small><b>' + esc(values[index]) + '</b></div>').join("") +
    '</div>';
}

function count(value, max, icon, label, css = "") {
  return '<span role="img" aria-label="' + value + ' ' + label + '" class="' + css + '">' +
    icon.repeat(value) + '<span class="spent">' + icon.repeat(max - value) + '</span></span>';
}

function game(now) {
  const { phase, mine, me, other, mission, reveal, turnName } = state;
  const stop = button("stop", "Arrêter la partie", "stop");
  if (!mine && now >= reveal) {
    show(panel('<div class="heart" aria-hidden="true">♥</div><h1>HugToMe</h1>', "centered waiting") + stop);
    return;
  }
  const header = '<div class="gamehead"><span>Partie en cours</span><time id="game-clock"></time></div>';
  const stats = mine ? '<div class="stats">' + count(me.hearts, 3, "♥", "cœurs") +
    count(me.gems, 2, "◆", "pierres", "gems") + '</div>' : "";
  const note = state.note ? '<p>' + esc(state.note) + '</p>' : "";
  let html;
  if (phase === "turn" || !mine) {
    html = '<p class="eyebrow">AU TOUR DE</p><h1>' + esc(turnName) + '</h1>' + dice() +
      (mine && now >= reveal ? button("roll", "Lancer les dés", "primary") : "");
  } else if (phase === "decision" && now < mission.reveal) {
    html = '<h2>Les dés tournent…</h2>' + dice(undefined, true);
  } else {
    const [zone, part] = zones[Math.floor(mission.choice / actions.length)];
    const [verb, command] = actions[mission.choice % actions.length];
    const name = other.name;
    const of = /^[aeiouyéèêëàâäîïôöùûüœ]/iu.test(name) ? " d’" : " de ";
    const phrase = command + " " + part + of + name + " pendant " + mission.seconds + " secondes.";
    html = '<p class="eyebrow">' + (phase === "active" ? "MISSION EN COURS" : "TA MISSION") + '</p><h2>' + esc(phrase) + '</h2>' +
      dice([zone, verb, mission.seconds + " s"]) + '<div class="time"><span id="mission-clock"></span> s</div>' +
      '<progress id="progress" value="0" max="1" aria-label="Temps restant"></progress>';
    if (phase === "decision") {
      html += '<div class="buttons">' + button("accept", "Accepter", "primary") + button("pass", "Passer · 1 cœur") +
        (me.gems ? button("reroll", "Relancer · 1 pierre", "gems") : "") + '</div>';
    }
  }
  show(panel(header + stats + html + note, "centered") + stop);
}

function render() {
  if (!state) return;
  const now = Date.now() + offset;
  const next = JSON.stringify([Boolean(state.me), state.phase, state.other?.name, state.turnId,
    now >= state.reveal, now >= (state.mission?.reveal ?? 0), state.note,
    state.invite?.key, state.invite && now >= state.invite.expiresAt]);
  if (next === signature) {
    if (state.me && state.phase === "lobby") lobbyStatus();
    return;
  }
  signature = next;
  if (!state.me) join();
  else if (state.phase === "lobby") lobby(now);
  else if (state.phase === "ended") {
    show(panel('<h1>Partie terminée</h1><p>' + esc(state.note) + '</p><a href="/" class="button">Retour à l’accueil</a>', "centered"));
  } else game(now);
}

function timers() {
  const now = Date.now() + offset;
  const inviteClock = document.querySelector("#invite-clock");
  if (inviteClock) inviteClock.textContent = clock(lastSeconds(state.invite.expiresAt, now));
  const gameClock = document.querySelector("#game-clock");
  if (gameClock) gameClock.textContent = clock(lastSeconds(state.end, now));
  const missionClock = document.querySelector("#mission-clock");
  if (!missionClock) return;
  const { mission, phase, end } = state;
  const limit = phase === "decision" ? Math.min(mission.until, end) : mission.until;
  missionClock.textContent = lastSeconds(limit, now);
  document.querySelector("#progress").value = Math.max(0, Math.min(1,
    (limit - now) / (phase === "decision" ? decisionMs : mission.seconds * 1000)));
}

app.addEventListener("submit", event => {
  event.preventDefault();
  if (event.target.id === "join") {
    const data = new FormData(event.target);
    if (state.needsParticipantKey && !participantKey) {
      participantKey = Array.from(crypto.getRandomValues(new Uint8Array(16)), byte =>
        byte.toString(16).padStart(2, "0")).join("");
      sessionStorage.setItem(pendingKeyName, participantKey);
    }
    send("join", { name: data.get("name") });
  } else if (event.target.id === "choices") {
    send("choices", selectedChoices(event.target));
  }
});
app.addEventListener("click", async event => {
  const target = event.target.closest("button[data-action]");
  if (!target) return;
  const { action } = target.dataset;
  if (action === "cycle-choice") {
    if (!submitting) cycleChoice(target);
  } else if (action === "create") {
    target.disabled = true;
    try {
      const room = await api("create");
      location.assign(url(room.id, room.key));
    } catch {
      notify("Impossible de créer le salon pour le moment.");
      target.disabled = false;
    }
  } else if (action === "copy") {
    const field = document.querySelector("#invite");
    try {
      await navigator.clipboard.writeText(field.value);
      notify("Lien copié.");
    } catch {
      field.select();
      notify("Lien sélectionné. Tu peux le copier.");
    }
  } else {
    send(action, { turnId: state.turnId });
  }
});
window.addEventListener("hashchange", () => location.reload());
document.addEventListener("visibilitychange", () => { if (!document.hidden) schedule(0); });
if (id && key) {
  poll();
  setInterval(() => {
    if (stopped || !state || state.phase === "ended" || (state.phase === "lobby" && !state.invite)) return;
    render();
    timers();
  }, 100);
} else landing();
