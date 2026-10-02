/* Steady characters — a cute doll-style set, drawn here as plain SVG so every piece mixes with every other,
   recolours freely and stays sharp at any size. charArt(av, {mode, uid}) returns a complete <svg>.
   Frame: 200×200. Head centre x=100, crown y≈46, chin y≈137; shoulders from y≈150. */

/* ---------- colour helpers ---------- */
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
function rgb(hex) { hex = hex.replace('#', ''); if (hex.length === 3) hex = [...hex].map(c => c + c).join(''); return [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16)); }
function hx(r, g, b) { return '#' + [r, g, b].map(v => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join(''); }
/* f > 0 lightens toward white, f < 0 darkens toward black */
export function shade(hex, f) { const [r, g, b] = rgb(hex); return f >= 0 ? hx(r + (255 - r) * f, g + (255 - g) * f, b + (255 - b) * f) : hx(r * (1 + f), g * (1 + f), b * (1 + f)); }
const lum = hex => { const [r, g, b] = rgb(hex); return (0.299 * r + 0.587 * g + 0.114 * b) / 255; };

/* ---------- palettes ---------- */
export const TONES = [
  { id: 't1', hex: '#fbe2d2' }, { id: 't2', hex: '#f1c9a9' }, { id: 't3', hex: '#dca47a' },
  { id: 't4', hex: '#b9784c' }, { id: 't5', hex: '#8a5432' }, { id: 't6', hex: '#5c3620' },
];
export const HAIR_COLOURS = [
  { id: 'c-black', hex: '#2b2426', name: 'Black' }, { id: 'c-brown', hex: '#5b3a27', name: 'Dark brown' },
  { id: 'c-mid', hex: '#946039', name: 'Chestnut' }, { id: 'c-caramel', hex: '#b9814f', name: 'Caramel' },
  { id: 'c-blond', hex: '#e7bf6c', name: 'Golden blonde' }, { id: 'c-grey', hex: '#f1e6c8', name: 'Platinum' },
  { id: 'c-ginger', hex: '#cf6a32', name: 'Ginger' }, { id: 'c-auburn', hex: '#8e3a22', name: 'Auburn' },
  { id: 'c-cherry', hex: '#b8243c', name: 'Cherry red' }, { id: 'c-red', hex: '#f3a3c4', name: 'Pink' },
  { id: 'c-peach', hex: '#f7b49a', name: 'Peach' }, { id: 'c-dyed', hex: '#b9a0f2', name: 'Lilac' },
  { id: 'c-purple', hex: '#7b4fd8', name: 'Purple' }, { id: 'c-blue', hex: '#5b8def', name: 'Blue' },
  { id: 'c-mint', hex: '#7fd8be', name: 'Mint' }, { id: 'c-silver', hex: '#c7cad3', name: 'Silver' },
];
export const isHex = v => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);
export function hairHexOf(v) { return isHex(v) ? v : (HAIR_COLOURS.find(c => c.id === v) || HAIR_COLOURS[1]).hex; }

/* ---------- faces: eyes × mouth × brows (+ blush strength) ---------- */
export const FACES = [
  { id: 'b1', name: 'Sweet', e: 'doll', m: 'smile', b: 'soft' },
  { id: 'b2', name: 'Sunny', e: 'round', m: 'open', b: 'soft' },
  { id: 'b3', name: 'Cheeky', e: 'wink', m: 'tongue', b: 'raised' },
  { id: 'b4', name: 'Happy', e: 'happy', m: 'open', b: 'soft' },
  { id: 'b5', name: 'Kitty', e: 'doll', m: 'cat', b: 'soft' },
  { id: 'b6', name: 'Calm', e: 'closed', m: 'small', b: 'soft' },
  { id: 'b7', name: 'Shy', e: 'side', m: 'small', b: 'worried', blush: 2 },
  { id: 'b8', name: 'Confident', e: 'cool', m: 'smirk', b: 'determined' },
  { id: 'b9', name: 'Focused', e: 'round', m: 'flat', b: 'determined' },
  { id: 'b10', name: 'Heart eyes', e: 'heart', m: 'open', b: 'raised' },
  { id: 'b11', name: 'Starry', e: 'star', m: 'smile', b: 'raised' },
  { id: 'b12', name: 'Surprised', e: 'wide', m: 'o', b: 'raised' },
  { id: 'b13', name: 'Dreamy', e: 'sleepy', m: 'small', b: 'soft' },
  { id: 'b14', name: 'Sleepy', e: 'sleepy', m: 'o', b: 'worried' },
  { id: 'b15', name: 'Smirk', e: 'round', m: 'smirk', b: 'one' },
  { id: 'b16', name: 'Giggle', e: 'happy', m: 'cat', b: 'soft' },
  { id: 'b17', name: 'Peaceful', e: 'closed', m: 'smile', b: 'soft' },
  { id: 'b18', name: 'Pout', e: 'doll', m: 'pout', b: 'worried' },
  { id: 'b19', name: 'Side-eye', e: 'side', m: 'flat', b: 'determined' },
  { id: 'b20', name: 'Grin', e: 'round', m: 'grin', b: 'raised' },
  { id: 'b21', name: 'Bubbly', e: 'sparkle', m: 'open', b: 'raised' },
  { id: 'b22', name: 'Laugh', e: 'happy', m: 'laugh', b: 'raised' },
  { id: 'b23', name: 'Kiss', e: 'wink', m: 'kiss', b: 'soft' },
  { id: 'b24', name: 'Blushing', e: 'doll', m: 'small', b: 'worried', blush: 2 },
  { id: 'b25', name: 'Proud', e: 'happy', m: 'smirk', b: 'raised' },
  { id: 'bx1', name: 'Silly', e: 'wide', m: 'tongue', b: 'raised', group: 'extra' },
  { id: 'bx2', name: 'Cool', e: 'cool', m: 'grin', b: 'one', group: 'extra' },
  { id: 'bx3', name: 'Superstar', e: 'star', m: 'laugh', b: 'raised', group: 'extra' },
  { id: 'bx4', name: 'Smitten', e: 'heart', m: 'kiss', b: 'soft', blush: 2, group: 'extra' },
  { id: 'bx5', name: 'Game face', e: 'cool', m: 'flat', b: 'determined', group: 'extra' },
];

/* ---------- catalogue art keys, by item id (ids and prices live in the app) ---------- */
export const HAIR = {
  // free
  'h-crop':     { name: 'Textured crop', back: 'short', front: 'crop' },
  'h-side':     { name: 'Side part', back: 'short', front: 'sidepart' },
  'h-long':     { name: 'Long & sleek', back: 'long', front: 'middle' },
  'h-bob':      { name: 'Bob', back: 'bob', front: 'blunt' },
  'h-short2':   { name: 'Curtains', back: 'short', front: 'curtain' },
  'h-short4':   { name: 'Messy fringe', back: 'short', front: 'messy' },
  'h-medium1':  { name: 'Shoulder waves', back: 'lob', front: 'sideswept' },
  'h-shaved1':  { name: 'Buzz cut', back: 'none', front: 'buzz' },
  'h-no1':      { name: 'Bald', back: 'none', front: 'none' },
  // 8–12
  'h-buzz':     { name: 'Skin fade', back: 'none', front: 'fade' },
  'h-shaved3':  { name: 'Crew cut', back: 'short', front: 'crew' },
  'h-short5':   { name: 'Spiky', back: 'short', front: 'spiky' },
  'h-no2':      { name: 'Pixie cut', back: 'short', front: 'pixie' },
  'h-no3':      { name: 'Slick back', back: 'short', front: 'slick' },
  'h-fringe':   { name: 'Blunt bangs', back: 'long', front: 'blunt' },
  'h-bangs2':   { name: 'Curtain bangs', back: 'long', front: 'curtainbangs' },
  'h-quiff':    { name: 'Quiff', back: 'short', front: 'quiff' },
  'h-medium2':  { name: 'High ponytail', back: 'ponyhigh', front: 'sleek' },
  'h-medium3':  { name: 'Low ponytail', back: 'ponylow', front: 'middleshort' },
  'h-bun':      { name: 'Top bun', back: 'none', front: 'sleek', top: 'bun' },
  'h-bun2':     { name: 'Messy bun', back: 'none', front: 'sleek', top: 'messybun' },
  'h-undercut': { name: 'Undercut', back: 'none', front: 'undercut' },
  'h-wavy':     { name: 'Beach waves', back: 'wavy', front: 'middle' },
  'h-longbangs':{ name: 'Long side-swept', back: 'long', front: 'sideswept' },
  'h-mbangs':   { name: 'Wolf cut', back: 'shag', front: 'messy' },
  // 18
  'h-mbangs2':  { name: 'Pigtails', back: 'none', front: 'middle', over: 'pigtails' },
  'h-mbangs3':  { name: 'Space buns', back: 'none', front: 'middle', top: 'spacebuns' },
  'h-braids':   { name: 'Two braids', back: 'none', front: 'middle', over: 'braids' },
  'h-space':    { name: 'Half-up bun', back: 'long', front: 'middle', top: 'smallbun' },
  'h-afro':     { name: 'Afro', back: 'afro', front: 'afroline' },
  'h-grayshort':{ name: 'Curly top', back: 'none', front: 'curlytop' },
  // 24
  'h-cornrows2':{ name: 'Box braids', back: 'boxbraids', front: 'middleshort', over: 'boxbraids' },
  'h-longafro': { name: 'Big curls', back: 'curly', front: 'curlyfringe' },
  'h-dreads1':  { name: 'Locs', back: 'locs', front: 'locsfront', over: 'locs' },
  'h-dreads2':  { name: 'Side braid', back: 'short', front: 'sideswept', over: 'sidebraid' },
  'h-twists':   { name: 'Afro puffs', back: 'none', front: 'afroline', top: 'puffs' },
  'h-twists2':  { name: 'Bubble ponytail', back: 'bubblepony', front: 'sleek' },
  'h-bantu':    { name: 'Bantu knots', back: 'none', front: 'afroline', top: 'bantu' },
  'h-flattopL': { name: 'Flow', back: 'flow', front: 'flow' },
  'h-graymed':  { name: 'Princess waves', back: 'wavylong', front: 'curtainbangs', top: 'bow' },
  'h-graybun':  { name: 'Ballerina bun', back: 'none', front: 'sleek', top: 'ballet' },
  // 30
  'h-mohawk':   { name: 'Mohawk', back: 'none', front: 'mohawk' },
  'h-mohawk2':  { name: 'Mullet', back: 'mullet', front: 'messy' },
  'h-bear':     { name: 'Barbie ponytail', back: 'ponyhigh', front: 'sleek', top: 'ponybow' },
  // legacy ids kept for old saves
  'h-pony':     { name: 'High ponytail', back: 'ponyhigh', front: 'sleek' },
  'h-curls':    { name: 'Wolf cut', back: 'shag', front: 'messy' },
  'a-bow':      { name: 'Messy bun', back: 'none', front: 'sleek', top: 'messybun' },
  'a-band':     { name: 'Curtain bangs', back: 'long', front: 'curtainbangs' },
};
export const DETAILS = {
  'fh-chin':  { name: 'Freckles', d: 'freckles' }, 'fh-goat1': { name: 'Rosy cheeks', d: 'rosy' },
  'fh-mous1': { name: 'Beauty mark', d: 'mark' }, 'fh-mous2': { name: 'Stubble', d: 'stubble' },
  'fh-full':  { name: 'Short beard', d: 'shortbeard' }, 'fh-full2': { name: 'Full beard', d: 'beard' },
  'fh-goat2': { name: 'Goatee', d: 'goatee' }, 'fh-mous3': { name: 'Moustache', d: 'moustache' },
  'fh-mous4': { name: 'Heart sticker', d: 'heart' }, 'fh-mous5': { name: 'Star stickers', d: 'stars' },
  'fh-mous6': { name: 'Glitter cheeks', d: 'glitter' }, 'fh-mous7': { name: 'Pink lips', d: 'lips:#e8548a' },
  'fh-mous8': { name: 'Red lips', d: 'lips:#d22b45' }, 'fh-mous9': { name: 'Winged liner', d: 'liner' },
  'fh-full3': { name: 'Long lashes', d: 'lashes' }, 'fh-full4': { name: 'Glam', d: 'glam' },
};
export const GLASSES = {
  'g-round': { name: 'Round', g: 'round' }, 'g-square': { name: 'Square', g: 'square' },
  'g-cats': { name: 'Cat-eye', g: 'cat' }, 'g-glass4': { name: 'Heart shades', g: 'heart' },
  'g-glass5': { name: 'Star shades', g: 'star' }, 'g-shades': { name: 'Aviators', g: 'aviator' },
  'g-shades2': { name: 'Retro shades', g: 'retro' }, 'g-patch': { name: 'White sunnies', g: 'white' },
};
export const HATS = {
  'a-beanie': { name: 'Beanie', h: 'beanie' }, 'a-cap': { name: 'Cap', h: 'cap' },
  'a-hijab': { name: 'Hijab', h: 'hijab' }, 'a-turban': { name: 'Turban', h: 'turban' },
  'a-bowbig': { name: 'Big bow', h: 'bigbow' }, 'a-crown': { name: 'Flower crown', h: 'flowers' },
  'a-tiara': { name: 'Tiara', h: 'tiara' },
};
/* An outfit is a whole look: top (o, col, c2), bottoms (bot) and shoes (shoe). Dresses have no bottoms. */
export const OUTFITS = {
  'o-tee': { name: 'Pink tee', o: 'tee', col: '#f5a6c3', bot: ['jeans', '#8fb3dc'], shoe: ['sneakers', '#ffffff'] },
  'o-hoodie': { name: 'Grey hoodie', o: 'hoodie', col: '#9aa3ad', bot: ['joggers', '#7d8692'], shoe: ['chunky', '#ffffff'] },
  'o-navy': { name: 'Navy tee', o: 'tee', col: '#2f3f6e', bot: ['trousers', '#d8c3a0'], shoe: ['sneakers', '#ffffff'] },
  'o-cream': { name: 'Cream jumper', o: 'knit', col: '#f1e4cc', bot: ['wide', '#7da0cc'], shoe: ['loafers', '#5a3b2a'] },
  'o-shirt': { name: 'Denim jacket', o: 'denim', col: '#6f93c4', bot: ['jeans', '#2b2b33'], shoe: ['boots', '#3a2a22'] },
  'o-stripe': { name: 'Striped tee', o: 'stripes', col: '#2f3f6e', bot: ['trousers', '#f4f0e6'], shoe: ['loafers', '#2b2224'] },
  'o-white': { name: 'White tee', o: 'tee', col: '#fbfbf8', bot: ['wide', '#5f84b8'], shoe: ['sneakers', '#ffffff'] },
  'o-black': { name: 'Black hoodie', o: 'hoodie', col: '#2a2a2e', bot: ['cargo', '#3a3a40'], shoe: ['chunky', '#f2f2f2'] },
  'o-charcoal': { name: 'Varsity jacket', o: 'varsity', col: '#c23b4e', bot: ['jeans', '#3c5a8a'], shoe: ['sneakers', '#ffffff'] },
  'o-sky': { name: 'Baby blue hoodie', o: 'hoodie', col: '#a9d3f5', bot: ['wide', '#eef2f7'], shoe: ['sneakers', '#ffffff'] },
  'o-mint': { name: 'Mint cardigan', o: 'cardigan', col: '#a6e3cc', bot: ['mini', '#f6f1e7'], shoe: ['flats', '#f7c7d6'] },
  'o-hivis': { name: 'Lilac set', o: 'hoodie', col: '#c9b3f4', bot: ['joggers', '#c9b3f4'], shoe: ['sneakers', '#ffffff'] },
  'o-jumper': { name: 'Cosy knit', o: 'knit', col: '#c98b5e', bot: ['cords', '#6b4a35'], shoe: ['boots', '#3a2a22'] },
  'o-dress': { name: 'Pink dress', o: 'dress', col: '#f07fae', shoe: ['maryjanes', '#2b2224'] },
  'o-berry': { name: 'Y2K crop top', o: 'crop', col: '#ff8fa3', bot: ['flare', '#9db9e3'], shoe: ['chunky', '#ffffff'] },
  'o-jacket': { name: 'Leather jacket', o: 'leather', col: '#2b2628', bot: ['jeans', '#2b2b33'], shoe: ['boots', '#1f1b1c'] },
  'o-forest': { name: 'Flannel shirt', o: 'flannel', col: '#3f7a57', bot: ['jeans', '#5f84b8'], shoe: ['boots', '#5a3b2a'] },
  'o-rust': { name: 'Satin dress', o: 'slip', col: '#e9b8d6', shoe: ['heels', '#f3c1d7'] },
  'o-violet': { name: 'Princess dress', o: 'puff', col: '#b98cf0', shoe: ['sparkle', '#e3d6ff'] },
  'o-coral': { name: 'Tuxedo', o: 'tux', col: '#24242a', bot: ['trousers', '#24242a'], shoe: ['loafers', '#1a1a1d'] },
  // 2026 trends
  'o-coquette': { name: 'Coquette bows', o: 'coquette', col: '#f9c6d6', bot: ['midi', '#fbe4ec'], shoe: ['flats', '#f4a6c0'] },
  'o-ballet': { name: 'Balletcore', o: 'wrap', col: '#f6d2dc', bot: ['tutu', '#fbe8ee'], shoe: ['flats', '#f2b6c8'] },
  'o-gorp': { name: 'Gorpcore', o: 'windbreaker', col: '#e07a3f', c2: '#2f5d50', bot: ['cargo', '#6e7058'], shoe: ['trainers', '#d9d4c7'] },
  'o-fleece': { name: 'Fleece & cargos', o: 'fleece', col: '#e8e1d2', c2: '#4b6a4f', bot: ['cargo', '#4b4f45'], shoe: ['trainers', '#7a6a58'] },
  'o-y2k': { name: 'Y2K baby tee', o: 'babytee', col: '#bfe3ff', bot: ['flare', '#7fa6d8'], shoe: ['chunky', '#fff3f8'] },
  'o-ddenim': { name: 'Double denim', o: 'denimshirt', col: '#7ea3d1', bot: ['wide', '#5f84b8'], shoe: ['boots', '#3a2a22'] },
  'o-trench': { name: 'Wool trench', o: 'trench', col: '#c8a27a', bot: ['trousers', '#2b2b30'], shoe: ['boots', '#1f1b1c'] },
  'o-football': { name: 'Football shirt', o: 'jersey', col: '#d8343f', c2: '#ffffff', bot: ['jeans', '#7da0cc'], shoe: ['trainers', '#ffffff'] },
  'o-retro': { name: '70s print shirt', o: 'retro', col: '#e2a248', c2: '#7a4a2a', bot: ['trousers', '#efe6d6'], shoe: ['loafers', '#6b4a35'] },
  'o-suede': { name: 'Suede jacket', o: 'suede', col: '#a86f45', bot: ['jeans', '#3c5a8a'], shoe: ['loafers', '#5a3b2a'] },
  'o-tennis': { name: 'Tennis skirt', o: 'polo', col: '#ffffff', c2: '#2f8f6e', bot: ['mini', '#ffffff'], shoe: ['sneakers', '#ffffff'] },
  'o-boho': { name: 'Boho maxi', o: 'boho', col: '#f3d9b1', c2: '#d9725b', shoe: ['boots', '#8a5a3a'] },
  'o-puffer': { name: 'Puffer jacket', o: 'puffer', col: '#2f3f6e', bot: ['joggers', '#2a2a2e'], shoe: ['chunky', '#f2f2f2'] },
  'o-western': { name: 'Western', o: 'western', col: '#e9d8c0', c2: '#8a5a3a', bot: ['jeans', '#5f84b8'], shoe: ['cowboy', '#8a5a3a'] },
  'o-oldmoney': { name: 'Old money', o: 'polo', col: '#f2ebdc', c2: '#2b3a5c', bot: ['trousers', '#c9b48f'], shoe: ['loafers', '#5a3b2a'] },
  'o-sport': { name: 'Matching set', o: 'zip', col: '#8fb9a8', c2: '#ffffff', bot: ['leggings', '#8fb9a8'], shoe: ['trainers', '#ffffff'] },
};
export const BACKDROPS = {
  'bg-plain': { name: 'Plain', bg: 'plain' }, 'bg-sun': { name: 'Sunset', bg: 'sunset' },
  'bg-mint': { name: 'Mint', bg: 'mint' }, 'bg-night': { name: 'Starry night', bg: 'night' },
  'bg-rose': { name: 'Pink hearts', bg: 'hearts' }, 'bg-sky': { name: 'Clouds', bg: 'clouds' },
  'bg-lilac': { name: 'Lilac sparkle', bg: 'sparkle' }, 'bg-peach': { name: 'Peach', bg: 'peach' },
};
export const BACKDROP_SWATCH = { plain: '#eef1f0', sunset: '#f7a77a', mint: '#a8e6cf', night: '#2d3361', hearts: '#f7b6cf', clouds: '#9fd0f2', sparkle: '#c9b6f2', peach: '#f9cdb0' };

