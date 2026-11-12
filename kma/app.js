const $ = id => document.getElementById(id);
let key = localStorage.getItem('kma-key') || '';
let state, revision = 0, busy = false;
const dialog = $('dialog');
const body = $('dialogBody');
const seasons = {winter:'❄', spring:'✿', summer:'☀', autumn:'🍂'};
const describe = o => [o.size + ' ' + o.temp + ' ' + o.drink, o.milk, o.extras].filter(Boolean).join(' · ');
function notice(message) {
  $('notice').textContent = message;
  $('notice').hidden = !message;
}
function node(tag, text) {
  const element = document.createElement(tag);
  if (text) element.textContent = text;
  return element;
}
function button(text, click, secondary = false) {
  const element = node('button', text);
  element.type = 'button';
  if (secondary) element.className = 'secondary';
  element.onclick = click;
  return element;
}
async function request(payload, credential = key) {
  const response = await fetch('/api', {
    method: payload ? 'POST' : 'GET',
    headers: {'Authorization': 'Bearer ' + credential, 'Content-Type': 'application/json'},
    body: payload ? JSON.stringify(payload) : undefined
  });
  const result = await response.json();
  if (!response.ok) throw Object.assign(new Error(result.error), {status: response.status});
  return result;
}
function remember(value) {
  localStorage.setItem('kma-key', value);
  key = value;
}
async function mutate(payload, message, close = false) {
  if (busy) return;
  busy = true;
  revision++;
  try {
    state = await request(payload);
    if (state.key) remember(state.key);
    if (close && dialog.open) dialog.close();
    render();
    notice(message);
    if (payload.action === 'register') profile();
  } catch (error) {
    if (dialog.open) body.querySelector('[role="alert"]').textContent = error.message;
    else notice(error.message);
  } finally {
    busy = false;
  }
}
async function refresh(initial = false) {
  if (busy || !key) {
    if (initial) render();
    return;
  }
  const current = ++revision;
  try {
    const fresh = await request();
    if (revision !== current) return;
    if (JSON.stringify(state) !== JSON.stringify(fresh) || initial) {
      state = fresh;
      render();
    } else updateDeadline();
  } catch (error) {
    if (revision !== current) return;
    if (initial) {
      render();
      notice(error.message);
    }
  }
}
function open(title, html) {
  $('dialogTitle').textContent = title;
  body.innerHTML = html + '<p role="alert"></p>';
  if (!dialog.open) dialog.showModal();
}
function profile() {
  open('My profile', '<p id="person"></p><label>Team season<select id="theme"><option value="winter">Winter</option><option value="spring">Spring</option><option value="summer">Summer</option><option value="autumn">Autumn</option></select></label><details><summary>Recovery key</summary><p>Keep this key private. Use it to restore your profile on another device.</p><input id="recovery" aria-label="Recovery key" readonly></details>');
  $('person').textContent = state.me.name;
  $('theme').value = state.theme;
  $('theme').onchange = event => mutate({action:'theme', theme:event.target.value}, 'Team theme updated.', true);
  $('recovery').value = key;
}
function editor(action, run) {
  open(action === 'favorite' ? 'Edit your favorite' : 'Edit your run order', `<form id="orderForm">
    <label>Drink<input name="drink" placeholder="e.g. Caramel Brûlée Latte" maxlength="100" required></label>
    <label>Size<select name="size"><option>Short</option><option>Tall</option><option selected>Grande</option><option>Venti</option><option>Trenta</option></select></label>
    <label>Temperature<select name="temp"><option>Hot</option><option>Iced</option></select></label>
    <label>Milk<input name="milk" placeholder="e.g. Oat milk" maxlength="60"></label>
    <label>Customizations<textarea name="extras" rows="2" placeholder="e.g. Two pumps, no whip" maxlength="240"></textarea></label>
    <button>${action === 'favorite' ? 'Save favorite' : 'Save run order'}</button></form>`);
  const form = $('orderForm');
  const existing = run?.myOrder || state.me.favorite;
  if (existing) for (const [field, value] of Object.entries(existing)) form.elements.namedItem(field).value = value;
  form.onsubmit = event => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(form));
    mutate(run ? {action, id:run.id, order:values} : {action, ...values},
      run ? 'Your run order is saved.' : 'Your favorite is saved.', true);
  };
}
function start() {
  open('Start a coffee run', '<form id="startForm"><label>Order deadline (optional)<input id="deadline" type="datetime-local"></label><button>Open coffee run</button></form>');
  $('startForm').onsubmit = event => {
    event.preventDefault();
    const value = $('deadline').value;
    mutate({action:'start', deadline:value ? Math.floor(new Date(value).getTime()/1000) : null}, 'Coffee run opened.', true);
  };
}
async function copyList(run) {
  const lines = ['KMA Coffee Run', ...run.orders.map((o, i) => `${i+1}. ${o.name} — ${describe(o)}`)].join('\n');
  try {
    await navigator.clipboard.writeText(lines);
    notice('Order list copied.');
  } catch {
    open('Copy the order list', '<label>Consolidated orders<textarea id="copyText" rows="8" readonly></textarea></label>');
    $('copyText').value = lines;
    $('copyText').select();
  }
}
function expired(run) {
  return run.deadline && Date.now() >= run.deadline * 1000;
}
function updateDeadline() {
  const run = state?.run;
  const status = $('runStatus');
  if (run && status && !run.closed && expired(run) && status.dataset.expired !== 'true') render();
}
function render() {
  $('login').hidden = !!state;
  $('dashboard').hidden = !state;
  $('profile').hidden = !state;
  if (!state) return;
  const {me, theme, run} = state;
  document.documentElement.dataset.theme = theme;
  $('season').textContent = seasons[theme] + ' ' + theme.toUpperCase();
  $('favorite').textContent = me.favorite ? describe(me.favorite) : 'Save your usual order to join future runs in one tap.';
  $('editFavorite').textContent = me.favorite ? 'Edit favorite' : 'Add favorite';
  const target = $('run');
  target.replaceChildren();
  const actions = node('div');
  actions.className = 'actions';
  if (!run) {
    target.append(node('p', 'No coffee run yet.'), actions);
    actions.append(button('Start a run', start));
    return;
  }
  const late = expired(run);
  const status = node('p', run.closed ? 'Closed' : late ? 'Deadline passed' : 'Taking orders');
  status.id = 'runStatus';
  status.dataset.expired = String(!!late);
  target.append(status, node('p', 'Organized by ' + run.organizer));
  if (run.deadline) target.append(node('p', 'Order by ' + new Date(run.deadline * 1000).toLocaleString([], {dateStyle:'medium', timeStyle:'short'})));
  if (run.myOrder) target.append(node('p', 'Your order · ' + describe(run.myOrder)));
  if (!run.closed && !late) {
    if (!run.myOrder && me.favorite) actions.append(button('Join with favorite', () => mutate({action:'join', id:run.id}, 'You joined the run.')));
    actions.append(button(run.myOrder ? 'Edit order' : 'Enter order', () => editor('join', run), !run.myOrder && !!me.favorite));
    if (run.myOrder) actions.append(button('Leave run', () => mutate({action:'leave', id:run.id}, 'You left the run.'), true));
  }
  if (run.closed) actions.append(button('Start a run', start));
  target.append(actions, node('p', run.orders.length + (run.orders.length === 1 ? ' order' : ' orders')));
  if (run.orders.length) {
    const list = node('ol');
    for (const entry of run.orders) list.append(node('li', entry.name + ' — ' + describe(entry)));
    target.append(list);
  }
  if (run.mine) {
    const organizer = node('div');
    organizer.className = 'actions';
    if (run.orders.length) organizer.append(button('Copy order list', () => copyList(run)));
    if (!run.closed) organizer.append(button('Close run', () => {
      open('Close this run?', '<p>Team members will stop adding or editing orders.</p>');
      body.append(button('Close run', () => mutate({action:'close', id:run.id}, 'Run closed.', true)));
    }, true));
    target.append(organizer);
  }
}
$('dismiss').onclick = () => dialog.close();
$('profile').onclick = profile;
$('editFavorite').onclick = () => editor('favorite');
$('signup').onsubmit = event => {
  event.preventDefault();
  mutate({action:'register', ...Object.fromEntries(new FormData(event.target))}, 'Profile created.');
};
$('restore').onsubmit = async event => {
  event.preventDefault();
  const value = event.target.elements.key.value.trim();
  try {
    const restored = await request(null, value);
    remember(value);
    state = restored;
    render();
    notice('Profile restored.');
  } catch (error) {
    notice(error.message);
  }
};
refresh(true);
setInterval(refresh, 4000);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) refresh();
});
