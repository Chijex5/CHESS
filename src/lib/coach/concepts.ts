import type { Concept } from "@/lib/chess/types";

/** The retrieval corpus, and the app's curriculum — the same fourteen entries feed
 *  the coach's prompt, the `[[term]]` links in its prose, the /concepts pages and
 *  the "when to use it" line on every drill. `tags` are the signals the retriever
 *  matches against position features; `blurb` is all the model is shown, so the
 *  teaching fields below can be written for a reader rather than for a prompt.
 *
 *  Adding a principle is a matter of adding an entry here — nothing else in the app
 *  needs to know. Examples are verified by `scripts/check-concepts.mjs`, which runs
 *  as part of `pnpm verify`; a caption that claims a piece is won is a claim the
 *  script checks. */
export const CONCEPTS: (Concept & { tags: string[] })[] = [
  {
    slug: "overloaded-defender",
    tags: ["capture", "material-loss", "defender", "tactic", "piece:n", "piece:b"],
    name: "Overloaded defender",
    family: "tactical",
    blurb:
      "A piece asked to guard two things at once guards neither reliably. Find the second job, then take the first.",
    look:
      "One enemy piece is the only thing defending two of your targets. Count defenders on each target and see if the same piece appears twice.",
    when:
      "Whenever you have two captures available and each is answered by the same recapture. It costs nothing to check — take one, and if the recapture abandons the other, you are a piece up.",
    pitfall:
      "Overload is not the same as a piece being busy. If the defender can recapture and still hold, or a second defender exists, there is no tactic and you have just given material away.",
    example: {
      fen: "6k1/ppb1q1pp/4n3/8/8/8/PP4PP/2R1R1K1 w - - 0 1",
      san: "Rxe6",
      caption:
        "Both the knight on e6 and the bishop on c7 lean on the queen. She can answer one capture, not both.",
    },
  },
  {
    slug: "center-control",
    tags: ["opening", "piece:p", "center", "quiet"],
    name: "Central control",
    family: "positional",
    blurb:
      "Pawns and pieces that cover d4, d5, e4 and e5 restrict the opponent's pieces before any tactic exists.",
    look:
      "Count how many of your pieces and pawns hit d4, d5, e4 and e5, and how many of theirs do. The side with more usually has the freer game.",
    when:
      "In the first ten moves, and any time the position opens up. A pawn in the centre is worth more than the same pawn on the edge because it takes squares away from four enemy pieces at once.",
    pitfall:
      "Occupying the centre is not the same as controlling it. A pawn pushed to a square your opponent attacks three times is a target, not an asset.",
    example: {
      fen: "r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 3 3",
      san: "d4",
      caption:
        "d4 hits e5 and frees the dark-squared bishop in the same move. Two jobs, one pawn.",
    },
  },
  {
    slug: "open-diagonal",
    tags: ["piece:b", "quiet", "middlegame"],
    name: "Open diagonal",
    family: "positional",
    blurb:
      "A bishop's value is the length of its unobstructed diagonal, not the square it stands on.",
    look:
      "Follow each bishop's two diagonals with your eye until they hit something. A bishop that stops after one square is doing nothing.",
    when:
      "Before you move a bishop anywhere. Ask which diagonal it will see from the new square, not whether the square looks safe — an unblocked bishop nine squares from the enemy king is a real attacker.",
    pitfall:
      "Your own pawns are the usual blockers. Putting pawns on the colour your bishop travels on turns it into the piece players call bad, and no amount of manoeuvring fixes that while the pawns stay.",
    example: {
      fen: "rnbqkb1r/ppp2ppp/4pn2/3p4/3P4/5NP1/PPP1PP1P/RNBQKB1R w KQkq - 0 4",
      san: "Bg2",
      caption:
        "On f1 the bishop sees one square. On g2 it looks down the whole a8-h1 diagonal.",
    },
  },
  {
    slug: "two-bishops",
    tags: ["piece:b", "capture", "middlegame"],
    name: "Bishop pair",
    family: "positional",
    blurb:
      "Two bishops cover both colours. In open positions the pair is worth roughly half a pawn over bishop and knight.",
    look:
      "Check whether you still have both bishops and they do not. If so, look for ways to open the position rather than to trade.",
    when:
      "In open positions with few pawns in the way. The pair's advantage is that between them they reach every square on the board, which only matters when there is room to travel.",
    pitfall:
      "In a blocked position with pawns fixed on both colours, a knight that can jump over the mess is worth more than either bishop. The pair is an advantage you have to open lines to collect.",
    example: {
      fen: "6k1/pp3ppp/2n5/8/4P3/1P1B4/P4PPP/2B3K1 w - - 0 1",
      san: "Bb2",
      caption:
        "Bb2 puts the second bishop on the second long diagonal. Between them they now cover both colours around the black king.",
    },
  },
  {
    slug: "open-file",
    tags: ["piece:r", "open-file", "half-open-file", "middlegame", "endgame"],
    name: "Open file",
    family: "positional",
    blurb:
      "Rooks need files with no pawns. Occupy the file, then contest it — the side that doubles first usually keeps it.",
    look:
      "Scan the eight files for one with no pawns of either colour on it, and for half-open files with only the enemy's pawn.",
    when:
      "As soon as pawns come off. A rook on a closed file has no future move; the same rook on an open file threatens everything on that file for the rest of the game.",
    pitfall:
      "Taking the file is not owning it. If they can meet you on it and trade rooks, the file becomes nobody's — which suits whoever had the worse position.",
    example: {
      fen: "r5k1/ppp1pppp/8/8/8/8/PPP1PPPP/R5K1 w - - 0 1",
      san: "Rd1",
      caption:
        "d is the only file with no pawns on it. Whoever puts a rook there first decides who gets to use it.",
    },
  },
  {
    slug: "rook-activity",
    tags: ["piece:r", "endgame", "quiet"],
    name: "Rook activity",
    family: "positional",
    blurb:
      "A rook that sees nothing is worth less than a knight that sees six squares. Activity outranks material in rook endings.",
    look:
      "Count the squares each rook can legally move to. A rook defending a pawn from behind it usually has one; the same rook attacking from the seventh has ten.",
    when:
      "In every endgame with rooks. Given the choice between defending a pawn passively and giving it up for an active rook, the active rook is right far more often than beginners expect.",
    pitfall:
      "Activity is not the same as adventure. A rook that runs into enemy territory and gets trapped behind a pawn chain has spent its activity on nothing.",
    example: {
      fen: "1r6/pp4kp/8/8/8/8/6PP/3R2K1 w - - 0 1",
      san: "Rd7+",
      caption:
        "From d7 the rook checks the king and attacks two pawns. On d1 it attacked nothing at all.",
    },
  },
  {
    slug: "double-attack",
    tags: ["piece:q", "piece:n", "check", "missed-threat", "tactic"],
    name: "Double attack",
    family: "tactical",
    blurb:
      "One move, two threats. The opponent answers one and loses the other. Queens and knights make the cheapest ones.",
    look:
      "After any candidate move, list everything the moved piece now attacks. If two of those are worth taking and both are undefended, you have one.",
    when:
      "Any time the opponent has two loose pieces, or a loose piece and an exposed king. A check plus a threat is the strongest form because the check is not optional.",
    pitfall:
      "Two attacks on defended pieces is not a double attack — it is two threats they can ignore. The targets have to be genuinely takeable.",
    example: {
      fen: "4k1n1/p5pp/8/8/1b6/8/PP4PP/3Q2K1 w - - 0 1",
      san: "Qa4+",
      caption:
        "The queen checks the king along one line and touches the loose bishop along another. The check has to be answered, so the bishop goes.",
    },
  },
  {
    slug: "king-safety",
    tags: ["piece:k", "castling", "check", "king-exposed"],
    name: "King safety",
    family: "positional",
    blurb:
      "A king stuck in the centre with open files nearby is a permanent tactical liability — even a pawn down, keep it stuck.",
    look:
      "Ask whether the king has castled, whether the files beside it are open, and whether the pawns in front of it have moved. Two of those three going wrong is usually enough for an attack.",
    when:
      "In the first ten moves, castle unless there is a concrete reason not to. Later, before every pawn push near your own king — those pawns are the roof.",
    pitfall:
      "Castling into the attack is worse than staying put. If they already have pieces aimed at one side, castle to the other or leave the king in the middle behind a solid pawn wall.",
    example: {
      fen: "r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4",
      san: "O-O",
      caption:
        "One move takes the king off the open e-file and brings the last undeveloped piece towards the centre.",
    },
  },
  {
    slug: "piece-trade",
    tags: ["capture", "recapture", "middlegame"],
    name: "Trading logic",
    family: "positional",
    blurb:
      "Trade when it helps your worst piece or hurts their best. Trading a good knight for a passive bishop is a concession.",
    look:
      "Before any capture, compare the two pieces by what they are doing rather than by their point value. The question is which of you will miss it.",
    when:
      "When you are ahead in material, trade pieces — fewer pieces means the extra material decides the game. When you are behind, keep pieces on and look for complications.",
    pitfall:
      "Equal points is not an equal trade. Your active knight for their bishop that has never moved is a bad deal at the same nominal price.",
    example: {
      fen: "6k1/6pp/2n5/8/3N4/8/PP4PP/6K1 w - - 0 1",
      san: "Nxc6",
      caption:
        "Two pawns up, trading the last pieces is the whole plan. What is left is a pawn ending White cannot lose.",
    },
  },
  {
    slug: "loose-piece",
    tags: ["left-attacked", "material-loss", "tactic", "blunder"],
    name: "Loose piece",
    family: "tactical",
    blurb:
      'Undefended pieces are what tactics are made of. "Loose pieces drop off" — check every piece you own before moving.',
    look:
      "Point at each of your own pieces in turn and name what defends it. Anything with no answer is loose, and every tactic in the game runs through it.",
    when:
      "Before you commit to any move. This is the one check worth making every single time — most material lost below club level is lost to a piece nobody was watching, not to a clever combination.",
    pitfall:
      "A piece defended once is still loose if the defender is pinned, overloaded, or about to be captured. Count the defenders that can actually arrive.",
    example: {
      fen: "6k1/6pp/2b5/8/8/8/6PP/2R3K1 w - - 0 1",
      san: "Rxc6",
      caption:
        "Nothing defends c6, so there is no tactic to find — the rook takes the bishop and the game is effectively over.",
    },
  },
  {
    slug: "back-rank",
    tags: ["piece:r", "piece:q", "back-rank", "endgame", "tactic"],
    name: "Back-rank weakness",
    family: "tactical",
    blurb:
      "A castled king behind three unmoved pawns has one escape square: none. Every rook on the first rank is a threat.",
    look:
      "Look at your own king. If f7, g7 and h7 are all still on their squares and no piece guards the eighth rank, you are one rook away from being mated.",
    when:
      "Every time a rook or queen can reach your back rank, and every time theirs is similarly shut in. Making a single escape square is usually a free move you should spend early rather than late.",
    pitfall:
      "The escape square has to be safe. Pushing h3 to make luft while the g-file is open can hand them a different mate instead of preventing this one.",
    example: {
      fen: "6k1/5ppp/8/8/8/8/6PP/4R1K1 w - - 0 1",
      san: "Re8#",
      caption:
        "The three pawns that look like shelter are the reason the king has nowhere to go.",
    },
  },
  {
    slug: "fork",
    tags: ["piece:n", "piece:q", "check", "tactic", "missed-threat"],
    name: "Fork",
    family: "tactical",
    blurb:
      "A single piece attacking two targets at once. Knights fork best because their attacks cannot be blocked.",
    look:
      "For knights, look for two enemy pieces a knight's move apart from a common square — kings and rooks on the same colour are the classic pair.",
    when:
      "Any time the enemy king and a heavy piece sit near each other. A knight check that also hits a rook wins material outright, because a check leaves no time to save the rook.",
    pitfall:
      "The forking square has to be safe. A knight fork on a square defended by a pawn is a knight given away with extra steps.",
    example: {
      fen: "r3k3/6pp/8/1N6/8/8/6PP/6K1 w - - 0 1",
      san: "Nc7+",
      caption:
        "From c7 the knight touches the king and the rook at once. The king must move, and then the rook falls.",
    },
  },
  {
    slug: "pin",
    tags: ["piece:b", "piece:r", "piece:q", "tactic"],
    name: "Pin",
    family: "tactical",
    blurb:
      "A piece that cannot move without exposing something more valuable behind it. Add attackers before it escapes.",
    look:
      "Look along your bishops', rooks' and queen's lines for two enemy pieces in a row, with the more valuable one behind.",
    when:
      "Once a piece is pinned, stop looking for a way to take it and start looking for a second attacker. A pinned piece cannot run, so you can build the attack at leisure — usually with a pawn.",
    pitfall:
      "A relative pin is not absolute. If the piece behind is a queen rather than a king, they may simply move it and let you have the exchange.",
    example: {
      fen: "rnbqkb1r/pppp1ppp/4pn2/8/3P4/5N2/PPP1PPPP/RNBQKB1R w KQkq - 0 3",
      san: "Bg5",
      caption:
        "The knight on f6 now cannot move without exposing the queen sitting behind it.",
    },
  },
  {
    slug: "discovered-attack",
    tags: ["piece:b", "piece:r", "tactic", "missed-threat"],
    name: "Discovered attack",
    family: "tactical",
    blurb:
      "Move the front piece and the piece behind it does the work. Strongest when the front piece also makes a threat.",
    look:
      "Look for your own pieces standing on a line between one of your long-range pieces and something of theirs worth hitting. The front piece is the one to move.",
    when:
      "When the discovered line gives check, because then the opponent has no time to deal with whatever the front piece went on to attack. That combination wins material almost every time.",
    pitfall:
      "Getting the order wrong. If you move the front piece somewhere harmless, they answer the discovery and you have gained nothing but a tempo loss.",
    example: {
      fen: "8/p1r2pkp/8/8/3N4/8/1B4PP/6K1 w - - 0 1",
      san: "Nb5+",
      caption:
        "The knight steps aside and the bishop behind it gives check. Black must answer the check, and then the rook on c7 is taken.",
    },
  },
];