/* ---------- geometry ---------- */
const HEAD = 'M100 46C128 46 142 66 142 92C142 119 123 137 100 137C77 137 58 119 58 92C58 66 72 46 100 46Z';
const BODY = 'M30 202C30 172 52 156 84 151L116 151C148 156 170 172 170 202Z';
const EYE_Y = 99, EL = 83, ER = 117, MOUTH_Y = 120;

/* ---------- pieces ---------- */
function backdrop(kind, id) {
  const r = '<rect width="200" height="200"';
  switch (kind) {
    case 'sunset': return `<defs><linearGradient id="${id}bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fcd27b"/><stop offset=".55" stop-color="#f6a07f"/><stop offset="1" stop-color="#ec7fa4"/></linearGradient></defs>${r} fill="url(#${id}bg)"/>`;
    case 'mint': return `${r} fill="#a8e6cf"/><circle cx="168" cy="36" r="40" fill="#c3f0df"/><circle cx="26" cy="170" r="34" fill="#93dcc1"/>`;
    case 'night': return `${r} fill="#2d3361"/>` + [[28, 30, 2.2], [160, 24, 1.6], [176, 70, 2.4], [40, 76, 1.4], [150, 120, 1.2], [20, 130, 2], [182, 160, 1.8], [64, 18, 1.2]].map(([x, y, s]) => `<circle cx="${x}" cy="${y}" r="${s}" fill="#fff4c7"/>`).join('') + `<path d="M162 40a14 14 0 1 0 10 24a11 11 0 1 1-10-24z" fill="#ffe9a8"/>`;
    case 'hearts': return `${r} fill="#f7b6cf"/>` + [[26, 30, 1], [170, 26, .8], [178, 110, 1.1], [18, 112, .9], [36, 176, 1], [168, 178, .8], [96, 14, .7]].map(([x, y, s]) => `<path transform="translate(${x} ${y}) scale(${s})" d="M0 4C-3-4-14-2-12 7C-10 13 0 18 0 18C0 18 10 13 12 7C14-2 3-4 0 4Z" fill="#fde1ec"/>`).join('');
    case 'clouds': return `${r} fill="#9fd0f2"/>` + [[36, 40, 1], [160, 30, .8], [170, 140, 1.1], [24, 150, .9]].map(([x, y, s]) => `<path transform="translate(${x} ${y}) scale(${s})" d="M-22 8C-30 8-30-4-21-4C-21-14-6-16-3-8C1-16 15-14 15-4C24-5 26 8 17 8Z" fill="#ffffff" opacity=".9"/>`).join('');
    case 'sparkle': return `${r} fill="#c9b6f2"/>` + [[28, 30, 1], [172, 34, .8], [176, 120, 1.2], [20, 124, .7], [44, 178, .9], [160, 178, .7]].map(([x, y, s]) => `<path transform="translate(${x} ${y}) scale(${s})" d="M0-10C1.5-2 2-1.5 10 0C2 1.5 1.5 2 0 10C-1.5 2-2 1.5-10 0C-2-1.5-1.5-2 0-10Z" fill="#fff7d6"/>`).join('');
    case 'peach': return `${r} fill="#f9cdb0"/><circle cx="30" cy="34" r="46" fill="#fbdcc6"/><circle cx="176" cy="172" r="40" fill="#f6bea0"/>`;
    default: return `${r} fill="#eef1f0"/>`;
  }
}

