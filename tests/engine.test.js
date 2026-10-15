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
  if (/brain\/brain|data\/samples|firebase|async-storage|ai\/secure/.test(req)) return { brainBlock: () => '', SAMPLE_STORIES: [] };
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
console.log(`\n${n} tests passed`);
