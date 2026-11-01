/* levels.js - level data: maps, enemies, items, goals, starter C++ code and hints. Add new levels here. */

var LEVELS = [
  {
    id: 1, name: "First Steps", w: 8, h: 5, hero: [0, 1], hp: 10, maxTurns: 40,
    walls: [[3,0],[3,1],[3,2]], enemies: [], items: [], exit: [6, 3], goals: ["exit"],
    brief: "Walk your hero to the glowing portal. A wall stands in the way, so plan a route around it.",
    hint: "hero.moveDown(2) takes you below the wall. After that, hero.moveRight(6) reaches the portal.",
    starter: "// Walk your hero to the portal.\n// x grows to the right, y grows downward.\nint main() {\n  hero.moveRight(2);\n  return 0;\n}\n"
  },
  {
    id: 2, name: "Gem Gulch", w: 9, h: 6, hero: [0, 0], hp: 10, maxTurns: 80,
    walls: [[2,2],[3,2],[4,2],[5,2],[6,2]], enemies: [],
    items: [["gem",5,0],["gem",7,3],["gem",1,5]], exit: null, goals: ["gems"],
    brief: "Collect all three gems. moveXY(x, y) finds a path around walls for you.",
    hint: "Add one hero.moveXY line per gem, before return 0. The gems sit at (5, 0), (7, 3) and (1, 5).",
    starter: "// moveXY(x, y) walks to a tile and goes around walls.\nint main() {\n  hero.moveXY(5, 0);\n  return 0;\n}\n"
  },
  {
    id: 3, name: "Munchkin Meadow", w: 10, h: 6, hero: [0, 3], hp: 10, maxTurns: 80,
    walls: [[4,1],[4,5],[7,3]], enemies: [["munchkin",5,3],["munchkin",8,1]], items: [], exit: null, goals: ["enemies"],
    brief: "Two munchkins guard the meadow. Defeat them both. Each attack is one turn, so repeat it in a loop.",
    hint: "Copy the fighting lines and run them again for the second munchkin. Write enemy = hero.findNearestEnemy(); first, because the nearest enemy has changed.",
    starter: "// Fight the nearest munchkin until it falls.\nint main() {\n  Enemy* enemy = hero.findNearestEnemy();\n  while (enemy->alive) {\n    hero.attack(enemy);\n  }\n\n  // A second munchkin is waiting. Fight it too.\n\n  return 0;\n}\n"
  },
  {
    id: 4, name: "Loop Canyon", w: 11, h: 7, hero: [0, 3], hp: 12, maxTurns: 220,
    walls: [[3,1],[3,2],[3,4],[3,5],[7,0],[7,1],[7,3],[7,4],[7,5]],
    enemies: [["munchkin",5,3],["munchkin",6,1],["munchkin",9,5],["munchkin",9,2]],
    items: [["gem",5,0],["gem",5,6],["gem",10,0],["gem",10,6]], exit: null, goals: ["gems","enemies"],
    brief: "Four munchkins and four gems. Defeat every foe and pick up every gem.",
    hint: "When findNearestEnemy() returns nullptr, the fighting is over. Then call hero.findGems(), pick one with hero.findNearest(gems), and send the hero there with hero.moveXY(gem->x, gem->y).",
    starter: "#include <vector>\n// Defeat every munchkin, then grab every gem.\nint main() {\n  while (true) {\n    Enemy* enemy = hero.findNearestEnemy();\n    if (enemy != nullptr) {\n      hero.attack(enemy);\n    } else {\n      break; // TODO: collect the gems before you stop\n    }\n  }\n  return 0;\n}\n"
  },
  {
    id: 5, name: "Wolf Pack", w: 12, h: 7, hero: [0, 3], hp: 10, maxTurns: 160,
    walls: [[3,0],[3,1],[3,5],[3,6],[8,2],[8,3],[8,4]],
    enemies: [["wolf",6,2],["wolf",6,4],["wolf",10,3]],
    items: [["potion",2,0]], exit: [11, 3], goals: ["enemies","exit"],
    brief: "Wolves chase you once you come close. Defeat the pack, then reach the portal. A potion sits in the top-left corner at (2, 0).",
    hint: "Check hero.health inside your loop. When it is 6 or less, fetch the potion from hero.findPotions() with hero.moveXY before you keep fighting.",
    starter: "// Defeat the wolves, then walk to the portal at (11, 3).\nint main() {\n  while (true) {\n    Enemy* enemy = hero.findNearestEnemy();\n    if (enemy != nullptr) {\n      hero.attack(enemy);\n    } else {\n      hero.moveXY(11, 3);\n      break;\n    }\n  }\n  return 0;\n}\n"
  },
  {
    id: 6, name: "Ogre Keep", w: 12, h: 8, hero: [0, 0], hp: 12, maxTurns: 320,
    walls: [[1,2],[2,2],[3,2],[4,2],[5,2],[6,2],[7,2],[8,2],[9,2],[2,5],[3,5],[4,5],[5,5],[6,5],[7,5],[8,5],[9,5],[10,5]],
    enemies: [["ogre",6,3],["munchkin",2,7],["munchkin",10,7],["wolf",11,3]],
    items: [["gem",6,0],["gem",10,1],["gem",3,3],["gem",4,7],["gem",9,6],["potion",1,4]],
    exit: [11, 7], goals: ["gems","enemies","exit"],
    brief: "The final keep. An ogre hits hard, wolves chase, and gems are scattered through three halls. Clear everything and escape through the portal.",
    hint: "Combine every idea: fight the nearest enemy, drink the potion when health is low, collect the gems, then call hero.moveXY(11, 7) as the last step.",
    starter: "#include <vector>\n// Clear the keep: foes, gems, then the portal at (11, 7).\nint main() {\n  while (true) {\n    Enemy* enemy = hero.findNearestEnemy();\n    if (enemy != nullptr) {\n      hero.attack(enemy);\n    } else {\n      break;\n    }\n  }\n  return 0;\n}\n"
  }
];