/* Hair drawn behind head and body */
function hairBack(k, c, d) {
  const f = `fill="${c}" stroke="${d}" stroke-width="1.3" stroke-linejoin="round"`;
  switch (k) {
    case 'short': return `<path ${f} d="M60 96C56 60 76 38 100 38C124 38 144 60 140 96Z"/>`;
    case 'bob': return `<path ${f} d="M55 98C50 58 74 34 100 34C126 34 150 58 145 98L148 126C150 136 140 140 132 134L68 134C60 140 50 136 52 126Z"/>`;
    case 'lob': return `<path ${f} d="M54 96C50 56 74 34 100 34C126 34 150 56 146 96L152 146C154 158 140 160 130 152L70 152C60 160 46 158 48 146Z"/>`;
    case 'long': return `<path ${f} d="M54 96C50 56 74 33 100 33C126 33 150 56 146 96L154 176C156 190 140 192 128 182L72 182C60 192 44 190 46 176Z"/>`;
    case 'wavy': case 'wavylong': {
      const y = k === 'wavy' ? 0 : 10;
      return `<path ${f} d="M54 96C50 56 74 33 100 33C126 33 150 56 146 96C152 112 144 122 152 134C160 148 148 156 156 168C162 ${180 + y} 146 ${188 + y} 138 ${178 + y}L62 ${178 + y}C54 ${188 + y} 38 ${180 + y} 44 168C52 156 40 148 48 134C56 122 48 112 54 96Z"/>`;
    }
    case 'shag': return `<path ${f} d="M52 98C48 56 74 34 100 34C126 34 152 56 148 98L156 132L146 128L150 148L136 140L134 154L66 154L64 140L50 148L54 128L44 132Z"/>`;
    case 'mullet': return `<path ${f} d="M58 96C54 58 76 36 100 36C124 36 146 58 142 96L148 140L140 136L144 156L128 146L72 146L56 156L60 136L52 140Z"/>`;
    case 'flow': return `<path ${f} d="M55 96C51 58 76 36 100 36C124 36 149 58 145 96L148 118C150 128 140 130 134 124L66 124C60 130 50 128 52 118Z"/>`;
    case 'curly': {
      let p = ''; const pts = [[52, 70, 18], [48, 98, 18], [52, 126, 18], [62, 150, 17], [84, 160, 16], [116, 160, 16], [138, 150, 17], [148, 126, 18], [152, 98, 18], [148, 70, 18], [126, 46, 20], [100, 38, 22], [74, 46, 20]];
      for (const [x, y, r] of pts) p += `<circle cx="${x}" cy="${y}" r="${r}" ${f}/>`;
      return p + `<path ${f} d="M56 70L144 70L150 150L50 150Z"/>`;
    }
    case 'afro': return `<circle cx="100" cy="82" r="64" ${f}/>` + [[46, 60], [42, 96], [52, 126], [154, 60], [158, 96], [148, 126], [76, 26], [124, 26], [100, 20]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="16" ${f}/>`).join('');
    case 'ponyhigh': return `<path ${f} d="M60 96C56 58 76 38 100 38C124 38 144 58 140 96Z"/><path ${f} d="M124 44C150 30 168 52 162 82C158 104 168 120 160 140C154 152 140 150 146 136C152 116 140 100 144 80C148 62 140 52 128 54Z"/><path d="M150 70C154 90 146 104 150 124" stroke="${d}" stroke-width="2.2" fill="none" stroke-linecap="round" opacity=".5"/>`;
    case 'ponylow': return `<path ${f} d="M60 96C56 58 76 38 100 38C124 38 144 58 140 96Z"/><path ${f} d="M128 118C150 122 160 140 156 162C154 176 140 180 140 166C140 150 134 136 122 130Z"/>`;
    case 'bubblepony': return `<path ${f} d="M60 96C56 58 76 38 100 38C124 38 144 58 140 96Z"/>` + [[150, 58, 14], [156, 84, 13], [158, 108, 12], [156, 130, 11], [150, 150, 9]].map(([x, y, r]) => `<ellipse cx="${x}" cy="${y}" rx="${r}" ry="${r * 1.05}" ${f}/>`).join('') + [[153, 71], [157, 96], [157, 119], [153, 140]].map(([x, y]) => `<rect x="${x - 6}" y="${y - 2}" width="12" height="4" rx="2" fill="#f07fae"/>`).join('');
    case 'boxbraids': case 'locs': return `<path ${f} d="M54 98C50 56 74 34 100 34C126 34 150 56 146 98L152 170C140 176 60 176 48 170Z"/>`;
    default: return '';
  }
}

/* Hair that sits over the shoulders/chest (drawn after the outfit, before the head) */
function hairOver(k, c, d) {
  const braid = (x0, y0, x1, y1, n, w) => { let p = ''; for (let i = 0; i < n; i++) { const t = i / (n - 1); const x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t; p += `<ellipse cx="${x}" cy="${y}" rx="${w}" ry="${w * 0.8}" fill="${c}" stroke="${d}" stroke-width="1.2"/>`; } return p; };
  switch (k) {
    case 'braids': return braid(64, 110, 60, 176, 8, 8) + braid(136, 110, 140, 176, 8, 8) + `<rect x="54" y="176" width="12" height="5" rx="2.5" fill="#f07fae"/><rect x="134" y="176" width="12" height="5" rx="2.5" fill="#f07fae"/><path d="M60 181L56 194L64 194Z M140 181L136 194L144 194Z" fill="${c}"/>`;
    case 'sidebraid': return braid(70, 112, 84, 180, 8, 8.5) + `<rect x="78" y="180" width="12" height="5" rx="2.5" fill="#f07fae"/><path d="M84 185L79 198L89 198Z" fill="${c}"/>`;
    case 'boxbraids': case 'locs': {
      const w = k === 'locs' ? 8 : 6.5, dash = k === 'locs' ? '' : `stroke-dasharray="3.2 2.2"`;
      const strand = (x0, y0, x1, y1, bend) => `<path d="M${x0} ${y0}Q${x0 + bend} ${(y0 + y1) / 2} ${x1} ${y1}" stroke="${d}" stroke-width="${w + 2}" stroke-linecap="round" fill="none"/><path d="M${x0} ${y0}Q${x0 + bend} ${(y0 + y1) / 2} ${x1} ${y1}" stroke="${c}" stroke-width="${w}" stroke-linecap="round" fill="none"/><path d="M${x0} ${y0 + 4}Q${x0 + bend} ${(y0 + y1) / 2} ${x1} ${y1 - 2}" stroke="${d}" stroke-width="1.2" ${dash} fill="none" opacity=".55"/>`;
      let p = '';
      [[60, 92, 52, 186, -8], [66, 96, 62, 192, -6], [72, 104, 72, 196, -4], [140, 92, 148, 186, 8], [134, 96, 138, 192, 6], [128, 104, 128, 196, 4]].forEach(([a, b, c2, d2, e]) => { p += strand(a, b, c2, d2, e); });
      return p + (k === 'boxbraids' ? `<circle cx="52" cy="186" r="2.6" fill="#ffd166"/><circle cx="148" cy="186" r="2.6" fill="#ffd166"/>` : '');
    }
    case 'pigtails': return `<path fill="${c}" d="M56 96C40 104 30 128 34 154C36 168 48 170 50 156C52 136 58 120 66 112Z"/><path fill="${c}" d="M144 96C160 104 170 128 166 154C164 168 152 170 150 156C148 136 142 120 134 112Z"/><circle cx="60" cy="104" r="5" fill="#f07fae"/><circle cx="140" cy="104" r="5" fill="#f07fae"/><path d="M42 130C40 142 42 150 44 156M158 130C160 142 158 150 156 156" stroke="${d}" stroke-width="2" fill="none" stroke-linecap="round" opacity=".5"/>`;
    default: return '';
  }
}

/* Buns, bows and other bits on top of the head (drawn before the front hair) */
function hairTop(k, c, d) {
  const f = `fill="${c}" stroke="${d}" stroke-width="1.3"`;
  switch (k) {
    case 'bun': return `<circle cx="100" cy="30" r="17" ${f}/><path d="M88 26C94 20 106 20 112 26" stroke="${d}" stroke-width="2" fill="none" opacity=".5"/>`;
    case 'messybun': return `<circle cx="100" cy="30" r="17" ${f}/><path ${f} d="M86 18C80 10 90 8 92 16Z M112 14C120 8 124 18 114 20Z M118 34C128 36 126 44 118 40Z"/><path d="M90 30C96 22 106 24 110 32M92 38C98 32 106 34 108 38" stroke="${d}" stroke-width="1.8" fill="none" opacity=".55"/>`;
    case 'smallbun': return `<circle cx="100" cy="34" r="11" ${f}/><path d="M92 38C96 42 104 42 108 38" stroke="#f07fae" stroke-width="3" fill="none" stroke-linecap="round"/>`;
    case 'ballet': return `<circle cx="100" cy="30" r="15" ${f}/><circle cx="100" cy="30" r="15" fill="none" stroke="${d}" stroke-width="1.5" opacity=".4"/><path d="M90 30C95 24 105 24 110 30" stroke="${d}" stroke-width="1.6" fill="none" opacity=".5"/><path d="M86 38C92 44 108 44 114 38" stroke="#f9c2d6" stroke-width="4" fill="none" stroke-linecap="round"/>`;
    case 'spacebuns': return `<circle cx="70" cy="44" r="16" ${f}/><circle cx="130" cy="44" r="16" ${f}/><path d="M62 42C66 36 74 36 78 42M122 42C126 36 134 36 138 42" stroke="${d}" stroke-width="1.8" fill="none" opacity=".5"/>`;
    case 'puffs': return `<circle cx="64" cy="48" r="20" ${f}/><circle cx="136" cy="48" r="20" ${f}/>` + [[52, 40], [62, 32], [76, 40], [124, 40], [138, 32], [148, 40]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="7" ${f}/>`).join('');
    case 'bantu': return [[72, 44], [100, 34], [128, 44], [62, 70], [138, 70]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="10" ${f}/><path d="M${x - 5} ${y}C${x - 2} ${y - 5} ${x + 3} ${y - 5} ${x + 5} ${y}" stroke="${d}" stroke-width="1.6" fill="none" opacity=".5"/>`).join('');
    case 'bow': return bowShape(122, 46, 1, '#f07fae');
    case 'ponybow': return bowShape(132, 44, 1.05, '#ff5fa2');
    default: return '';
  }
}
function bowShape(x, y, s, col) {
  return `<g transform="translate(${x} ${y}) scale(${s})"><path d="M0 0C-8-10-20-10-20 0C-20 10-8 10 0 0Z" fill="${col}"/><path d="M0 0C8-10 20-10 20 0C20 10 8 10 0 0Z" fill="${col}"/><path d="M-4 2L-10 14L-4 12Z M4 2L10 14L4 12Z" fill="${shade(col, -0.2)}"/><circle r="4.5" fill="${shade(col, -0.15)}"/><path d="M-14-2C-12-5-8-5-6-3" stroke="#fff" stroke-width="1.6" fill="none" opacity=".7" stroke-linecap="round"/></g>`;
}

/* Hair over the forehead */
function hairFront(k, c, d, l) {
  const f = `fill="${c}" stroke="${d}" stroke-width="1.3" stroke-linejoin="round"`;
  const shine = (p) => `<path d="${p}" stroke="${l}" stroke-width="3" fill="none" stroke-linecap="round" opacity=".55"/>`;
  switch (k) {
    case 'crop': return `<path ${f} d="M57 92C54 58 76 38 100 38C124 38 146 58 143 92L138 76L132 70L126 66L118 70L110 64L102 70L94 64L86 70L78 66L72 72L66 76L62 86Z"/>` + shine('M84 48C92 44 104 44 112 48');
    case 'sidepart': return `<path ${f} d="M57 94C54 58 76 38 100 38C124 38 146 58 143 94L140 76C132 64 116 58 98 62C86 64 74 70 66 80L62 90Z"/>` + `<path d="M80 44C78 52 76 58 74 64" stroke="${d}" stroke-width="2" fill="none" opacity=".45"/>` + shine('M90 48C104 44 120 48 130 58');
    case 'curtain': return `<path ${f} d="M57 98C54 58 76 38 100 38C124 38 146 58 143 98L140 84C134 70 114 62 102 66L100 74L98 66C86 62 66 70 60 84Z"/>` + shine('M78 50C86 46 94 46 98 50M104 50C110 46 118 46 124 52');
    case 'messy': return `<path ${f} d="M56 96C52 58 76 36 100 36C124 36 148 58 144 96L140 80L134 84L132 70L124 76L120 64L112 74L106 62L98 74L92 62L86 74L78 64L74 76L66 70L64 84L60 80Z"/>` + shine('M82 46C92 42 106 42 116 46');
    case 'buzz': return `<path fill="${c}" opacity=".9" d="M60 88C58 60 76 44 100 44C124 44 142 60 140 88C136 72 120 60 100 60C80 60 64 72 60 88Z"/>`;
    case 'fade': return `<path fill="${c}" opacity=".55" d="M60 92C58 66 74 52 100 52C126 52 142 66 140 92C134 78 118 70 100 70C82 70 66 78 60 92Z"/><path ${f} d="M66 70C66 48 82 38 100 38C118 38 134 48 134 70C126 62 114 60 100 62C86 60 74 62 66 70Z"/>` + shine('M86 46C94 42 106 42 114 46');
    case 'crew': return `<path ${f} d="M58 90C55 58 76 40 100 40C124 40 145 58 142 90C138 74 122 64 100 64C78 64 62 74 58 90Z"/>` + shine('M86 48C94 44 106 44 114 48');
    case 'spiky': return `<path ${f} d="M58 92C56 62 72 50 80 46L74 28L90 40L96 22L106 38L118 24L118 42L136 34L128 50C140 58 144 72 142 92C136 74 120 64 100 66C80 64 64 74 58 92Z"/>`;
    case 'pixie': return `<path ${f} d="M56 98C52 58 76 38 100 38C124 38 148 58 144 98L140 90C138 76 128 66 112 66C96 66 82 74 72 86C68 90 62 94 56 98Z"/>` + shine('M96 48C108 46 122 50 130 58');
    case 'slick': return `<path ${f} d="M58 90C56 56 76 38 100 38C124 38 144 56 142 90C136 70 122 58 100 58C78 58 64 70 58 90Z"/>` + `<path d="M76 54C88 46 112 46 124 54M72 64C88 54 112 54 128 64" stroke="${l}" stroke-width="2.4" fill="none" opacity=".5" stroke-linecap="round"/>`;
    case 'blunt': return `<path ${f} d="M55 104C52 58 76 36 100 36C124 36 148 58 145 104L140 104L140 74L60 74L60 104Z"/>` + shine('M78 48C90 42 112 42 124 48');
    case 'curtainbangs': return `<path ${f} d="M55 106C52 58 76 36 100 36C124 36 148 58 145 106L140 104C138 86 128 72 106 66L100 70L94 66C72 72 62 86 60 104Z"/>` + shine('M78 48C88 42 96 42 100 46M104 46C112 42 120 44 126 50');
    case 'middle': return `<path ${f} d="M55 108C52 58 76 36 100 36C124 36 148 58 145 108L140 108C140 82 126 60 100 52C74 60 60 82 60 108Z"/>` + shine('M80 48C88 42 96 40 100 42M104 42C112 42 120 46 124 50');
    case 'middleshort': return `<path ${f} d="M57 94C54 58 76 38 100 38C124 38 146 58 143 94L140 92C138 72 124 58 100 52C76 58 62 72 60 92Z"/>` + shine('M82 48C90 44 98 42 100 44');
    case 'sleek': return `<path ${f} d="M57 94C54 58 76 38 100 38C124 38 146 58 143 94L140 88C134 66 120 54 100 52C80 54 66 66 60 88Z"/>` + shine('M78 52C88 44 112 44 122 52');
    case 'sideswept': return `<path ${f} d="M55 108C52 58 76 36 100 36C124 36 148 58 145 108L140 108C140 86 132 70 116 64C98 60 80 66 70 78C66 84 62 90 60 100Z"/>` + `<path ${f} d="M60 90C64 72 80 60 104 60C116 60 126 64 132 70C118 66 102 68 90 74C78 80 68 86 60 94Z"/>` + shine('M84 48C98 42 116 46 126 54');
    case 'quiff': return `<path ${f} d="M58 90C56 64 70 52 80 48C76 34 90 22 110 24C126 26 136 36 132 46C142 54 144 70 142 90C136 74 120 66 100 66C80 66 64 74 58 90Z"/>` + shine('M92 32C104 28 118 30 126 38');
    case 'undercut': return `<path fill="${c}" opacity=".5" d="M60 92C58 66 74 54 100 54C126 54 142 66 140 92C134 78 118 72 100 72C82 72 66 78 60 92Z"/><path ${f} d="M64 70C62 44 82 32 104 34C124 36 140 48 138 64C126 56 110 56 98 62C88 66 76 66 64 70Z"/>` + shine('M90 40C104 36 120 40 128 48');
    case 'curlytop': return `<path fill="${c}" opacity=".55" d="M60 92C58 66 74 54 100 54C126 54 142 66 140 92C134 78 118 72 100 72C82 72 66 78 60 92Z"/>` + [[74, 56], [86, 46], [100, 42], [114, 46], [126, 56], [80, 64], [96, 60], [110, 62], [122, 66], [68, 66], [132, 66]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="10" ${f}/>`).join('');
    case 'curlyfringe': return [[66, 72], [78, 60], [92, 54], [108, 54], [122, 60], [134, 72], [72, 84], [128, 84]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="11" ${f}/>`).join('') + `<path ${f} d="M58 90C56 60 76 40 100 40C124 40 144 60 142 90L130 70L70 70Z"/>`;
    case 'afroline': return `<path ${f} d="M58 92C56 60 76 40 100 40C124 40 144 60 142 92C138 76 124 64 100 64C76 64 62 76 58 92Z"/>`;
    case 'locsfront': return `<path ${f} d="M57 94C54 58 76 38 100 38C124 38 146 58 143 94C138 74 122 62 100 62C78 62 62 74 57 94Z"/>` + [70, 82, 118, 130].map(x => `<path d="M${x} 62L${x + (x < 100 ? -4 : 4)} 88" stroke="${c}" stroke-width="7" stroke-linecap="round"/>`).join('');
    case 'flow': return `<path ${f} d="M56 96C52 58 76 36 100 36C124 36 148 58 144 96L140 84C134 70 120 62 104 62C92 62 80 66 72 74C70 66 76 58 86 54C74 56 64 64 60 76Z"/>` + shine('M82 48C96 42 114 44 126 52');
    case 'mohawk': return `<path fill="${c}" opacity=".4" d="M60 90C58 64 74 52 100 52C126 52 142 64 140 90C134 76 118 70 100 70C82 70 66 76 60 90Z"/><path ${f} d="M88 70C84 54 86 34 90 18C96 26 100 20 104 12C108 22 112 26 116 22C116 40 114 56 112 70Z"/>`;
    default: return '';
  }
}

function eyes(kind, skin, iris) {
  const doll = (x, lashes) => `<ellipse cx="${x}" cy="${EYE_Y}" rx="7.2" ry="8.8" fill="${iris}"/><ellipse cx="${x}" cy="${EYE_Y + 2.5}" rx="5" ry="5" fill="${shade(iris, 0.25)}" opacity=".55"/><circle cx="${x - 2.4}" cy="${EYE_Y - 3.4}" r="2.8" fill="#fff"/><circle cx="${x + 2.6}" cy="${EYE_Y + 3}" r="1.3" fill="#fff"/>` + (lashes ? `<path d="M${x - 8} ${EYE_Y - 5}Q${x} ${EYE_Y - 12} ${x + 8} ${EYE_Y - 5}" stroke="#2a1d1f" stroke-width="2.4" fill="none" stroke-linecap="round"/>` + (x < 100 ? `<path d="M${x - 7.5} ${EYE_Y - 5.5}L${x - 11} ${EYE_Y - 8.5}M${x - 5.5} ${EYE_Y - 8}L${x - 8} ${EYE_Y - 11.5}" stroke="#2a1d1f" stroke-width="2" stroke-linecap="round"/>` : `<path d="M${x + 7.5} ${EYE_Y - 5.5}L${x + 11} ${EYE_Y - 8.5}M${x + 5.5} ${EYE_Y - 8}L${x + 8} ${EYE_Y - 11.5}" stroke="#2a1d1f" stroke-width="2" stroke-linecap="round"/>`) : '');
  const arcUp = x => `<path d="M${x - 7} ${EYE_Y + 2}Q${x} ${EYE_Y - 7} ${x + 7} ${EYE_Y + 2}" stroke="#2a1d1f" stroke-width="3" fill="none" stroke-linecap="round"/>`;
  const arcDown = x => `<path d="M${x - 7} ${EYE_Y - 1}Q${x} ${EYE_Y + 6} ${x + 7} ${EYE_Y - 1}" stroke="#2a1d1f" stroke-width="3" fill="none" stroke-linecap="round"/>`;
  const heart = x => `<path transform="translate(${x} ${EYE_Y - 4})" d="M0 3C-3-4-12-2-10 5C-8 10 0 13 0 13C0 13 8 10 10 5C12-2 3-4 0 3Z" fill="#ff4f8b"/><circle cx="${x - 4}" cy="${EYE_Y - 2}" r="1.6" fill="#fff"/>`;
  const star = x => `<path transform="translate(${x} ${EYE_Y})" d="M0-10L2.9-3.1L10.5-3.1L4.3 1.4L6.6 8.7L0 4.2L-6.6 8.7L-4.3 1.4L-10.5-3.1L-2.9-3.1Z" fill="#f6b72a" stroke="#b9821a" stroke-width="1"/><circle cx="${x - 2}" cy="${EYE_Y - 2}" r="1.5" fill="#fff"/>`;
  switch (kind) {
    case 'round': return doll(EL, false) + doll(ER, false);
    case 'happy': return arcUp(EL) + arcUp(ER);
    case 'closed': return arcDown(EL) + arcDown(ER);
    case 'wink': return doll(EL, true) + arcUp(ER);
    case 'sleepy': return [EL, ER].map(x => `<path d="M${x - 7.5} ${EYE_Y}A7.5 6 0 0 0 ${x + 7.5} ${EYE_Y}Z" fill="${iris}"/><circle cx="${x - 2}" cy="${EYE_Y + 2}" r="1.6" fill="#fff"/><path d="M${x - 8.5} ${EYE_Y}L${x + 8.5} ${EYE_Y}" stroke="#2a1d1f" stroke-width="2.6" stroke-linecap="round"/>`).join('');
    case 'star': return star(EL) + star(ER);
    case 'heart': return heart(EL) + heart(ER);
    case 'side': return [EL, ER].map(x => `<ellipse cx="${x}" cy="${EYE_Y}" rx="7.2" ry="8.8" fill="#fff"/><ellipse cx="${x + 2.6}" cy="${EYE_Y + .5}" rx="5" ry="6.8" fill="${iris}"/><circle cx="${x + 1.2}" cy="${EYE_Y - 2.4}" r="1.8" fill="#fff"/><path d="M${x - 8} ${EYE_Y - 5}Q${x} ${EYE_Y - 11} ${x + 8} ${EYE_Y - 5}" stroke="#2a1d1f" stroke-width="2.2" fill="none" stroke-linecap="round"/>`).join('');
    case 'wide': return [EL, ER].map(x => `<circle cx="${x}" cy="${EYE_Y}" r="8.6" fill="#fff" stroke="#2a1d1f" stroke-width="1.6"/><circle cx="${x}" cy="${EYE_Y + .5}" r="4.4" fill="${iris}"/><circle cx="${x - 1.4}" cy="${EYE_Y - 1.2}" r="1.5" fill="#fff"/>`).join('');
    case 'cool': return [EL, ER].map(x => `<path d="M${x - 7.5} ${EYE_Y - 2}L${x + 7.5} ${EYE_Y - 2}A7.5 7.5 0 0 1 ${x - 7.5} ${EYE_Y - 2}Z" fill="${iris}"/><circle cx="${x - 2.2}" cy="${EYE_Y + 1}" r="1.8" fill="#fff"/><path d="M${x - 9} ${EYE_Y - 2.5}L${x + 9} ${EYE_Y - 2.5}" stroke="#2a1d1f" stroke-width="2.8" stroke-linecap="round"/>`).join('');
    case 'sparkle': return doll(EL, true) + doll(ER, true) + `<path transform="translate(${ER + 13} ${EYE_Y - 12}) scale(.45)" d="M0-10C1.5-2 2-1.5 10 0C2 1.5 1.5 2 0 10C-1.5 2-2 1.5-10 0C-2-1.5-1.5-2 0-10Z" fill="#ffd15c"/>`;
    default: return doll(EL, true) + doll(ER, true);
  }
}
function brows(kind, col) {
  const s = `stroke="${col}" stroke-width="2.6" fill="none" stroke-linecap="round"`;
  const y = 85;
  switch (kind) {
    case 'raised': return `<path d="M${EL - 7} ${y - 3}Q${EL} ${y - 9} ${EL + 7} ${y - 4}" ${s}/><path d="M${ER - 7} ${y - 4}Q${ER} ${y - 9} ${ER + 7} ${y - 3}" ${s}/>`;
    case 'determined': return `<path d="M${EL - 7} ${y - 3}L${EL + 7} ${y + 1}" ${s}/><path d="M${ER - 7} ${y + 1}L${ER + 7} ${y - 3}" ${s}/>`;
    case 'worried': return `<path d="M${EL - 7} ${y + 1}Q${EL} ${y - 2} ${EL + 7} ${y - 4}" ${s}/><path d="M${ER - 7} ${y - 4}Q${ER} ${y - 2} ${ER + 7} ${y + 1}" ${s}/>`;
    case 'one': return `<path d="M${EL - 7} ${y}Q${EL} ${y - 3} ${EL + 7} ${y}" ${s}/><path d="M${ER - 7} ${y - 5}Q${ER} ${y - 11} ${ER + 7} ${y - 6}" ${s}/>`;
    default: return `<path d="M${EL - 7} ${y}Q${EL} ${y - 5} ${EL + 7} ${y - 1}" ${s}/><path d="M${ER - 7} ${y - 1}Q${ER} ${y - 5} ${ER + 7} ${y}" ${s}/>`;
  }
}
function mouth(kind, lip) {
  const st = `stroke="${lip}" stroke-width="2.6" fill="none" stroke-linecap="round"`;
  const y = MOUTH_Y;
  switch (kind) {
    case 'open': return `<path d="M90 ${y - 3}Q100 ${y + 12} 110 ${y - 3}Z" fill="#8f3446"/><path d="M93 ${y + 3}Q100 ${y + 9} 107 ${y + 3}Q100 ${y + 1} 93 ${y + 3}Z" fill="#ff8aa6"/><path d="M90 ${y - 3}L110 ${y - 3}" stroke="#8f3446" stroke-width="2" stroke-linecap="round"/>`;
    case 'laugh': return `<path d="M88 ${y - 4}Q100 ${y + 16} 112 ${y - 4}Z" fill="#8f3446"/><path d="M92 ${y + 4}Q100 ${y + 12} 108 ${y + 4}Q100 ${y + 1} 92 ${y + 4}Z" fill="#ff8aa6"/><path d="M90 ${y - 4}L110 ${y - 4}L108 ${y}L92 ${y}Z" fill="#fff"/>`;
    case 'tongue': return `<path d="M91 ${y - 2}Q100 ${y + 8} 109 ${y - 2}Z" fill="#8f3446"/><path d="M95 ${y + 1}Q95 ${y + 10} 100 ${y + 10}Q105 ${y + 10} 105 ${y + 1}Z" fill="#ff7c9c"/><path d="M100 ${y + 2}L100 ${y + 7}" stroke="#e05a7d" stroke-width="1.2"/>`;
    case 'cat': return `<path d="M92 ${y - 1}Q96 ${y + 4} 100 ${y}Q104 ${y + 4} 108 ${y - 1}" ${st}/>`;
    case 'smirk': return `<path d="M93 ${y + 1}Q103 ${y + 4} 109 ${y - 4}" ${st}/>`;
    case 'o': return `<ellipse cx="100" cy="${y + 1}" rx="3.6" ry="4.6" fill="#8f3446"/>`;
    case 'grin': return `<path d="M89 ${y - 3}Q100 ${y + 10} 111 ${y - 3}Z" fill="#fff" stroke="${lip}" stroke-width="2" stroke-linejoin="round"/><path d="M92 ${y}L108 ${y}" stroke="${shade(lip, 0.5)}" stroke-width="1"/>`;
    case 'small': return `<path d="M96 ${y}Q100 ${y + 3.5} 104 ${y}" ${st}/>`;
    case 'pout': return `<ellipse cx="100" cy="${y + 1}" rx="4.6" ry="3.2" fill="#e9798f"/><path d="M96 ${y + 1}L104 ${y + 1}" stroke="#b44a62" stroke-width="1.2" stroke-linecap="round"/>`;
    case 'kiss': return `<path transform="translate(100 ${y + 1})" d="M0 2C-2-2-7-1-6 3C-5 6 0 8 0 8C0 8 5 6 6 3C7-1 2-2 0 2Z" fill="#ff5f8a"/>`;
    case 'flat': return `<path d="M95 ${y + 1}L105 ${y + 1}" ${st}/>`;
    default: return `<path d="M92 ${y - 1}Q100 ${y + 7} 108 ${y - 1}" ${st}/>`;
  }
}
function detail(kind, hairC, skin, phase) {
  // phase 'under' = on the skin before eyes; 'over' = on top (beards, lips, stickers)
  const beardC = shade(hairC, -0.1);
  if (phase === 'under') {
    if (kind === 'freckles') return [[76, 110], [81, 113], [86, 110], [114, 110], [119, 113], [124, 110], [79, 107], [121, 107]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.1" fill="${shade(skin, -0.38)}"/>`).join('');
    if (kind === 'rosy') return `<ellipse cx="77" cy="112" rx="10" ry="6" fill="#ff6f96" opacity=".45"/><ellipse cx="123" cy="112" rx="10" ry="6" fill="#ff6f96" opacity=".45"/>`;
    if (kind === 'stubble') return `<path d="M68 112C70 128 84 137 100 137C116 137 130 128 132 112C124 126 114 130 100 130C86 130 76 126 68 112Z" fill="${beardC}" opacity=".28"/><path d="M90 113Q100 110 110 113" stroke="${beardC}" stroke-width="3" opacity=".3" fill="none" stroke-linecap="round"/>`;
    return '';
  }
  if (kind === 'mark') return `<circle cx="121" cy="117" r="1.5" fill="#3a2627"/>`;
  if (kind === 'shortbeard') return `<path d="M64 104C64 126 80 142 100 142C120 142 136 126 136 104C132 120 120 126 112 124C108 118 92 118 88 124C80 126 68 120 64 104Z" fill="${beardC}"/><path d="M91 114Q100 110 109 114Q106 117 100 115Q94 117 91 114Z" fill="${beardC}"/>`;
  if (kind === 'beard') return `<path d="M60 98C58 128 76 150 100 150C124 150 142 128 140 98C136 118 122 126 112 124C108 118 92 118 88 124C78 126 64 118 60 98Z" fill="${beardC}"/><path d="M89 114Q100 108 111 114Q107 118 100 116Q93 118 89 114Z" fill="${beardC}"/>`;
  if (kind === 'goatee') return `<path d="M93 125C93 134 96 138 100 138C104 138 107 134 107 125C104 128 96 128 93 125Z" fill="${beardC}"/><path d="M91 114Q100 110 109 114Q106 117 100 115Q94 117 91 114Z" fill="${beardC}"/>`;
  if (kind === 'moustache') return `<path d="M88 116Q94 109 100 113Q106 109 112 116Q106 115 100 117Q94 115 88 116Z" fill="${beardC}"/>`;
  if (kind === 'heart') return `<path transform="translate(124 113) scale(.55)" d="M0 3C-3-4-12-2-10 5C-8 10 0 13 0 13C0 13 8 10 10 5C12-2 3-4 0 3Z" fill="#ff5f8a"/>`;
  if (kind === 'stars') return [[75, 111, .38], [125, 111, .38], [130, 104, .25]].map(([x, y, s]) => `<path transform="translate(${x} ${y}) scale(${s})" d="M0-10L2.9-3.1L10.5-3.1L4.3 1.4L6.6 8.7L0 4.2L-6.6 8.7L-4.3 1.4L-10.5-3.1L-2.9-3.1Z" fill="#ffc83d"/>`).join('');
  if (kind === 'glitter') return [[72, 110], [77, 114], [80, 108], [120, 108], [123, 114], [128, 110], [75, 117], [125, 117]].map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="${i % 2 ? 0.9 : 1.4}" fill="${i % 3 ? '#fff6c2' : '#ff9ec4'}"/>`).join('');
  if (kind.startsWith('lips:')) { const c = kind.slice(5); return `<path d="M91 ${MOUTH_Y - 1}Q95 ${MOUTH_Y - 4} 100 ${MOUTH_Y - 2}Q105 ${MOUTH_Y - 4} 109 ${MOUTH_Y - 1}Q100 ${MOUTH_Y + 8} 91 ${MOUTH_Y - 1}Z" fill="${c}"/><path d="M93 ${MOUTH_Y}Q100 ${MOUTH_Y + 2} 107 ${MOUTH_Y}" stroke="${shade(c, -0.35)}" stroke-width="1" fill="none"/><circle cx="96" cy="${MOUTH_Y + 2}" r="1" fill="#fff" opacity=".6"/>`; }
  if (kind === 'liner') return `<path d="M${EL - 8} ${EYE_Y - 5}L${EL - 14} ${EYE_Y - 9}M${ER + 8} ${EYE_Y - 5}L${ER + 14} ${EYE_Y - 9}" stroke="#2a1d1f" stroke-width="2.6" stroke-linecap="round"/>`;
  if (kind === 'lashes' || kind === 'glam') {
    const l = [EL, ER].map(x => { const sgn = x < 100 ? -1 : 1; return `<path d="M${x + sgn * 6} ${EYE_Y - 7}L${x + sgn * 11} ${EYE_Y - 11}M${x + sgn * 3} ${EYE_Y - 9}L${x + sgn * 6} ${EYE_Y - 14}M${x} ${EYE_Y - 10}L${x + sgn * 1} ${EYE_Y - 15}" stroke="#2a1d1f" stroke-width="1.9" stroke-linecap="round"/>`; }).join('');
    return l + (kind === 'glam' ? `<path d="M91 ${MOUTH_Y - 1}Q95 ${MOUTH_Y - 4} 100 ${MOUTH_Y - 2}Q105 ${MOUTH_Y - 4} 109 ${MOUTH_Y - 1}Q100 ${MOUTH_Y + 8} 91 ${MOUTH_Y - 1}Z" fill="#e8548a"/><ellipse cx="${EL}" cy="${EYE_Y - 7}" rx="9" ry="3" fill="#c79bf2" opacity=".35"/><ellipse cx="${ER}" cy="${EYE_Y - 7}" rx="9" ry="3" fill="#c79bf2" opacity=".35"/>` : '');
  }
  return '';
}

function outfit(kind, col, skin, uid, c2) {
  const dk = shade(col, -0.18), lt = shade(col, 0.25), ink = lum(col) > 0.55 ? shade(col, -0.35) : shade(col, 0.35);
  const torso = (fill) => `<path d="${BODY}" fill="${fill}"/>`;
  const sleeves = `<path d="M58 168C60 182 60 192 58 202M142 168C140 182 140 192 142 202" stroke="${dk}" stroke-width="2" fill="none" stroke-linecap="round" opacity=".7"/>`;
  const crew = `<path d="M84 151C88 162 112 162 116 151" stroke="${dk}" stroke-width="3.2" fill="none" stroke-linecap="round"/>`;
  switch (kind) {
    case 'hoodie': return torso(col) + `<path d="M72 152C76 138 124 138 128 152C120 164 80 164 72 152Z" fill="${dk}"/><path d="M80 152C86 160 114 160 120 152" stroke="${shade(col, -0.32)}" stroke-width="2" fill="none"/><path d="M92 160L91 180M108 160L109 180" stroke="${lt}" stroke-width="2.4" stroke-linecap="round"/><circle cx="91" cy="181" r="2" fill="${lt}"/><circle cx="109" cy="181" r="2" fill="${lt}"/><path d="M76 190L124 190" stroke="${dk}" stroke-width="2" opacity=".6"/>` + sleeves;
    case 'knit': return torso(col) + `<path d="M80 151C86 164 114 164 120 151L116 148C110 156 90 156 84 148Z" fill="${dk}"/>` + [80, 92, 108, 120].map(x => `<path d="M${x} 168L${x} 202" stroke="${dk}" stroke-width="2.4" stroke-dasharray="3 3" opacity=".6"/>`).join('') + sleeves;
    case 'stripes': return `<defs><pattern id="${uid}st" width="12" height="12" patternUnits="userSpaceOnUse"><rect width="12" height="12" fill="#fbfaf6"/><rect width="12" height="5" fill="${col}"/></pattern></defs>` + torso(`url(#${uid}st)`) + crew;
    case 'denim': return torso('#fbfaf6') + `<path d="M30 202C30 172 52 156 84 151L92 151L96 202Z" fill="${col}"/><path d="M170 202C170 172 148 156 116 151L108 151L104 202Z" fill="${col}"/><path d="M84 151L92 172L98 160M116 151L108 172L102 160" fill="${dk}"/><path d="M66 176L84 176L84 186L66 186ZM116 176L134 176L134 186L116 186Z" fill="none" stroke="#f3c766" stroke-width="1.2" stroke-dasharray="2 2"/><circle cx="94" cy="186" r="1.8" fill="#d9b14c"/><circle cx="106" cy="186" r="1.8" fill="#d9b14c"/>`;
    case 'leather': return torso('#f4f1ea') + `<path d="M30 202C30 172 52 156 84 151L90 151L98 202Z" fill="${col}"/><path d="M170 202C170 172 148 156 116 151L110 151L102 202Z" fill="${col}"/><path d="M84 151L94 170L88 172ZM116 151L106 170L112 172Z" fill="${shade(col, 0.15)}"/><path d="M98 172L98 202" stroke="#bdbdbd" stroke-width="2"/><path d="M50 172C56 166 64 166 70 170" stroke="${shade(col, 0.25)}" stroke-width="2" fill="none" opacity=".6"/>`;
    case 'varsity': return torso('#fbfaf6') + `<path d="M30 202C30 172 52 156 84 151L96 151L96 202Z" fill="${col}"/><path d="M170 202C170 172 148 156 116 151L104 151L104 202Z" fill="${col}"/><path d="M30 202C30 180 40 166 56 160L64 202Z M170 202C170 180 160 166 144 160L136 202Z" fill="#fbfaf6"/><path d="M82 151C88 160 112 160 118 151" stroke="#2a2a2e" stroke-width="4" fill="none"/><text x="70" y="186" font-family="Georgia,serif" font-weight="700" font-size="16" fill="#fbfaf6">S</text>` + [176, 186, 196].map(y => `<circle cx="96" cy="${y}" r="1.6" fill="#2a2a2e"/>`).join('');
    case 'cardigan': return torso('#fbfaf6') + `<path d="M30 202C30 172 52 156 84 151L98 202Z" fill="${col}"/><path d="M170 202C170 172 148 156 116 151L102 202Z" fill="${col}"/>` + [170, 182, 194].map(y => `<circle cx="${92 + (y - 170) * 0.1}" cy="${y}" r="2" fill="${dk}"/>`).join('') + sleeves;
    case 'flannel': return `<defs><pattern id="${uid}fl" width="16" height="16" patternUnits="userSpaceOnUse"><rect width="16" height="16" fill="${col}"/><rect width="16" height="5" fill="${dk}" opacity=".8"/><rect width="5" height="16" fill="${dk}" opacity=".8"/><rect x="10" width="1.5" height="16" fill="${lt}" opacity=".6"/></pattern></defs>` + torso(`url(#${uid}fl)`) + `<path d="M84 151L100 166L116 151L110 150L100 158L90 150Z" fill="${dk}"/><path d="M100 166L100 202" stroke="${shade(col, -0.4)}" stroke-width="1.4"/>`;
    case 'dress': case 'slip': case 'puff': case 'crop': {
      const skinBody = torso(skin) + `<path d="M84 151C88 156 112 156 116 151" stroke="${shade(skin, -0.12)}" stroke-width="2" fill="none" opacity=".6"/>`;
      if (kind === 'crop') return skinBody + `<path d="M58 176C70 170 86 172 100 176C114 172 130 170 142 176L148 202L52 202Z" fill="${col}"/><path d="M74 172L72 160M126 172L128 160" stroke="${col}" stroke-width="3" stroke-linecap="round"/>`;
      if (kind === 'slip') return skinBody + `<path d="M62 174C76 166 90 176 100 172C110 176 124 166 138 174L150 202L50 202Z" fill="${col}"/><path d="M70 170L76 152M130 170L124 152" stroke="${shade(col, -0.2)}" stroke-width="1.6"/><path d="M70 182C90 186 110 186 130 182" stroke="${lt}" stroke-width="3" fill="none" opacity=".6" stroke-linecap="round"/>`;
      if (kind === 'puff') return skinBody + `<path d="M56 172C72 168 86 176 100 170C114 176 128 168 144 172L152 202L48 202Z" fill="${col}"/><ellipse cx="50" cy="170" rx="18" ry="14" fill="${col}"/><ellipse cx="150" cy="170" rx="18" ry="14" fill="${col}"/><path d="M40 166C46 160 54 160 60 164M140 164C146 160 154 160 160 166" stroke="${lt}" stroke-width="2.2" fill="none" opacity=".7" stroke-linecap="round"/><circle cx="100" cy="178" r="3.4" fill="#fff6c2"/>`;
      return skinBody + `<path d="M58 172C70 164 86 174 100 168C114 174 130 164 142 172L150 202L50 202Z" fill="${col}"/><path d="M66 170L70 154M134 170L130 154" stroke="${col}" stroke-width="3.2" stroke-linecap="round"/><path d="M60 186C80 192 120 192 140 186" stroke="${lt}" stroke-width="2.4" fill="none" opacity=".6" stroke-linecap="round"/>`;
    }
    case 'wrap': return torso(col) + `<path d="M84 151L100 176L116 151Z" fill="${skin}"/><path d="M84 151L104 184M116 151L96 184" stroke="${dk}" stroke-width="2" fill="none"/><path d="M60 196C80 190 120 190 140 196" stroke="${lt}" stroke-width="3" fill="none" opacity=".6"/>` + sleeves;
    case 'coquette': return torso('#fffafc') + `<path d="M30 202C30 172 52 156 84 151L94 202Z" fill="${col}"/><path d="M170 202C170 172 148 156 116 151L106 202Z" fill="${col}"/>` + [166, 180, 194].map(y => bowShape(100, y, 0.32, '#ff7aa8')).join('') + `<path d="M84 151C88 158 112 158 116 151" stroke="#f3c6d6" stroke-width="2" fill="none"/>`;
    case 'windbreaker': return torso(col) + `<path d="M30 202C30 184 34 176 42 170L158 170C166 176 170 184 170 202Z" fill="${dk}" opacity=".0"/><path d="M42 176L158 176L160 186L40 186Z" fill="${c2}"/><path d="M82 146L118 146L120 158L80 158Z" fill="${c2}"/><path d="M100 158L100 202" stroke="${shade(col, -0.35)}" stroke-width="2"/>`;
    case 'fleece': return torso(col) + `<path d="M80 144L120 144L122 160L78 160Z" fill="${c2}"/><path d="M100 144L100 202" stroke="${c2}" stroke-width="2.4"/><path d="M60 172L80 172L80 186L60 186Z" fill="${c2}" opacity=".85"/>`;
    case 'denimshirt': return torso(col) + `<path d="M84 151L100 164L116 151L110 149L100 157L90 149Z" fill="${dk}"/><path d="M100 164L100 202" stroke="${dk}" stroke-width="1.6"/>` + [174, 186, 198].map(y => `<circle cx="102" cy="${y}" r="1.5" fill="#f3e3b3"/>`).join('') + `<path d="M70 174L88 174L88 186L70 186ZM112 174L130 174L130 186L112 186Z" fill="none" stroke="${dk}" stroke-width="1.4"/>`;
    case 'trench': return torso(col) + `<path d="M84 151L98 186L80 182L72 158Z M116 151L102 186L120 182L128 158Z" fill="${shade(col, 0.12)}"/><path d="M84 151L100 170L116 151Z" fill="#2b2b30"/>` + [[90, 190], [110, 190], [90, 200], [110, 200]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2" fill="${shade(col, -0.35)}"/>`).join('');
    case 'jersey': return `<defs><pattern id="${uid}js" width="16" height="16" patternUnits="userSpaceOnUse"><rect width="16" height="16" fill="${col}"/><rect width="5" height="16" fill="${c2}"/></pattern></defs>` + torso(`url(#${uid}js)`) + `<path d="M86 151L100 164L114 151" stroke="#fbfbf8" stroke-width="4" fill="none"/><circle cx="120" cy="176" r="5" fill="#f6d36b" stroke="#c59b2a" stroke-width="1"/>`;
    case 'retro': return `<defs><pattern id="${uid}rt" width="18" height="18" patternUnits="userSpaceOnUse"><rect width="18" height="18" fill="${col}"/><circle cx="5" cy="5" r="3.4" fill="${c2}"/><circle cx="14" cy="14" r="2.4" fill="#f6e3c0"/></pattern></defs>` + torso(`url(#${uid}rt)`) + `<path d="M84 151L100 180L116 151Z" fill="${skin}"/><path d="M84 151L94 168L80 166ZM116 151L106 168L120 166Z" fill="${c2}"/>`;
    case 'suede': return torso('#f4f1ea') + `<path d="M30 202C30 172 52 156 84 151L92 151L97 202Z" fill="${col}"/><path d="M170 202C170 172 148 156 116 151L108 151L103 202Z" fill="${col}"/><path d="M84 151L94 170L86 172ZM116 151L106 170L114 172Z" fill="${shade(col, -0.15)}"/>` + [174, 188].map(y => `<circle cx="95" cy="${y}" r="1.8" fill="${shade(col, -0.35)}"/>`).join('');
    case 'polo': return torso(col) + `<path d="M84 150L96 160L100 152L104 160L116 150L110 147L100 152L90 147Z" fill="${c2 || dk}"/><path d="M100 152L100 172" stroke="${shade(col, -0.25)}" stroke-width="1.4"/><circle cx="100" cy="162" r="1.3" fill="${shade(col, -0.35)}"/><circle cx="100" cy="168" r="1.3" fill="${shade(col, -0.35)}"/>` + (c2 ? `<path d="M56 196C60 190 62 182 62 176M144 196C140 190 138 182 138 176" stroke="${c2}" stroke-width="3" fill="none" opacity=".8"/>` : '');
    case 'puffer': return torso(col) + [164, 178, 192].map(y => `<path d="M34 ${y}C70 ${y + 4} 130 ${y + 4} 166 ${y}" stroke="${dk}" stroke-width="2.4" fill="none"/>`).join('') + `<path d="M78 142L122 142L124 160L76 160Z" fill="${dk}"/><path d="M100 142L100 202" stroke="${shade(col, -0.35)}" stroke-width="2"/>`;
    case 'western': return torso(col) + `<path d="M40 172C60 160 80 168 100 178C120 168 140 160 160 172" stroke="${c2}" stroke-width="3" fill="none"/><path d="M84 151L100 164L116 151L110 149L100 157L90 149Z" fill="${c2}"/>` + [172, 184, 196].map(y => `<circle cx="100" cy="${y}" r="2" fill="#fbf7ee" stroke="${c2}" stroke-width="1"/>`).join('');
    case 'zip': return torso(col) + `<path d="M80 144L120 144L122 158L78 158Z" fill="${col}" stroke="${dk}" stroke-width="1.4"/><path d="M100 144L100 202" stroke="${c2}" stroke-width="2.2"/><path d="M46 168L52 202M154 168L148 202" stroke="${c2}" stroke-width="3"/>`;
    case 'babytee': return torso(col) + crew + `<path transform="translate(100 176) scale(.7)" d="M0 3C-3-4-12-2-10 5C-8 10 0 13 0 13C0 13 8 10 10 5C12-2 3-4 0 3Z" fill="#ff7aa8"/>`;
    case 'boho': return torso(skin) + `<path d="M50 166C70 160 86 168 100 164C114 168 130 160 150 166L156 202L44 202Z" fill="${col}"/><path d="M46 168C60 176 80 174 100 172C120 174 140 176 154 168" stroke="${c2}" stroke-width="2" fill="none" stroke-dasharray="4 3"/>` + [[70, 186], [96, 192], [124, 184], [144, 196]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="3" fill="${c2}"/><circle cx="${x}" cy="${y}" r="1.2" fill="#fff4c2"/>`).join('');
    case 'tux': return torso(col) + `<path d="M84 151L100 196L116 151Z" fill="#fbfaf6"/><path d="M84 151L96 182L88 186L78 156Z M116 151L104 182L112 186L122 156Z" fill="${shade(col, 0.12)}"/><path d="M92 158L100 162L108 158L108 166L100 162L92 166Z" fill="#1d1d22"/><circle cx="100" cy="174" r="1.4" fill="#1d1d22"/><circle cx="100" cy="184" r="1.4" fill="#1d1d22"/>`;
    default: return torso(col) + crew + sleeves;
  }
}

function glasses(kind) {
  const L = EL, R = ER, y = EYE_Y;
  const bridge = (c, w = 2.2) => `<path d="M${L + 10} ${y - 1}Q100 ${y - 5} ${R - 10} ${y - 1}" stroke="${c}" stroke-width="${w}" fill="none"/><path d="M${L - 11} ${y - 2}L60 ${y - 5}M${R + 11} ${y - 2}L140 ${y - 5}" stroke="${c}" stroke-width="${w}"/>`;
  switch (kind) {
    case 'round': return `<circle cx="${L}" cy="${y}" r="11" fill="#fff" fill-opacity=".12" stroke="#2a1d1f" stroke-width="2.4"/><circle cx="${R}" cy="${y}" r="11" fill="#fff" fill-opacity=".12" stroke="#2a1d1f" stroke-width="2.4"/>` + bridge('#2a1d1f');
    case 'square': return `<rect x="${L - 12}" y="${y - 9}" width="24" height="18" rx="4" fill="#fff" fill-opacity=".12" stroke="#3b2c2c" stroke-width="2.8"/><rect x="${R - 12}" y="${y - 9}" width="24" height="18" rx="4" fill="#fff" fill-opacity=".12" stroke="#3b2c2c" stroke-width="2.8"/>` + bridge('#3b2c2c', 2.6);
    case 'cat': return [L, R].map(x => { const s = x < 100 ? -1 : 1; return `<path d="M${x - 12} ${y - 6}Q${x} ${y - 10} ${x + 12} ${y - 6}L${x + 12 * 1} ${y + 2}Q${x} ${y + 12} ${x - 12} ${y + 2}Z" fill="#fff" fill-opacity=".12" stroke="#c2185b" stroke-width="2.6" stroke-linejoin="round"/><path d="M${x + s * 12} ${y - 6}L${x + s * 17} ${y - 11}" stroke="#c2185b" stroke-width="2.6" stroke-linecap="round"/>`; }).join('') + bridge('#c2185b');
    case 'heart': return [L, R].map(x => `<path transform="translate(${x} ${y - 6}) scale(1.25)" d="M0 3C-3-4-12-2-10 5C-8 10 0 13 0 13C0 13 8 10 10 5C12-2 3-4 0 3Z" fill="#ff4f8b" fill-opacity=".85" stroke="#d81b60" stroke-width="1.4"/><circle cx="${x - 5}" cy="${y - 2}" r="2" fill="#fff" opacity=".8"/>`).join('') + bridge('#d81b60');
    case 'star': return [L, R].map(x => `<path transform="translate(${x} ${y}) scale(1.25)" d="M0-10L2.9-3.1L10.5-3.1L4.3 1.4L6.6 8.7L0 4.2L-6.6 8.7L-4.3 1.4L-10.5-3.1L-2.9-3.1Z" fill="#ffc83d" fill-opacity=".9" stroke="#e09a12" stroke-width="1.2"/>`).join('') + bridge('#e09a12');
    case 'aviator': return [L, R].map(x => `<path d="M${x - 12} ${y - 7}L${x + 12} ${y - 7}Q${x + 12} ${y + 12} ${x} ${y + 11}Q${x - 12} ${y + 10} ${x - 12} ${y - 7}Z" fill="#4a3a32" fill-opacity=".85" stroke="#c9a14a" stroke-width="1.8"/><path d="M${x - 8} ${y - 3}L${x - 3} ${y - 3}" stroke="#fff" stroke-width="1.6" opacity=".6" stroke-linecap="round"/>`).join('') + bridge('#c9a14a', 1.8);
    case 'retro': return `<rect x="${L - 13}" y="${y - 8}" width="26" height="15" rx="6" fill="#1d1d22"/><rect x="${R - 13}" y="${y - 8}" width="26" height="15" rx="6" fill="#1d1d22"/><path d="M${L - 8} ${y - 4}L${L - 2} ${y - 4}M${R - 8} ${y - 4}L${R - 2} ${y - 4}" stroke="#fff" stroke-width="1.6" opacity=".5" stroke-linecap="round"/>` + bridge('#1d1d22', 3);
    case 'white': return `<rect x="${L - 13}" y="${y - 8}" width="26" height="15" rx="7" fill="#2a2a30" stroke="#fbfaf6" stroke-width="3"/><rect x="${R - 13}" y="${y - 8}" width="26" height="15" rx="7" fill="#2a2a30" stroke="#fbfaf6" stroke-width="3"/>` + bridge('#fbfaf6', 3);
    default: return '';
  }
}

function hat(kind, hairC) {
  switch (kind) {
    case 'beanie': return `<path d="M54 82C52 44 74 26 100 26C126 26 148 44 146 82Z" fill="#e5677d"/><rect x="50" y="72" width="100" height="16" rx="8" fill="#c94c63"/>` + [62, 74, 86, 98, 110, 122, 134].map(x => `<path d="M${x} 74L${x} 86" stroke="#b03e55" stroke-width="2"/>`).join('') + `<circle cx="100" cy="22" r="10" fill="#fbe3e8"/>`;
    case 'cap': return `<path d="M56 78C54 46 76 30 100 30C124 30 146 46 144 78Z" fill="#3e6fb3"/><path d="M56 78C80 70 120 70 144 78C150 80 162 82 166 88C150 90 120 84 100 84C80 84 62 84 56 78Z" fill="#2f5896"/><circle cx="100" cy="32" r="3.5" fill="#2f5896"/><path d="M100 32L100 74" stroke="#2f5896" stroke-width="1.6" opacity=".6"/>`;
    case 'turban': return `<path d="M54 86C50 48 74 28 100 28C126 28 150 48 146 86C136 74 120 70 100 70C80 70 64 74 54 86Z" fill="#7d5bd6"/><path d="M60 72C76 56 112 50 140 66M58 58C80 42 116 40 138 52" stroke="#6243b8" stroke-width="3" fill="none" stroke-linecap="round"/><path d="M100 70L94 54L106 54Z" fill="#6243b8"/>`;
    case 'bigbow': return bowShape(100, 44, 1.5, '#ff5fa2');
    case 'flowers': return [[64, 66, '#ff8fb1'], [78, 52, '#ffd166'], [94, 46, '#ff6f96'], [110, 46, '#c3a6ff'], [124, 52, '#ffd166'], [136, 66, '#ff8fb1']].map(([x, y, c]) => `<g transform="translate(${x} ${y})">${[0, 72, 144, 216, 288].map(a => `<ellipse rx="4.4" ry="7" transform="rotate(${a}) translate(0 -5)" fill="${c}"/>`).join('')}<circle r="3.2" fill="#fff4c2"/></g>`).join('') + [[71, 58], [102, 44], [131, 58]].map(([x, y]) => `<ellipse cx="${x}" cy="${y}" rx="4" ry="7" fill="#7bc796" transform="rotate(40 ${x} ${y})"/>`).join('');
    case 'tiara': return `<path d="M70 58L76 40L86 54L100 32L114 54L124 40L130 58Q100 50 70 58Z" fill="#f6d36b" stroke="#d9a93a" stroke-width="1.6" stroke-linejoin="round"/><circle cx="100" cy="40" r="4" fill="#ff6fa8"/><circle cx="80" cy="50" r="2.6" fill="#8fd3ff"/><circle cx="120" cy="50" r="2.6" fill="#8fd3ff"/>`;
    default: return '';
  }
}
/* The hijab replaces hair entirely: one piece behind the head and one framing the face. */
function hijab(col, uid) {
  return {
    back: `<path d="M46 110C40 54 70 26 100 26C130 26 160 54 154 110L164 166C150 172 122 164 100 164C78 164 50 172 36 166Z" fill="${col}"/>`,
    front: `<path d="M50 120C46 64 72 34 100 34C128 34 154 64 150 120C150 140 134 154 120 158C134 140 140 122 138 96C136 70 120 54 100 54C80 54 64 70 62 96C60 122 66 140 80 158C66 154 50 140 50 120Z" fill="${col}"/><path d="M62 96C64 70 80 56 100 56" stroke="${shade(col, 0.2)}" stroke-width="2" fill="none" opacity=".6"/>`,
  };
}

/* ---------- full body: bottoms, shoes, tops, arms ---------- */
const TORSO_F = 'M68 162C68 152 78 148 88 147L112 147C122 148 132 152 132 162L134 236L66 236Z';
const TORSO_COAT = 'M68 162C68 152 78 148 88 147L112 147C122 148 132 152 132 162L140 292L60 292Z';
const TORSO_CROP = 'M68 162C68 152 78 148 88 147L112 147C122 148 132 152 132 162L133 200L67 200Z';
const TORSO_BABY = 'M68 162C68 152 78 148 88 147L112 147C122 148 132 152 132 162L133 214L67 214Z';
const PANEL_L = 'M68 162C68 152 78 148 88 147L97 236L66 236Z', PANEL_R = 'M132 162C132 152 122 148 112 147L103 236L134 236Z';
const DRESSY = ['dress', 'slip', 'puff', 'boho'];
const SLEEVES = { tee: 'short', babytee: 'short', stripes: 'short', jersey: 'short', polo: 'short', retro: 'short', crop: 'none', dress: 'none', slip: 'none', boho: 'none', puff: 'puff' };

function legs(skin) {
  const d = shade(skin, -0.12);
  return `<rect x="77" y="222" width="20" height="134" rx="9" fill="${skin}" stroke="${d}" stroke-width="1"/><rect x="103" y="222" width="20" height="134" rx="9" fill="${skin}" stroke="${d}" stroke-width="1"/>`;
}
function bottomsFull(kind, col, uid) {
  if (!kind) return '';
  const dk = shade(col, -0.2), lt = shade(col, 0.28);
  const band = `<path d="M72 222L128 222L128 230L72 230Z" fill="${dk}"/>`;
  const fly = `<path d="M100 230L100 258" stroke="${dk}" stroke-width="1.4"/>`;
  const pk = `<path d="M76 236Q84 242 92 234M124 236Q116 242 108 234" stroke="${lt}" stroke-width="1.4" fill="none"/>`;
  const legsShape = (outerL, outerR, hemY) => `M72 222L128 222L${outerR} ${hemY}L103 ${hemY}L101 262L99 262L97 ${hemY}L${outerL} ${hemY}Z`;
  switch (kind) {
    case 'jeans': return `<path d="${legsShape(73, 127, 352)}" fill="${col}"/>` + band + fly + pk + `<path d="M86 270L86 350M114 270L114 350" stroke="${lt}" stroke-width="1" opacity=".5"/>`;
    case 'wide': return `<path d="${legsShape(63, 137, 354)}" fill="${col}"/>` + band + fly + pk;
    case 'flare': return `<path d="M73 222L127 222L125 298L138 354L103 354L101 262L99 262L97 354L62 354L75 298Z" fill="${col}"/>` + `<path d="M70 222L130 222L130 228L70 228Z" fill="${dk}"/>` + fly + pk;
    case 'cargo': return `<path d="${legsShape(64, 136, 354)}" fill="${col}"/>` + band + fly + `<rect x="66" y="274" width="13" height="22" rx="2" fill="${dk}"/><rect x="121" y="274" width="13" height="22" rx="2" fill="${dk}"/><path d="M66 279L79 279M121 279L134 279" stroke="${lt}" stroke-width="1"/>`;
    case 'joggers': return `<path d="${legsShape(73, 127, 340)}" fill="${col}"/><rect x="75" y="336" width="23" height="12" rx="5" fill="${dk}"/><rect x="102" y="336" width="23" height="12" rx="5" fill="${dk}"/>` + band + `<path d="M96 230L95 242M104 230L105 242" stroke="${lt}" stroke-width="1.6" stroke-linecap="round"/>`;
    case 'trousers': return `<path d="${legsShape(68, 132, 354)}" fill="${col}"/>` + band + fly + `<path d="M85 240L83 352M115 240L117 352" stroke="${dk}" stroke-width="1.2" opacity=".55"/>`;
    case 'cords': return `<path d="${legsShape(72, 128, 352)}" fill="${col}"/>` + band + fly + [78, 84, 90, 110, 116, 122].map(x => `<path d="M${x} 236L${x} 350" stroke="${lt}" stroke-width="1.2" opacity=".45"/>`).join('');
    case 'leggings': return `<path d="M74 222L126 222L124 352L104 352L101 262L99 262L96 352L76 352Z" fill="${col}"/>` + band + `<path d="M77 240L78 350M123 240L122 350" stroke="${lt}" stroke-width="2.4" opacity=".7"/>`;
    case 'shorts': return `<path d="${legsShape(69, 131, 284)}" fill="${col}"/>` + band + fly;
    case 'mini': return `<path d="M73 222L127 222L142 282L58 282Z" fill="${col}"/>` + band + [72, 84, 96, 108, 120].map((x, i) => `<path d="M${x + 4} 230L${x - 2 + i * 1.5} 282" stroke="${dk}" stroke-width="1.2" opacity=".55"/>`).join('');
    case 'midi': return `<path d="M73 222L127 222L144 324Q100 330 56 324Z" fill="${col}"/>` + band + `<path d="M84 240Q80 290 72 320M112 240Q118 290 126 320" stroke="${lt}" stroke-width="3" fill="none" opacity=".6" stroke-linecap="round"/>`;
    case 'tutu': return `<path d="M70 222L130 222L156 272Q100 284 44 272Z" fill="${shade(col, -0.06)}"/><path d="M72 222L128 222L148 264Q100 274 52 264Z" fill="${col}"/>` + [52, 64, 76, 88, 100, 112, 124, 136, 148].map(x => `<circle cx="${x}" cy="${271 + Math.abs(100 - x) * 0.02}" r="5" fill="${shade(col, -0.06)}"/>`).join('') + `<path d="M72 222L128 222L128 230L72 230Z" fill="${dk}"/>`;
    default: return '';
  }
}
function dressSkirt(kind, col, c2) {
  const lt = shade(col, 0.28), dk = shade(col, -0.15);
  switch (kind) {
    case 'dress': return `<path d="M70 220L130 220L150 306Q100 314 50 306Z" fill="${col}"/><path d="M64 286Q100 296 136 286" stroke="${lt}" stroke-width="3" fill="none" opacity=".6"/>`;
    case 'slip': return `<path d="M72 220L128 220L140 324Q100 330 60 324Z" fill="${col}"/><path d="M84 236Q80 290 74 320" stroke="${lt}" stroke-width="3" fill="none" opacity=".7" stroke-linecap="round"/>`;
    case 'puff': return `<path d="M70 220L130 220L168 360Q100 370 32 360Z" fill="${col}"/><path d="M76 240Q60 300 46 356M124 240Q140 300 154 356M100 236L100 362" stroke="${lt}" stroke-width="2.4" fill="none" opacity=".55"/>` + [[64, 300], [130, 320], [96, 286], [118, 346], [76, 340]].map(([x, y]) => `<path transform="translate(${x} ${y}) scale(.3)" d="M0-10C1.5-2 2-1.5 10 0C2 1.5 1.5 2 0 10C-1.5 2-2 1.5-10 0C-2-1.5-1.5-2 0-10Z" fill="#fff7d6"/>`).join('');
    case 'boho': return `<path d="M70 220L130 220L152 354Q100 362 48 354Z" fill="${col}"/>` + [262, 308].map(y => `<path d="M${60 - (y - 262) * 0.15} ${y}Q100 ${y + 8} ${140 + (y - 262) * 0.15} ${y}" stroke="${c2}" stroke-width="2" fill="none" stroke-dasharray="4 3"/>`).join('') + [[70, 286], [96, 276], [124, 290], [84, 332], [116, 330], [140, 340], [60, 340]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="3.2" fill="${c2}"/><circle cx="${x}" cy="${y}" r="1.3" fill="#fff4c2"/>`).join('');
    default: return '';
  }
}
function shoes(kind, c) {
  const d = shade(c, -0.28), sole = lum(c) > 0.8 ? '#e6e2da' : shade(c, -0.35);
  const one = cx => {
    const toe = `M${cx - 12} 345Q${cx} 337 ${cx + 12} 345L${cx + 13} 358Q${cx} 363 ${cx - 13} 358Z`;
    switch (kind) {
      case 'chunky': return `<path d="${toe}" fill="${c}" stroke="${d}" stroke-width="1"/><rect x="${cx - 15}" y="355" width="30" height="9" rx="4" fill="${sole}"/><path d="M${cx - 5} 345L${cx + 5} 349M${cx - 5} 349L${cx + 5} 345" stroke="${d}" stroke-width="1.2"/>`;
      case 'trainers': return `<path d="${toe}" fill="${c}" stroke="${d}" stroke-width="1"/><path d="M${cx - 11} 353Q${cx} 347 ${cx + 11} 353" stroke="#e8743b" stroke-width="2.4" fill="none"/><rect x="${cx - 14}" y="357" width="28" height="5" rx="2.5" fill="${sole}"/>`;
      case 'boots': return `<path d="M${cx - 11} 322L${cx + 11} 322L${cx + 12} 346Q${cx + 14} 352 ${cx + 13} 358Q${cx} 363 ${cx - 13} 358L${cx - 11} 346Z" fill="${c}" stroke="${d}" stroke-width="1"/><rect x="${cx - 14}" y="356" width="28" height="7" rx="2" fill="${shade(c, -0.45)}"/><path d="M${cx - 11} 328L${cx + 11} 328" stroke="${shade(c, 0.2)}" stroke-width="1.4" opacity=".6"/>`;
      case 'cowboy': return `<path d="M${cx - 11} 316L${cx + 11} 316L${cx + 11} 344Q${cx + 16} 352 ${cx + 16} 358L${cx - 13} 358L${cx - 11} 344Z" fill="${c}" stroke="${d}" stroke-width="1"/><path d="M${cx - 6} 324Q${cx} 334 ${cx + 6} 324M${cx - 6} 332Q${cx} 342 ${cx + 6} 332" stroke="${shade(c, 0.3)}" stroke-width="1.4" fill="none"/><rect x="${cx + 5}" y="357" width="7" height="6" fill="${shade(c, -0.4)}"/>`;
      case 'flats': return `<path d="M${cx - 12} 350Q${cx} 346 ${cx + 12} 350L${cx + 12} 358Q${cx} 362 ${cx - 12} 358Z" fill="${c}" stroke="${d}" stroke-width="1"/>` + `<g transform="translate(${cx} 350) scale(.22)"><path d="M0 0C-8-10-20-10-20 0C-20 10-8 10 0 0Z M0 0C8-10 20-10 20 0C20 10 8 10 0 0Z" fill="${d}"/></g>`;
      case 'maryjanes': return `<path d="M${cx - 12} 348Q${cx} 343 ${cx + 12} 348L${cx + 12} 358Q${cx} 362 ${cx - 12} 358Z" fill="${c}" stroke="${d}" stroke-width="1"/><path d="M${cx - 10} 346L${cx + 10} 346" stroke="${c}" stroke-width="3"/><circle cx="${cx + 7}" cy="346" r="1.6" fill="#d9b14c"/>`;
      case 'loafers': return `<path d="M${cx - 12} 347Q${cx} 341 ${cx + 12} 347L${cx + 12} 358Q${cx} 362 ${cx - 12} 358Z" fill="${c}" stroke="${d}" stroke-width="1"/><path d="M${cx - 6} 350L${cx + 6} 350" stroke="${shade(c, 0.25)}" stroke-width="2"/><rect x="${cx - 13}" y="358" width="26" height="4" rx="2" fill="${shade(c, -0.4)}"/>`;
      case 'heels': return `<path d="M${cx - 11} 350Q${cx} 345 ${cx + 11} 350L${cx + 6} 359L${cx - 6} 359Z" fill="${c}" stroke="${d}" stroke-width="1"/><path d="M${cx - 8} 347L${cx + 8} 347" stroke="${c}" stroke-width="2"/><rect x="${cx - 1.5}" y="358" width="3" height="6" fill="${d}"/>`;
      case 'sparkle': return `<path d="M${cx - 12} 350Q${cx} 345 ${cx + 12} 350L${cx + 12} 358Q${cx} 362 ${cx - 12} 358Z" fill="${c}" stroke="${shade(c, -0.25)}" stroke-width="1"/>` + [[cx - 6, 353], [cx + 3, 351], [cx + 7, 356], [cx - 1, 357]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.1" fill="#fff"/>`).join('');
      default: return `<path d="${toe}" fill="${c}" stroke="${d}" stroke-width="1"/><rect x="${cx - 14}" y="357" width="28" height="5" rx="2.5" fill="${sole}"/><path d="M${cx - 5} 344L${cx + 5} 348M${cx - 5} 348L${cx + 5} 344" stroke="${d}" stroke-width="1.1"/>`;
    }
  };
  return one(87) + one(113);
}
/* The top, drawn on the narrow full-body torso. Patterns reuse the same ids as the bust version. */
function topFull(kind, col, c2, skin, uid) {
  const dk = shade(col, -0.18), lt = shade(col, 0.25);
  const t = (d, f) => `<path d="${d}" fill="${f}"/>`;
  const crew = `<path d="M86 149C90 158 110 158 114 149" stroke="${dk}" stroke-width="3" fill="none" stroke-linecap="round"/>`;
  const hem = (y, c = dk) => `<path d="M67 ${y - 4}L133 ${y - 4}" stroke="${c}" stroke-width="2" opacity=".55"/>`;
  const pat = (id, body) => `<defs>${body}</defs>`;
  const jacket = (inner, panelCol, extra = '') => t(TORSO_F, inner) + t(PANEL_L, panelCol) + t(PANEL_R, panelCol) + extra;
  switch (kind) {
    case 'hoodie': return t(TORSO_F, col) + `<path d="M74 150C78 138 122 138 126 150C118 160 82 160 74 150Z" fill="${dk}"/><path d="M93 158L92 178M107 158L108 178" stroke="${lt}" stroke-width="2.2" stroke-linecap="round"/><path d="M80 204L120 204L124 228L76 228Z" fill="${dk}" opacity=".55"/>` + hem(236);
    case 'knit': return t(TORSO_F, col) + `<path d="M82 149C88 160 112 160 118 149L114 146C108 154 92 154 86 146Z" fill="${dk}"/>` + [82, 94, 106, 118].map(x => `<path d="M${x} 166L${x} 226" stroke="${dk}" stroke-width="2.2" stroke-dasharray="3 3" opacity=".6"/>`).join('') + `<rect x="66" y="226" width="68" height="10" fill="${dk}"/>`;
    case 'stripes': return pat('', `<pattern id="${uid}stF" width="12" height="12" patternUnits="userSpaceOnUse"><rect width="12" height="12" fill="#fbfaf6"/><rect width="12" height="5" fill="${col}"/></pattern>`) + t(TORSO_F, `url(#${uid}stF)`) + crew;
    case 'jersey': return pat('', `<pattern id="${uid}jsF" width="14" height="14" patternUnits="userSpaceOnUse"><rect width="14" height="14" fill="${col}"/><rect width="4.5" height="14" fill="${c2}"/></pattern>`) + t(TORSO_F, `url(#${uid}jsF)`) + `<path d="M88 149L100 162L112 149" stroke="#fbfbf8" stroke-width="4" fill="none"/><circle cx="118" cy="176" r="4.5" fill="#f6d36b"/>`;
    case 'retro': return pat('', `<pattern id="${uid}rtF" width="16" height="16" patternUnits="userSpaceOnUse"><rect width="16" height="16" fill="${col}"/><circle cx="4" cy="4" r="3" fill="${c2}"/><circle cx="12" cy="12" r="2.2" fill="#f6e3c0"/></pattern>`) + t(TORSO_F, `url(#${uid}rtF)`) + `<path d="M86 149L100 176L114 149Z" fill="${skin}"/><path d="M86 149L95 166L82 164ZM114 149L105 166L118 164Z" fill="${c2}"/>`;
    case 'flannel': return pat('', `<pattern id="${uid}flF" width="14" height="14" patternUnits="userSpaceOnUse"><rect width="14" height="14" fill="${col}"/><rect width="14" height="4.5" fill="${dk}" opacity=".8"/><rect width="4.5" height="14" fill="${dk}" opacity=".8"/></pattern>`) + t(TORSO_F, `url(#${uid}flF)`) + `<path d="M86 149L100 162L114 149L108 148L100 156L92 148Z" fill="${dk}"/><path d="M100 162L100 236" stroke="${shade(col, -0.4)}" stroke-width="1.3"/>`;
    case 'denim': return jacket('#fbfaf6', col, `<path d="M88 147L94 166L99 160M112 147L106 166L101 160" fill="${dk}"/><path d="M71 182L87 182L87 192L71 192ZM113 182L129 182L129 192L113 192Z" fill="none" stroke="#f3c766" stroke-width="1.1" stroke-dasharray="2 2"/>`) + crew.replace(dk, '#e7e4dc');
    case 'denimshirt': return t(TORSO_F, col) + `<path d="M86 149L100 162L114 149L108 147L100 155L92 147Z" fill="${dk}"/><path d="M100 162L100 236" stroke="${dk}" stroke-width="1.5"/>` + [176, 192, 208, 224].map(y => `<circle cx="102" cy="${y}" r="1.4" fill="#f3e3b3"/>`).join('') + `<path d="M72 176L88 176L88 188L72 188ZM112 176L128 176L128 188L112 188Z" fill="none" stroke="${dk}" stroke-width="1.3"/>`;
    case 'leather': return jacket('#f4f1ea', col, `<path d="M88 147L96 166L90 168ZM112 147L104 166L110 168Z" fill="${shade(col, 0.15)}"/><path d="M98 168L98 236" stroke="#bdbdbd" stroke-width="2"/>`);
    case 'suede': return jacket('#f4f1ea', col, `<path d="M88 147L96 166L90 168ZM112 147L104 166L110 168Z" fill="${shade(col, -0.15)}"/>` + [178, 196, 214].map(y => `<circle cx="95" cy="${y}" r="1.6" fill="${shade(col, -0.35)}"/>`).join(''));
    case 'varsity': return jacket('#fbfaf6', col, `<path d="M84 149C90 158 110 158 116 149" stroke="#2a2a2e" stroke-width="3.4" fill="none"/><text x="72" y="190" font-family="Georgia,serif" font-weight="700" font-size="13" fill="#fbfaf6">S</text><rect x="66" y="228" width="68" height="8" fill="#2a2a2e"/>`);
    case 'cardigan': return jacket('#fbfaf6', col, [170, 188, 206, 224].map(y => `<circle cx="95" cy="${y}" r="1.8" fill="${dk}"/>`).join(''));
    case 'coquette': return jacket('#fffafc', col, [168, 190, 212].map(y => bowShape(100, y, 0.3, '#ff7aa8')).join(''));
    case 'tux': return t(TORSO_F, col) + `<path d="M88 147L100 230L112 147Z" fill="#fbfaf6"/><path d="M88 147L97 196L90 200L80 156ZM112 147L103 196L110 200L120 156Z" fill="${shade(col, 0.12)}"/><path d="M93 154L100 158L107 154L107 161L100 158L93 161Z" fill="#1d1d22"/>`;
    case 'trench': return t(TORSO_COAT, col) + t('M68 162C68 152 78 148 88 147L99 292L60 292Z', shade(col, 0.06)) + `<path d="M88 147L98 190L80 186L72 160ZM112 147L102 190L120 186L128 160Z" fill="${shade(col, 0.12)}"/><path d="M88 147L100 166L112 147Z" fill="#2b2b30"/><rect x="64" y="226" width="72" height="8" fill="${dk}"/><rect x="96" y="224" width="8" height="12" rx="1" fill="${shade(col, -0.35)}"/>` + [[92, 200], [108, 200], [92, 214], [108, 214]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.8" fill="${shade(col, -0.35)}"/>`).join('');
    case 'puffer': return t(TORSO_COAT.replace('L140 292L60 292', 'L136 262L64 262'), col) + [174, 194, 214, 236].map(y => `<path d="M66 ${y}Q100 ${y + 5} 134 ${y}" stroke="${dk}" stroke-width="2.2" fill="none"/>`).join('') + `<path d="M80 140L120 140L122 158L78 158Z" fill="${dk}"/><path d="M100 140L100 262" stroke="${shade(col, -0.35)}" stroke-width="1.8"/>`;
    case 'windbreaker': return t(TORSO_F, col) + `<path d="M67 184L133 184L133 196L67 196Z" fill="${c2}"/><path d="M82 140L118 140L120 156L80 156Z" fill="${c2}"/><path d="M100 156L100 236" stroke="${shade(col, -0.35)}" stroke-width="1.8"/>` + hem(236, c2);
    case 'fleece': return t(TORSO_F, col) + `<path d="M80 140L120 140L122 158L78 158Z" fill="${c2}"/><path d="M100 140L100 236" stroke="${c2}" stroke-width="2.2"/><path d="M70 174L86 174L86 188L70 188Z" fill="${c2}" opacity=".85"/>` + hem(236, c2);
    case 'polo': return t(TORSO_F, col) + `<path d="M86 148L96 158L100 150L104 158L114 148L108 146L100 150L92 146Z" fill="${c2 || dk}"/><path d="M100 150L100 170" stroke="${shade(col, -0.25)}" stroke-width="1.3"/><circle cx="100" cy="160" r="1.2" fill="${shade(col, -0.35)}"/><circle cx="100" cy="166" r="1.2" fill="${shade(col, -0.35)}"/>` + hem(236);
    case 'western': return t(TORSO_F, col) + `<path d="M68 172C82 162 92 170 100 178C108 170 118 162 132 172" stroke="${c2}" stroke-width="2.6" fill="none"/><path d="M86 149L100 162L114 149L108 147L100 155L92 147Z" fill="${c2}"/>` + [176, 192, 208, 224].map(y => `<circle cx="100" cy="${y}" r="1.8" fill="#fbf7ee" stroke="${c2}" stroke-width="1"/>`).join('');
    case 'zip': return t(TORSO_CROP.replace('L133 200L67 200', 'L133 212L67 212'), col) + `<path d="M82 140L118 140L120 156L80 156Z" fill="${col}" stroke="${dk}" stroke-width="1.3"/><path d="M100 140L100 212" stroke="${c2}" stroke-width="2"/><path d="M70 162L69 212M130 162L131 212" stroke="${c2}" stroke-width="2.6"/>`;
    case 'wrap': return t(TORSO_F, col) + `<path d="M86 149L100 178L114 149Z" fill="${skin}"/><path d="M86 149L106 190M114 149L94 190" stroke="${dk}" stroke-width="2" fill="none"/><path d="M68 214L132 214L133 224L67 224Z" fill="${dk}" opacity=".5"/>`;
    case 'babytee': return t(TORSO_BABY, col) + crew + `<path transform="translate(100 182) scale(.6)" d="M0 3C-3-4-12-2-10 5C-8 10 0 13 0 13C0 13 8 10 10 5C12-2 3-4 0 3Z" fill="#ff7aa8"/>`;
    case 'crop': return `<path d="M70 170C80 164 90 168 100 170C110 168 120 164 130 170L133 200L67 200Z" fill="${col}"/><path d="M78 168L76 152M122 168L124 152" stroke="${col}" stroke-width="2.6" stroke-linecap="round"/>`;
    case 'dress': return `<path d="M70 168C80 160 90 168 100 164C110 168 120 160 130 168L132 222L68 222Z" fill="${col}"/><path d="M76 166L78 150M124 166L122 150" stroke="${col}" stroke-width="3" stroke-linecap="round"/><rect x="68" y="214" width="64" height="8" fill="${dk}"/>`;
    case 'slip': return `<path d="M72 170C82 164 92 172 100 168C108 172 118 164 128 170L130 222L70 222Z" fill="${col}"/><path d="M78 168L82 150M122 168L118 150" stroke="${shade(col, -0.2)}" stroke-width="1.4"/>`;
    case 'puff': return `<path d="M68 166C80 162 90 170 100 164C110 170 120 162 132 166L132 222L68 222Z" fill="${col}"/><circle cx="100" cy="176" r="3.2" fill="#fff6c2"/><rect x="68" y="214" width="64" height="8" fill="${dk}"/>`;
    case 'boho': return `<path d="M66 166C80 160 90 168 100 164C110 168 120 160 134 166L132 222L68 222Z" fill="${col}"/><path d="M64 168C78 176 90 174 100 172C110 174 122 176 136 168" stroke="${c2}" stroke-width="2" fill="none" stroke-dasharray="4 3"/>`;
    default: return t(TORSO_F, col) + crew + hem(236);
  }
}
function armsFull(kind, col, skin, uid) {
  const sl = SLEEVES[kind] || 'long';
  const fills = { stripes: `url(#${uid}stF)`, jersey: `url(#${uid}jsF)`, retro: `url(#${uid}rtF)`, flannel: `url(#${uid}flF)` };
  const sc = fills[kind] || (kind === 'varsity' ? '#fbfaf6' : col);
  const d = shade(skin, -0.12), dk = kind === 'varsity' ? '#e2ded6' : shade(col, -0.18);
  const one = (px, ang) => {
    let s = `<g transform="rotate(${ang} ${px} 154)"><rect x="${px - 8}" y="150" width="16" height="84" rx="8" fill="${skin}" stroke="${d}" stroke-width="1"/><circle cx="${px}" cy="236" r="8" fill="${skin}" stroke="${d}" stroke-width="1"/>`;
    if (sl === 'short') s += `<rect x="${px - 9}" y="148" width="18" height="30" rx="8" fill="${sc}"/>`;
    else if (sl === 'long') s += `<rect x="${px - 9}" y="148" width="18" height="80" rx="8" fill="${sc}"/><path d="M${px - 9} 222L${px + 9} 222" stroke="${dk}" stroke-width="2"/>`;
    else if (sl === 'puff') s += `<ellipse cx="${px}" cy="160" rx="13" ry="12" fill="${col}"/><path d="M${px - 9} 156Q${px} 150 ${px + 9} 156" stroke="${shade(col, 0.3)}" stroke-width="2" fill="none" opacity=".7"/>`;
    return s + '</g>';
  };
  return one(68, 9) + one(132, -9);
}
function backdropTall(kind, id) {
  // the square backdrop, repeated down the taller full-body frame
  if (kind === 'sunset') return `<defs><linearGradient id="${id}bgT" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fcd27b"/><stop offset=".55" stop-color="#f6a07f"/><stop offset="1" stop-color="#ec7fa4"/></linearGradient></defs><rect width="200" height="400" fill="url(#${id}bgT)"/>`;
  return backdrop(kind, id) + `<g transform="translate(0 198)">${backdrop(kind, id + 'b')}</g>`;   // 2px overlap hides the join
}

/* ---------- assemble ---------- */
function parts(a, uid) {
  const face = FACES.find(f => f.id === a.base) || FACES[0];
  const tone = (TONES.find(t => t.id === a.tone) || TONES[1]).hex;
  const hairC = hairHexOf(a.hairCol);
  const hairD = shade(hairC, -0.22), hairL = shade(hairC, lum(hairC) > 0.7 ? -0.08 : 0.35);
  const style = HAIR[a.hair] || HAIR['h-crop'];
  const det = a.facial && DETAILS[a.facial] ? DETAILS[a.facial].d : null;
  const gl = a.glasses && GLASSES[a.glasses] ? GLASSES[a.glasses].g : null;
  const ht = a.hat && HATS[a.hat] ? HATS[a.hat].h : null;
  const out = OUTFITS[a.outfit] || OUTFITS['o-tee'];
  const bgKind = (BACKDROPS[a.backdrop] || BACKDROPS['bg-plain']).bg;
  const browC = lum(hairC) > 0.6 ? shade(hairC, -0.45) : shade(hairC, -0.1);
  const skinD = shade(tone, -0.12), lip = shade(tone, -0.45);
  const hij = ht === 'hijab' ? hijab('#e7a3b8', uid) : null;
  let head = `<ellipse cx="58.5" cy="97" rx="6.5" ry="9" fill="${tone}" stroke="${shade(tone, -0.18)}" stroke-width="1"/><ellipse cx="141.5" cy="97" rx="6.5" ry="9" fill="${tone}" stroke="${shade(tone, -0.18)}" stroke-width="1"/><ellipse cx="59.5" cy="97" rx="3" ry="5" fill="${skinD}" opacity=".6"/><ellipse cx="140.5" cy="97" rx="3" ry="5" fill="${skinD}" opacity=".6"/>`;
  head += `<path d="${HEAD}" fill="${tone}" stroke="${shade(tone, -0.18)}" stroke-width="1"/>`;
  const bo = face.blush === 2 ? 0.55 : 0.3;
  head += `<ellipse cx="77" cy="112" rx="8" ry="4.6" fill="#ff7a9c" opacity="${bo}"/><ellipse cx="123" cy="112" rx="8" ry="4.6" fill="#ff7a9c" opacity="${bo}"/>`;
  if (det) head += detail(det, hairC, tone, 'under');
  head += eyes(face.e, tone, '#3a2627') + brows(face.b, browC);
  head += `<path d="M98 108Q100 110.5 102 108" stroke="${skinD}" stroke-width="2" fill="none" stroke-linecap="round"/>`;
  head += mouth(face.m, lip);
  if (det) head += detail(det, hairC, tone, 'over');
  if (hij) head += hij.front;
  else { if (style.top) head += hairTop(style.top, hairC, hairD); head += hairFront(style.front, hairC, hairD, hairL); }
  if (gl) head += glasses(gl);
  if (ht && !hij) head += hat(ht, hairC);
  return {
    tone, out, bgKind,
    back: hij ? hij.back : hairBack(style.back, hairC, hairD),
    over: hij ? '' : hairOver(style.over, hairC, hairD),
    neck: `<path d="M88 124L88 154L112 154L112 124Z" fill="${skinD}"/>`,
    head,
  };
}
/* Head and shoulders, for the avatar circle and thumbnails. mode 'chip' is a head close-up. */
export function charArt(av, { mode = 'bust', uid = 'c' } = {}) {
  const p = parts(av || {}, uid);
  const s = backdrop(p.bgKind, uid) + p.back + p.neck + outfit(p.out.o, p.out.col, p.tone, uid, p.out.c2) + p.over + p.head;
  const vb = mode === 'chip' ? '36 20 128 128' : '18 18 164 164';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" class="charsvg">${s}</svg>`;
}
/* Head to toe, for the editor and the friends' view. bg:false leaves the background transparent. */
export function charFull(av, { uid = 'f', bg = true } = {}) {
  const p = parts(av || {}, uid), o = p.out;
  const dressy = DRESSY.includes(o.o);
  let s = bg ? backdropTall(p.bgKind, uid) : '';
  s += `<ellipse cx="100" cy="365" rx="48" ry="6" fill="#000" opacity=".1"/>`;
  s += p.back;
  s += legs(p.tone);
  s += `<path d="${TORSO_F}" fill="${p.tone}"/>`;
  s += dressy ? dressSkirt(o.o, o.col, o.c2) : bottomsFull(o.bot && o.bot[0], o.bot && o.bot[1], uid);
  s += shoes(o.shoe ? o.shoe[0] : 'sneakers', o.shoe ? o.shoe[1] : '#ffffff');
  s += p.neck;
  s += topFull(o.o, o.col, o.c2, p.tone, uid);
  s += armsFull(o.o, o.col, p.tone, uid);
  s += p.over + p.head;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="10 8 180 364" class="charsvg charfull">${s}</svg>`;
}
