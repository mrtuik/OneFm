// Offline tests for the story engine (no network, no model). Run: npm run test:engine
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');
const assert = require('assert');

// Load .ts files from src/ without a build step. Native / Firebase modules are stubbed.
require.extensions['.ts'] = (m, file) => {
  const out = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } });
  m._compile(out.outputText, file);
};
const origLoad = Module._load;
Module._load = function (req, ...rest) {
  if (/brain\/brain|data\/samples|firebase|async-storage|ai\/secure|^\.\/local$/.test(req)) return { brainBlock: () => '', SAMPLE_STORIES: [] };
  return origLoad.call(this, req, ...rest);
};
const P = require(path.join(__dirname, '../src/ai/prompts.ts'));

const story = {
  id: 's1', title: 'Roommate', language: 'hi', genres: ['Campus'], logline: 'x', episodes: [{ goal: 'Meet the roommates' }],
  plotBeats: ['Arrival', 'Secret slips'],
  characters: [
    { name: 'Kabir', role: 'funny roommate', relationshipToUser: 'teases you' },
    { name: 'Dhruv', role: 'practical roommate' },
    { name: 'Yuvraj', role: 'gamer roommate' },
    { name: 'Siddharth Singhania', role: 'sarcastic roommate' },
    { name: 'Ayaan', role: 'the user' },
  ],
};
const chatBase = { storyId: 's1', ep: 1, epCount: 4, userRole: 'Ayaan', messages: [], episodeSummaries: [], rollingSummary: '', facts: [] };
const ai = (text, extra = {}) => ({ id: Math.random() + '', role: 'ai', text, ep: 1, ...extra });
const user = (text) => ({ id: Math.random() + '', role: 'user', text, ep: 1 });
let n = 0;
const test = (name, fn) => { fn(); n++; console.log('ok  ' + name); };