export const CONCEPT_BY_SLUG = new Map(CONCEPTS.map((c) => [c.slug, c]));

/* The coach marks its own jargon with [[double brackets]] and writes whatever word
   fits the sentence — "hanging", "overloaded", "forks". This maps those back onto
   the corpus so a marked term becomes a link. Keys are matched after lowercasing
   and stripping a trailing s/es/ed/ing, so one entry covers the inflections.

   A term with no entry here still renders — just as plain text with the brackets
   removed — so an unmapped word is a missed link, never a broken sentence. */
const ALIASES: Record<string, string> = {
  hang: "loose-piece",
  hanging: "loose-piece",
  loose: "loose-piece",
  "loose piece": "loose-piece",
  undefended: "loose-piece",
  unprotected: "loose-piece",
  overload: "overloaded-defender",
  overloaded: "overloaded-defender",
  "overworked defender": "overloaded-defender",
  fork: "fork",
  "double attack": "double-attack",
  "two threats": "double-attack",
  pin: "pin",
  pinned: "pin",
  skewer: "pin",
  discovery: "discovered-attack",
  "discovered check": "discovered-attack",
  "back rank": "back-rank",
  "back-rank mate": "back-rank",
  luft: "back-rank",
  centre: "center-control",
  center: "center-control",
  "central control": "center-control",
  diagonal: "open-diagonal",
  "long diagonal": "open-diagonal",
  fianchetto: "open-diagonal",
  "bad bishop": "open-diagonal",
  "bishop pair": "two-bishops",
  "two bishops": "two-bishops",
  file: "open-file",
  "open file": "open-file",
  "half-open file": "open-file",
  "half open file": "open-file",
  doubling: "open-file",
  "seventh rank": "rook-activity",
  "active rook": "rook-activity",
  activity: "rook-activity",
  castle: "king-safety",
  castling: "king-safety",
  "king safety": "king-safety",
  exposed: "king-safety",
  trade: "piece-trade",
  exchange: "piece-trade",
  simplify: "piece-trade",
  simplifying: "piece-trade",
};

