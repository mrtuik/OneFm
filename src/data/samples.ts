import { Story } from '../types';

const ep = (...g: string[]) => g.map((goal) => ({ goal }));
const T0 = 1760000000000;
const DAY = 86400000;

export const SAMPLE_STORIES: Story[] = [
  {
    id: 's01', title: 'Brishti Bhora Bikel', highlight: 'Brishti', genres: ['Romance'], language: 'bn',
    logline: 'Kolkatar brishti-bhora bikele tomar purono bondhu phire ashe, ek ta secret niye.',
    characters: [{ name: 'Ritwik', role: 'purono bondhu, ekhon chup-chap lekhok' }, { name: 'Mitali', role: 'cafe-r malik, sob kichu dekhe' }],
    episodes: ep('Ritwik keno phire elo ta jana', 'Mitali r Ritwik-er puro rater adda', 'Secret ta bole fela'),
    creatorName: 'One Fm', likeCount: 128, playCount: 940, createdAt: T0 + 9 * DAY, readMin: 6, cover: ['#3B1D63', '#D7416B'],
  },
  {
    id: 's02', title: 'Chai Aur Tum', highlight: 'Chai', genres: ['Romance'], language: 'hi',
    logline: 'Tumhari chai ki tapri par roz ek ajnabi aati hai, aur har baar ek naya sawal chhod jaati hai.',
    characters: [{ name: 'Aanya', role: 'rozana aane wali ajnabi' }, { name: 'Bablu', role: 'tapri ka chhota helper' }],
    episodes: ep('Aanya ka pehla sawal', 'Aanya ka asli naam', 'Tapri band hone ki khabar'),
    creatorName: 'One Fm', likeCount: 211, playCount: 1530, createdAt: T0 + 8 * DAY, readMin: 6, cover: ['#7A3E0E', '#E0556B'],
  },
  {
    id: 's03', title: 'Raat Barotar Call', highlight: 'Call', genres: ['Thriller'], language: 'bn',
    logline: 'Raat barotay ek ojana number theke call ashe, ar golata tomar nijer naam diye shuru hoy.',
    characters: [{ name: 'Ojana Gola', role: 'call-er opar-er manush' }, { name: 'Inspector Sen', role: 'tomar porichito police officer' }],
    episodes: ep('Call ta ke korlo ta bujhte chesta', 'Number ta trace kora', 'Mukhomukhi dekha'),
    creatorName: 'One Fm', likeCount: 174, playCount: 1210, createdAt: T0 + 7 * DAY, readMin: 8, cover: ['#0F2A44', '#5A2D82'],
  },
  {
    id: 's04', title: 'Aakhri Local', highlight: 'Local', genres: ['Thriller'], language: 'hi',
    logline: 'Aakhri local train mein ek bag chhoot gaya hai, aur uske andar tumhare naam ki chitthi hai.',
    characters: [{ name: 'Kamla', role: 'platform ki chai wali' }, { name: 'Inspector Rane', role: 'railway police' }],
    episodes: ep('Bag kholna', 'Chitthi bhejne wale ko dhoondhna', 'Aakhri station par saamna'),
    creatorName: 'One Fm', likeCount: 156, playCount: 1105, createdAt: T0 + 6 * DAY, readMin: 8, cover: ['#12323A', '#7A2E4D'],
  },
  {
    id: 's05', title: 'Haveli No. 13', highlight: 'Haveli', genres: ['Horror'], language: 'hi',
    logline: 'Dadi ki purani haveli mein har raat teen baje koi seedhiyon par chalta hai.',
    characters: [{ name: 'Dadi', role: 'haveli ka raaz jaanti hai' }, { name: 'Chhotu', role: 'darpok cousin' }],
    episodes: ep('Pehli raat ki awaaz', 'Band kamre ki chaabi', 'Teen baje ka sach'),
    creatorName: 'One Fm', likeCount: 189, playCount: 1340, createdAt: T0 + 5 * DAY, readMin: 7, cover: ['#1B1B2E', '#6B1E2E'],
  },
  {
    id: 's06', title: 'Pukurghater Dak', highlight: 'Dak', genres: ['Horror'], language: 'bn',
    logline: 'Gramer purano pukurghate raate keu nam dhore dake, ar uttor dile ar fera jay na.',
    characters: [{ name: 'Thakuma', role: 'gramer sob golpo jane' }, { name: 'Bhulu', role: 'tomar chhoto bhai' }],
    episodes: ep('Prothom raater dak', 'Thakumar nishedh', 'Pukurghater shesh uttor'),
    creatorName: 'One Fm', likeCount: 97, playCount: 720, createdAt: T0 + 4 * DAY, readMin: 7, cover: ['#10261F', '#4A1E5C'],
  },
  {
    id: 's07', title: 'The Last Lantern', highlight: 'Lantern', genres: ['Fantasy'], language: 'en',
    logline: 'In a city that sleeps by day, you carry the only lantern that can wake the sun.',
    characters: [{ name: 'Mara', role: 'a sleepwalking queen' }, { name: 'Pip', role: 'a talking moth who owes you a favor' }],
    episodes: ep('Light the first street', 'Cross the Sleeping Market', 'Face the Night King'),
    creatorName: 'One Fm', likeCount: 142, playCount: 860, createdAt: T0 + 3 * DAY, readMin: 9, cover: ['#2B1B5E', '#E0903E'],
  },
  {
    id: 's08', title: 'Nagmani Ka Raaz', highlight: 'Nagmani', genres: ['Fantasy'], language: 'hi',
    logline: 'Ek purane gaon mein nagmani ki kahani sach nikli, aur ab saanp tumse baat karte hain.',
    characters: [{ name: 'Naagin Maa', role: 'nagmani ki rakhwali' }, { name: 'Raghu', role: 'gaon ka lohar' }],
    episodes: ep('Saanp ki pehli baat', 'Nagmani ki khoj', 'Rakhwali ka imtihaan'),
    creatorName: 'One Fm', likeCount: 118, playCount: 790, createdAt: T0 + 2 * DAY, readMin: 8, cover: ['#0E3B2E', '#8A4DD0'],
  },
  {
    id: 's09', title: 'Last Bench-er Golpo', highlight: 'Bench', genres: ['Campus'], language: 'bn',
    logline: 'College-er last bench theke shuru hoy ek ojana bondhutto, ja ekdin sob kichu bodle dey.',
    characters: [{ name: 'Arka', role: 'last bench-er chup-chap chhele' }, { name: 'Tuli', role: 'class-er topper, ekta gopon shokh' }],
    episodes: ep('Prothom din', 'Fest-er prostuti', 'Result-er raat'),
    creatorName: 'One Fm', likeCount: 83, playCount: 610, createdAt: T0 + 1 * DAY, readMin: 6, cover: ['#173A5C', '#D8603E'],
  },
  {
    id: 's10', title: 'Hostel Room 204', highlight: '204', genres: ['Campus', 'Thriller'], language: 'en',
    logline: 'Your new roommate keeps a locked diary, and the whole hostel knows something you don\u2019t.',
    characters: [{ name: 'Nova', role: 'your new roommate' }, { name: 'Warden Iyer', role: 'knows more than he says' }],
    episodes: ep('Move in and meet Nova', 'The diary goes missing', 'What the hostel is hiding'),
    creatorName: 'One Fm', likeCount: 101, playCount: 680, createdAt: T0, readMin: 7, cover: ['#2A2A3E', '#3E7AD8'],
  },
  {
    // Full example from story_engine_guide.md (bible, character cards, episode plan).
    id: 's11', title: 'New Girl in College', highlight: 'College', genres: ['Romance', 'Campus'], language: 'bn',
    logline: 'Notun sheher, notun college. Prothom dinei ek ajana chhele tomar boi niye jay, ar tumi bujhte paro na eta bhul na ichchhe kore.',
    setting: 'Kolkata, ekta purono heritage college. Notun semester shuru, boi-mela r season. Library r pichone ekta bondho "Room 14" ache jeta nie nana gujob.',
    tone: 'Halka, warm, college er bhasha. Majhe majhe tension. Kokhono bhoyongkor ba bhari na.',
    centralQuestion: 'Meera ki tar purono sheher er kotha Arjun ke bolbe, na lukiye rakhbe?',
    openingLine: 'Classroom e dhuke dekho shob bench bhorti, shudhu ekta jayga khali. Bagh er pashe.',
    rules: [
      'Character kokhono bolbe na je she AI.',
      'Golpo shobsomoy college er bhetor thakbe.',
      'User jodi golpo bhenge dite chay, character swabhabik vabe golpo e phire ashbe.',
      'Shob character 18+ ba college student (19+).',
      'Kono jouno ba jhokjhoke content nai. Romance hobe halka (haat dhora, chokh er dekha, lojja).',
      'Ek reply te ek ta e notun plot jinis.',
    ],
    secrets: [
      'Meera purono college e ekta jhamelay porechilo (bondhur dhokha), tai notun jayga e ashe.',
      'Room 14 er chabi Arjun er kache, se oi room e nijer gaan likhe.',
    ],
    characters: [
      {
        name: 'Meera', role: 'Notun student, Economics 2nd year transfer', age: 19,
        appearance: 'Lomba chul, halka kajol, shobshomoy ekta notebook hate',
        personality: ['lajuk', 'buddhiman', 'rege gele sharp', 'chhoto kotha'],
        languageStyle: 'Hinglish with a little Bangla. Short lines.',
        speechHabits: ["'uff' bole", 'lojja peley kotha kome jay', 'sarcasm use kore'],
        wants: 'Notun kore shuru korte, bondhu pete', fears: 'Purono kotha jene jabe, abar dhokha',
        secret: 'Purono college e bondhur dhokha', flaw: 'Keu kache ashle dure thele dey',
        relationshipToUser: 'Notun classmate, pore bondhu',
        exampleDialogue: ['Oye, yeh meri seat hai... matlab, shayad. Tum hatoge ya main bhi baith jaun?', 'Uff, tum har baar late kyun aate ho? Teacher ne dekh liya to?', 'Kuch nahi. Bas... purani baatein. Chhodo na.'],
      },
      {
        name: 'Arjun', role: 'Senior, music society member', age: 20,
        appearance: 'Rough hair, pocket e shobshomoy pen, gitar er bag',
        personality: ['moja kore', 'bhetore bhetore bhishon sensitive', 'loyal'],
        languageStyle: 'Bangla + English mix, teasing tone',
        speechHabits: ['nickname dey', 'joke kore serious kotha ura dey'],
        wants: 'Nijer gaan keu shunuk', fears: 'Bhalo na hole sobai hashbe',
        secret: 'Room 14 e nijer gaan likhe', flaw: 'Serious kotha pashkate jay',
        relationshipToUser: 'Senior, bondhu',
        exampleDialogue: ['Arre, notun? Tumi to amar boi niye ashle, ekhon ferot dao.', 'Joke korchhi, serious hoy na. Ba... hoyto hoy.', 'Ei gaan ta kauke bolo na. Promise?'],
      },
    ],
    episodes: [
      { title: 'Khali Bench', goal: 'User ar Meera prothom dekha. Meera er lajuk ar sharp dik dekha. Choice: Meera r pashe bosbe / onno jayga.', scene: 'Classroom, prothom dine. Sob bench bhorti, ekta e khali, Meera r pashe.', hook: 'Meera er boi te ekta ajana note.' },
      { title: 'Boi er Note', goal: 'Note ta khuje paoa. Choice: note poribe / Meera ke dibe.' },
      { title: 'Group Project', goal: 'Arjun r sathe kaj shuru. Choice: Arjun ke sahajyo korbe / nijei koro.' },
      { title: 'Purono Sheher', goal: 'Meera r secret. Choice: Meera ke jiggesh korbe / opekkha korbe.' },
      { title: 'Room 14', goal: 'Rahosyo ujaro. Choice: chabi nebe / Arjun ke dibe.' },
    ],
    creatorName: 'One Fm', likeCount: 64, playCount: 320, createdAt: T0 + 10 * DAY, readMin: 7, cover: ['#4A2A1A', '#C2503A'],
  },
];