test('speakers: the character the user names answers first, max 3', () => {
  const sp = P.pickSpeakers(story, chatBase, 'Siddharth se poochho kaun hai woh', [], {});
  assert.strictEqual(sp[0], 'Siddharth Singhania');
  assert.ok(sp.length <= 3 && !sp.includes('Ayaan'));
});
test('speakers: people who just spoke or are in the scene come next', () => {
  const hist = [ai('*x*\n\nDhruv: "Ek minute."\n\nKabir: "Haha."')];
  const sp = P.pickSpeakers(story, chatBase, 'Tum log hamesha ladte ho?', hist, { scene: { where: 'Room 207', present: ['Yuvraj'], doing: '' } });
  assert.ok(sp.includes('Dhruv') && sp.includes('Yuvraj'));
});
test('state: scene replaced, unknown names ignored, knowledge deduped and capped', () => {
  let st = P.mergeState(story, {}, { scene: { where: 'Room 207', present: ['Kabir', 'Nobody'], doing: 'unpacking' }, characters: [{ name: 'Siddharth', toward_user: 'annoyed', learned: 'user is sensitive' }, { name: 'Ghost', toward_user: 'x' }] });
  assert.deepStrictEqual(st.scene.present, ['Kabir']);
  assert.ok(!st.chars.Ghost);
  assert.strictEqual(st.chars['Siddharth Singhania'].mood, 'annoyed');
  for (let i = 0; i < 9; i++) st = P.mergeState(story, st, { characters: [{ name: 'Siddharth', learned: 'fact ' + i }, { name: 'Siddharth', learned: 'fact ' + i }] });
  assert.strictEqual(st.chars['Siddharth Singhania'].knows.length, 6);
});
test('decisions: saved once, capped, never duplicated', () => {
  let st = {};
  st = P.mergeState(story, st, { decision: 'Pehle papa se baat karenge' }, 'Pehle papa se baat karenge');
  st = P.mergeState(story, st, { decision: 'pehle papa se baat karenge' });
  assert.strictEqual(st.decisions.length, 1);
  for (let i = 0; i < 14; i++) st = P.mergeState(story, st, { decision: 'choice ' + i });
  assert.strictEqual(st.decisions.length, 10);
});
test('regenerate: dropping the last reply drops its state (no duplicate events)', () => {
  const s1 = P.mergeState(story, {}, { scene: { where: 'Room 207', present: ['Kabir'], doing: 'arrival' } });
  const s2 = P.mergeState(story, s1, { decision: 'Main ruk jaunga' });
  const chat = { ...chatBase, messages: [ai('a', { state: s1 }), user('Main ruk jaunga'), ai('b', { state: s2 })] };
  assert.deepStrictEqual(P.currentState(chat).decisions, ['Main ruk jaunga']);
  const regenerated = { ...chat, messages: chat.messages.slice(0, 2) };
  assert.strictEqual((P.currentState(regenerated).decisions ?? []).length, 0);
});
test('episode change keeps the state', () => {
  const s1 = P.mergeState(story, {}, { decision: 'Papa se baat' });
  const chat = { ...chatBase, ep: 2, epCount: 0, messages: [ai('a', { state: s1 }), { id: 'e', role: 'episode_end', text: 'end', ep: 1 }] };
  assert.deepStrictEqual(P.currentState(chat).decisions, ['Papa se baat']);
});
test('prompt: scene, character state, decisions and speakers reach the model', () => {
  const st = P.mergeState(story, {}, { scene: { where: 'Room 207', present: ['Kabir', 'Dhruv'], doing: 'unpacking' }, characters: [{ name: 'Siddharth', toward_user: 'annoyed', learned: 'user insulted him' }], decision: 'Papa se pehle baat' });
  const chat = { ...chatBase, messages: [ai('*x*\n\nKabir: "Oye!"', { state: st }), user('Siddharth kahan hai?')] };
  const msgs = P.buildTurnMessages(story, chat, 'Siddharth kahan hai?', chat.messages.slice(0, 1), 'turn');
  const all = msgs.map((m) => m.content).join('\n');
  for (const needle of ['CURRENT SCENE', 'Room 207', 'CHARACTER STATE', 'user insulted him', 'DECISIONS THE USER ALREADY MADE', 'Papa se pehle baat', 'Speakers for this reply: Siddharth Singhania']) assert.ok(all.includes(needle), 'missing: ' + needle);
});
test('prompt: opening scene template and no state yet', () => {
  const msgs = P.buildTurnMessages(story, { ...chatBase, epCount: 0 }, 'Begin the story.', [], 'begin');
  const all = msgs.map((m) => m.content).join('\n');
  assert.ok(all.includes('Open like the first scene of a series'));
  assert.ok(!all.includes('CURRENT SCENE'));
});
test('reply parsing: state is read, broken state never throws', () => {
  const ok = P.parseReply('{"speaker":"Kabir","display_text":"*a*\\n\\nKabir: \\"hi\\"","speech_text":"a","choices":[],"episode_complete":false,"state":{"scene":{"where":"x","present":["Kabir"],"doing":"y"}}}');
  assert.strictEqual(ok.state.scene.where, 'x');
  const bad = P.parseReply('{"speaker":"K","display_text":"*a*\\n\\nKabir: \\"hi\\"","state":"oops"}');
  assert.ok(bad);
  assert.doesNotThrow(() => P.mergeState(story, {}, bad.state));
  assert.doesNotThrow(() => P.mergeState(story, {}, { scene: 5, characters: 'x', decision: 7 }));
});
const body = '\n\nAanya: "Bolo na, aaj kya plan hai? Dukaan khulne mein abhi aadha ghanta hai, tab tak baat kar sakte hain."\n\nKabir: "Plan kuch nahi, bas yahin baithna hai aur teri chai peeni hai, phir dekhte hain."\n\n*Chai ka bhaap steel ke glass se uthta hai aur bench par ek gol nishaan chhod jaata hai.*';
const sStory = { ...story, characters: [{ name: 'Aanya', role: 'x' }, { name: 'Kabir', role: 'y' }] };
test('quality: weak replies from the screenshots are rejected, a good one passes', () => {
  const chat = { ...chatBase, userRole: 'Bablu' };
  const hist = [ai('*Dhoop tapri par pad rahi thi, cup dhadak raha tha.*\n\nAanya: "Tum roz kyun aate ho?"')];
  const ctx = P.replyContext(sStory, chat, hist);
  assert.ok(P.qualityIssue('*Aap Ramdas ki taraf mudkar dekhte ho.*' + body, ctx), 'aap puppeting');
  assert.ok(P.qualityIssue('*Dhoop tapri par pad rahi thi, aur bench garam hai.*' + body, ctx), 'same opening');
  assert.ok(P.qualityIssue('*Aanya cup rakhti hai.*' + body + '\n\nAanya: "Toh phir roz kyun aate ho?"', ctx), 'question again');
  assert.ok(P.qualityIssue('*Aanya cup rakhti hai.*' + body.replace('Kabir', 'Rohan'), ctx), 'stranger');
  assert.strictEqual(P.qualityIssue('*Aanya cup rakhti hai, steel ka glass khanakta hai.*' + body, ctx), null);
});
test('hesitant input: short replies are detected, real sentences are not', () => {
  for (const x of ['hmm', 'Hmm...', 'kuch nahi', 'ok', '...', 'idk', 'kichu na']) assert.ok(P.isHesitant(x), x);
  for (const x of ['ask her', 'Siddharth se poochho kaun hai woh', 'main chai pilunga', '']) assert.ok(!P.isHesitant(x), x);
  const m = P.buildTurnMessages(story, chatBase, 'hmm', [], 'turn');
  assert.ok(JSON.stringify(m).includes('One character must notice it'));
  const m2 = P.buildTurnMessages(story, chatBase, 'Kabir se poochho woh kahan gaya', [], 'turn');
  assert.ok(!JSON.stringify(m2).includes('One character must notice it'));
});
test('system prompt has contrast, micro-beat and dilemma rules', () => {
  const sys = P.masterPrompt('hi');
  assert.ok(/CONTRAST/.test(sys) && /micro-reaction/.test(sys) && /DILEMMA/.test(sys) && /hesitant/.test(sys));
});
test('local: compact prompt is much shorter, has no speech_text, history is trimmed', () => {
  const full = P.buildTurnMessages(story, chatBase, 'chai khabo', [], 'turn');
  const small = P.buildTurnMessages(story, chatBase, 'chai khabo', [], 'turn', { compact: true });
  assert.ok(small[0].content.length < full[0].content.length / 2.2, `${small[0].content.length} vs ${full[0].content.length}`);
  assert.ok(!/speech_text/.test(small[0].content) && /speech_text/.test(full[0].content));
  assert.ok(/CONTRAST|do not agree/.test(small[0].content) && /hesitant/.test(small[0].content));
  const hist = Array.from({ length: 30 }, (_, i) => (i % 2 ? ai('reply ' + i, { speech: 'x' }) : user('msg ' + i)));
  const m = P.buildTurnMessages(story, chatBase, 'ok', hist, 'turn', { compact: true });
  assert.ok(m.length <= 2 + 11 + 1, 'history capped at 10');
  assert.ok(!m.some((x) => x.role === 'assistant' && /speech_text/.test(x.content)));
});
const LT = require(path.join(__dirname, '../src/ai/localText.ts'));
test('local: system messages fold into the first user message', () => {
  const out = LT.foldSystem([{ role: 'system', content: 'A' }, { role: 'system', content: 'B' }, { role: 'user', content: 'hi' }, { role: 'assistant', content: 'yo' }, { role: 'user', content: 'x' }]);
  assert.deepStrictEqual(out.map((m) => m.role), ['user', 'assistant', 'user']);
  assert.ok(out[0].content.startsWith('A\n\nB\n\nhi'));
  assert.deepStrictEqual(LT.foldSystem([{ role: 'user', content: 'u' }]), [{ role: 'user', content: 'u' }]);
});
test('local: thinking text is removed from the reply', () => {
  assert.strictEqual(LT.stripThinking('<think>plan it</think>{"a":1}'), '{"a":1}');
  assert.strictEqual(LT.stripThinking('plan</think>{"a":1}'), '{"a":1}');
  assert.strictEqual(LT.stripThinking('{"a":1}'), '{"a":1}');
});
test('local: prompt is trimmed to the context window, oldest turns first', () => {
  const big = 'x'.repeat(1000);
  const msgs = [{ role: 'system', content: 'S'.repeat(2000) }, { role: 'system', content: 'T'.repeat(500) },
    { role: 'user', content: 'u1' + big }, { role: 'assistant', content: 'a1' + big }, { role: 'user', content: 'u2' + big }, { role: 'assistant', content: 'a2' + big }, { role: 'user', content: 'last' }];
  const out = LT.fitMessages(msgs, 5000);
  assert.strictEqual(out[0].content[0], 'S'); assert.strictEqual(out[out.length - 1].content, 'last');
  assert.ok(out.reduce((n, m) => n + m.content.length, 0) <= 5000);
  assert.ok(out.some((m) => m.content.startsWith('a2')) && !out.some((m) => m.content.startsWith('u1')));
  assert.notStrictEqual(out[2] && out[2].role, 'assistant');
  assert.deepStrictEqual(LT.fitMessages(msgs, 100000), msgs);
});
test('local: resume offset and model file check', () => {
  assert.strictEqual(LT.resumeOffset(undefined), 0); assert.strictEqual(LT.resumeOffset(500), 0); assert.strictEqual(LT.resumeOffset(123456789), 123456789);
  assert.ok(LT.looksLikeGguf(Buffer.from('GGUF\x03\x00').toString('base64'))); assert.ok(!LT.looksLikeGguf(Buffer.from('<htm').toString('base64')));
});

