// Steady Food tab — curated offline profiles. No external APIs.
// Educational only; not medical advice.

export const FOOD_DISCLAIMER =
  'Educational only — not medical advice, not a diagnosis, and not personalised health care. If you have a condition or take medication, talk to a clinician about food choices.';

/** @typedef {{n:string, role:string}} FoodIng */
/** @typedef {{id:string, names:string[], category:string, ingredients:FoodIng[], feel:string[], body:string[], good:string[], bad:string[], longevity:string, flags:string[]}} FoodProfile */

/** @type {FoodProfile[]} */
export const FOOD_PROFILES = [
  {
    id: 'chocolate-cookies',
    names: ['chocolate cookie','chocolate cookies','choc cookie','choc cookies','chocolate biscuit','chocolate biscuits','choc biscuit','cookie','cookies','biscuit','biscuits'],
    category: 'sweet',
    ingredients: [
      {n:'Sugar / syrups', role:'sweetness and quick energy'},
      {n:'Refined flour', role:'bulk of the biscuit — little fibre'},
      {n:'Oils or butter', role:'texture and mouthfeel'},
      {n:'Cocoa / chocolate chips', role:'flavour; some fat and caffeine-ish compounds'},
      {n:'Emulsifiers & salt', role:'shelf life and taste (typical packaged)'},
    ],
    feel: [
      'A quick lift — sweet and comforting within minutes.',
      'Then a softer crash: foggy, restless, or suddenly wanting more.',
      'Cravings often rebound harder than the first bite satisfied.',
    ],
    body: [
      'Blood sugar rises fast from refined carbs and sugar; insulin follows to clear it.',
      'When levels drop, energy dips and the brain hunts for another hit.',
      'Dopamine from sugar + fat makes the “just one more” loop feel urgent.',
    ],
    good: [
      'Honestly thin: a moment of pleasure and a little cocoa flavour.',
      'Not a meaningful source of protein, fibre, or lasting fuel.',
    ],
    bad: [
      'Spike-then-crash energy; easy to overeat past fullness.',
      'Refined flour + sugar + oils is a classic ultraprocessed combo.',
      'Can nudge mood irritability and late-day snack hunger.',
    ],
    longevity: 'One plate of cookies is a treat. Making that pattern daily loads sugar and refined carbs over years — linked with weight gain, dental wear, and metabolic strain. Frequency matters more than a single evening.',
    flags: ['sugar','ultraprocessed','refined'],
  },
  {
    id: 'chocolate',
    names: ['chocolate','choc','chocolate bar','chocolate bars','milk chocolate','dark chocolate','cocoa'],
    category: 'sweet',
    ingredients: [
      {n:'Cocoa solids', role:'flavour; flavonoids in darker bars'},
      {n:'Sugar', role:'especially high in milk chocolate'},
      {n:'Cocoa butter / milk fat', role:'creaminess'},
      {n:'Milk powder', role:'milk chocolate only'},
    ],
    feel: [
      'Calm pleasure, sometimes a mild alertness from cocoa.',
      'Sweet bars can leave you wanting another square soon after.',
    ],
    body: [
      'Sugar raises blood glucose; fat slows digestion so the hit can linger.',
      'Cocoa has mild stimulants; dark bars may feel more “awake”.',
    ],
    good: [
      'Darker chocolate (higher cocoa) can carry some flavanols.',
      'Small portions satisfy many people better than a whole bar.',
    ],
    bad: [
      'Most commercial bars are sugar-forward.',
      'Easy to eat far past a “taste” portion.',
    ],
    longevity: 'Occasional dark chocolate in small amounts is a different habit from nightly sweet bars. Watch the sugar load and portion size over time.',
    flags: ['sugar'],
  },
  {
    id: 'crisps',
    names: ['crisps','crisp','chips','potato chips','potato crisps','pringles','tortilla chips','nachos'],
    category: 'snack',
    ingredients: [
      {n:'Potato or corn', role:'base starch'},
      {n:'Frying oil', role:'crunch and calories'},
      {n:'Salt', role:'flavour; thirst'},
      {n:'Flavourings', role:'often ultraprocessed seasoning blends'},
    ],
    feel: [
      'Crunch + salt can feel oddly soothing and hard to stop.',
      'Afterwards: thirsty, slightly heavy, still oddly snacky.',
    ],
    body: [
      'High salt pulls water; you may feel bloated or parched.',
      'Low protein/fibre → little satiety per calorie.',
      'Fried starches digest into a fast carb load.',
    ],
    good: [
      'A few crisps for crunch is mostly sensory pleasure.',
      'Almost no micronutrient upside at typical bag sizes.',
    ],
    bad: [
      'Salt + oil + refined starch: easy overeating by the handful.',
      'Can leave you inflamed-feeling and still hungry.',
    ],
    longevity: 'Frequent fried-snack patterns add salt and industrial oils. Occasional is different from a daily bag — your blood pressure and waistline notice the pattern.',
    flags: ['ultraprocessed','salt','fried'],
  },
  {
    id: 'soda',
    names: ['soda','fizzy drink','soft drink','cola','coke','pepsi','lemonade','sprite','fanta','pop','carbonated drink'],
    category: 'drink',
    ingredients: [
      {n:'Sugar or high-fructose syrup', role:'sweetness (regular soda)'},
      {n:'Carbonated water', role:'fizz'},
      {n:'Acids & flavourings', role:'tang and brand taste'},
      {n:'Caffeine', role:'in many colas'},
    ],
    feel: [
      'Cold, sweet rush — then a flatter, thirstier feeling.',
      'Caffeinated ones can buzz then leave you edgy when they wear off.',
    ],
    body: [
      'Liquid sugar hits the bloodstream fast with almost no chewing brake.',
      'Acid + sugar is tough on teeth enamel over time.',
      'Doesn’t fill you the way solid food does — easy empty calories.',
    ],
    good: [
      'Hydration of a sort, but water does it better without the sugar.',
      'Diet versions skip sugar but still train a sweet preference.',
    ],
    bad: [
      'A can can pack as much sugar as several cookies.',
      'Crash, cravings, and dental wear stack with frequent use.',
    ],
    longevity: 'Regular sugary drinks are strongly tied to weight gain and metabolic risk. Swapping most of them for water or unsweetened drinks is one of the highest-leverage habits.',
    flags: ['sugar','ultraprocessed','liquid-sugar'],
  },
  {
    id: 'energy-drink',
    names: ['energy drink','energy drinks','red bull','monster energy','caffeine drink'],
    category: 'drink',
    ingredients: [
      {n:'Caffeine', role:'stimulant'},
      {n:'Sugar or sweeteners', role:'taste and quick energy'},
      {n:'Taurine / B-vitamins / acids', role:'marketing stack; acids hit teeth'},
    ],
    feel: [
      'Wired, focused, sometimes jittery or anxious.',
      'Crash or wired-tired later; sleep can suffer if late.',
    ],
    body: [
      'Heart rate and alertness up; cortisol-ish stress feel possible.',
      'Sugar versions spike glucose; caffeine blocks sleep pressure.',
    ],
    good: [
      'Short-term alertness for a deadline — not a free lunch.',
    ],
    bad: [
      'Easy to lean on instead of sleep or food.',
      'High caffeine + sugar is rough on sleep, mood, and teeth.',
    ],
    longevity: 'Relying on stimulant drinks daily often masks sleep debt. Chronic high caffeine and sugar aren’t a longevity strategy — they’re a coping loop.',
    flags: ['caffeine','sugar','ultraprocessed'],
  },
  {
    id: 'pizza',
    names: ['pizza','slice of pizza','pepperoni pizza','cheese pizza','domino','takeaway pizza'],
    category: 'meal',
    ingredients: [
      {n:'Refined dough', role:'base carbs'},
      {n:'Cheese', role:'fat, protein, salt'},
      {n:'Tomato sauce', role:'flavour; some lycopene'},
      {n:'Processed meats (often)', role:'salt and curing compounds'},
      {n:'Oils', role:'calories and mouthfeel'},
    ],
    feel: [
      'Satisfying and heavy; often sleepy after.',
      'Salt-thirst and leftover hunger for more savoury later.',
    ],
    body: [
      'Large refined-carb + fat load; digestion feels slow.',
      'Blood sugar rise depends on crust and toppings.',
      'High salt can leave you puffy overnight.',
    ],
    good: [
      'Cheese and toppings can add protein.',
      'Tomato sauce isn’t empty — still not a vegetable plate.',
    ],
    bad: [
      'Portion sizes are usually oversized for one sitting.',
      'Processed meat toppings stack salt and curing agents.',
    ],
    longevity: 'Pizza night is fine as a ritual. Making takeaway pizza a frequent default crowds out fibre-rich meals and quietly raises salt and refined-carb exposure.',
    flags: ['refined','salt','ultraprocessed'],
  },
  {
    id: 'burger',
    names: ['burger','hamburger','cheeseburger','takeaway burger','fast food burger','big mac','whopper'],
    category: 'meal',
    ingredients: [
      {n:'Beef or plant patty', role:'protein and fat'},
      {n:'White bun', role:'refined carbs'},
      {n:'Cheese, sauces', role:'salt, sugar, fat'},
      {n:'Fries (often alongside)', role:'fried starch'},
    ],
    feel: [
      'Full and rewarded — then sluggish.',
      'Sauce-sugar can keep snack desire alive.',
    ],
    body: [
      'Dense calories; satiety arrives after you’ve already overshot.',
      'Refined bun + fatty patty is a heavy digest.',
    ],
    good: [
      'Real protein if the patty is decent meat or a solid alternative.',
    ],
    bad: [
      'Combo meals balloon salt, refined carbs, and frying oils.',
      'Easy post-meal crash on the couch.',
    ],
    longevity: 'An occasional burger isn’t a crisis. Frequent fast-food patterns track with weight gain and heart-risk markers — especially with fries and soda.',
    flags: ['ultraprocessed','salt','fried'],
  },
  {
    id: 'fried-chicken',
    names: ['fried chicken','nuggets','chicken nuggets','nando','kfc','wings','buffalo wings'],
    category: 'meal',
    ingredients: [
      {n:'Chicken', role:'protein'},
      {n:'Breading', role:'refined starch'},
      {n:'Frying oil', role:'crust and calories'},
      {n:'Salt & spices', role:'flavour'},
    ],
    feel: [
      'Crispy satisfaction; heavy afterward.',
      'Greasy mouthfeel can linger; thirst common.',
    ],
    body: [
      'Protein helps, but breading + oil dominate the load.',
      'Inflammation-ish heaviness is common after big fried portions.',
    ],
    good: [
      'Chicken itself is a useful protein source.',
    ],
    bad: [
      'Frying and breading turn a lean food into a calorie bomb.',
      'Salt levels are typically high.',
    ],
    longevity: 'Grilled or baked chicken differs a lot from deep-fried. How it’s cooked matters as much as the animal it came from.',
    flags: ['fried','salt','ultraprocessed'],
  },
  {
    id: 'ice-cream',
    names: ['ice cream','icecream','gelato','milkshake','soft serve','ben and jerry'],
    category: 'sweet',
    ingredients: [
      {n:'Sugar', role:'sweetness'},
      {n:'Cream / milk fat', role:'richness'},
      {n:'Milk solids', role:'body'},
      {n:'Emulsifiers & flavours', role:'texture (typical industrial)'},
    ],
    feel: [
      'Cold comfort, then often a desire for “just a bit more”.',
      'Can leave you sticky-tired or craving sweetness again.',
    ],
    body: [
      'Sugar + fat is a potent reward combo for the brain.',
      'Lactose + large portions can bloat some people.',
    ],
    good: [
      'Pleasure and a little dairy protein/calcium in some tubs.',
      'Still dessert — not dinner.',
    ],
    bad: [
      'Easy to eat a day’s sugar in one bowl.',
      'Reward loop trains evening dessert as a default.',
    ],
    longevity: 'A scoop as a treat is different from a nightly pint. Sugar-and-fat desserts most evenings add up quietly.',
    flags: ['sugar','ultraprocessed'],
  },
  {
    id: 'alcohol',
    names: ['alcohol','beer','wine','pint','lager','cider','vodka','gin','whisky','whiskey','cocktail','drinks','booze','prosecco'],
    category: 'drink',
    ingredients: [
      {n:'Ethanol', role:'the intoxicant your liver must clear'},
      {n:'Sugars / carbs', role:'beer, cider, sweet mixers'},
      {n:'Congeners (spirits/red wine)', role:'flavour; hangover intensity'},
    ],
    feel: [
      'Looser, warmer, more social — then poorer sleep and a flatter next day.',
      'Anxiety rebound (“hangxiety”) is common even after a “normal” night.',
    ],
    body: [
      'Liver prioritises alcohol; fat burning and recovery pause.',
      'Sleep architecture worsens — more wakeups, less deep sleep.',
      'Dehydration and inflammation leave you foggy and sore.',
    ],
    good: [
      'Social ease for some people — that’s culture, not nutrition.',
      'No meaningful health need for alcohol.',
    ],
    bad: [
      'Mood, sleep, and next-day discipline take a hit.',
      'Empty calories; lowers inhibition around food too.',
    ],
    longevity: 'Less is almost always better for long-term health. Regular heavy drinking raises cancer, liver, and heart risk; even “moderate” habits are a trade-off, not a free benefit.',
    flags: ['alcohol'],
  },
  {
    id: 'coffee',
    names: ['coffee','espresso','latte','cappuccino','americano','flat white','mocha'],
    category: 'drink',
    ingredients: [
      {n:'Coffee / caffeine', role:'stimulant and flavour'},
      {n:'Milk / syrups (optional)', role:'calories and sugar in café drinks'},
    ],
    feel: [
      'Clearer, more alert — or jittery if you’re sensitive or overdone.',
      'Afternoon cups can steal deep sleep without you noticing.',
    ],
    body: [
      'Caffeine blocks adenosine (sleep pressure) for hours.',
      'Can raise heart rate and stress feel in high doses.',
      'Black coffee is nearly calorie-free; syrup lattes are not.',
    ],
    good: [
      'May support alertness and, for many, a pleasant ritual.',
      'Plain coffee is linked with some population health upsides.',
    ],
    bad: [
      'Late caffeine wrecks sleep quality.',
      'Sugar-laden café drinks become dessert in a cup.',
    ],
    longevity: 'Modest plain coffee is fine for most adults. Sleep debt from late caffeine and sugar-bomb milky drinks are the long-game risks.',
    flags: ['caffeine'],
  },
  {
    id: 'tea',
    names: ['tea','builder\'s tea','green tea','black tea','chai'],
    category: 'drink',
    ingredients: [
      {n:'Tea leaves', role:'caffeine + polyphenols'},
      {n:'Milk / sugar (optional)', role:'changes the metabolic load'},
    ],
    feel: [
      'Gentle alertness; comforting ritual.',
    ],
    body: [
      'Milder caffeine than coffee for most cups.',
      'Sugar in tea adds up across a day of spoonfuls.',
    ],
    good: [
      'Hydrating ritual; green/black tea carry plant compounds.',
    ],
    bad: [
      'Sweet tea is still sugar — just quieter.',
    ],
    longevity: 'Unsweetened tea is one of the kinder daily drinks. Watch the sugar spoons if that’s your habit.',
    flags: ['caffeine'],
  },
  {
    id: 'banana',
    names: ['banana','bananas'],
    category: 'produce',
    ingredients: [
      {n:'Carbohydrate (natural sugars + starch)', role:'quickish fuel'},
      {n:'Potassium & fibre', role:'electrolyte and gut bulk'},
      {n:'Vitamin B6 / C (small)', role:'micronutrients'},
    ],
    feel: [
      'Steady-ish energy; settles an empty stomach.',
    ],
    body: [
      'Natural sugars with fibre — gentler than candy.',
      'Good pre-activity fuel for many people.',
    ],
    good: [
      'Convenient potassium and fibre.',
      'Actually filling relative to sweets.',
    ],
    bad: [
      'Ripe bananas are still a sugar hit if you stack several.',
    ],
    longevity: 'Whole fruit patterns track better than fruit juice or sweets. Bananas are a solid everyday choice for most people.',
    flags: ['whole-food'],
  },
  {
    id: 'apple',
    names: ['apple','apples'],
    category: 'produce',
    ingredients: [
      {n:'Fibre (pectin)', role:'slows sugar absorption'},
      {n:'Natural sugars', role:'energy'},
      {n:'Water & polyphenols', role:'hydration and plant compounds'},
    ],
    feel: [
      'Crunchy, lightly sweet, reasonably satisfying.',
    ],
    body: [
      'Fibre helps blunt the sugar rise versus juice.',
    ],
    good: [
      'Whole fruit with skin on is a longevity-friendly default.',
    ],
    bad: [
      'Juice removes the fibre brake — different food.',
    ],
    longevity: 'Eating whole fruit regularly is consistently linked with better long-term health versus ultraprocessed snacks.',
    flags: ['whole-food','fibre'],
  },
  {
    id: 'oats',
    names: ['oats','oatmeal','porridge','overnight oats','muesli'],
    category: 'grain',
    ingredients: [
      {n:'Whole oat grain', role:'slow carbs and beta-glucan fibre'},
      {n:'Optional sugar/honey/syrup', role:'can turn it dessert-like'},
    ],
    feel: [
      'Warm, steady energy; less crash than sugary cereal.',
    ],
    body: [
      'Beta-glucan fibre supports steadier blood sugar and satiety.',
      'Keeps you fuller longer than refined breakfast carbs.',
    ],
    good: [
      'Strong everyday breakfast for energy and gut fullness.',
    ],
    bad: [
      'Instant packets with added sugar blunt the upside.',
    ],
    longevity: 'Plain oats are a classic longevity-friendly staple. Keep toppings closer to fruit/nuts than icing sugar.',
    flags: ['whole-food','fibre'],
  },
  {
    id: 'chicken',
    names: ['chicken','grilled chicken','chicken breast','roast chicken'],
    category: 'protein',
    ingredients: [
      {n:'Lean protein', role:'muscle repair and satiety'},
      {n:'B-vitamins & minerals', role:'metabolic support'},
    ],
    feel: [
      'Solid and satisfied without heaviness (when not fried).',
    ],
    body: [
      'Protein blunts hunger hormones and supports recovery.',
    ],
    good: [
      'Excellent base for meals when cooked simply.',
    ],
    bad: [
      'Breaded/fried versions flip the profile — see fried chicken.',
    ],
    longevity: 'Adequate protein from varied sources supports muscle as you age. Prefer grilling, roasting, or stewing over deep frying.',
    flags: ['protein','whole-food'],
  },
  {
    id: 'salad',
    names: ['salad','green salad','garden salad','side salad'],
    category: 'produce',
    ingredients: [
      {n:'Leafy greens & veg', role:'fibre, volume, micronutrients'},
      {n:'Dressing (optional)', role:'can add oils, sugar, salt'},
      {n:'Protein toppings (optional)', role:'turns it into a meal'},
    ],
    feel: [
      'Light, clean, sometimes not filling alone.',
    ],
    body: [
      'High volume, low energy density — helps fullness with fewer calories.',
      'Fibre feeds gut microbes over time.',
    ],
    good: [
      'One of the easiest ways to raise vegetable intake.',
    ],
    bad: [
      'Creamy sweet dressings can erase the “light” intent.',
      'Salad-only meals may leave you hunting snacks later without protein.',
    ],
    longevity: 'More plants across the week is one of the strongest everyday longevity levers. Build salads into meals, don’t punish yourself with rabbit food.',
    flags: ['whole-food','fibre','plants'],
  },
  {
    id: 'eggs',
    names: ['egg','eggs','boiled egg','scrambled eggs','omelette','omelet'],
    category: 'protein',
    ingredients: [
      {n:'Complete protein', role:'amino acids'},
      {n:'Choline & fats in yolk', role:'brain and hormone building blocks'},
    ],
    feel: [
      'Properly filling; stable energy for many people.',
    ],
    body: [
      'Protein + fat slow digestion; solid breakfast or snack.',
    ],
    good: [
      'Nutrient-dense and versatile.',
    ],
    bad: [
      'Pairing with piles of processed meat changes the meal.',
    ],
    longevity: 'Eggs are a practical protein staple for most people. Overall dietary pattern matters more than demonising yolks.',
    flags: ['protein','whole-food'],
  },
  {
    id: 'avocado',
    names: ['avocado','avo','guacamole','guac'],
    category: 'produce',
    ingredients: [
      {n:'Monounsaturated fats', role:'satiety and absorption of fat-soluble vitamins'},
      {n:'Fibre', role:'fullness'},
    ],
    feel: [
      'Creamy and satisfying; less snacky afterward.',
    ],
    body: [
      'Fats slow the meal; helps steady energy when paired with carbs.',
    ],
    good: [
      'Useful fats and fibre from a whole food.',
    ],
    bad: [
      'Calories add up fast if you’re unaware of portion size.',
    ],
    longevity: 'Replacing ultraprocessed fats with whole-food fats like avocado is generally a kinder long-term pattern.',
    flags: ['whole-food','fibre'],
  },
  {
    id: 'bread',
    names: ['bread','toast','white bread','sandwich bread','baguette'],
    category: 'grain',
    ingredients: [
      {n:'Wheat flour', role:'carbs — refined if white'},
      {n:'Yeast / salt', role:'rise and flavour'},
    ],
    feel: [
      'Comforting; white toast can leave you hungry again soon.',
    ],
    body: [
      'White bread digests fast → quicker glucose rise.',
      'Wholegrain slows that and adds fibre.',
    ],
    good: [
      'Convenient vehicle for eggs, protein, or nut butter.',
    ],
    bad: [
      'White bread alone is a fast carb with little staying power.',
    ],
    longevity: 'Prefer wholegrain most days. Bread isn’t the enemy — the ultra-refined, low-fibre versions and what you stack on them matter.',
    flags: ['refined'],
  },
  {
    id: 'pasta',
    names: ['pasta','spaghetti','noodles','macaroni','mac and cheese'],
    category: 'grain',
    ingredients: [
      {n:'Wheat (usually refined)', role:'carb base'},
      {n:'Sauce / cheese', role:'flavour, salt, fat'},
    ],
    feel: [
      'Comfort food; large bowls bring a food coma.',
    ],
    body: [
      'Portion size drives the glucose load.',
      'Pairing with veg and protein steadies the meal.',
    ],
    good: [
      'Useful energy; wholewheat versions add fibre.',
    ],
    bad: [
      'Huge restaurant portions plus creamy sauces overshoot easily.',
    ],
    longevity: 'Pasta can fit a long, healthy life — portions and what rides with it (veg, olive oil, protein vs cream mountains) decide the story.',
    flags: ['refined'],
  },
  {
    id: 'rice',
    names: ['rice','white rice','fried rice','brown rice'],
    category: 'grain',
    ingredients: [
      {n:'Rice grain', role:'carb fuel'},
    ],
    feel: [
      'Neutral fuel; fried rice feels heavier and saltier.',
    ],
    body: [
      'White rice raises glucose faster than brown; portions matter.',
    ],
    good: [
      'Easy energy alongside protein and vegetables.',
    ],
    bad: [
      'Fried rice often adds oil and salt without you noticing.',
    ],
    longevity: 'Rice cultures thrived on it with vegetables and protein. Ultra-large white-rice portions with little fibre are the weaker pattern.',
    flags: [],
  },
  {
    id: 'chips-fries',
    names: ['fries','french fries','chippy','fish and chips','loaded fries'],
    category: 'fried',
    ingredients: [
      {n:'Potato', role:'starch'},
      {n:'Frying oil', role:'crisp and calories'},
      {n:'Salt', role:'flavour'},
    ],
    feel: [
      'Hot, salty reward — then heavy and thirsty.',
    ],
    body: [
      'Deep-fried starch is calorie-dense and easy to overeat.',
      'Salt + oil leave you puffy and sluggish.',
    ],
    good: [
      'Pleasure food. Nutrient upside is minimal.',
    ],
    bad: [
      'Classic spike-and-slump side that crowds out better sides.',
    ],
    longevity: 'Chip-shop regularity is a different life from an occasional portion. Frying oils and salt frequency are the long-term cost.',
    flags: ['fried','salt','ultraprocessed'],
  },
  {
    id: 'sweets-candy',
    names: ['sweets','candy','gummy','gummies','haribo','chocolate sweets','sour candy'],
    category: 'sweet',
    ingredients: [
      {n:'Sugar / glucose syrup', role:'almost the whole product'},
      {n:'Acids & colours', role:'tang and brightness'},
      {n:'Gelatin / gums', role:'chew'},
    ],
    feel: [
      'Bright hit, then flatness and more wanting.',
      'Jaw-chewy kinds keep the reward loop going.',
    ],
    body: [
      'Near-pure sugar — sharp glucose rise.',
      'Acids + sugar hammer tooth enamel.',
    ],
    good: [
      'Purely recreational. Almost no nutritional upside.',
    ],
    bad: [
      'Cravings rebound; dental risk; mood jitter after the rush.',
    ],
    longevity: 'Frequent candy is a straight sugar habit. Keep it rare and intentional rather than desk-drawer automatic.',
    flags: ['sugar','ultraprocessed'],
  },
  {
    id: 'doughnut',
    names: ['doughnut','donut','doughnuts','donuts','cronut'],
    category: 'sweet',
    ingredients: [
      {n:'Refined flour', role:'dough'},
      {n:'Sugar / glaze', role:'sweet shell'},
      {n:'Frying oil', role:'texture'},
    ],
    feel: [
      'Euphoric first bites; crash and grease feel after.',
    ],
    body: [
      'Fried refined carb + sugar is a fast spike combo.',
      'Little protein or fibre to slow it.',
    ],
    good: [
      'Celebration food. That’s the honest upside.',
    ],
    bad: [
      'Energy rollercoaster; easy second doughnut.',
    ],
    longevity: 'Fine as a rare treat. Weekly doughnut runs are a sugar-and-oil pattern your metabolism notices.',
    flags: ['sugar','fried','ultraprocessed','refined'],
  },
  {
    id: 'cake',
    names: ['cake','cupcake','brownie','brownies','muffin','blondie'],
    category: 'sweet',
    ingredients: [
      {n:'Sugar', role:'structure and sweetness'},
      {n:'Refined flour', role:'crumb'},
      {n:'Butter/oil & eggs', role:'richness'},
    ],
    feel: [
      'Comfort and celebration — then sleepy or snacky.',
    ],
    body: [
      'Dense sugar + refined flour load.',
      'Portion “just a slice” often underestimates frosting.',
    ],
    good: [
      'Social joy is real; nutrition is not the point.',
    ],
    bad: [
      'Sugar hangover, cravings, and easy overshoot.',
    ],
    longevity: 'Mark birthdays. Don’t make cake an unmarked weeknight default.',
    flags: ['sugar','refined','ultraprocessed'],
  },
  {
    id: 'pastry',
    names: ['pastry','croissant','pain au chocolat','danish','sausage roll','bakery'],
    category: 'sweet',
    ingredients: [
      {n:'Laminated dough / pastry fat', role:'flaky layers'},
      {n:'Butter or shortening', role:'richness'},
      {n:'Sugar or savoury fillings', role:'flavour'},
    ],
    feel: [
      'Buttery pleasure; hunger returns surprisingly fast.',
    ],
    body: [
      'High energy density; refined layers digest quickly.',
    ],
    good: [
      'A good croissant is craft and joy — not a health food.',
    ],
    bad: [
      'Easy empty calories before lunch.',
    ],
    longevity: 'Bakery breakfasts daily crowd out protein and fibre. Occasional is the kinder pattern.',
    flags: ['refined','ultraprocessed'],
  },
  {
    id: 'breakfast-cereal',
    names: ['cereal','breakfast cereal','cornflakes','frosties','coco pops','granola'],
    category: 'grain',
    ingredients: [
      {n:'Refined grains (often)', role:'crunch'},
      {n:'Added sugar', role:'many kids’ and “healthy” granolas'},
      {n:'Milk (if used)', role:'protein depending on type'},
    ],
    feel: [
      'Fast and easy; sugary ones leave a mid-morning hole.',
    ],
    body: [
      'Sweet cereals act like dessert for breakfast.',
      'Fibre-rich, low-sugar options behave differently.',
    ],
    good: [
      'Fortified cereals can add vitamins; check sugar first.',
    ],
    bad: [
      'Many boxes are ultraprocessed sugar vehicles.',
    ],
    longevity: 'Read the sugar line. Plain oats or low-sugar wholegrain beats frosted flakes most mornings.',
    flags: ['sugar','ultraprocessed','refined'],
  },
  {
    id: 'yogurt',
    names: ['yogurt','yoghurt','greek yogurt','greek yoghurt'],
    category: 'dairy',
    ingredients: [
      {n:'Milk cultures', role:'protein and fermented benefits'},
      {n:'Added sugar (flavoured)', role:'can rival dessert'},
    ],
    feel: [
      'Creamy and filling when plain/Greek; sweet pots feel like pudding.',
    ],
    body: [
      'Protein supports satiety; live cultures may help some guts.',
    ],
    good: [
      'Plain Greek-style is a strong snack or breakfast base.',
    ],
    bad: [
      'Low-fat sweetened cups often hide a lot of sugar.',
    ],
    longevity: 'Fermented dairy patterns can fit well long-term — prefer unsweetened and add fruit yourself.',
    flags: ['protein'],
  },
  {
    id: 'cheese',
    names: ['cheese','cheddar','mozarella','mozzarella','cheese string'],
    category: 'dairy',
    ingredients: [
      {n:'Milk fat & protein', role:'satiety'},
      {n:'Salt', role:'preservation and flavour'},
    ],
    feel: [
      'Satisfying in small amounts; easy to keep slicing.',
    ],
    body: [
      'Dense calories; protein helps fullness.',
    ],
    good: [
      'Useful protein and calcium in modest portions.',
    ],
    bad: [
      'Salt and calories climb if “a bit of cheese” becomes half a block.',
    ],
    longevity: 'Cheese can fit a long life in measured amounts. Ultra-processed cheese products are a weaker cousin.',
    flags: ['protein','salt'],
  },
  {
    id: 'nuts',
    names: ['nuts','almonds','walnuts','cashews','peanuts','mixed nuts','trail mix'],
    category: 'snack',
    ingredients: [
      {n:'Nuts', role:'fats, protein, fibre'},
      {n:'Salt / sugar coatings (optional)', role:'can turn snack into candy'},
    ],
    feel: [
      'Properly satisfying; handful can stop a craving spiral.',
    ],
    body: [
      'Fats + fibre slow eating and steady energy.',
    ],
    good: [
      'One of the better snack defaults.',
    ],
    bad: [
      'Honey-roasted / salted tubs are easy to overeat.',
    ],
    longevity: 'Unsalted nuts regularly show up in healthier dietary patterns. Watch coatings and portion blindness.',
    flags: ['whole-food','protein','fibre'],
  },
  {
    id: 'smoothie',
    names: ['smoothie','protein shake','meal deal smoothie'],
    category: 'drink',
    ingredients: [
      {n:'Fruit', role:'sugars + some fibre if whole-blended'},
      {n:'Juice / syrup (shop ones)', role:'extra liquid sugar'},
      {n:'Yogurt / protein (optional)', role:'staying power'},
    ],
    feel: [
      'Refreshing; shop smoothies can still leave you snacky.',
    ],
    body: [
      'Drinking calories bypasses some fullness signals.',
      'Homemade with whole fruit + protein differs from juice blends.',
    ],
    good: [
      'Can be a vehicle for fruit and protein if built well.',
    ],
    bad: [
      'Commercial smoothies often rival soft drinks for sugar.',
    ],
    longevity: 'Chew fruit more often than you drink it. If you blend, include protein and skip juice bases.',
    flags: ['sugar','liquid-sugar'],
  },
  {
    id: 'fruit-juice',
    names: ['juice','orange juice','apple juice','fruit juice'],
    category: 'drink',
    ingredients: [
      {n:'Fruit sugars', role:'without most of the fibre'},
      {n:'Water & acids', role:'drinkable form'},
    ],
    feel: [
      'Fresh and virtuous — metabolically closer to soda than fruit.',
    ],
    body: [
      'Fibre removed → faster glucose rise.',
      'Easy to drink multiple fruits’ sugar in one glass.',
    ],
    good: [
      'Some vitamins remain; still not a free pass.',
    ],
    bad: [
      'Liquid sugar without the chewing brake.',
    ],
    longevity: 'Prefer whole fruit. Juice is an occasional drink, not a hydration staple.',
    flags: ['sugar','liquid-sugar'],
  },
  {
    id: 'takeaway-chinese',
    names: ['chinese takeaway','chinese food','sweet and sour','fried rice takeaway','chow mein'],
    category: 'meal',
    ingredients: [
      {n:'Fried items / battered meat', role:'oil load'},
      {n:'Sauces', role:'sugar and salt'},
      {n:'Rice or noodles', role:'refined carbs'},
    ],
    feel: [
      'Full and sleepy; thirsty from salt.',
    ],
    body: [
      'Salt, sugar, and oil stack quickly in classic takeaway combos.',
    ],
    good: [
      'Shared meal joy; some dishes are lighter if you choose carefully.',
    ],
    bad: [
      'Sweet sauces + fried starters are a metabolic pile-on.',
    ],
    longevity: 'Takeaway as a weekly ritual is common; stacking fried + sugary sauce most weeks is the bit that ages poorly.',
    flags: ['ultraprocessed','salt','sugar','fried'],
  },
  {
    id: 'takeaway-indian',
    names: ['indian takeaway','curry','tikka','biryani','naan','korma','butter chicken'],
    category: 'meal',
    ingredients: [
      {n:'Sauce (cream/oil/ghee often)', role:'richness and calories'},
      {n:'Meat or veg', role:'protein if present'},
      {n:'Rice / naan', role:'carb load'},
    ],
    feel: [
      'Warm, aromatic, very full — often next-day heavy.',
    ],
    body: [
      'Calorie-dense sauces; salt can be high.',
      'Big carb sides multiply the load.',
    ],
    good: [
      'Spices and vegetable curries can be excellent — depends on the dish.',
    ],
    bad: [
      'Creamy curries + naan + rice easily overshoot.',
    ],
    longevity: 'Home-style lentil and veg curries differ wildly from creamy takeaway feasts. Pattern and preparation decide the long game.',
    flags: ['salt'],
  },
  {
    id: 'kebab',
    names: ['kebab','doner','shawarma','gyro'],
    category: 'meal',
    ingredients: [
      {n:'Spit meat or grilled meat', role:'protein; quality varies'},
      {n:'White bread / wrap', role:'refined carbs'},
      {n:'Sauces & salad', role:'salt, sometimes sugar'},
    ],
    feel: [
      'Late-night satisfaction; greasy sleep afterward.',
    ],
    body: [
      'Salt and refined carbs; meat quality varies a lot.',
    ],
    good: [
      'Can include salad and decent protein if you choose well.',
    ],
    bad: [
      'Drunk-food portions and sauces tip it into a heavy load.',
    ],
    longevity: 'Occasional late kebab is a cultural staple for many — making it the default dinner after drinking stacks salt, refined carbs, and poor sleep.',
    flags: ['salt','refined'],
  },
  {
    id: 'hot-dog',
    names: ['hot dog','hotdog','frankfurter','corndog'],
    category: 'meal',
    ingredients: [
      {n:'Processed meat', role:'protein with curing salts'},
      {n:'White bun', role:'refined carbs'},
      {n:'Sauces', role:'sugar and salt'},
    ],
    feel: [
      'Salty satisfaction; not deeply filling.',
    ],
    body: [
      'Processed meats bring salt and curing compounds.',
    ],
    good: [
      'Quick protein of a sort — not a health food.',
    ],
    bad: [
      'Ultraprocessed meat + white bun is a weak everyday pattern.',
    ],
    longevity: 'Processed meats are better as rare foods than daily staples according to long-term risk research.',
    flags: ['ultraprocessed','salt'],
  },
  {
    id: 'bacon',
    names: ['bacon','bacon sandwich','bacon butty'],
    category: 'protein',
    ingredients: [
      {n:'Cured pork', role:'protein, fat, salt, nitrates/nitrites often'},
    ],
    feel: [
      'Savoury hit; thirsty afterward.',
    ],
    body: [
      'High salt; processed meat category.',
    ],
    good: [
      'Flavour and some protein — best occasional.',
    ],
    bad: [
      'Salt load; processed meat frequency is the concern.',
    ],
    longevity: 'Enjoy bacon rarely if you like it. Daily cured meats are the pattern linked with higher long-term risk.',
    flags: ['ultraprocessed','salt'],
  },
  {
    id: 'sausage',
    names: ['sausage','sausages','bangers','bratwurst'],
    category: 'protein',
    ingredients: [
      {n:'Minced meat + fat', role:'protein and calories'},
      {n:'Salt & preservatives', role:'typical processed sausage'},
      {n:'Fillers (rusk etc.)', role:'bulk in many British sausages'},
    ],
    feel: [
      'Hearty; heavy if you have a full fry-up.',
    ],
    body: [
      'Salt and fat dense; pair with beans/tomatoes/veg if it’s breakfast.',
    ],
    good: [
      'Protein — quality varies by brand.',
    ],
    bad: [
      'Processed sausages are easy everyday defaults that stack salt.',
    ],
    longevity: 'Same story as other processed meats: occasional vs daily changes the long-term picture.',
    flags: ['ultraprocessed','salt'],
  },
  {
    id: 'beans-toast',
    names: ['beans on toast','baked beans','heinz beans'],
    category: 'meal',
    ingredients: [
      {n:'Haricot beans', role:'fibre and plant protein'},
      {n:'Tomato sauce', role:'flavour; some sugar/salt'},
      {n:'Toast', role:'carbs'},
    ],
    feel: [
      'Properly filling for cheap comfort food.',
    ],
    body: [
      'Fibre from beans supports steadier energy and gut fullness.',
    ],
    good: [
      'One of the better “lazy” meals — plants + fibre.',
    ],
    bad: [
      'Sauce sugar/salt isn’t zero; still kinder than pastry breakfast.',
    ],
    longevity: 'Bean-heavy patterns show up often in longer-lived diets. A strong everyday option.',
    flags: ['fibre','plants','protein'],
  },
  {
    id: 'fish',
    names: ['fish','salmon','tuna','cod','mackerel','sardines'],
    category: 'protein',
    ingredients: [
      {n:'Fish protein', role:'satiety'},
      {n:'Omega-3s (oily fish)', role:'cell and heart-relevant fats'},
    ],
    feel: [
      'Clean fullness when simply cooked.',
    ],
    body: [
      'Quality protein; oily fish add long-chain omega-3s.',
    ],
    good: [
      'Especially oily fish a few times a week is a strong habit.',
    ],
    bad: [
      'Battered deep-fried fish flips toward the fries profile.',
    ],
    longevity: 'Regular oily fish is one of the better evidence-backed food habits for long-term health — baking/grilling beats batter.',
    flags: ['protein','whole-food'],
  },
  {
    id: 'vegetables',
    names: ['vegetables','veggies','veg','broccoli','carrots','spinach','greens'],
    category: 'produce',
    ingredients: [
      {n:'Vegetables', role:'fibre, volume, micronutrients'},
    ],
    feel: [
      'Light to satisfying depending on cooking and fat added.',
    ],
    body: [
      'Fibre and plant compounds support gut and metabolic health over time.',
    ],
    good: [
      'Nearly always a win — more plants, more often.',
    ],
    bad: [
      'Drowning veg in creamy sauces changes the maths.',
    ],
    longevity: 'Vegetable intake is one of the clearest longevity correlates. Build them into meals you already like.',
    flags: ['whole-food','fibre','plants'],
  },
  {
    id: 'water',
    names: ['water','sparkling water','soda water'],
    category: 'drink',
    ingredients: [
      {n:'Water', role:'hydration'},
    ],
    feel: [
      'Clearer head when you were actually thirsty.',
    ],
    body: [
      'Supports circulation, digestion, and cognitive feel.',
    ],
    good: [
      'The default drink for a long life.',
    ],
    bad: [
      'None worth mentioning — unless you’re forcing gallons.',
    ],
    longevity: 'Replacing sugary drinks with water is a high-leverage longevity move.',
    flags: ['whole-food'],
  },
  {
    id: 'protein-bar',
    names: ['protein bar','protein bars','granola bar','cereal bar','breakfast bar'],
    category: 'snack',
    ingredients: [
      {n:'Protein blend', role:'marketing upside'},
      {n:'Sugars / syrups / sugar alcohols', role:'bind and sweeten'},
      {n:'Oils & flavours', role:'mouthfeel'},
    ],
    feel: [
      'Convenient; some leave a sweet after-craving or gut rumble (sugar alcohols).',
    ],
    body: [
      'Varies wildly — some are candy with protein powder.',
    ],
    good: [
      'Better than nothing when you need portable protein — check the label.',
    ],
    bad: [
      'Many are ultraprocessed desserts in disguise.',
    ],
    longevity: 'Whole-food protein usually beats bars. Use bars as tools, not a food group.',
    flags: ['ultraprocessed'],
  },
  {
    id: 'microwave-meal',
    names: ['microwave meal','ready meal','tv dinner','frozen meal'],
    category: 'meal',
    ingredients: [
      {n:'Mixed components', role:'convenience'},
      {n:'Salt & additives', role:'shelf life and flavour'},
    ],
    feel: [
      'Fills a gap; often oddly unsatisfying an hour later.',
    ],
    body: [
      'Salt can be very high; protein/fibre vary.',
    ],
    good: [
      'Beats skipping meals when life is chaos — choose higher-protein ones.',
    ],
    bad: [
      'Ultraprocessed defaults train a salt-heavy palate.',
    ],
    longevity: 'Fine as a bridge. Living on ready meals most nights is a salt-and-additive pattern worth upgrading when you can.',
    flags: ['ultraprocessed','salt'],
  },
  {
    id: 'popcorn',
    names: ['popcorn','cinema popcorn'],
    category: 'snack',
    ingredients: [
      {n:'Popped corn', role:'whole grain'},
      {n:'Butter/oil/salt/sugar', role:'cinema versions go hard'},
    ],
    feel: [
      'Light crunch; sweet/salty cinema tubs are a different beast.',
    ],
    body: [
      'Air-popped is high volume/fibre; cinema style is oil+sugar+salt.',
    ],
    good: [
      'Plain popcorn can be a solid high-fibre snack.',
    ],
    bad: [
      'Cinema tubs rival dessert for sugar/salt/oil.',
    ],
    longevity: 'Technique matters: air-popped plain vs carnival bucket are not the same food.',
    flags: [],
  },
  {
    id: 'hummus',
    names: ['hummus','houmous'],
    category: 'snack',
    ingredients: [
      {n:'Chickpeas', role:'fibre and plant protein'},
      {n:'Tahini / olive oil', role:'fats'},
      {n:'Garlic & lemon', role:'flavour'},
    ],
    feel: [
      'Satisfying with veg sticks; easy to finish a pot with crisps.',
    ],
    body: [
      'Fibre + fat supports steadier energy than sugary snacks.',
    ],
    good: [
      'Strong dip default — especially with vegetables.',
    ],
    bad: [
      'Pairing with endless crisps changes the story.',
    ],
    longevity: 'Legume-based foods like hummus fit well in long-term healthy patterns.',
    flags: ['whole-food','fibre','plants','protein'],
  },
  {
    id: 'peanut-butter',
    names: ['peanut butter','pb','jam sandwich','pbj'],
    category: 'snack',
    ingredients: [
      {n:'Peanuts', role:'protein and fats'},
      {n:'Added sugar/oils (some brands)', role:'smoother commercial jars'},
    ],
    feel: [
      'Very filling; spoonfuls sneak up on you.',
    ],
    body: [
      'Energy dense; protein helps satiety.',
    ],
    good: [
      'Decent everyday spread when ingredients are mostly peanuts.',
    ],
    bad: [
      'Sweetened jars + white bread become dessert-adjacent.',
    ],
    longevity: 'Nut butters with short ingredient lists are a practical longevity snack — watch sugar-added versions.',
    flags: ['protein'],
  },
];

/** Keyword heuristics when no profile matches. */
export const FOOD_HEURISTICS = [
  {keys:['sugar','sweet','candy','dessert','icing','frosting','syrup'], flags:['sugar'], label:'sweet / sugary'},
  {keys:['fried','deep fried','battered','tempura'], flags:['fried'], label:'fried'},
  {keys:['soda','cola','fizzy','soft drink'], flags:['sugar','liquid-sugar'], label:'sugary drink'},
  {keys:['beer','wine','vodka','alcohol','cocktail','pint'], flags:['alcohol'], label:'alcohol'},
  {keys:['coffee','espresso','caffeine','energy'], flags:['caffeine'], label:'caffeinated'},
  {keys:['salad','veg','vegetable','fruit','bean','lentil','oat'], flags:['plants','whole-food'], label:'plant-forward'},
  {keys:['chicken','fish','egg','meat','tofu','protein'], flags:['protein'], label:'protein-heavy'},
  {keys:['chip','crisp','takeaway','fast food','mcdonald','kfc'], flags:['ultraprocessed','salt'], label:'takeaway / packaged'},
];