/** Trailing inflections, longest first so "ing" is tried before "g" cases and
 *  "es" before "s". Deliberately crude: this only has to collapse plurals and
 *  participles of chess nouns, not conjugate English. */
const SUFFIXES = ["ing", "ed", "es", "s"] as const;

function stem(word: string): string {
  for (const suffix of SUFFIXES) {
    if (word.length > suffix.length + 2 && word.endsWith(suffix)) {
      return word.slice(0, -suffix.length);
    }
  }
  return word;
}

/** Resolves a `[[marked]]` term to a corpus entry, or null if we teach no such
 *  thing — in which case the caller renders the word plainly. */
export function conceptForTerm(term: string): Concept | null {
  const raw = term.toLowerCase().trim().replace(/\s+/g, " ");
  const slug =
    ALIASES[raw] ??
    ALIASES[stem(raw)] ??
    CONCEPTS.find((c) => c.name.toLowerCase() === raw || c.slug === raw)?.slug ??
    CONCEPTS.find((c) => stem(c.name.toLowerCase()) === stem(raw))?.slug;
  const found = slug ? CONCEPT_BY_SLUG.get(slug) : undefined;
  return found ? publicConcept(found) : null;
}

/** Strips retrieval-only fields before a concept crosses the wire. The teaching
 *  fields travel with it: a drill needs `when` to say when the idea applies, and
 *  it reaches the drill through an annotation rather than through the corpus. */
export function publicConcept(concept: Concept & { tags?: string[] }): Concept {
  const { slug, name, family, blurb, look, when, pitfall, example } = concept;
  return { slug, name, family, blurb, look, when, pitfall, example };
}