// ---- V3.1: choice chips in the story's own language, running summary of the current episode ----
const C = require(path.join(__dirname, '../src/ai/choices.ts'));
const M = require(path.join(__dirname, '../src/ai/memory.ts'));
const LG = require(path.join(__dirname, '../src/ai/language.ts'));

test('choices: Hinglish chips in a Banglish story are found (the bug from the screenshot)', () => {
  assert.ok(C.isWrongLanguageChoice('bn', 'Main call ka reason bataunga'));
  assert.ok(C.isWrongLanguageChoice('bn', 'Inspector Sen se kuch poochunga'));
  assert.ok(C.isWrongLanguageChoice('bn', 'Main pehle uske papa se baat karunga'));
});
test('choices: good Banglish and Hinglish chips are kept', () => {
  assert.ok(!C.isWrongLanguageChoice('bn', 'Ami age okhaner baba er sathe kotha bolbo'));
  assert.ok(!C.isWrongLanguageChoice('bn', 'Inspector Sen ke jiggesh korbo, call ta kotha theke ashchhe'));
  assert.ok(!C.isWrongLanguageChoice('bn', 'Main gate er dike jai'));
  assert.ok(!C.isWrongLanguageChoice('hi', 'Main pehle uske papa se baat karunga'));
  assert.ok(C.isWrongLanguageChoice('hi', 'Ami jiggesh korbo kotha theke call ashche'));
  assert.ok(!C.isWrongLanguageChoice('en', 'Main call ka reason bataunga'));
});
test('choices: wrong chips are replaced, good ones stay, always at most 3', () => {
  const mix = ['Main call ka reason bataunga', 'Ami phone ta kete dilam', 'Inspector Sen se kuch poochunga'];
  const { good, bad } = C.splitChoices('bn', mix);
  assert.deepStrictEqual(good, ['Ami phone ta kete dilam']);
  assert.strictEqual(bad.length, 2);
  const shown = C.displayChoices('bn', mix);
  assert.strictEqual(shown.length, 3);
  assert.ok(shown[0] === 'Ami phone ta kete dilam' && shown.every((c) => !C.isWrongLanguageChoice('bn', c)));
  assert.deepStrictEqual(C.displayChoices('bn', ['Ami ekta proshno korbo']), ['Ami ekta proshno korbo']);
  assert.deepStrictEqual(C.displayChoices('bn', []), []);
});
const pending = [];
test('choices: on the phone wrong chips are dropped without a second AI call', () => {
  pending.push((async () => {
    const out = await LG.fixChoices('bn', ['Main call ka reason bataunga', 'Ami phone ta kete dilam'], { preset: 'local' }, 'local');
    assert.ok(out.length >= 2 && out[0] === 'Ami phone ta kete dilam' && out.every((c) => !C.isWrongLanguageChoice('bn', c)));
    const same = await LG.fixChoices('bn', ['Ami ekta proshno korbo'], { preset: 'local' }, 'local');
    assert.deepStrictEqual(same, ['Ami ekta proshno korbo']);
  })());
});
test('prompt: the Banglish prompts never teach Hinglish chips', () => {
  const bnMaster = P.masterPrompt('bn');
  assert.ok(!bnMaster.includes('Main pehle uske papa'));
  assert.ok(/ami/.test(bnMaster) && /NEVER Hinglish/.test(bnMaster));
  assert.ok(!P.compactPrompt('bn').includes('Main pehle'));
  assert.ok(/Main pehle uske papa/.test(P.masterPrompt('hi')));
});
test('memory: running summary of this episode goes into the prompt, a summary of another episode does not', () => {
  const bn = { ...story, language: 'bn' };
  const base = { ...chatBase, ep: 2, epCount: 20, messages: [], epSummaryAt: 8 };
  const withSum = P.buildTurnMessages(bn, { ...base, epSummary: 'Ojana found the unknown number belongs to the old school.', epSummaryEp: 2 }, 'hmm', [], 'turn');
  const sys = withSum.filter((m) => m.role === 'system').map((m) => m.content).join('\n');
  assert.ok(sys.includes('Earlier in THIS episode') && sys.includes('unknown number belongs to the old school'));
  assert.ok(sys.includes('How to use MEMORY'));
  const old = P.buildTurnMessages(bn, { ...base, epSummary: 'stale text', epSummaryEp: 1 }, 'hmm', [], 'turn');
  assert.ok(!old.map((m) => m.content).join('\n').includes('stale text'));
});
test('memory: only messages older than the chat window are waiting for a summary', () => {
  const msgs = (n, ep = 1) => Array.from({ length: n }, (_, i) => ({ id: 'm' + i, role: i % 2 ? 'ai' : 'user', text: 't' + i, ep }));
  assert.strictEqual(M.pendingForSummary({ ...chatBase, ep: 1, messages: msgs(10) }, true), 0);
  assert.strictEqual(M.pendingForSummary({ ...chatBase, ep: 1, messages: msgs(16) }, true), 6);
  assert.strictEqual(M.pendingForSummary({ ...chatBase, ep: 1, messages: msgs(16) }, false), 0);
  assert.strictEqual(M.pendingForSummary({ ...chatBase, ep: 1, messages: msgs(30), epSummaryEp: 1, epSummaryAt: 10 }, false), 0);
  assert.strictEqual(M.pendingForSummary({ ...chatBase, ep: 1, messages: msgs(36), epSummaryEp: 1, epSummaryAt: 10 }, false), 6);
  assert.strictEqual(M.pendingForSummary({ ...chatBase, ep: 2, messages: [...msgs(30, 1), ...msgs(8, 2)] }, true), 0);
});

Promise.all(pending).then(() => console.log(`\n${n} tests passed`), (e) => { console.error(e); process.exit(1); });
