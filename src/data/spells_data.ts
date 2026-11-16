// АВТОГЕНЕРАЦИЯ — не править руками. Источник: docs/content/data/gen_spells_ts.py
// (таблицы оригинала 0.9941 → orig_tables.json; база урона/КД — namu, в коде оригинала её нет, см. README «Пробелы» п.1).
// Урон в процентах ATK оригинала. «pct» складываются внутри заклинания (fadd в DamageRatioU), «mul» — отдельные множители.

export type Frame = 'projectile' | 'sky' | 'aura' | 'orbit' | 'zone' | 'beam' | 'wave' | 'utility';
export type Stat = 'dmg' | 'cd' | 'count' | 'size' | 'duration' | 'speed' | 'pierce' | 'interval' | 'range' | 'width' | 'mana' | 'revive' | 'effect' | 'crit' | 'amp' | 'other';
/** pct: +N% (сумма), mul: ×N, add: +N штук, sec: +N секунд, note: текст без числа */
export type Op = 'pct' | 'mul' | 'add' | 'sec' | 'note';
export interface Mod { stat: Stat; op: Op; v: number; text: string }
/** table — колонка таблиц игры (для базы заклинаний таких нет), code — константа в game.asm, wiki — namu/EN вики */
export type Src = 'table' | 'code' | 'wiki';
export type BaseField = 'dmgPct' | 'effectPct' | 'cd' | 'count' | 'duration' | 'tick' | 'size';
export interface Base { dmgPct?: number; effectPct?: number; cd?: number; count?: number; duration?: number; tick?: number; size?: number; note: string; src: Partial<Record<BaseField, Src>> }
export interface LevelUp { level: number; prop: false; mods: Mod[] }
export interface Prop { id: number; name: string; en: string; mods: Mod[]; mechanics: string[]; effIds: number[][] }
export interface SpellData {
  id: number; key: string; ours: string; oursCodeId: string | null; name: string; en: string;
  kind: 'attack' | 'utility'; frame: Frame; maxLevel: number; desc: string; base: Base;
  /** прибавки уровней 2..max (без уровней выбора свойства) */
  levels: LevelUp[];
  /** на каких уровнях выбор свойства (у Магической пули — 4 и 7) */
  propLevels: number[];
  /** уровень → 3 варианта свойства */
  props: Record<string, Prop[]>;
  enchant: { text: string; mods: Mod[] } | null;
}
export interface ComboSide { spell: number; prop: number; propName: string }
export interface ComboData {
  id: number; name: string; en: string;
  /** основа (усиливается) и донор (убирается) */
  base: ComboSide; donor: ComboSide;
  mods: Mod[]; mechanics: string[]; effIds: number[][];
  ultimate: { name: string; en: string; classId: number; className: string; text: string } | null;
}

/** Уровни персонажа, на которых предлагается карточка слияния (по STATUS/вики; в таблицах уровня нет). */
export const COMBO_SLOT_LEVELS = [25, 50, 75] as const;
/** Энчант («Очарование»): макс. 3 раза на заклинание. */
export const ENCHANT_MAX = 3;

export const SPELLS: SpellData[] = [
 {
  "id": 1,
  "key": "bolt",
  "ours": "Звёздная игла",
  "oursCodeId": "needle",
  "name": "Магическая пуля",
  "en": "Magic Bolt",
  "kind": "attack",
  "frame": "projectile",
  "maxLevel": 7,
  "desc": "Усиливает базовые снаряды.",
  "base": {
   "dmgPct": 500.0,
   "cd": 0.75,
   "count": 1.0,
   "note": "Урон: 500% ATK; КД: 0.75 с; Кол-во: 1; Цель: ближайший враг",
   "src": {
    "dmgPct": "code",
    "cd": "code",
    "count": "code"
   }
  },
  "levels": [
   {
    "level": 2,
    "prop": false as const,
    "mods": [
     {
      "stat": "count",
      "op": "add",
      "v": 1.0,
      "text": "Число магических пуль +1"
     }
    ]
   },
   {
    "level": 3,
    "prop": false as const,
    "mods": [
     {
      "stat": "dmg",
      "op": "pct",
      "v": 50.0,
      "text": "Урон магических пуль +50%"
     }
    ]
   },
   {
    "level": 5,
    "prop": false as const,
    "mods": [
     {
      "stat": "count",
      "op": "add",
      "v": 1.0,
      "text": "Число магических пуль +1"
     }
    ]
   },
   {
    "level": 6,
    "prop": false as const,
    "mods": [
     {
      "stat": "dmg",
      "op": "pct",
      "v": 50.0,
      "text": "Урон магических пуль +50%"
     }
    ]
   }
  ],
  "propLevels": [
   4,
   7
  ],
  "props": {
   "4": [
    {
     "id": 362,
     "name": "Магическая стрела",
     "en": "Magic Arrow",
     "mods": [
      {
       "stat": "dmg",
       "op": "mul",
       "v": 1.5,
       "text": "Урон магических пуль х1,5"
      },
      {
       "stat": "size",
       "op": "pct",
       "v": 180.0,
       "text": "Размер зарядов магических пуль +180%"
      },
      {
       "stat": "speed",
       "op": "pct",
       "v": 180.0,
       "text": "Скорость зарядов магических пуль +180%"
      }
     ],
     "mechanics": [
      "Магические пули пробивают насквозь всех врагов."
     ],
     "effIds": [
      [
       -1,
       1.0
      ],
      [
       164,
       180.0
      ],
      [
       851,
       150.0
      ],
      [
       862,
       180.0
      ]
     ]
    },
    {
     "id": 363,
     "name": "Петарда",
     "en": "Fireworks",
     "mods": [
      {
       "stat": "dmg",
       "op": "pct",
       "v": 50.0,
       "text": "Урон магических пуль +50%"
      },
      {
       "stat": "cd",
       "op": "sec",
       "v": 2.0,
       "text": "Время перезарядки магических пуль +2 сек."
      }
     ],
     "mechanics": [
      "Магические пули разлетаются по 3 и взрываются."
     ],
     "effIds": [
      [
       -1,
       1.0
      ],
      [
       156,
       2.0
      ],
      [
       151,
       50.0
      ],
      [
       157,
       200.0
      ]
     ]
    },
    {
     "id": 364,
     "name": "Раскол",
     "en": "Fission",
     "mods": [
      {
       "stat": "dmg",
       "op": "pct",
       "v": 50.0,
       "text": "Урон магических пуль +50%"
      }
     ],
     "mechanics": [
      "Магические пули атакуют еще 2 цели."
     ],
     "effIds": [
      [
       -1,
       1.0
      ],
      [
       171,
       2.0
      ],
      [
       151,
       50.0
      ]
     ]
    }
   ],
   "7": [
    {
     "id": 365,
     "name": "Непрерывная атака",
     "en": "Chain Casting",
     "mods": [
      {
       "stat": "count",
       "op": "add",
       "v": 1.0,
       "text": "Число магических пуль +1"
      },
      {
       "stat": "cd",
       "op": "pct",
       "v": -20.0,
       "text": "Время перезарядки магических пуль -20%"
      }
     ],
     "mechanics": [],
     "effIds": [
      [
       -1,
       1.0
      ],
      [
       153,
       1.0
      ],
      [
       158,
       20.0
      ]
     ]
    },
    {
     "id": 366,
     "name": "Лихорадка",
     "en": "Fire at Will",
     "mods": [
      {
       "stat": "count",
       "op": "mul",
       "v": 5.0,
       "text": "Число магических пуль х5"
      },
      {
       "stat": "dmg",
       "op": "pct",
       "v": 50.0,
       "text": "Урон магических пуль +50%"
      },
      {
       "stat": "cd",
       "op": "sec",
       "v": 3.0,
       "text": "Время перезарядки магических пуль +3 сек."
      }
     ],
     "mechanics": [
      "Магические пули летят в хаотичном направлении."
     ],
     "effIds": [
      [
       -1,
       1.0
      ],
      [
       151,
       50.0
      ],
      [
       157,
       300.0
      ],
      [
       853,
       5.0
      ]
     ]
    },
    {
     "id": 367,
     "name": "Двойник",
     "en": "Doppelganger",
     "mods": [
      {
       "stat": "cd",
       "op": "pct",
       "v": 50.0,
       "text": "Время перезарядки магических пуль +50%"
      }
     ],
     "mechanics": [
      "Призывает 3 фантома, которые стреляют магическими пулями вместо персонажа."
     ],
     "effIds": [
      [
       -1,
       1.0
      ],
      [
       159,
       50.0
      ]
     ]
    }
   ]
  },
  "enchant": {
   "text": "Урон магических пуль +50% @ Время перезарядки магических пуль -5%",
   "mods": [
    {
     "stat": "dmg",
     "op": "pct",
     "v": 50.0,
     "text": "Урон магических пуль +50%"
    },
    {
     "stat": "cd",
     "op": "pct",
     "v": -5.0,
     "text": "Время перезарядки магических пуль -5%"
    }
   ]
  }
 },
 {
  "id": 2,
  "key": "fireball",
  "ours": "Пламенное ядро",
  "oursCodeId": "flame",
  "name": "Огненный шар",
  "en": "Fireball",
  "kind": "attack",
  "frame": "projectile",
  "maxLevel": 7,
  "desc": "Стреляет взрывающимися снарядами.",
  "base": {
   "dmgPct": 700.0,
   "cd": 1.5,
   "count": 1.0,
   "note": "Урон: 700% ATK (взрыв); КД: 1.5 с; Кол-во: 1; Цель: ближайший враг, взрыв при касании",
   "src": {
    "dmgPct": "code",
    "cd": "code",
    "count": "code"
   }
  },
  "levels": [
   {
    "level": 2,
    "prop": false as const,
    "mods": [
     {
      "stat": "count",
      "op": "add",
      "v": 1.0,
      "text": "Число огненных шаров +1"
     }
    ]
   },
   {
    "level": 3,
    "prop": false as const,
    "mods": [
     {
      "stat": "dmg",
      "op": "pct",
      "v": 50.0,
      "text": "Урон огненных шаров +50%"
     }
    ]
   },
   {
    "level": 4,
    "prop": false as const,
    "mods": [
     {
      "stat": "size",
      "op": "pct",
      "v": 20.0,
      "text": "Размер огненных шаров +20%"
     }
    ]
   },
   {
    "level": 5,
    "prop": false as const,
    "mods": [
     {
      "stat": "count",
      "op": "add",
      "v": 1.0,
      "text": "Число огненных шаров +1"
     }
    ]
   },
   {
    "level": 6,
    "prop": false as const,
    "mods": [
     {
      "stat": "dmg",
      "op": "pct",
      "v": 50.0,
      "text": "Урон огненных шаров +50%"
     }
    ]
   }
  ],
  "propLevels": [
   7
  ],
  "props": {
   "7": [
    {
     "id": 371,
     "name": "Большой взрыв",
     "en": "Big Bang",
     "mods": [
      {
       "stat": "dmg",
       "op": "pct",
       "v": 80.0,
       "text": "Урон огненных шаров +80%"
      }
     ],
     "mechanics": [
      "Урон и размер первого из запускаемых шаров увеличиваются в 1,5 раза."
     ],
     "effIds": [
      [
       -2,
       1.0
      ],
      [
       197,
       1.0
      ],
      [
       181,
       80.0
      ]
     ]
    },
    {
     "id": 372,
     "name": "Ядовитый газ",
     "en": "Toxic Gas",
     "mods": [
      {
       "stat": "dmg",
       "op": "pct",
       "v": -30.0,
       "text": "Урон огненных шаров -30%"
      }
     ],
     "mechanics": [
      "Взрывы огненных шаров расширяются и наносят урон 3 раза."
     ],
     "effIds": [
      [
       -2,
       1.0
      ],
      [
       182,
       30.0
      ]
     ]
    },
    {
     "id": 373,
     "name": "Созвездие",
     "en": "Constellation",
     "mods": [
      {
       "stat": "pierce",
       "op": "add",
       "v": 1.0,
       "text": "Пробивная сила огненных шаров +1"
      }
     ],
     "mechanics": [
      "Огненные шары выстреливают в хаотичном направлении и ненадолго задерживаются, следуя за персонажем.",
      "Скорость движения огненных шаров постепенно снижается."
     ],
     "effIds": [
      [
       -2,
       1.0
      ],
      [
       183,
       1.0
      ]
     ]
    }
   ]
  },
  "enchant": {
   "text": "Урон огненных шаров +50% @ Размер огненных шаров +10%",
   "mods": [
    {
     "stat": "dmg",
     "op": "pct",
     "v": 50.0,
     "text": "Урон огненных шаров +50%"
    },
    {
     "stat": "size",
     "op": "pct",
     "v": 10.0,
     "text": "Размер огненных шаров +10%"
    }
   ]
  }
 },
 {
  "id": 3,
  "key": "spirit",
  "ours": "Духи-стражи",
  "oursCodeId": "guardians",
  "name": "Дух",
  "en": "Spirit",
  "kind": "attack",
  "frame": "projectile",
  "maxLevel": 7,
  "desc": "Призывает духов, которые помогают атаковать.",
  "base": {
   "dmgPct": 650.0,
   "cd": 0.9,
   "count": 1.0,
   "note": "Урон: 650% ATK; КД: 0.9 с; Кол-во: 1 дух; Механика: дух стреляет пробивающим снарядом",
   "src": {
    "dmgPct": "code",
    "cd": "code",
    "count": "wiki"
   }
  },
  "levels": [
   {
    "level": 2,
    "prop": false as const,
    "mods": [
     {
      "stat": "dmg",
      "op": "pct",
      "v": 20.0,
      "text": "Урон духов +20%"
     },
     {
      "stat": "count",
      "op": "add",
      "v": 1.0,
      "text": "Число духов +1"
     }
    ]
   },
   {
    "level": 3,
    "prop": false as const,
    "mods": [
     {
      "stat": "dmg",
      "op": "pct",
      "v": 20.0,
      "text": "Урон духов +20%"
     },
     {
      "stat": "count",
      "op": "add",
      "v": 1.0,
      "text": "Число духов +1"
     }
    ]
   },
   {
    "level": 4,
    "prop": false as const,
    "mods": [
     {
      "stat": "dmg",
      "op": "pct",
      "v": 20.0,
      "text": "Урон духов +20%"
     },
     {
      "stat": "count",
      "op": "add",
      "v": 1.0,
      "text": "Число духов +1"
     }
    ]
   },
   {
    "level": 5,
    "prop": false as const,
    "mods": [
     {
      "stat": "dmg",
      "op": "pct",
      "v": 20.0,
      "text": "Урон духов +20%"
     },
     {
      "stat": "count",
      "op": "add",
      "v": 1.0,
      "text": "Число духов +1"
     }
    ]
   },
   {
    "level": 6,
    "prop": false as const,
    "mods": [
     {
      "stat": "dmg",
      "op": "pct",
      "v": 20.0,
      "text": "Урон духов +20%"
     },
     {
      "stat": "count",
      "op": "add",
      "v": 1.0,
      "text": "Число духов +1"
     }
    ]
   }
  ],
  "propLevels": [
   7
  ],
  "props": {
   "7": [
    {
     "id": 380,
     "name": "Заколдованная ракета",
     "en": "Magic Missile",
     "mods": [
      {
       "stat": "cd",
       "op": "pct",
       "v": -20.0,
       "text": "Время перезарядки духов -20%"
      }
     ],
     "mechanics": [
      "Перезарядка духов ускоряется пропорционально их количеству,",
      "а интервал стрельбы становится равен времени перезарядки."
     ],
     "effIds": [
      [
       -3,
       1.0
      ],
      [
       281,
       20.0
      ]
     ]
    },
    {
     "id": 381,
     "name": "Магический клинок",
     "en": "Magic Blade",
     "mods": [
      {
       "stat": "dmg",
       "op": "mul",
       "v": 2.5,
       "text": "Урон духов х2,5"
      }
     ],
     "mechanics": [
      "Заряды духов в виде клинков молниеносно атакуют врагов."
     ],
     "effIds": [
      [
       -3,
       1.0
      ],
      [
       971,
       250.0
      ]
     ]
    },
    {
     "id": 382,
     "name": "Фамильяр",
     "en": "Familiar",
     "mods": [
      {
       "stat": "count",
       "op": "add",
       "v": 15.0,
       "text": "Число выстрелов +15 за каждого духа"
      },
      {
       "stat": "interval",
       "op": "add",
       "v": 5.0,
       "text": "Интервал стрельбы духов сокращается в 5 раз"
      },
      {
       "stat": "cd",
       "op": "mul",
       "v": 5.0,
       "text": "Время перезарядки духов х5"
      }
     ],
     "mechanics": [
      "Духи объединяются в одного.",
      "Духи стреляют зарядами во все стороны."
     ],
     "effIds": [
      [
       -3,
       1.0
      ],
      [
       984,
       5.0
      ],
      [
       982,
       5.0
      ]
     ]
    }
   ]
  },
  "enchant": {
   "text": "Урон духов +50% @ Время перезарядки духов -5%",
   "mods": [
    {
     "stat": "dmg",
     "op": "pct",
     "v": 50.0,
     "text": "Урон духов +50%"
    },
    {
     "stat": "cd",
     "op": "pct",
     "v": -5.0,
     "text": "Время перезарядки духов -5%"
    }
   ]
  }
 },
 {
  "id": 4,
  "key": "satellite",
  "ours": "Кольцо сфер",
  "oursCodeId": "orbring",
  "name": "Спутник",
  "en": "Satellite",
  "kind": "attack",
  "frame": "orbit",
  "maxLevel": 7,
  "desc": "Рядом с персонажем начинает вращаться спутник.",
  "base": {
   "dmgPct": 450.0,
   "count": 1.0,
   "note": "Урон: 450% ATK (при касании); КД: нет (постоянно); Кол-во: 1 сфера; Механика: сферы вращаются вокруг мага",
   "src": {
    "dmgPct": "code",
    "count": "wiki"
   }
  },
  "levels": [
   {
    "level": 2,
    "prop": false as const,
    "mods": [
     {
      "stat": "dmg",
      "op": "pct",
      "v": 20.0,
      "text": "Урон спутников +20%"
     },
     {
      "stat": "count",
      "op": "add",
      "v": 1.0,
      "text": "Число спутников +1"
     }
    ]
   },
   {
    "level": 3,
    "prop": false as const,
    "mods": [
     {
      "stat": "dmg",
      "op": "pct",
      "v": 20.0,
      "text": "Урон спутников +20%"
     },
     {
      "stat": "count",
      "op": "add",
      "v": 1.0,
      "text": "Число спутников +1"
     }
    ]
   },
   {
    "level": 4,
    "prop": false as const,
    "mods": [
     {
      "stat": "dmg",
      "op": "pct",
      "v": 20.0,
      "text": "Урон спутников +20%"
     },
     {
      "stat": "count",
      "op": "add",
      "v": 1.0,
      "text": "Число спутников +1"
     }
    ]
   },
   {
    "level": 5,
    "prop": false as const,
    "mods": [
     {
      "stat": "dmg",
      "op": "pct",
      "v": 20.0,
      "text": "Урон спутников +20%"
     },
     {
      "stat": "count",
      "op": "add",
      "v": 1.0,
      "text": "Число спутников +1"
     }
    ]
   },
   {
    "level": 6,
    "prop": false as const,
    "mods": [
     {
      "stat": "dmg",
      "op": "pct",
      "v": 20.0,
      "text": "Урон спутников +20%"
     },
     {
      "stat": "count",
      "op": "add",
      "v": 1.0,
      "text": "Число спутников +1"
     }
    ]
   }
  ],
  "propLevels": [
   7
  ],
  "props": {
   "7": [
    {
     "id": 389,
     "name": "Антигравитация",
     "en": "Anti-Gravity",
     "mods": [],
     "mechanics": [
      "Скорость вращения спутников постепенно повышается, достигая 3-кратного",
      "увеличения, а затем возвращается к начальному значению и повторяет цикл."
     ],
     "effIds": [
      [
       -4,
       1.0
      ]
     ]
    },
    {
     "id": 390,
     "name": "Блуждающие огоньки",
     "en": "Will o’ the Wisp",
     "mods": [
      {
       "stat": "count",
       "op": "mul",
       "v": 2.0,
       "text": "Число спутников х2"
      },
      {
       "stat": "speed",
       "op": "pct",
       "v": 33.0,
       "text": "Скорость вращения спутников +33%"
      },
      {
       "stat": "size",
       "op": "pct",
       "v": -33.0,
       "text": "Размер спутников -33%"
      }
     ],
     "mechanics": [
      "Радиусы вращения спутников разделяются."
     ],
     "effIds": [
      [
       -4,
       1.0
      ],
      [
       311,
       33.0
      ],
      [
       314,
       33.0
      ],
      [
       1008,
       2.0
      ]
     ]
    },
    {
     "id": 391,
     "name": "Термоядерная реакция",
     "en": "Nuclear Fusion",
     "mods": [
      {
       "stat": "dmg",
       "op": "add",
       "v": 1.0,
       "text": "Множитель урона +1 за каждый спутник"
      },
      {
       "stat": "size",
       "op": "add",
       "v": 1.0,
       "text": "Множитель размера +1 за каждый спутник"
      },
      {
       "stat": "speed",
       "op": "pct",
       "v": -50.0,
       "text": "Скорость вращения спутников -50%"
      }
     ],
     "mechanics": [
      "Спутники объединяются в один.",
      "Спутники наносят урон с интервалом в 0,3 сек."
     ],
     "effIds": [
      [
       -4,
       1.0
      ],
      [
       312,
       50.0
      ]
     ]
    }
   ]
  },
  "enchant": {
   "text": "Урон спутников +50% @ Скорость вращения спутников +25%",
   "mods": [
    {
     "stat": "dmg",
     "op": "pct",
     "v": 50.0,
     "text": "Урон спутников +50%"
    },
    {
     "stat": "speed",
     "op": "pct",
     "v": 25.0,
     "text": "Скорость вращения спутников +25%"
    }
   ]
  }
 },
 {
  "id": 5,
  "key": "frostnova",
  "ours": "Ледяной венец",
  "oursCodeId": null,
  "name": "Ледяные иглы",
  "en": "Frost Nova",
  "kind": "attack",
  "frame": "aura",
  "maxLevel": 7,
  "desc": "Ненадолго замораживают ближайших врагов.",
  "base": {
   "dmgPct": 1200.0,
   "cd": 5.5,
   "note": "Урон: 1200% ATK; КД: 5.5 с; Заморозка: 1 с; Механика: взрыв вокруг мага, замораживает (кроме крупных)",
   "src": {
    "dmgPct": "code",
    "cd": "code"
   }
  },
  "levels": [
   {
    "level": 2,
    "prop": false as const,
    "mods": [
     {
      "stat": "size",
      "op": "pct",
      "v": 15.0,
      "text": "Размер ледяных игл +15%"
     }
    ]
   },
   {
    "level": 3,
    "prop": false as const,
    "mods": [
     {
      "stat": "dmg",
      "op": "pct",
      "v": 50.0,
      "text": "Урон ледяных игл +50%"
     }
    ]
   },
   {
    "level": 4,
    "prop": false as const,
    "mods": [
     {
      "stat": "cd",
      "op": "pct",
      "v": -15.0,
      "text": "Время перезарядки ледяных игл -15%"
     }
    ]
   },
   {
    "level": 5,
    "prop": false as const,
    "mods": [
     {
      "stat": "size",
      "op": "pct",
      "v": 20.0,
      "text": "Размер ледяных игл +20%"
     }
    ]
   },
   {
    "level": 6,
    "prop": false as const,
    "mods": [
     {
      "stat": "dmg",
      "op": "pct",
      "v": 50.0,
      "text": "Урон ледяных игл +50%"
     }
    ]
   }
  ],
  "propLevels": [
   7
  ],
  "props": {
   "7": [
    {
     "id": 398,
     "name": "Абсолютный ноль",
     "en": "Absolute Zero",
     "mods": [
      {
       "stat": "duration",
       "op": "pct",
       "v": 25.0,
       "text": "Длительность заморозки +25%"
      }
     ],
     "mechanics": [
      "Враги, оказавшиеся рядом с местом взрыва ледяных игл, замораживаются."
     ],
     "effIds": [
      [
       -5,
       1.0
      ],
      [
       75,
       25.0
      ]
     ]
    },
    {
     "id": 399,
     "name": "Ледниковый период",
     "en": "Ice Age",
     "mods": [
      {
       "stat": "size",
       "op": "pct",
       "v": -20.0,
       "text": "Размер ледяных игл -20%"
      },
      {
       "stat": "cd",
       "op": "mul",
       "v": 2.0,
       "text": "Время перезарядки ледяных игл х2"
      }
     ],
     "mechanics": [
      "Ледяные иглы взрываются 3 раза подряд,",
      "а их урон и размер увеличиваются в 1,5 раза за каждый взрыв."
     ],
     "effIds": [
      [
       -5,
       1.0
      ],
      [
       376,
       20.0
      ],
      [
       1079,
       2.0
      ]
     ]
    },
    {
     "id": 400,
     "name": "Землетрясение",
     "en": "Earthquake",
     "mods": [
      {
       "stat": "dmg",
       "op": "mul",
       "v": 2.0,
       "text": "Урон ледяных игл х2"
      },
      {
       "stat": "size",
       "op": "pct",
       "v": 25.0,
       "text": "Размер ледяных игл +25%"
      }
     ],
     "mechanics": [
      "Ледяные иглы больше не замораживают, но зато оглушают врагов."
     ],
     "effIds": [
      [
       -5,
       1.0
      ],
      [
       375,
       25.0
      ],
      [
       1071,
       2.0
      ]
     ]
    }
   ]
  },
  "enchant": {
   "text": "Урон ледяных игл +50% @ Размер ледяных игл +10%",
   "mods": [
    {
     "stat": "dmg",
     "op": "pct",
     "v": 50.0,
     "text": "Урон ледяных игл +50%"
    },
    {
     "stat": "size",
     "op": "pct",
     "v": 10.0,
     "text": "Размер ледяных игл +10%"
    }
   ]
  }
 },
 {
  "id": 6,
  "key": "shield",
  "ours": "Оберег",
  "oursCodeId": null,
  "name": "Щит",
  "en": "Shield",
  "kind": "utility",
  "frame": "utility",
  "maxLevel": 5,
  "desc": "Создает щит, который 1 раз защищает персонажа от урона.",
  "base": {
   "cd": 33.0,
   "note": "Заряды: 1 (блок 1 удара; потолок 2); КД: 33 с; Неуязвимость при поломке: 0.2 с",
   "src": {
    "cd": "code"
   }
  },
  "levels": [
   {
    "level": 2,
    "prop": false as const,
    "mods": [
     {
      "stat": "cd",
      "op": "pct",
      "v": -10.0,
      "text": "Время перезарядки щита -10%"
     }
    ]
   },
   {
    "level": 3,
    "prop": false as const,
    "mods": [
     {
      "stat": "cd",
      "op": "pct",
      "v": -10.0,
      "text": "Время перезарядки щита -10%"
     }
    ]
   },
   {
    "level": 4,
    "prop": false as const,
    "mods": [
     {
      "stat": "cd",
      "op": "pct",
      "v": -10.0,
      "text": "Время перезарядки щита -10%"
     }
    ]
   }
  ],
  "propLevels": [
   5
  ],
  "props": {
   "5": [
    {
     "id": 407,
     "name": "Барьер",
     "en": "Barrier",
     "mods": [
      {
       "stat": "count",
       "op": "add",
       "v": 2.0,
       "text": "Максимальное число зарядок щитов +2"
      }
     ],
     "mechanics": [],
     "effIds": [
      [
       -6,
       1.0
      ],
      [
       231,
       2.0
      ]
     ]
    },
    {
     "id": 408,
     "name": "Переустановка",
     "en": "Reconstruct",
     "mods": [
      {
       "stat": "count",
       "op": "add",
       "v": 1.0,
       "text": "Максимальное число зарядок щитов +1"
      },
      {
       "stat": "cd",
       "op": "pct",
       "v": 20.0,
       "text": "Время перезарядки щита +20%"
      }
     ],
     "mechanics": [
      "Одновременно заряжаются сразу 2 щита."
     ],
     "effIds": [
      [
       -6,
       1.0
      ],
      [
       231,
       1.0
      ],
      [
       235,
       1.0
      ],
      [
       234,
       20.0
      ]
     ]
    },
    {
     "id": 409,
     "name": "Поле разрушения",
     "en": "Destruction Field",
     "mods": [],
     "mechanics": [
      "Когда щит исчезает, происходят взрывы,",
      "которые недолго следуют за персонажем и 4 раза наносят урон."
     ],
     "effIds": [
      [
       -6,
       1.0
      ]
     ]
    }
   ]
  },
  "enchant": null
 },
 {
  "id": 7,
  "key": "thunder",
  "ours": "Гнев туч",
  "oursCodeId": null,
  "name": "Молния",
  "en": "Thunderstorm",
  "kind": "attack",
  "frame": "sky",
  "maxLevel": 7,
  "desc": "По ближайшим врагам бьют молнии.",
  "base": {
   "dmgPct": 1500.0,
   "cd": 2.0,
   "count": 1.0,
   "note": "Урон: 1500% ATK; КД: 2 с; Кол-во: 1; Цель: ближайшие враги",
   "src": {
    "dmgPct": "code",
    "cd": "code",
    "count": "code"
   }
  },
  "levels": [
   {
    "level": 2,
    "prop": false as const,
    "mods": [
     {
      "stat": "dmg",
      "op": "pct",
      "v": 20.0,
      "text": "Урон молний +20%"
     },
     {
      "stat": "count",
      "op": "add",
      "v": 1.0,
      "text": "Число молний +1"
     }
    ]
   },
   {
    "level": 3,
    "prop": false as const,
    "mods": [
     {
      "stat": "dmg",
      "op": "pct",
      "v": 20.0,
      "text": "Урон молний +20%"
     },
     {
      "stat": "count",
      "op": "add",
      "v": 1.0,
      "text": "Число молний +1"
     }
    ]
   },
   {
    "level": 4,
    "prop": false as const,
    "mods": [
     {
      "stat": "dmg",
      "op": "pct",
      "v": 20.0,
      "text": "Урон молний +20%"
     },
     {
      "stat": "count",
      "op": "add",
      "v": 1.0,
      "text": "Число молний +1"
     }
    ]
   },
   {
    "level": 5,
    "prop": false as const,
    "mods": [
     {
      "stat": "dmg",
      "op": "pct",
      "v": 20.0,
      "text": "Урон молний +20%"
     },
     {
      "stat": "count",
      "op": "add",
      "v": 1.0,
      "text": "Число молний +1"
     }
    ]
   },
   {
    "level": 6,
    "prop": false as const,
    "mods": [
     {
      "stat": "dmg",
      "op": "pct",
      "v": 20.0,
      "text": "Урон молний +20%"
     },
     {
      "stat": "count",
      "op": "add",
      "v": 1.0,
      "text": "Число молний +1"
     }
    ]
   }
  ],
  "propLevels": [
   7
  ],
  "props": {
   "7": [
    {
     "id": 416,
     "name": "Гром среди ясного неба",
     "en": "Thunderclap",
     "mods": [
      {
       "stat": "cd",
       "op": "pct",
       "v": -25.0,
       "text": "Время перезарядки молний -25%"
      }
     ],
     "mechanics": [
      "Молнии появляются 1–3 раза подряд."
     ],
     "effIds": [
      [
       -7,
       1.0
      ],
      [
       219,
       25.0
      ]
     ]
    },
    {
     "id": 417,
     "name": "Грозовой взрыв",
     "en": "Lightning Explosion",
     "mods": [
      {
       "stat": "dmg",
       "op": "pct",
       "v": 80.0,
       "text": "Урон молний +80%"
      }
     ],
     "mechanics": [
      "Взрывы молний расширяются.",
      "Молнии одна за другой появляются в случайных местах."
     ],
     "effIds": [
      [
       -7,
       1.0
      ],
      [
       211,
       80.0
      ]
     ]
    },
    {
     "id": 418,
     "name": "Суд",
     "en": "Judgment",
     "mods": [
      {
       "stat": "dmg",
       "op": "mul",
       "v": 5.0,
       "text": "Урон молний х5"
      },
      {
       "stat": "cd",
       "op": "mul",
       "v": 2.0,
       "text": "Время перезарядки молний х2"
      }
     ],
     "mechanics": [
      "Молнии объединяются в одну.",
      "Враги, находящиеся рядом с местом взрыва молнии, получают половину урона.",
      "Размер молний увеличивается на 20% за каждую молнию."
     ],
     "effIds": [
      [
       -7,
       1.0
      ],
      [
       911,
       5.0
      ],
      [
       920,
       2.0
      ]
     ]
    }
   ]
  },
  "enchant": {
   "text": "Урон молний +50% @ Время перезарядки молний -5%",
   "mods": [
    {
     "stat": "dmg",
     "op": "pct",
     "v": 50.0,
     "text": "Урон молний +50%"
    },
    {
     "stat": "cd",
     "op": "pct",
     "v": -5.0,
     "text": "Время перезарядки молний -5%"
    }
   ]
  }
 },
 {
  "id": 8,
  "key": "ezone",
  "ours": "Поле разрядов",
  "oursCodeId": null,
  "name": "Область электротока",
  "en": "Electric Zone",
  "kind": "attack",
  "frame": "aura",
  "maxLevel": 7,
  "desc": "Периодически наносит урон ближайшим врагам.",
  "base": {
   "dmgPct": 125.0,
   "tick": 0.25,
   "note": "Урон: 125% ATK за тик; Тик: 0.25 с; Механика: постоянная зона вокруг мага",
   "src": {
    "dmgPct": "code",
    "tick": "code"
   }
  },
  "levels": [
   {
    "level": 2,
    "prop": false as const,
    "mods": [
     {
      "stat": "size",
      "op": "pct",
      "v": 15.0,
      "text": "Размер области электротока +15%"
     }
    ]
   },
   {
    "level": 3,
    "prop": false as const,
    "mods": [
     {
      "stat": "dmg",
      "op": "pct",
      "v": 50.0,
      "text": "Урон области электротока +50%"
     }
    ]
   },
   {
    "level": 4,
    "prop": false as const,
    "mods": [
     {
      "stat": "size",
      "op": "pct",
      "v": 15.0,
      "text": "Размер области электротока +15%"
     }
    ]
   },
   {
    "level": 5,
    "prop": false as const,
    "mods": [
     {
      "stat": "size",
      "op": "pct",
      "v": 20.0,
      "text": "Размер области электротока +20%"
     }
    ]
   },
   {
    "level": 6,
    "prop": false as const,
    "mods": [
     {
      "stat": "dmg",
      "op": "pct",
      "v": 50.0,
      "text": "Урон области электротока +50%"
     }
    ]
   }
  ],
  "propLevels": [
   7
  ],
  "props": {
   "7": [
    {
     "id": 425,
     "name": "Эмиссия заряда",
     "en": "Electricity Blast",
     "mods": [
      {
       "stat": "dmg",
       "op": "pct",
       "v": 80.0,
       "text": "Урон области электротока +80%"
      },
      {
       "stat": "size",
       "op": "pct",
       "v": 30.0,
       "text": "Размер области электротока +30%"
      }
     ],
     "mechanics": [],
     "effIds": [
      [
       -8,
       1.0
      ],
      [
       291,
       80.0
      ],
      [
       293,
       30.0
      ]
     ]
    },
    {
     "id": 426,
     "name": "ЭМИ",
     "en": "EMP",
     "mods": [
      {
       "stat": "interval",
       "op": "pct",
       "v": -10.0,
       "text": "Интервал урона области электротока -10%"
      }
     ],
     "mechanics": [
      "Когда враг 4 раза получает урон от области электротока, он оглушается."
     ],
     "effIds": [
      [
       -8,
       1.0
      ],
      [
       296,
       10.0
      ]
     ]
    },
    {
     "id": 427,
     "name": "Огненная аура",
     "en": "Fire Aura",
     "mods": [
      {
       "stat": "dmg",
       "op": "mul",
       "v": 5.0,
       "text": "Урон области электротока х5"
      },
      {
       "stat": "interval",
       "op": "mul",
       "v": 3.0,
       "text": "Интервал урона области электротока х3"
      }
     ],
     "mechanics": [
      "Область электротока не наносит многократных ударов,",
      "зато постоянно расширяется, перед тем как исчезнуть.",
      "Чем короче интервал урона, тем быстрее повторяется цикл."
     ],
     "effIds": [
      [
       -8,
       1.0
      ],
      [
       991,
       5.0
      ],
      [
       995,
       3.0
      ]
     ]
    }
   ]
  },
  "enchant": {
   "text": "Урон области электротока +50% @ Размер области электротока +10%",
   "mods": [
    {
     "stat": "dmg",
     "op": "pct",
     "v": 50.0,
     "text": "Урон области электротока +50%"
    },
    {
     "stat": "size",
     "op": "pct",
     "v": 10.0,
     "text": "Размер области электротока +10%"
    }
   ]
  }
 },
 {
  "id": 9,
  "key": "tsunami",
  "ours": "Чёрный прилив",
  "oursCodeId": null,
  "name": "Цунами",
  "en": "Tsunami",
  "kind": "attack",
  "frame": "wave",
  "maxLevel": 7,
  "desc": "Вызывает огромную волну, которая проносится по полю.",
  "base": {
   "dmgPct": 700.0,
   "cd": 8.5,
   "count": 8.0,
   "note": "Урон: 700% ATK; КД: 8.5 с; Кол-во: 8 волн; Механика: волны пересекают поле по диагонали",
   "src": {
    "dmgPct": "code",
    "cd": "code",
    "count": "code"
   }
  },
  "levels": [
   {
    "level": 2,
    "prop": false as const,
    "mods": [
     {
      "stat": "count",
      "op": "add",
      "v": 3.0,
      "text": "Число цунами +3"
     }
    ]
   },
   {
    "level": 3,
    "prop": false as const,
    "mods": [
     {
      "stat": "dmg",
      "op": "pct",
      "v": 50.0,
      "text": "Урон цунами +50%"
     }
    ]
   },
   {
    "level": 4,
    "prop": false as const,
    "mods": [
     {
      "stat": "cd",
      "op": "pct",
      "v": -15.0,
      "text": "Время перезарядки цунами -15%"
     }
    ]
   },
   {
    "level": 5,
    "prop": false as const,
    "mods": [
     {
      "stat": "count",
      "op": "add",
      "v": 3.0,
      "text": "Число цунами +3"
     }
    ]
   },
   {
    "level": 6,
    "prop": false as const,
    "mods": [
     {
      "stat": "dmg",
      "op": "pct",
      "v": 50.0,
      "text": "Урон цунами +50%"
     }
    ]
   }
  ],
  "propLevels": [
   7
  ],
  "props": {
   "7": [
    {
     "id": 434,
     "name": "Полюс",
     "en": "Pole",
     "mods": [],
     "mechanics": [
      "Цунами приходит сразу с четырех сторон и замораживает врагов."
     ],
     "effIds": [
      [
       -9,
       1.0
      ]
     ]
    },
    {
     "id": 435,
     "name": "Песнь сирены",
     "en": "Siren’s Song",
     "mods": [
      {
       "stat": "cd",
       "op": "pct",
       "v": -50.0,
       "text": "Время перезарядки цунами -50%"
      },
      {
       "stat": "count",
       "op": "pct",
       "v": -50.0,
       "text": "Число цунами -50%"
      }
     ],
     "mechanics": [
      "Цунами возникает рядом с персонажем по направлению его движения."
     ],
     "effIds": [
      [
       -9,
       1.0
      ],
      [
       259,
       50.0
      ],
      [
       255,
       50.0
      ]
     ]
    },
    {
     "id": 436,
     "name": "Великое извержение",
     "en": "Great Eruption",
     "mods": [
      {
       "stat": "dmg",
       "op": "mul",
       "v": 2.0,
       "text": "Урон цунами х2"
      },
      {
       "stat": "size",
       "op": "pct",
       "v": 10.0,
       "text": "Размер цунами +10%"
      },
      {
       "stat": "cd",
       "op": "pct",
       "v": 30.0,
       "text": "Время перезарядки цунами +30%"
      }
     ],
     "mechanics": [
      "Радиус появления цунами расширяется."
     ],
     "effIds": [
      [
       -9,
       1.0
      ],
      [
       256,
       10.0
      ],
      [
       260,
       30.0
      ],
      [
       951,
       2.0
      ]
     ]
    }
   ]
  },
  "enchant": {
   "text": "Урон цунами +50% @ Время перезарядки цунами -5%",
   "mods": [
    {
     "stat": "dmg",
     "op": "pct",
     "v": 50.0,
     "text": "Урон цунами +50%"
    },
    {
     "stat": "cd",
     "op": "pct",
     "v": -5.0,
     "text": "Время перезарядки цунами -5%"
    }
   ]
  }
 },
 {
  "id": 10,
  "key": "meteor",
  "ours": "Падение звезды",
  "oursCodeId": null,
  "name": "Метеорит",
  "en": "Meteor",
  "kind": "attack",
  "frame": "sky",
  "maxLevel": 7,
  "desc": "В случайных местах падают метеориты.",
  "base": {
   "dmgPct": 1500.0,
   "cd": 4.5,
   "count": 1.0,
   "note": "Урон: 1500% ATK; КД: 4.5 с; Кол-во: 1; Механика: падает в случайную точку",
   "src": {
    "dmgPct": "code",
    "cd": "code",
    "count": "code"
   }
  },
  "levels": [
   {
    "level": 2,
    "prop": false as const,
    "mods": [
     {
      "stat": "count",
      "op": "add",
      "v": 1.0,
      "text": "Число метеоритов +1"
     }
    ]
   },
   {
    "level": 3,
    "prop": false as const,
    "mods": [
     {
      "stat": "dmg",
      "op": "pct",
      "v": 50.0,
      "text": "Урон метеоритов +50%"
     }
    ]
   },
   {
    "level": 4,
    "prop": false as const,
    "mods": [
     {
      "stat": "size",
      "op": "pct",
      "v": 20.0,
      "text": "Размер метеоритов +20%"
     }
    ]
   },
   {
    "level": 5,
    "prop": false as const,
    "mods": [
     {
      "stat": "count",
      "op": "add",
      "v": 1.0,
      "text": "Число метеоритов +1"
     }
    ]
   },
   {
    "level": 6,
    "prop": false as const,
    "mods": [
     {
      "stat": "dmg",
      "op": "pct",
      "v": 50.0,
      "text": "Урон метеоритов +50%"
     }
    ]
   }
  ],
  "propLevels": [
   7
  ],
  "props": {
   "7": [
    {
     "id": 443,
     "name": "Извержение вулкана",
     "en": "Volcanic Eruption",
     "mods": [],
     "mechanics": [
      "Падение метеорита взрывается мгновенно, оставляя кратер, который наносит урон в размере 25% каждые 0.5 сек.."
     ],
     "effIds": [
      [
       -10,
       1.0
      ]
     ]
    },
    {
     "id": 444,
     "name": "Метеоритный дождь",
     "en": "Meteor Shower",
     "mods": [
      {
       "stat": "count",
       "op": "mul",
       "v": 3.0,
       "text": "Число метеоритов х3"
      },
      {
       "stat": "interval",
       "op": "pct",
       "v": -30.0,
       "text": "Интервал появления метеоритов -30%"
      },
      {
       "stat": "dmg",
       "op": "pct",
       "v": -25.0,
       "text": "Урон метеоритов -25%"
      },
      {
       "stat": "size",
       "op": "pct",
       "v": -25.0,
       "text": "Размер метеоритов -25%"
      }
     ],
     "mechanics": [],
     "effIds": [
      [
       -10,
       1.0
      ],
      [
       322,
       25.0
      ],
      [
       325,
       25.0
      ],
      [
       1023,
       3.0
      ],
      [
       1036,
       30.0
      ]
     ]
    },
    {
     "id": 445,
     "name": "Астероид",
     "en": "Asteroid",
     "mods": [
      {
       "stat": "dmg",
       "op": "mul",
       "v": 3.0,
       "text": "Урон метеоритов х3"
      },
      {
       "stat": "cd",
       "op": "mul",
       "v": 2.0,
       "text": "Время перезарядки метеоритов х2"
      }
     ],
     "mechanics": [
      "Метеориты объединяются в один.",
      "Размер метеоритов увеличивается на 50% за каждый метеорит."
     ],
     "effIds": [
      [
       -10,
       1.0
      ],
      [
       1021,
       3.0
      ],
      [
       1028,
       2.0
      ]
     ]
    }
   ]
  },
  "enchant": {
   "text": "Урон метеоритов +50% @ Время перезарядки метеоритов -5%",
   "mods": [
    {
     "stat": "dmg",
     "op": "pct",
     "v": 50.0,
     "text": "Урон метеоритов +50%"
    },
    {
     "stat": "cd",
     "op": "pct",
     "v": -5.0,
     "text": "Время перезарядки метеоритов -5%"
    }
   ]
  }
 },
 {
  "id": 11,
  "key": "cloak",
  "ours": "Тень",
  "oursCodeId": "phase",
  "name": "Маскировка",
  "en": "Cloaking",
  "kind": "utility",
  "frame": "utility",
  "maxLevel": 5,
  "desc": "Позволяет некоторое время проходить сквозь любые объекты и двигаться быстрее.",
  "base": {
   "cd": 45.0,
   "duration": 2.0,
   "note": "Длительность: 2 с; Скорость: +15%; КД: 45 с; Механика: неуязвимость + проход сквозь врагов",
   "src": {
    "cd": "code",
    "duration": "code"
   }
  },
  "levels": [
   {
    "level": 2,
    "prop": false as const,
    "mods": [
     {
      "stat": "duration",
      "op": "pct",
      "v": 30.0,
      "text": "Длительность маскировки +30%"
     }
    ]
   },
   {
    "level": 3,
    "prop": false as const,
    "mods": [
     {
      "stat": "duration",
      "op": "pct",
      "v": 30.0,
      "text": "Длительность маскировки +30%"
     }
    ]
   },
   {
    "level": 4,
    "prop": false as const,
    "mods": [
     {
      "stat": "duration",
      "op": "pct",
      "v": 30.0,
      "text": "Длительность маскировки +30%"
     }
    ]
   }
  ],
  "propLevels": [
   5
  ],
  "props": {
   "5": [
    {
     "id": 452,
     "name": "Мираж",
     "en": "Mirage",
     "mods": [
      {
       "stat": "duration",
       "op": "pct",
       "v": 80.0,
       "text": "Длительность маскировки +80%"
      }
     ],
     "mechanics": [],
     "effIds": [
      [
       -11,
       1.0
      ],
      [
       352,
       80.0
      ]
     ]
    },
    {
     "id": 453,
     "name": "Искажение пространства",
     "en": "Space Warp",
     "mods": [],
     "mechanics": [
      "Когда действие маскировки заканчивается, рядом с персонажем происходит мощный взрыв.",
      "СКРЫТО в таблице: эффект 358 = 100 (сила взрыва, вероятно 100× ATK = 10000%)"
     ],
     "effIds": [
      [
       -11,
       1.0
      ],
      [
       358,
       100.0
      ]
     ]
    },
    {
     "id": 454,
     "name": "Жатва душ",
     "en": "Soul Harvest",
     "mods": [],
     "mechanics": [
      "За каждого врага, уничтоженного во время действия маскировки, восстанавливается 0,1% здоровья,",
      "а получение маны увеличивается на 33%."
     ],
     "effIds": [
      [
       -11,
       1.0
      ],
      [
       359,
       33.0
      ],
      [
       360,
       10.0
      ]
     ]
    }
   ]
  },
  "enchant": null
 },
 {
  "id": 12,
  "key": "cyclone",
  "ours": "Смерч",
  "oursCodeId": null,
  "name": "Вихрь",
  "en": "Cyclone",
  "kind": "attack",
  "frame": "zone",
  "maxLevel": 7,
  "desc": "Вызывает сильный ветер, который постепенно нарастает и наносит урон.",
  "base": {
   "dmgPct": 500.0,
   "cd": 3.5,
   "count": 1.0,
   "duration": 2.0,
   "tick": 0.3,
   "note": "Урон: 500% ATK за тик; Тик: 0.3 с; Длительность: 2 с; КД: 3.5 с; Кол-во: 1",
   "src": {
    "dmgPct": "code",
    "cd": "code",
    "count": "code",
    "duration": "code",
    "tick": "code"
   }
  },
  "levels": [
   {
    "level": 2,
    "prop": false as const,
    "mods": [
     {
      "stat": "count",
      "op": "add",
      "v": 1.0,
      "text": "Число вихрей +1"
     }
    ]
   },
   {
    "level": 3,
    "prop": false as const,
    "mods": [
     {
      "stat": "dmg",
      "op": "pct",
      "v": 50.0,
      "text": "Урон вихря +50%"
     }
    ]
   },
   {
    "level": 4,
    "prop": false as const,
    "mods": [
     {
      "stat": "duration",
      "op": "pct",
      "v": 30.0,
      "text": "Продолжительность вихрей +30%"
     }
    ]
   },
   {
    "level": 5,
    "prop": false as const,
    "mods": [
     {
      "stat": "count",
      "op": "add",
      "v": 1.0,
      "text": "Число вихрей +1"
     }
    ]
   },
   {
    "level": 6,
    "prop": false as const,
    "mods": [
     {
      "stat": "dmg",
      "op": "pct",
      "v": 50.0,
      "text": "Урон вихря +50%"
     }
    ]
   }
  ],
  "propLevels": [
   7
  ],
  "props": {
   "7": [
    {
     "id": 461,
     "name": "Штормовое предупреждение",
     "en": "Extreme Weather",
     "mods": [
      {
       "stat": "count",
       "op": "add",
       "v": 2.0,
       "text": "Число вихрей +2"
      },
      {
       "stat": "cd",
       "op": "pct",
       "v": -10.0,
       "text": "Время перезарядки вихря -10%"
      }
     ],
     "mechanics": [],
     "effIds": [
      [
       -12,
       1.0
      ],
      [
       393,
       2.0
      ],
      [
       406,
       10.0
      ]
     ]
    },
    {
     "id": 462,
     "name": "Электрическая сфера",
     "en": "Electric Orb",
     "mods": [
      {
       "stat": "dmg",
       "op": "mul",
       "v": 2.0,
       "text": "Урон вихря х2"
      },
      {
       "stat": "size",
       "op": "pct",
       "v": 30.0,
       "text": "Размер вихря +30%"
      }
     ],
     "mechanics": [
      "Вихрь постепенно уменьшается и стреляет зарядами."
     ],
     "effIds": [
      [
       -12,
       1.0
      ],
      [
       397,
       30.0
      ],
      [
       1091,
       2.0
      ]
     ]
    },
    {
     "id": 463,
     "name": "Космические пустоты",
     "en": "Void",
     "mods": [
      {
       "stat": "speed",
       "op": "mul",
       "v": 9.0,
       "text": "Скорость увеличения вихря х9"
      },
      {
       "stat": "duration",
       "op": "pct",
       "v": -50.0,
       "text": "Продолжительность вихря -50%"
      },
      {
       "stat": "cd",
       "op": "mul",
       "v": 2.0,
       "text": "Время перезарядки вихря х2"
      }
     ],
     "mechanics": [
      "Вихри один за другим появляются в случайных местах и не движутся."
     ],
     "effIds": [
      [
       -12,
       1.0
      ],
      [
       396,
       50.0
      ],
      [
       1099,
       9.0
      ],
      [
       1107,
       2.0
      ]
     ]
    }
   ]
  },
  "enchant": {
   "text": "Урон вихря +50% @ Продолжительность вихрей +15%",
   "mods": [
    {
     "stat": "dmg",
     "op": "pct",
     "v": 50.0,
     "text": "Урон вихря +50%"
    },
    {
     "stat": "duration",
     "op": "pct",
     "v": 15.0,
     "text": "Продолжительность вихрей +15%"
    }
   ]
  }
 },
 {
  "id": 13,
  "key": "eshock",
  "ours": "Разряд",
  "oursCodeId": null,
  "name": "Электрический удар",
  "en": "Electric Shock",
  "kind": "attack",
  "frame": "projectile",
  "maxLevel": 7,
  "desc": "Излучает электричество в случайном направлении.",
  "base": {
   "dmgPct": 500.0,
   "cd": 2.0,
   "count": 2.0,
   "note": "Урон: 500% ATK; КД: 2 с; Кол-во: 2; Механика: разряды из мага в случайные стороны",
   "src": {
    "dmgPct": "code",
    "cd": "code",
    "count": "code"
   }
  },
  "levels": [
   {
    "level": 2,
    "prop": false as const,
    "mods": [
     {
      "stat": "dmg",
      "op": "pct",
      "v": 20.0,
      "text": "Урон электрического удара +20%"
     },
     {
      "stat": "count",
      "op": "add",
      "v": 1.0,
      "text": "Число электрических ударов +1"
     }
    ]
   },
   {
    "level": 3,
    "prop": false as const,
    "mods": [
     {
      "stat": "dmg",
      "op": "pct",
      "v": 20.0,
      "text": "Урон электрического удара +20%"
     },
     {
      "stat": "count",
      "op": "add",
      "v": 1.0,
      "text": "Число электрических ударов +1"
     }
    ]
   },
   {
    "level": 4,
    "prop": false as const,
    "mods": [
     {
      "stat": "dmg",
      "op": "pct",
      "v": 20.0,
      "text": "Урон электрического удара +20%"
     },
     {
      "stat": "count",
      "op": "add",
      "v": 1.0,
      "text": "Число электрических ударов +1"
     }
    ]
   },
   {
    "level": 5,
    "prop": false as const,
    "mods": [
     {
      "stat": "dmg",
      "op": "pct",
      "v": 20.0,
      "text": "Урон электрического удара +20%"
     },
     {
      "stat": "count",
      "op": "add",
      "v": 1.0,
      "text": "Число электрических ударов +1"
     }
    ]
   },
   {
    "level": 6,
    "prop": false as const,
    "mods": [
     {
      "stat": "dmg",
      "op": "pct",
      "v": 20.0,
      "text": "Урон электрического удара +20%"
     },
     {
      "stat": "count",
      "op": "add",
      "v": 1.0,
      "text": "Число электрических ударов +1"
     }
    ]
   }
  ],
  "propLevels": [
   7
  ],
  "props": {
   "7": [
    {
     "id": 470,
     "name": "Цепная молния",
     "en": "Chain Lightning",
     "mods": [
      {
       "stat": "dmg",
       "op": "pct",
       "v": 50.0,
       "text": "Урон электрического удара +50%"
      }
     ],
     "mechanics": [
      "Создается цепочка из 1–3 электрических ударов."
     ],
     "effIds": [
      [
       -13,
       1.0
      ],
      [
       421,
       50.0
      ]
     ]
    },
    {
     "id": 471,
     "name": "Высокая производительность",
     "en": "High Output",
     "mods": [],
     "mechanics": [
      "Электрический удар взрывается при исчезновении.",
      "Темп увеличения размера Электрического удара преобразуется в урон."
     ],
     "effIds": [
      [
       -13,
       1.0
      ]
     ]
    },
    {
     "id": 472,
     "name": "Сверхпроводимость",
     "en": "Superconductivity",
     "mods": [
      {
       "stat": "dmg",
       "op": "mul",
       "v": 3.0,
       "text": "Урон электрических ударов х3"
      },
      {
       "stat": "size",
       "op": "mul",
       "v": 2.0,
       "text": "Размер электрических ударов х2"
      }
     ],
     "mechanics": [
      "Электрические удары по очереди направляются в сторону ближайших врагов."
     ],
     "effIds": [
      [
       -13,
       1.0
      ],
      [
       1121,
       3.0
      ],
      [
       1128,
       2.0
      ]
     ]
    }
   ]
  },
  "enchant": {
   "text": "Урон электрического удара +50% @ Время перезарядки электрического удара -5%",
   "mods": [
    {
     "stat": "dmg",
     "op": "pct",
     "v": 50.0,
     "text": "Урон электрического удара +50%"
    },
    {
     "stat": "cd",
     "op": "pct",
     "v": -5.0,
     "text": "Время перезарядки электрического удара -5%"
    }
   ]
  }
 },
 {
  "id": 14,
  "key": "armageddon",
  "ours": "Судный час",
  "oursCodeId": null,
  "name": "Армагеддон",
  "en": "Armageddon",
  "kind": "utility",
  "frame": "utility",
  "maxLevel": 5,
  "desc": "Уничтожает всех врагов.",
  "base": {
   "cd": 100.0,
   "note": "Эффект: убивает всех врагов на экране (без маны); КД: 100 с; Задержка спавна после: 1 с; Доступно с: ур. персонажа 6",
   "src": {
    "cd": "code"
   }
  },
  "levels": [
   {
    "level": 2,
    "prop": false as const,
    "mods": [
     {
      "stat": "cd",
      "op": "pct",
      "v": -10.0,
      "text": "Время перезарядки Армагеддона -10%"
     }
    ]
   },
   {
    "level": 3,
    "prop": false as const,
    "mods": [
     {
      "stat": "cd",
      "op": "pct",
      "v": -10.0,
      "text": "Время перезарядки Армагеддона -10%"
     }
    ]
   },
   {
    "level": 4,
    "prop": false as const,
    "mods": [
     {
      "stat": "cd",
      "op": "pct",
      "v": -10.0,
      "text": "Время перезарядки Армагеддона -10%"
     }
    ]
   }
  ],
  "propLevels": [
   5
  ],
  "props": {
   "5": [
    {
     "id": 479,
     "name": "Апокалипсис",
     "en": "Apocalypse",
     "mods": [],
     "mechanics": [
      "После взрыва Армагеддона здоровье всех врагов уменьшается на 40%.",
      "В течение 20 сек. показатель сокращения здоровья постепенно возвращается к 0%."
     ],
     "effIds": [
      [
       -14,
       1.0
      ],
      [
       447,
       -40.0
      ]
     ]
    },
    {
     "id": 480,
     "name": "Вознесение",
     "en": "Rapture",
     "mods": [
      {
       "stat": "cd",
       "op": "pct",
       "v": 0.1,
       "text": "Доля восстановления здоровья в сек. +0,1%"
      }
     ],
     "mechanics": [
      "После каждой 4-й активации Армагеддона здоровье полностью восстанавливается."
     ],
     "effIds": [
      [
       -14,
       1.0
      ],
      [
       24,
       10.0
      ]
     ]
    },
    {
     "id": 481,
     "name": "Пророчество Судного дня",
     "en": "Doom Prophet",
     "mods": [
      {
       "stat": "cd",
       "op": "pct",
       "v": -10.0,
       "text": "Время перезарядки Армагеддона -10%"
      }
     ],
     "mechanics": [
      "При получении крупицы маны оставшееся время перезарядки Армагеддона сокращается на 1%."
     ],
     "effIds": [
      [
       -14,
       1.0
      ],
      [
       448,
       -100.0
      ],
      [
       443,
       10.0
      ]
     ]
    }
   ]
  },
  "enchant": null
 },
 {
  "id": 15,
  "key": "incinerate",
  "ours": "Пламя пасти",
  "oursCodeId": null,
  "name": "Испепеление",
  "en": "Incineration",
  "kind": "attack",
  "frame": "wave",
  "maxLevel": 7,
  "desc": "Огнем выжигает врагов перед собой.",
  "base": {
   "dmgPct": 500.0,
   "cd": 4.0,
   "count": 15.0,
   "note": "Урон: 500% ATK; КД: 4 с; Кол-во: 15 языков; Механика: конус огня вперёд по движению",
   "src": {
    "dmgPct": "code",
    "cd": "code",
    "count": "code"
   }
  },
  "levels": [
   {
    "level": 2,
    "prop": false as const,
    "mods": [
     {
      "stat": "count",
      "op": "add",
      "v": 6.0,
      "text": "Число испепелений +6"
     }
    ]
   },
   {
    "level": 3,
    "prop": false as const,
    "mods": [
     {
      "stat": "dmg",
      "op": "pct",
      "v": 50.0,
      "text": "Урон испепеления +50%"
     }
    ]
   },
   {
    "level": 4,
    "prop": false as const,
    "mods": [
     {
      "stat": "size",
      "op": "pct",
      "v": 20.0,
      "text": "Размер испепеления +20%"
     }
    ]
   },
   {
    "level": 5,
    "prop": false as const,
    "mods": [
     {
      "stat": "count",
      "op": "add",
      "v": 6.0,
      "text": "Число испепелений +6"
     }
    ]
   },
   {
    "level": 6,
    "prop": false as const,
    "mods": [
     {
      "stat": "dmg",
      "op": "pct",
      "v": 50.0,
      "text": "Урон испепеления +50%"
     }
    ]
   }
  ],
  "propLevels": [
   7
  ],
  "props": {
   "7": [
    {
     "id": 488,
     "name": "Пламенный удар",
     "en": "Flamestrike",
     "mods": [
      {
       "stat": "size",
       "op": "mul",
       "v": 4.0,
       "text": "(Максимальное увеличение: урон x4, размер x1,5)"
      },
      {
       "stat": "count",
       "op": "pct",
       "v": 25.0,
       "text": "Число испепелений +25%"
      }
     ],
     "mechanics": [
      "При атаке испепелением его мощность постепенно возрастает."
     ],
     "effIds": [
      [
       -15,
       1.0
      ],
      [
       464,
       25.0
      ]
     ]
    },
    {
     "id": 489,
     "name": "Пироман",
     "en": "Pyromaniac",
     "mods": [
      {
       "stat": "cd",
       "op": "pct",
       "v": -20.0,
       "text": "Время перезарядки испепеления -20%"
      }
     ],
     "mechanics": [
      "При каждой атаке испепелением образуется 2 языка пламени с таким же уроном."
     ],
     "effIds": [
      [
       -15,
       1.0
      ],
      [
       472,
       20.0
      ]
     ]
    },
    {
     "id": 490,
     "name": "Пламя Цербера",
     "en": "Cerberus Flame",
     "mods": [
      {
       "stat": "dmg",
       "op": "pct",
       "v": 30.0,
       "text": "Урон испепеления +30%"
      },
      {
       "stat": "range",
       "op": "pct",
       "v": 20.0,
       "text": "Дальность испепеления +20%"
      },
      {
       "stat": "width",
       "op": "pct",
       "v": -33.0,
       "text": "Ширина испепеления -33%"
      },
      {
       "stat": "count",
       "op": "pct",
       "v": -33.0,
       "text": "Число испепелений -33%"
      }
     ],
     "mechanics": [
      "Испепеление дополнительно распространяется по бокам."
     ],
     "effIds": [
      [
       -15,
       1.0
      ],
      [
       461,
       30.0
      ],
      [
       470,
       20.0
      ],
      [
       465,
       33.0
      ],
      [
       1169,
       33.0
      ]
     ]
    }
   ]
  },
  "enchant": {
   "text": "Урон испепеления +50% @ Время перезарядки испепеления -5%",
   "mods": [
    {
     "stat": "dmg",
     "op": "pct",
     "v": 50.0,
     "text": "Урон испепеления +50%"
    },
    {
     "stat": "cd",
     "op": "pct",
     "v": -5.0,
     "text": "Время перезарядки испепеления -5%"
    }
   ]
  }
 },
 {
  "id": 16,
  "key": "ebolt",
  "ours": "Сгустки силы",
  "oursCodeId": null,
  "name": "Энергетическая пуля",
  "en": "Energy Bolt",
  "kind": "attack",
  "frame": "projectile",
  "maxLevel": 7,
  "desc": "Стреляет пробивным снарядом на небольшое расстояние.",
  "base": {
   "dmgPct": 750.0,
   "cd": 3.3,
   "count": 5.0,
   "duration": 0.6,
   "note": "Урон: 750% ATK; КД: 3.3 с; Кол-во: 5; Длительность: 0.6 с; Механика: пробивающие шары в ближайших",
   "src": {
    "dmgPct": "code",
    "cd": "code",
    "count": "code",
    "duration": "code"
   }
  },
  "levels": [
   {
    "level": 2,
    "prop": false as const,
    "mods": [
     {
      "stat": "dmg",
      "op": "pct",
      "v": 20.0,
      "text": "Урон энергетических пуль +20%"
     },
     {
      "stat": "count",
      "op": "add",
      "v": 2.0,
      "text": "Число энергетических пуль +2"
     }
    ]
   },
   {
    "level": 3,
    "prop": false as const,
    "mods": [
     {
      "stat": "dmg",
      "op": "pct",
      "v": 20.0,
      "text": "Урон энергетических пуль +20%"
     },
     {
      "stat": "count",
      "op": "add",
      "v": 2.0,
      "text": "Число энергетических пуль +2"
     }
    ]
   },
   {
    "level": 4,
    "prop": false as const,
    "mods": [
     {
      "stat": "dmg",
      "op": "pct",
      "v": 20.0,
      "text": "Урон энергетических пуль +20%"
     },
     {
      "stat": "count",
      "op": "add",
      "v": 2.0,
      "text": "Число энергетических пуль +2"
     }
    ]
   },
   {
    "level": 5,
    "prop": false as const,
    "mods": [
     {
      "stat": "dmg",
      "op": "pct",
      "v": 20.0,
      "text": "Урон энергетических пуль +20%"
     },
     {
      "stat": "count",
      "op": "add",
      "v": 2.0,
      "text": "Число энергетических пуль +2"
     }
    ]
   },
   {
    "level": 6,
    "prop": false as const,
    "mods": [
     {
      "stat": "dmg",
      "op": "pct",
      "v": 20.0,
      "text": "Урон энергетических пуль +20%"
     },
     {
      "stat": "count",
      "op": "add",
      "v": 2.0,
      "text": "Число энергетических пуль +2"
     }
    ]
   }
  ],
  "propLevels": [
   7
  ],
  "props": {
   "7": [
    {
     "id": 497,
     "name": "Заряженная частица",
     "en": "Charged Particle",
     "mods": [
      {
       "stat": "count",
       "op": "pct",
       "v": 35.0,
       "text": "Число энергетических пуль +35%"
      },
      {
       "stat": "speed",
       "op": "pct",
       "v": 35.0,
       "text": "Скорость зарядов энергетических пуль +35%"
      }
     ],
     "mechanics": [
      "Когда время действия энергетических пуль заканчивается, они возвращаются к персонажу."
     ],
     "effIds": [
      [
       -16,
       1.0
      ],
      [
       486,
       35.0
      ],
      [
       490,
       35.0
      ]
     ]
    },
    {
     "id": 498,
     "name": "Искра",
     "en": "Spark",
     "mods": [
      {
       "stat": "duration",
       "op": "mul",
       "v": 2.5,
       "text": "Время действия энергетических пуль х2,5"
      },
      {
       "stat": "size",
       "op": "pct",
       "v": 25.0,
       "text": "Размер энергетических пуль +25%"
      },
      {
       "stat": "dmg",
       "op": "pct",
       "v": -25.0,
       "text": "Урон энергетических пуль -25%"
      }
     ],
     "mechanics": [
      "Энергетические пули наносят урон с интервалом в 0,3 сек."
     ],
     "effIds": [
      [
       -16,
       1.0
      ],
      [
       483,
       25.0
      ],
      [
       482,
       25.0
      ],
      [
       1188,
       250.0
      ]
     ]
    },
    {
     "id": 499,
     "name": "Вспышка",
     "en": "Flare",
     "mods": [
      {
       "stat": "dmg",
       "op": "pct",
       "v": 30.0,
       "text": "Урон энергетических пуль +30%"
      }
     ],
     "mechanics": [
      "Энергетические пули летят сразу в четыре стороны",
      "и взрываются с двойной мощностью, когда заканчивается их время действия."
     ],
     "effIds": [
      [
       -16,
       1.0
      ],
      [
       481,
       30.0
      ]
     ]
    }
   ]
  },
  "enchant": {
   "text": "Урон энергетических пуль +50% @ Размер энергетических пуль +10%",
   "mods": [
    {
     "stat": "dmg",
     "op": "pct",
     "v": 50.0,
     "text": "Урон энергетических пуль +50%"
    },
    {
     "stat": "size",
     "op": "pct",
     "v": 10.0,
     "text": "Размер энергетических пуль +10%"
    }
   ]
  }
 },
 {
  "id": 17,
  "key": "blizzard",
  "ours": "Ледяная буря",
  "oursCodeId": null,
  "name": "Метель",
  "en": "Blizzard",
  "kind": "attack",
  "frame": "sky",
  "maxLevel": 7,
  "desc": "Вызывает метель, которая замораживает врагов.",
  "base": {
   "dmgPct": 700.0,
   "cd": 6.0,
   "count": 20.0,
   "note": "Урон: 700% ATK; КД: 6 с; Кол-во: 20; Механика: ледяные снаряды падают вокруг, шанс заморозки",
   "src": {
    "dmgPct": "code",
    "cd": "code",
    "count": "code"
   }
  },
  "levels": [
   {
    "level": 2,
    "prop": false as const,
    "mods": [
     {
      "stat": "count",
      "op": "add",
      "v": 8.0,
      "text": "Число метелей +8"
     }
    ]
   },
   {
    "level": 3,
    "prop": false as const,
    "mods": [
     {
      "stat": "dmg",
      "op": "pct",
      "v": 50.0,
      "text": "Урон метели +50%"
     }
    ]
   },
   {
    "level": 4,
    "prop": false as const,
    "mods": [
     {
      "stat": "cd",
      "op": "pct",
      "v": -15.0,
      "text": "Время перезарядки метели -15%"
     }
    ]
   },
   {
    "level": 5,
    "prop": false as const,
    "mods": [
     {
      "stat": "count",
      "op": "add",
      "v": 8.0,
      "text": "Число метелей +8"
     }
    ]
   },
   {
    "level": 6,
    "prop": false as const,
    "mods": [
     {
      "stat": "dmg",
      "op": "pct",
      "v": 50.0,
      "text": "Урон метели +50%"
     }
    ]
   }
  ],
  "propLevels": [
   7
  ],
  "props": {
   "7": [
    {
     "id": 506,
     "name": "Лютый холод",
     "en": "Sub-Zero",
     "mods": [
      {
       "stat": "count",
       "op": "pct",
       "v": 30.0,
       "text": "Число метелей +30%"
      }
     ],
     "mechanics": [
      "Пока бушует метель, скорость всех врагов каждую секунду сокращается на 3%.",
      "Когда действие метели заканчивается, замедление сбрасывается."
     ],
     "effIds": [
      [
       -17,
       1.0
      ],
      [
       523,
       3.0
      ],
      [
       514,
       30.0
      ]
     ]
    },
    {
     "id": 507,
     "name": "Падающая звезда",
     "en": "Shooting Star",
     "mods": [
      {
       "stat": "dmg",
       "op": "mul",
       "v": 2.0,
       "text": "Урон метели х2"
      },
      {
       "stat": "size",
       "op": "mul",
       "v": 1.35,
       "text": "Размер метели х1,35"
      },
      {
       "stat": "count",
       "op": "pct",
       "v": -50.0,
       "text": "Число метелей -50%"
      },
      {
       "stat": "interval",
       "op": "mul",
       "v": 2.0,
       "text": "Интервал появления метели х2"
      }
     ],
     "mechanics": [
      "Скорость падения метели снижается."
     ],
     "effIds": [
      [
       -17,
       1.0
      ],
      [
       515,
       50.0
      ],
      [
       1211,
       2.0
      ],
      [
       1216,
       135.0
      ],
      [
       1221,
       2.0
      ]
     ]
    },
    {
     "id": 508,
     "name": "Пожар",
     "en": "Conflagration",
     "mods": [
      {
       "stat": "interval",
       "op": "pct",
       "v": -30.0,
       "text": "Интервал появления метели -30%"
      },
      {
       "stat": "size",
       "op": "pct",
       "v": -30.0,
       "text": "Радиус появления метели -30%"
      }
     ],
     "mechanics": [
      "Метель взрывается 2 раза подряд. С каждым взрывом мощность уменьшается на 10%.",
      "Метель больше не замораживает."
     ],
     "effIds": [
      [
       -17,
       1.0
      ],
      [
       522,
       30.0
      ],
      [
       1223,
       30.0
      ]
     ]
    }
   ]
  },
  "enchant": {
   "text": "Урон метели +50% @ Время перезарядки метели -5%",
   "mods": [
    {
     "stat": "dmg",
     "op": "pct",
     "v": 50.0,
     "text": "Урон метели +50%"
    },
    {
     "stat": "cd",
     "op": "pct",
     "v": -5.0,
     "text": "Время перезарядки метели -5%"
    }
   ]
  }
 },
 {
  "id": 18,
  "key": "ray",
  "ours": "Луч бездны",
  "oursCodeId": null,
  "name": "Таинственный луч",
  "en": "Arcane Ray",
  "kind": "attack",
  "frame": "beam",
  "maxLevel": 7,
  "desc": "Излучает луч, пронзающий все на своем пути.",
  "base": {
   "dmgPct": 900.0,
   "cd": 3.5,
   "count": 1.0,
   "duration": 0.8,
   "note": "Урон: 900% ATK; КД: 3.5 с; Длительность: 0.8 с; Кол-во: 1; Механика: луч до края экрана, пробивает всё",
   "src": {
    "dmgPct": "code",
    "cd": "code",
    "count": "code",
    "duration": "code"
   }
  },
  "levels": [
   {
    "level": 2,
    "prop": false as const,
    "mods": [
     {
      "stat": "dmg",
      "op": "pct",
      "v": 20.0,
      "text": "Урон таинственных лучей +20%"
     },
     {
      "stat": "count",
      "op": "add",
      "v": 1.0,
      "text": "Число таинственных лучей +1"
     }
    ]
   },
   {
    "level": 3,
    "prop": false as const,
    "mods": [
     {
      "stat": "dmg",
      "op": "pct",
      "v": 20.0,
      "text": "Урон таинственных лучей +20%"
     },
     {
      "stat": "count",
      "op": "add",
      "v": 1.0,
      "text": "Число таинственных лучей +1"
     }
    ]
   },
   {
    "level": 4,
    "prop": false as const,
    "mods": [
     {
      "stat": "dmg",
      "op": "pct",
      "v": 20.0,
      "text": "Урон таинственных лучей +20%"
     },
     {
      "stat": "count",
      "op": "add",
      "v": 1.0,
      "text": "Число таинственных лучей +1"
     }
    ]
   },
   {
    "level": 5,
    "prop": false as const,
    "mods": [
     {
      "stat": "dmg",
      "op": "pct",
      "v": 20.0,
      "text": "Урон таинственных лучей +20%"
     },
     {
      "stat": "count",
      "op": "add",
      "v": 1.0,
      "text": "Число таинственных лучей +1"
     }
    ]
   },
   {
    "level": 6,
    "prop": false as const,
    "mods": [
     {
      "stat": "dmg",
      "op": "pct",
      "v": 20.0,
      "text": "Урон таинственных лучей +20%"
     },
     {
      "stat": "count",
      "op": "add",
      "v": 1.0,
      "text": "Число таинственных лучей +1"
     }
    ]
   }
  ],
  "propLevels": [
   7
  ],
  "props": {
   "7": [
    {
     "id": 515,
     "name": "Отражение",
     "en": "Reflect",
     "mods": [
      {
       "stat": "dmg",
       "op": "pct",
       "v": 50.0,
       "text": "Урон таинственных лучей +50%"
      },
      {
       "stat": "interval",
       "op": "pct",
       "v": -50.0,
       "text": "Интервал появления таинственных лучей -50%"
      }
     ],
     "mechanics": [
      "Таинственные лучи появляются на противоположной стороне."
     ],
     "effIds": [
      [
       -18,
       1.0
      ],
      [
       531,
       50.0
      ],
      [
       545,
       50.0
      ]
     ]
    },
    {
     "id": 516,
     "name": "Разрушительный луч",
     "en": "Disintegration Ray",
     "mods": [
      {
       "stat": "dmg",
       "op": "mul",
       "v": 2.0,
       "text": "Урон таинственных лучей х2"
      },
      {
       "stat": "cd",
       "op": "pct",
       "v": 50.0,
       "text": "Время перезарядки таинственных лучей +50%"
      }
     ],
     "mechanics": [
      "Таинственные лучи вращаются быстрее."
     ],
     "effIds": [
      [
       -18,
       1.0
      ],
      [
       543,
       50.0
      ],
      [
       1231,
       2.0
      ]
     ]
    },
    {
     "id": 517,
     "name": "Электромагнитное излучение",
     "en": "Electromagnetic Burst",
     "mods": [
      {
       "stat": "duration",
       "op": "mul",
       "v": 4.0,
       "text": "Время действия таинственных лучей х4"
      }
     ],
     "mechanics": [
      "Таинственные лучи (от 1 до количества создаваемых лучей) появляются в случайных направлениях.",
      "Таинственные лучи наносят урон с интервалом в 0,5 сек."
     ],
     "effIds": [
      [
       -18,
       1.0
      ],
      [
       1237,
       4.0
      ]
     ]
    }
   ]
  },
  "enchant": {
   "text": "Урон таинственных лучей +50% @ Время перезарядки таинственных лучей -5%",
   "mods": [
    {
     "stat": "dmg",
     "op": "pct",
     "v": 50.0,
     "text": "Урон таинственных лучей +50%"
    },
    {
     "stat": "cd",
     "op": "pct",
     "v": -5.0,
     "text": "Время перезарядки таинственных лучей -5%"
    }
   ]
  }
 },
 {
  "id": 19,
  "key": "mcircle",
  "ours": "Руна силы",
  "oursCodeId": "powerrune",
  "name": "Магический круг",
  "en": "Magic Circle",
  "kind": "utility",
  "frame": "utility",
  "maxLevel": 5,
  "desc": "Активированный круг приумножает атаку.",
  "base": {
   "effectPct": 25.0,
   "cd": 20.0,
   "duration": 5.0,
   "note": "Эффект: +25% усиление ATK; Длительность: 5 с; КД: 20 с",
   "src": {
    "effectPct": "code",
    "cd": "code",
    "duration": "code"
   }
  },
  "levels": [
   {
    "level": 2,
    "prop": false as const,
    "mods": [
     {
      "stat": "effect",
      "op": "pct",
      "v": 5.0,
      "text": "Эффект магического круга +5%"
     },
     {
      "stat": "duration",
      "op": "pct",
      "v": 20.0,
      "text": "Время действия магического круга +20%"
     }
    ]
   },
   {
    "level": 3,
    "prop": false as const,
    "mods": [
     {
      "stat": "effect",
      "op": "pct",
      "v": 5.0,
      "text": "Эффект магического круга +5%"
     },
     {
      "stat": "duration",
      "op": "pct",
      "v": 20.0,
      "text": "Время действия магического круга +20%"
     }
    ]
   },
   {
    "level": 4,
    "prop": false as const,
    "mods": [
     {
      "stat": "effect",
      "op": "pct",
      "v": 5.0,
      "text": "Эффект магического круга +5%"
     },
     {
      "stat": "duration",
      "op": "pct",
      "v": 20.0,
      "text": "Время действия магического круга +20%"
     }
    ]
   }
  ],
  "propLevels": [
   5
  ],
  "props": {
   "5": [
    {
     "id": 524,
     "name": "Магическое высвобождение",
     "en": "Unleash Mana",
     "mods": [
      {
       "stat": "cd",
       "op": "pct",
       "v": -15.0,
       "text": "Время перезарядки магического круга -15%"
      }
     ],
     "mechanics": [
      "Пока действует магический круг, время перезарядки всех заклинаний сокращается на 15%."
     ],
     "effIds": [
      [
       -19,
       1.0
      ],
      [
       568,
       15.0
      ],
      [
       566,
       15.0
      ]
     ]
    },
    {
     "id": 525,
     "name": "Пластичность материи",
     "en": "Material Synthesis",
     "mods": [
      {
       "stat": "mana",
       "op": "pct",
       "v": 15.0,
       "text": "Получение маны +15%"
      }
     ],
     "mechanics": [
      "При активации магического круга рядом с персонажем появляется 5 предметов."
     ],
     "effIds": [
      [
       -19,
       1.0
      ],
      [
       569,
       5.0
      ],
      [
       38,
       15.0
      ]
     ]
    },
    {
     "id": 526,
     "name": "Большой магический круг",
     "en": "Great Magic Circle",
     "mods": [
      {
       "stat": "duration",
       "op": "pct",
       "v": 33.0,
       "text": "Время действия магического круга +33%"
      },
      {
       "stat": "cd",
       "op": "pct",
       "v": 33.0,
       "text": "Время перезарядки магического круга +33%"
      }
     ],
     "mechanics": [
      "Эффективность магического круга возрастает в 2 раза."
     ],
     "effIds": [
      [
       -19,
       1.0
      ],
      [
       563,
       33.0
      ],
      [
       567,
       33.0
      ]
     ]
    }
   ]
  },
  "enchant": null
 },
 {
  "id": 20,
  "key": "lava",
  "ours": "Кипящая земля",
  "oursCodeId": null,
  "name": "Лавовая область",
  "en": "Lava Zone",
  "kind": "attack",
  "frame": "zone",
  "maxLevel": 7,
  "desc": "Создает лавовую область, которая в течение некоторого времени непрерывно наносит урон врагам.",
  "base": {
   "dmgPct": 1000.0,
   "cd": 5.0,
   "count": 1.0,
   "duration": 6.0,
   "tick": 0.5,
   "note": "Урон: 1000% ATK за тик; Тик: 0.5 с; Длительность: 6 с; КД: 5 с (после окончания); Кол-во: 1",
   "src": {
    "dmgPct": "code",
    "cd": "code",
    "count": "code",
    "duration": "code",
    "tick": "wiki"
   }
  },
  "levels": [
   {
    "level": 2,
    "prop": false as const,
    "mods": [
     {
      "stat": "count",
      "op": "add",
      "v": 1.0,
      "text": "Число лавовых областей +1"
     }
    ]
   },
   {
    "level": 3,
    "prop": false as const,
    "mods": [
     {
      "stat": "dmg",
      "op": "pct",
      "v": 50.0,
      "text": "Урон лавовой области +50%"
     }
    ]
   },
   {
    "level": 4,
    "prop": false as const,
    "mods": [
     {
      "stat": "size",
      "op": "pct",
      "v": 20.0,
      "text": "Размер лавовых областей +20%"
     }
    ]
   },
   {
    "level": 5,
    "prop": false as const,
    "mods": [
     {
      "stat": "count",
      "op": "add",
      "v": 1.0,
      "text": "Число лавовых областей +1"
     }
    ]
   },
   {
    "level": 6,
    "prop": false as const,
    "mods": [
     {
      "stat": "dmg",
      "op": "pct",
      "v": 50.0,
      "text": "Урон лавовой области +50%"
     }
    ]
   }
  ],
  "propLevels": [
   7
  ],
  "props": {
   "7": [
    {
     "id": 533,
     "name": "Плавление",
     "en": "Melt",
     "mods": [
      {
       "stat": "effect",
       "op": "pct",
       "v": 30.0,
       "text": "(Максимальное увеличение: 30%)"
      },
      {
       "stat": "cd",
       "op": "pct",
       "v": -15.0,
       "text": "Время перезарядки лавовой области -15%"
      }
     ],
     "mechanics": [
      "Каждый раз, когда враг получает урон от лавовой области, получаемый урон увеличивается на 5%."
     ],
     "effIds": [
      [
       -20,
       1.0
      ],
      [
       592,
       5.0
      ],
      [
       590,
       15.0
      ]
     ]
    },
    {
     "id": 534,
     "name": "Кратер",
     "en": "Crater",
     "mods": [
      {
       "stat": "count",
       "op": "mul",
       "v": 2.0,
       "text": "Число лавовых областей х2"
      },
      {
       "stat": "size",
       "op": "pct",
       "v": -20.0,
       "text": "Размер лавовой области -20%"
      },
      {
       "stat": "duration",
       "op": "pct",
       "v": -20.0,
       "text": "Время действия лавовой области -20%"
      }
     ],
     "mechanics": [],
     "effIds": [
      [
       -20,
       1.0
      ],
      [
       588,
       20.0
      ],
      [
       586,
       20.0
      ],
      [
       1283,
       2.0
      ]
     ]
    },
    {
     "id": 535,
     "name": "Излияние магмы",
     "en": "Magma Eruption",
     "mods": [
      {
       "stat": "dmg",
       "op": "mul",
       "v": 2.0,
       "text": "Урон лавовой области х2"
      },
      {
       "stat": "cd",
       "op": "pct",
       "v": 50.0,
       "text": "Время перезарядки лавовых областей +50%"
      }
     ],
     "mechanics": [
      "Лавовые области объединяются в одну.",
      "Размер лавовой области увеличивается на 30% за каждую лавовую область."
     ],
     "effIds": [
      [
       -20,
       1.0
      ],
      [
       591,
       50.0
      ],
      [
       1281,
       2.0
      ]
     ]
    }
   ]
  },
  "enchant": {
   "text": "Урон лавовой области +50% @ Время перезарядки лавовой области -5%",
   "mods": [
    {
     "stat": "dmg",
     "op": "pct",
     "v": 50.0,
     "text": "Урон лавовой области +50%"
    },
    {
     "stat": "cd",
     "op": "pct",
     "v": -5.0,
     "text": "Время перезарядки лавовой области -5%"
    }
   ]
  }
 },
 {
  "id": 21,
  "key": "flash",
  "ours": "Разрез света",
  "oursCodeId": null,
  "name": "Световая вспышка",
  "en": "Flash Shock",
  "kind": "attack",
  "frame": "beam",
  "maxLevel": 7,
  "desc": "В направлении движения персонажа возникает вспышка, которая проносится по полю, нанося врагам урон.",
  "base": {
   "dmgPct": 1800.0,
   "cd": 10.0,
   "note": "Урон: 1800% ATK; КД: 10 с; Размер: ×1; Механика: полоса света через весь экран по направлению движения",
   "src": {
    "dmgPct": "code",
    "cd": "code"
   }
  },
  "levels": [
   {
    "level": 2,
    "prop": false as const,
    "mods": [
     {
      "stat": "size",
      "op": "pct",
      "v": 15.0,
      "text": "Размер световых вспышек +15%"
     }
    ]
   },
   {
    "level": 3,
    "prop": false as const,
    "mods": [
     {
      "stat": "dmg",
      "op": "pct",
      "v": 50.0,
      "text": "Урон световых вспышек +50%"
     }
    ]
   },
   {
    "level": 4,
    "prop": false as const,
    "mods": [
     {
      "stat": "size",
      "op": "pct",
      "v": 15.0,
      "text": "Размер световых вспышек +15%"
     }
    ]
   },
   {
    "level": 5,
    "prop": false as const,
    "mods": [
     {
      "stat": "cd",
      "op": "pct",
      "v": -20.0,
      "text": "Время перезарядки световых вспышек -20%"
     }
    ]
   },
   {
    "level": 6,
    "prop": false as const,
    "mods": [
     {
      "stat": "dmg",
      "op": "pct",
      "v": 50.0,
      "text": "Урон световых вспышек +50%"
     }
    ]
   }
  ],
  "propLevels": [
   7
  ],
  "props": {
   "7": [
    {
     "id": 542,
     "name": "Уничтожение",
     "en": "Wipeout",
     "mods": [
      {
       "stat": "size",
       "op": "pct",
       "v": 30.0,
       "text": "Размер световых вспышек +30%"
      }
     ],
     "mechanics": [
      "Урон в центре световой вспышки увеличивается в 10 раз."
     ],
     "effIds": [
      [
       -21,
       1.0
      ],
      [
       611,
       1000.0
      ],
      [
       606,
       30.0
      ]
     ]
    },
    {
     "id": 543,
     "name": "Рагнарок",
     "en": "Ragnarok",
     "mods": [
      {
       "stat": "count",
       "op": "add",
       "v": 5.0,
       "text": "Число световых вспышек +5"
      },
      {
       "stat": "cd",
       "op": "mul",
       "v": 2.0,
       "text": "Время перезарядки световых вспышек х2"
      }
     ],
     "mechanics": [
      "Радиус появления световых вспышек увеличивается."
     ],
     "effIds": [
      [
       -21,
       1.0
      ],
      [
       603,
       5.0
      ],
      [
       1310,
       2.0
      ]
     ]
    },
    {
     "id": 544,
     "name": "Когти дьявола",
     "en": "Satan's Nails",
     "mods": [
      {
       "stat": "dmg",
       "op": "pct",
       "v": 33.0,
       "text": "Урон световых вспышек +33%"
      },
      {
       "stat": "size",
       "op": "pct",
       "v": -50.0,
       "text": "Размер световых вспышек -50%"
      }
     ],
     "mechanics": [
      "Вспышки появляются в случайных местах и направлениях.",
      "Вспышки появляются по бокам и каждый раз число активаций увеличивается на 1.",
      "После каждого 4-го раза накопленное число активаций сбрасывается."
     ],
     "effIds": [
      [
       -21,
       1.0
      ],
      [
       601,
       33.0
      ],
      [
       607,
       50.0
      ]
     ]
    }
   ]
  },
  "enchant": {
   "text": "Урон световых вспышек +50% @ Время перезарядки световых вспышек -5%",
   "mods": [
    {
     "stat": "dmg",
     "op": "pct",
     "v": 50.0,
     "text": "Урон световых вспышек +50%"
    },
    {
     "stat": "cd",
     "op": "pct",
     "v": -5.0,
     "text": "Время перезарядки световых вспышек -5%"
    }
   ]
  }
 }
];

export const COMBOS: ComboData[] = [
 {
  "id": 1,
  "name": "Гнев небес",
  "en": "Empyrean Wrath",
  "base": {
   "spell": 7,
   "prop": 417,
   "propName": "Грозовой взрыв"
  },
  "donor": {
   "spell": 10,
   "prop": 444,
   "propName": "Метеоритный дождь"
  },
  "mods": [
   {
    "stat": "dmg",
    "op": "mul",
    "v": 5.0,
    "text": "Урон молний х5"
   },
   {
    "stat": "count",
    "op": "mul",
    "v": 3.0,
    "text": "Число молний х3"
   }
  ],
  "mechanics": [
   "Радиус взрыва молний увеличивается, но взрывы не расширяются."
  ],
  "effIds": [
   [
    911,
    5.0
   ],
   [
    914,
    3.0
   ]
  ],
  "ultimate": {
   "name": "Штормбрингер",
   "en": "Stormbringer",
   "classId": 4,
   "className": "Шаман",
   "text": "Молния обрушивается мгновенно."
  }
 },
 {
  "id": 2,
  "name": "Парящие мечи",
  "en": "Telekinetic Sword",
  "base": {
   "spell": 3,
   "prop": 381,
   "propName": "Магический клинок"
  },
  "donor": {
   "spell": 13,
   "prop": 470,
   "propName": "Цепная молния"
  },
  "mods": [
   {
    "stat": "dmg",
    "op": "mul",
    "v": 3.0,
    "text": "Урон духов х3"
   }
  ],
  "mechanics": [
   "Снаряды Духа быстрее рассекают врагов и становятся длиннее.",
   "Каждые 0.15 сек. уменьшения времени перезарядки Духа увеличивают множитель урона на 1.",
   "Каждые 0.15 сек. уменьшения времени перезарядки Духа увеличивают количество атак на 1."
  ],
  "effIds": [
   [
    971,
    3.0
   ]
  ],
  "ultimate": {
   "name": "Аура Блейд",
   "en": "Aura Blade",
   "classId": 7,
   "className": "Призыватель",
   "text": "Снаряды Духа с низкой вероятностью значительно усиливают свою мощь и усиливаются пропорционально шансу критического удара."
  }
 },
 {
  "id": 3,
  "name": "Световая стрельба",
  "en": "Crazed Spray",
  "base": {
   "spell": 16,
   "prop": 497,
   "propName": "Заряженная частица"
  },
  "donor": {
   "spell": 3,
   "prop": 382,
   "propName": "Фамильяр"
  },
  "mods": [
   {
    "stat": "dmg",
    "op": "mul",
    "v": 10.0,
    "text": "Урон энергетических пуль х10"
   },
   {
    "stat": "count",
    "op": "mul",
    "v": 3.0,
    "text": "Количество Энергетических пуль х3"
   },
   {
    "stat": "duration",
    "op": "pct",
    "v": 30.0,
    "text": "Время действия энергетических пуль +30%"
   }
  ],
  "mechanics": [
   "Энергетическая пуля делится на 4 части и выстреливает во все стороны",
   "Заряды энергетических пуль непрерывно летят вперед."
  ],
  "effIds": [
   [
    488,
    30.0
   ],
   [
    1181,
    10.0
   ],
   [
    1186,
    3.0
   ]
  ],
  "ultimate": {
   "name": "Темпестер",
   "en": "Tempester",
   "classId": 13,
   "className": "Алхимик",
   "text": "Время перезарядки Энергетической пули уменьшается, а интервал создания становится равным времени перезарядки."
  }
 },
 {
  "id": 4,
  "name": "Поток Теры",
  "en": "Terra Current",
  "base": {
   "spell": 18,
   "prop": 517,
   "propName": "Электромагнитное излучение"
  },
  "donor": {
   "spell": 13,
   "prop": 472,
   "propName": "Сверхпроводимость"
  },
  "mods": [
   {
    "stat": "dmg",
    "op": "mul",
    "v": 4.0,
    "text": "Урон таинственных лучей х4"
   },
   {
    "stat": "cd",
    "op": "pct",
    "v": -50.0,
    "text": "Время перезарядки таинственных лучей -50%"
   }
  ],
  "mechanics": [
   "Радиус атаки таинственными лучами увеличивается.",
   "Таинственные лучи меняют направление с интервалом в 0,5 сек.",
   "Длительность Таинственных лучей 1 секунда увеличивает урон на 1"
  ],
  "effIds": [
   [
    542,
    50.0
   ],
   [
    1231,
    4.0
   ]
  ],
  "ultimate": null
 },
 {
  "id": 5,
  "name": "Военный климат",
  "en": "War Climate",
  "base": {
   "spell": 10,
   "prop": 444,
   "propName": "Метеоритный дождь"
  },
  "donor": {
   "spell": 17,
   "prop": 507,
   "propName": "Падающая звезда"
  },
  "mods": [
   {
    "stat": "dmg",
    "op": "mul",
    "v": 6.0,
    "text": "Урон метеоритов х6"
   }
  ],
  "mechanics": [
   "Перезарядка метеоритов ускоряется пропорционально их количеству.",
   "Интервал появления становится равен времени перезарядки.",
   "При каждом появлении метеорита время перезарядки сокращается на 0–80%."
  ],
  "effIds": [
   [
    1021,
    6.0
   ]
  ],
  "ultimate": {
   "name": "Граунд Зеро",
   "en": "Ground Zero",
   "classId": 5,
   "className": "Чернокнижник",
   "text": "Падение метеоритов становится огромным и бомбардирует всё поле."
  }
 },
 {
  "id": 6,
  "name": "Уравнение демона",
  "en": "Demon Equation",
  "base": {
   "spell": 2,
   "prop": 371,
   "propName": "Большой взрыв"
  },
  "donor": {
   "spell": 16,
   "prop": 499,
   "propName": "Вспышка"
  },
  "mods": [
   {
    "stat": "dmg",
    "op": "mul",
    "v": 6.66,
    "text": "Урон огненных шаров х6,66"
   },
   {
    "stat": "pierce",
    "op": "add",
    "v": 2.0,
    "text": "Пробивная сила огненных шаров +2"
   },
   {
    "stat": "count",
    "op": "mul",
    "v": 4.0,
    "text": "Число огненных шаров х4"
   },
   {
    "stat": "cd",
    "op": "mul",
    "v": 3.3,
    "text": "Время перезарядки огненных шаров х3,3"
   }
  ],
  "mechanics": [
   "Огненные шары разлетаются сразу во все стороны,",
   "а свойство «Большой взрыв» пропадает."
  ],
  "effIds": [
   [
    183,
    2.0
   ],
   [
    881,
    666.0
   ],
   [
    884,
    4.0
   ],
   [
    895,
    330.0
   ]
  ],
  "ultimate": {
   "name": "Немезис",
   "en": "Nemesis",
   "classId": 11,
   "className": "Пиромант",
   "text": "Мощность Огненного шара увеличивается при каждом взрыве."
  }
 },
 {
  "id": 7,
  "name": "Безумие",
  "en": "Frenzy",
  "base": {
   "spell": 21,
   "prop": 544,
   "propName": "Когти дьявола"
  },
  "donor": {
   "spell": 1,
   "prop": 366,
   "propName": "Лихорадка"
  },
  "mods": [
   {
    "stat": "dmg",
    "op": "mul",
    "v": 7.0,
    "text": "Урон световых вспышек х7"
   },
   {
    "stat": "cd",
    "op": "pct",
    "v": -50.0,
    "text": "Время перезарядки световых вспышек -50%"
   }
  ],
  "mechanics": [
   "Световая вспышка создаётся длиннее и быстрее.",
   "Наложение начинается с 3, сбрасывается на 7; за каждые 4.5 сек. уменьшения времени перезарядки наложение увеличивается на 1."
  ],
  "effIds": [
   [
    609,
    50.0
   ],
   [
    1301,
    7.0
   ]
  ],
  "ultimate": {
   "name": "Берсерк",
   "en": "Berserk",
   "classId": 22,
   "className": "Боевой маг",
   "text": "Количество наложений Световой вспышки всегда поддерживается на максимуме. @ Максимальное количество наложений увеличивается пропорционально шансу критического удара."
  }
 },
 {
  "id": 8,
  "name": "Пандемониум",
  "en": "Ghastly Rampage",
  "base": {
   "spell": 2,
   "prop": 373,
   "propName": "Созвездие"
  },
  "donor": {
   "spell": 4,
   "prop": 390,
   "propName": "Блуждающие огоньки"
  },
  "mods": [
   {
    "stat": "dmg",
    "op": "mul",
    "v": 4.0,
    "text": "Урон огненных шаров х4"
   },
   {
    "stat": "cd",
    "op": "pct",
    "v": -33.0,
    "text": "Время перезарядки огненных шаров -33%"
   }
  ],
  "mechanics": [
   "Огненный шар пронзает всех врагов и движется случайным образом.",
   "Огненный шар взрывается с силой x3 только при исчезновении.",
   "Урон Огненного шара увеличивается пропорционально его длительности.",
   "За каждую единицу пронзающей силы Огненного шара множитель урона увеличивается на 3."
  ],
  "effIds": [
   [
    194,
    33.0
   ],
   [
    881,
    4.0
   ]
  ],
  "ultimate": null
 },
 {
  "id": 9,
  "name": "Противодействие",
  "en": "Reaction",
  "base": {
   "spell": 16,
   "prop": 498,
   "propName": "Искра"
  },
  "donor": {
   "spell": 6,
   "prop": 409,
   "propName": "Поле разрушения"
  },
  "mods": [
   {
    "stat": "dmg",
    "op": "mul",
    "v": 9.0,
    "text": "Урон энергетических пуль х9"
   },
   {
    "stat": "count",
    "op": "pct",
    "v": -50.0,
    "text": "Число энергетических пуль -50%"
   }
  ],
  "mechanics": [
   "Энергетическая пуля создаётся во всех направлениях.",
   "Энергетическая пуля взрывается с интервалом 0.5 сек., и при каждом взрыве её мощность увеличивается на 20%."
  ],
  "effIds": [
   [
    487,
    50.0
   ],
   [
    1181,
    9.0
   ]
  ],
  "ultimate": null
 },
 {
  "id": 10,
  "name": "Вихрь",
  "en": "Vortex",
  "base": {
   "spell": 12,
   "prop": 463,
   "propName": "Космические пустоты"
  },
  "donor": {
   "spell": 4,
   "prop": 389,
   "propName": "Антигравитация"
  },
  "mods": [
   {
    "stat": "dmg",
    "op": "mul",
    "v": 9.0,
    "text": "Урон вихря х9"
   },
   {
    "stat": "duration",
    "op": "mul",
    "v": 9.0,
    "text": "Продолжительность вихря х9"
   },
   {
    "stat": "cd",
    "op": "pct",
    "v": -50.0,
    "text": "Время перезарядки вихря -50%"
   }
  ],
  "mechanics": [
   "Рядом с персонажем начинает кружить вихрь.",
   "Вихрь постепенно сужается."
  ],
  "effIds": [
   [
    406,
    50.0
   ],
   [
    1091,
    9.0
   ],
   [
    1095,
    9.0
   ]
  ],
  "ultimate": {
   "name": "Тьма",
   "en": "Darkness",
   "classId": 10,
   "className": "Друид",
   "text": "Вихрь объединяется в прерывистую, максимально усиленную форму."
  }
 },
 {
  "id": 11,
  "name": "Огненное дыхание",
  "en": "Breath of Fire",
  "base": {
   "spell": 15,
   "prop": 490,
   "propName": "Пламя Цербера"
  },
  "donor": {
   "spell": 18,
   "prop": 515,
   "propName": "Отражение"
  },
  "mods": [
   {
    "stat": "dmg",
    "op": "mul",
    "v": 6.0,
    "text": "Урон испепеления х6"
   },
   {
    "stat": "count",
    "op": "pct",
    "v": 30.0,
    "text": "Число испепелений +30%"
   }
  ],
  "mechanics": [
   "Испепеление направляется не по бокам,",
   "а в пять сторон от персонажа.",
   "Испепеление распространяется быстрее и дальше."
  ],
  "effIds": [
   [
    464,
    30.0
   ],
   [
    1161,
    6.0
   ]
  ],
  "ultimate": null
 },
 {
  "id": 12,
  "name": "Поджог эфира",
  "en": "Ether Blaze",
  "base": {
   "spell": 17,
   "prop": 508,
   "propName": "Пожар"
  },
  "donor": {
   "spell": 15,
   "prop": 488,
   "propName": "Пламенный удар"
  },
  "mods": [
   {
    "stat": "dmg",
    "op": "mul",
    "v": 8.0,
    "text": "Урон метели х8"
   },
   {
    "stat": "size",
    "op": "pct",
    "v": 20.0,
    "text": "Размер метели +20%"
   },
   {
    "stat": "interval",
    "op": "pct",
    "v": -30.0,
    "text": "Интервал появления метели -30%"
   }
  ],
  "mechanics": [
   "Каждый взрыв метели разделяется на 2 взрыва."
  ],
  "effIds": [
   [
    516,
    20.0
   ],
   [
    522,
    30.0
   ],
   [
    1211,
    8.0
   ]
  ],
  "ultimate": null
 },
 {
  "id": 13,
  "name": "Орбитальная бомбардировка",
  "en": "Orbital Strike",
  "base": {
   "spell": 7,
   "prop": 417,
   "propName": "Грозовой взрыв"
  },
  "donor": {
   "spell": 17,
   "prop": 507,
   "propName": "Падающая звезда"
  },
  "mods": [
   {
    "stat": "dmg",
    "op": "mul",
    "v": 9.0,
    "text": "Урон молний х9"
   },
   {
    "stat": "size",
    "op": "pct",
    "v": 30.0,
    "text": "Размер удара молнии увеличен на 30%."
   },
   {
    "stat": "cd",
    "op": "pct",
    "v": 30.0,
    "text": "Время восстановления молнии увеличено на 30%."
   }
  ],
  "mechanics": [
   "Молния быстро генерируется рядом с указанным местом."
  ],
  "effIds": [
   [
    216,
    30.0
   ],
   [
    220,
    30.0
   ],
   [
    911,
    9.0
   ]
  ],
  "ultimate": null
 },
 {
  "id": 14,
  "name": "Генерация нейтронов",
  "en": "Neutron Generation",
  "base": {
   "spell": 12,
   "prop": 462,
   "propName": "Электрическая сфера"
  },
  "donor": {
   "spell": 4,
   "prop": 391,
   "propName": "Термоядерная реакция"
  },
  "mods": [
   {
    "stat": "dmg",
    "op": "mul",
    "v": 10.0,
    "text": "Урон вихря х10"
   }
  ],
  "mechanics": [
   "Вихри объединяются в один.",
   "Вихри не выстреливают зарядами, зато быстро расширяются;",
   "скорость при этом постепенно снижается.",
   "Размер вихря увеличивается на 25% за каждый вихрь."
  ],
  "effIds": [
   [
    1091,
    10.0
   ]
  ],
  "ultimate": {
   "name": "Омега",
   "en": "Omega",
   "classId": 10,
   "className": "Друид",
   "text": "Длительность Вихря преобразуется в урон, и при исчезновении происходит взрыв."
  }
 },
 {
  "id": 15,
  "name": "Зимний шторм",
  "en": "Winter Storm",
  "base": {
   "spell": 17,
   "prop": 506,
   "propName": "Лютый холод"
  },
  "donor": {
   "spell": 2,
   "prop": 372,
   "propName": "Ядовитый газ"
  },
  "mods": [
   {
    "stat": "dmg",
    "op": "mul",
    "v": 8.0,
    "text": "Урон метели х8"
   },
   {
    "stat": "size",
    "op": "pct",
    "v": 25.0,
    "text": "Размер метели +25%"
   },
   {
    "stat": "count",
    "op": "pct",
    "v": -25.0,
    "text": "Число метелей -25%"
   }
  ],
  "mechanics": [
   "Взрывы метели расширяются."
  ],
  "effIds": [
   [
    516,
    25.0
   ],
   [
    515,
    25.0
   ],
   [
    1211,
    8.0
   ]
  ],
  "ultimate": null
 },
 {
  "id": 16,
  "name": "Плазменный луч",
  "en": "Plasma Ray",
  "base": {
   "spell": 18,
   "prop": 516,
   "propName": "Разрушительный луч"
  },
  "donor": {
   "spell": 4,
   "prop": 391,
   "propName": "Термоядерная реакция"
  },
  "mods": [
   {
    "stat": "dmg",
    "op": "add",
    "v": 1.0,
    "text": "Множитель урона увеличивается на 1 за каждый Таинственный луч."
   }
  ],
  "mechanics": [
   "Таинственный луч фиксируется в количестве 4 и действует постоянно; за каждые 1 сек. уменьшения времени перезарядки от 4 сек. добавляется 1 луч.",
   "Размер и длительность Таинственного луча преобразуются в урон.",
   "Таинственный луч наносит урон каждые 0.25 сек."
  ],
  "effIds": [],
  "ultimate": {
   "name": "Квантовый лазер",
   "en": "Quantum Laser",
   "classId": 9,
   "className": "Мистик",
   "text": "Таинственный луч увеличивает мощь и вращается быстрее пропорционально количеству активных лучей."
  }
 },
 {
  "id": 17,
  "name": "Взрыв молний",
  "en": "Lightning Bolts",
  "base": {
   "spell": 7,
   "prop": 416,
   "propName": "Гром среди ясного неба"
  },
  "donor": {
   "spell": 13,
   "prop": 470,
   "propName": "Цепная молния"
  },
  "mods": [
   {
    "stat": "dmg",
    "op": "mul",
    "v": 12.0,
    "text": "Урон молний х12"
   }
  ],
  "mechanics": [
   "5 молний подряд появляются в случайных местах.",
   "При каждом последующем появлении молнии их радиус создания и количество увеличиваются на 30%."
  ],
  "effIds": [
   [
    911,
    12.0
   ]
  ],
  "ultimate": {
   "name": "Дес Шторм",
   "en": "Death Storm",
   "classId": 4,
   "className": "Шаман",
   "text": "Количество последовательных созданий Молнии увеличивается, и она создаётся быстрее."
  }
 },
 {
  "id": 18,
  "name": "Квантовый взрыв",
  "en": "Photon Explosion",
  "base": {
   "spell": 6,
   "prop": 409,
   "propName": "Поле разрушения"
  },
  "donor": {
   "spell": 35,
   "prop": 35,
   "propName": "Рассеивание"
  },
  "mods": [
   {
    "stat": "cd",
    "op": "pct",
    "v": -70.0,
    "text": "Время перезарядки щита -70%"
   }
  ],
  "mechanics": [
   "Вместо зарядки щита происходит мощный взрыв.",
   "Урон и размер Щитов +33% за каждый Щит",
   "﻿Урон увеличивается в соответствии с показателем увеличения размера всех заклинаний.﻿"
  ],
  "effIds": [
   [
    233,
    70.0
   ]
  ],
  "ultimate": null
 },
 {
  "id": 19,
  "name": "Инферно",
  "en": "Inferno",
  "base": {
   "spell": 15,
   "prop": 488,
   "propName": "Пламенный удар"
  },
  "donor": {
   "spell": 20,
   "prop": 533,
   "propName": "Плавление"
  },
  "mods": [
   {
    "stat": "size",
    "op": "mul",
    "v": 30.0,
    "text": "(Максимальный множитель: урон x30, размер x2)"
   },
   {
    "stat": "cd",
    "op": "pct",
    "v": -25.0,
    "text": "Время перезарядки испепеления -25%"
   }
  ],
  "mechanics": [
   "Испепеление создаётся быстрее, максимальный множитель урона увеличивается."
  ],
  "effIds": [
   [
    472,
    25.0
   ]
  ],
  "ultimate": {
   "name": "Инквизитор",
   "en": "Inquisitor",
   "classId": 23,
   "className": "Полководец",
   "text": "Испепеление создаётся мгновенно и в большом количестве."
  }
 },
 {
  "id": 20,
  "name": "Отладка молний",
  "en": "Lightning Calibration",
  "base": {
   "spell": 8,
   "prop": 425,
   "propName": "Эмиссия заряда"
  },
  "donor": {
   "spell": 4,
   "prop": 390,
   "propName": "Блуждающие огоньки"
  },
  "mods": [
   {
    "stat": "dmg",
    "op": "mul",
    "v": 10.0,
    "text": "Урон области электротока х10"
   },
   {
    "stat": "size",
    "op": "pct",
    "v": 30.0,
    "text": "Размер области электротока +30%"
   }
  ],
  "mechanics": [
   "Область электротока в форме зарядов окружает персонажа.",
   "У области электротока пропадает интервал урона, но повышается скорость вращения."
  ],
  "effIds": [
   [
    293,
    30.0
   ],
   [
    991,
    10.0
   ]
  ],
  "ultimate": null
 },
 {
  "id": 21,
  "name": "Доменная печь",
  "en": "Furnace",
  "base": {
   "spell": 20,
   "prop": 535,
   "propName": "Излияние магмы"
  },
  "donor": {
   "spell": 10,
   "prop": 443,
   "propName": "Извержение вулкана"
  },
  "mods": [
   {
    "stat": "dmg",
    "op": "mul",
    "v": 10.0,
    "text": "Урон лавовой области х10"
   },
   {
    "stat": "duration",
    "op": "pct",
    "v": 30.0,
    "text": "Время действия лавовой области +30%"
   },
   {
    "stat": "cd",
    "op": "pct",
    "v": -30.0,
    "text": "Время перезарядки лавовой области -30%"
   }
  ],
  "mechanics": [
   "Лавовая область постепенно увеличивается в размере.",
   "Урон увеличивается пропорционально размеру лавовой области."
  ],
  "effIds": [
   [
    585,
    30.0
   ],
   [
    590,
    30.0
   ],
   [
    1281,
    10.0
   ]
  ],
  "ultimate": null
 },
 {
  "id": 22,
  "name": "Буйство электричества",
  "en": "Current Overload",
  "base": {
   "spell": 13,
   "prop": 470,
   "propName": "Цепная молния"
  },
  "donor": {
   "spell": 3,
   "prop": 382,
   "propName": "Фамильяр"
  },
  "mods": [
   {
    "stat": "dmg",
    "op": "mul",
    "v": 8.0,
    "text": "Урон электрических ударов х8"
   }
  ],
  "mechanics": [
   "Электрические удары не создают цепочку, но зато происходят 3–7 раз подряд.",
   "Увеличивается дальность электрических ударов."
  ],
  "effIds": [
   [
    1121,
    8.0
   ]
  ],
  "ultimate": null
 },
 {
  "id": 23,
  "name": "Потоп",
  "en": "Great Flood",
  "base": {
   "spell": 9,
   "prop": 435,
   "propName": "Песнь сирены"
  },
  "donor": {
   "spell": 12,
   "prop": 461,
   "propName": "Штормовое предупреждение"
  },
  "mods": [
   {
    "stat": "dmg",
    "op": "mul",
    "v": 8.0,
    "text": "Урон цунами х8"
   },
   {
    "stat": "cd",
    "op": "pct",
    "v": 50.0,
    "text": "Время перезарядки цунами +50%"
   }
  ],
  "mechanics": [
   "Появляется еще 2 цунами по бокам.",
   "Цунами регулярно создаются за спиной у персонажа."
  ],
  "effIds": [
   [
    260,
    50.0
   ],
   [
    951,
    8.0
   ]
  ],
  "ultimate": {
   "name": "Мега-цунами",
   "en": "Mega Tsunami",
   "classId": 17,
   "className": "Заклинатель",
   "text": "Цунами возникает одновременно на широкой площади."
  }
 },
 {
  "id": 24,
  "name": "Снежное цветение",
  "en": "Snowflake Blossom",
  "base": {
   "spell": 5,
   "prop": 399,
   "propName": "Ледниковый период"
  },
  "donor": {
   "spell": 9,
   "prop": 434,
   "propName": "Полюс"
  },
  "mods": [
   {
    "stat": "dmg",
    "op": "mul",
    "v": 24.0,
    "text": "Урон ледяных игл х24"
   },
   {
    "stat": "cd",
    "op": "pct",
    "v": -30.0,
    "text": "Время перезарядки ледяных игл -30%"
   }
  ],
  "mechanics": [
   "Ледяные иглы взрываются рядом с врагами 24 раза подряд, при каждом взрыве урон и размер уменьшаются на 2%."
  ],
  "effIds": [
   [
    378,
    30.0
   ],
   [
    1071,
    24.0
   ]
  ],
  "ultimate": {
   "name": "Нулевая нова",
   "en": "Zero Nova",
   "classId": 3,
   "className": "Криомант",
   "text": "Взрывы Ледяных игл создаются быстро и в большом количестве."
  }
 },
 {
  "id": 25,
  "name": "Повелитель тайфуна",
  "en": "Ruler of Storms",
  "base": {
   "spell": 12,
   "prop": 461,
   "propName": "Штормовое предупреждение"
  },
  "donor": {
   "spell": 1,
   "prop": 366,
   "propName": "Лихорадка"
  },
  "mods": [
   {
    "stat": "dmg",
    "op": "mul",
    "v": 10.0,
    "text": "Урон вихря х10"
   },
   {
    "stat": "size",
    "op": "pct",
    "v": 20.0,
    "text": "Размер вихря +20%"
   },
   {
    "stat": "duration",
    "op": "pct",
    "v": -50.0,
    "text": "Продолжительность вихря -50%"
   }
  ],
  "mechanics": [
   "Вихри появляются в четырех направлениях 3 раза подряд.",
   "Скорость перемещения сначала повышается, а затем постепенно снижается."
  ],
  "effIds": [
   [
    397,
    20.0
   ],
   [
    396,
    50.0
   ],
   [
    1091,
    10.0
   ]
  ],
  "ultimate": null
 },
 {
  "id": 26,
  "name": "Сверхразум",
  "en": "Overmind",
  "base": {
   "spell": 31,
   "prop": 31,
   "propName": "Интеллект"
  },
  "donor": {
   "spell": 19,
   "prop": 526,
   "propName": "Большой магический круг"
  },
  "mods": [
   {
    "stat": "amp",
    "op": "pct",
    "v": 1.5,
    "text": "Приумножение атаки на 1,5%"
   },
   {
    "stat": "size",
    "op": "pct",
    "v": 0.5,
    "text": "Размер всех заклинаний +0,5%"
   },
   {
    "stat": "cd",
    "op": "pct",
    "v": -0.3,
    "text": "Время перезарядки всех заклинаний -0,3%"
   }
  ],
  "mechanics": [
   "Применяются только комбинированные заклинания.",
   "За каждый уровень полученного активного заклинания улучшаются следующие характеристики."
  ],
  "effIds": [],
  "ultimate": null
 },
 {
  "id": 27,
  "name": "Безграничная энергия",
  "en": "Perpetual Engine",
  "base": {
   "spell": 19,
   "prop": 524,
   "propName": "Магическое высвобождение"
  },
  "donor": {
   "spell": 31,
   "prop": 31,
   "propName": "Интеллект"
  },
  "mods": [],
  "mechanics": [
   "Магический круг становится постоянным.",
   "Эффективность магического круга повышается на 1% за каждый 3% времени действия круга.",
   "Эффективность магического круга повышается на 1% за каждый 3% показателя сокращения времени перезарядки круга."
  ],
  "effIds": [],
  "ultimate": null
 },
 {
  "id": 28,
  "name": "Врата созидания",
  "en": "Gate of Creation",
  "base": {
   "spell": 31,
   "prop": 31,
   "propName": "Интеллект"
  },
  "donor": {
   "spell": 19,
   "prop": 525,
   "propName": "Пластичность материи"
  },
  "mods": [],
  "mechanics": [
   "За каждую активированную Комбинированную магию Атака Усиливается на 20%.",
   "Число комбинаций заклинаний увеличивается на 2.",
   "Максимальный уровень увеличивается на 5."
  ],
  "effIds": [
   [
    35,
    2.0
   ],
   [
    106,
    5.0
   ]
  ],
  "ultimate": null
 },
 {
  "id": 29,
  "name": "Отправной взрыв",
  "en": "Origin Explosion",
  "base": {
   "spell": 16,
   "prop": 499,
   "propName": "Вспышка"
  },
  "donor": {
   "spell": 2,
   "prop": 373,
   "propName": "Созвездие"
  },
  "mods": [
   {
    "stat": "dmg",
    "op": "mul",
    "v": 12.0,
    "text": "Урон энергетических пуль х12"
   },
   {
    "stat": "size",
    "op": "pct",
    "v": 50.0,
    "text": "Размер взрывов энергетических пуль +50%"
   },
   {
    "stat": "cd",
    "op": "pct",
    "v": 75.0,
    "text": "Время перезарядки Энергетической пули +75%"
   }
  ],
  "mechanics": [
   "Энергетическая пуля взрывается сразу после распространения во все стороны.",
   "Урон и количество Энергетической пули увеличиваются пропорционально длительности."
  ],
  "effIds": [
   [
    494,
    75.0
   ],
   [
    1181,
    12.0
   ],
   [
    1202,
    50.0
   ]
  ],
  "ultimate": {
   "name": "Блиц",
   "en": "Blitz",
   "classId": 13,
   "className": "Алхимик",
   "text": "Энергетическая пуля разделяется 2 раза подряд."
  }
 },
 {
  "id": 30,
  "name": "Призменная лихорадка",
  "en": "Prism Spray",
  "base": {
   "spell": 18,
   "prop": 515,
   "propName": "Отражение"
  },
  "donor": {
   "spell": 1,
   "prop": 366,
   "propName": "Лихорадка"
  },
  "mods": [
   {
    "stat": "dmg",
    "op": "mul",
    "v": 7.0,
    "text": "Урон таинственных лучей х7"
   },
   {
    "stat": "cd",
    "op": "pct",
    "v": -25.0,
    "text": "Время перезарядки таинственных лучей -25%"
   }
  ],
  "mechanics": [
   "На противоположной стороне не создаются таинственные лучи,",
   "вместо этого они возникают единовременно в хаотичных направлениях, и это повторяется 5 раз подряд.",
   "Время действия таинственных лучей конвертируется в урон."
  ],
  "effIds": [
   [
    542,
    25.0
   ],
   [
    1231,
    7.0
   ]
  ],
  "ultimate": null
 },
 {
  "id": 31,
  "name": "Большой разлом",
  "en": "Great Rift",
  "base": {
   "spell": 5,
   "prop": 400,
   "propName": "Землетрясение"
  },
  "donor": {
   "spell": 10,
   "prop": 443,
   "propName": "Извержение вулкана"
  },
  "mods": [
   {
    "stat": "dmg",
    "op": "mul",
    "v": 10.0,
    "text": "Урон ледяных игл х10"
   },
   {
    "stat": "size",
    "op": "pct",
    "v": 50.0,
    "text": "Размер ледяных игл +50%"
   },
   {
    "stat": "cd",
    "op": "pct",
    "v": 50.0,
    "text": "Время перезарядки ледяных игл +50%"
   }
  ],
  "mechanics": [
   "Враги, поражённые Ледяными иглами, отталкиваются.",
   "Урон Ледяных игл увеличивается пропорционально их размеру."
  ],
  "effIds": [
   [
    375,
    50.0
   ],
   [
    379,
    50.0
   ],
   [
    1071,
    10.0
   ]
  ],
  "ultimate": null
 },
 {
  "id": 32,
  "name": "Гиперион",
  "en": "Hyperion",
  "base": {
   "spell": 4,
   "prop": 391,
   "propName": "Термоядерная реакция"
  },
  "donor": {
   "spell": 10,
   "prop": 445,
   "propName": "Астероид"
  },
  "mods": [
   {
    "stat": "dmg",
    "op": "pct",
    "v": 50.0,
    "text": "Множитель урона Спутника +50%"
   },
   {
    "stat": "speed",
    "op": "pct",
    "v": 50.0,
    "text": "Скорость вращения спутников +50%"
   }
  ],
  "mechanics": [
   "Объединённый Спутник дополнительно создаётся с противоположной стороны; его урон на 【20%】 ниже, но при первом попадании вызывает заморозку.",
   "Урон Спутника увеличивается пропорционально его размеру."
  ],
  "effIds": [
   [
    311,
    50.0
   ]
  ],
  "ultimate": {
   "name": "Абаддон",
   "en": "Abaddon",
   "classId": 2,
   "className": "Астроном",
   "text": "Спутники сливаются в одно Солнце и наносят 33% урона всем врагам на поле."
  }
 },
 {
  "id": 33,
  "name": "Аватар",
  "en": "Avatar",
  "base": {
   "spell": 1,
   "prop": 367,
   "propName": "Двойник"
  },
  "donor": {
   "spell": 3,
   "prop": 380,
   "propName": "Заколдованная ракета"
  },
  "mods": [
   {
    "stat": "dmg",
    "op": "mul",
    "v": 9.99,
    "text": "Урон магических пуль х9,99"
   },
   {
    "stat": "cd",
    "op": "pct",
    "v": -33.0,
    "text": "Время перезарядки магических пуль -33%"
   }
  ],
  "mechanics": [
   "Призывает 3 дополнительных фантома, которые стреляют магическими пулями.",
   "Число магических пуль фиксируется на 1.",
   "Урон увеличивается на 33% за каждую магическую пулю."
  ],
  "effIds": [
   [
    158,
    33.0
   ],
   [
    851,
    999.0
   ]
  ],
  "ultimate": {
   "name": "Эквилибриум",
   "en": "Equilibrium",
   "classId": 1,
   "className": "Чародей",
   "text": "Создаётся дополнительно 3 двойника Доппельгангера."
  }
 },
 {
  "id": 34,
  "name": "Сердце грозы",
  "en": "Heart of Lightning",
  "base": {
   "spell": 13,
   "prop": 470,
   "propName": "Цепная молния"
  },
  "donor": {
   "spell": 16,
   "prop": 497,
   "propName": "Заряженная частица"
  },
  "mods": [
   {
    "stat": "dmg",
    "op": "mul",
    "v": 8.0,
    "text": "Урон электрических ударов х8"
   }
  ],
  "mechanics": [
   "При каждом сцеплении электрических ударов заряд разделяется на 2,",
   "а урон и размер сокращаются на 【20%】.",
   "Сцепление электрических ударов происходит быстрее."
  ],
  "effIds": [
   [
    1121,
    8.0
   ]
  ],
  "ultimate": {
   "name": "Арка",
   "en": "Arc",
   "classId": 12,
   "className": "Колдун",
   "text": "Электрический удар усиливается — при цепной реакции снаряды не разделяются, но мощность не теряется."
  }
 },
 {
  "id": 35,
  "name": "Великое столкновение",
  "en": "Great Impact",
  "base": {
   "spell": 10,
   "prop": 445,
   "propName": "Астероид"
  },
  "donor": {
   "spell": 17,
   "prop": 507,
   "propName": "Падающая звезда"
  },
  "mods": [
   {
    "stat": "dmg",
    "op": "mul",
    "v": 12.0,
    "text": "Урон метеоритов х12"
   },
   {
    "stat": "cd",
    "op": "pct",
    "v": -30.0,
    "text": "Время перезарядки метеоритов -30%"
   },
   {
    "stat": "size",
    "op": "pct",
    "v": -30.0,
    "text": "Размер метеоритов -30%"
   }
  ],
  "mechanics": [
   "Падение метеоритов происходит 3 раза подряд, при этом мощность первого метеорита увеличивается на 50%."
  ],
  "effIds": [
   [
    327,
    30.0
   ],
   [
    325,
    30.0
   ],
   [
    1021,
    12.0
   ]
  ],
  "ultimate": {
   "name": "Гигантский удар",
   "en": "Giant Impact",
   "classId": 5,
   "className": "Чернокнижник",
   "text": "Падение метеоритов объединяется в одно и при взрыве оглушает всех врагов поблизости."
  }
 },
 {
  "id": 36,
  "name": "Ледяное сердце",
  "en": "Frozen Heart",
  "base": {
   "spell": 8,
   "prop": 427,
   "propName": "Огненная аура"
  },
  "donor": {
   "spell": 5,
   "prop": 399,
   "propName": "Ледниковый период"
  },
  "mods": [
   {
    "stat": "dmg",
    "op": "mul",
    "v": 20.0,
    "text": "Урон области электротока х20"
   }
  ],
  "mechanics": [
   "Область электротока на короткое время замораживает врагов.",
   "Область электротока: урон и размер увеличиваются на 1 при каждом срабатывании, сброс на 4 срабатывания."
  ],
  "effIds": [
   [
    991,
    20.0
   ]
  ],
  "ultimate": null
 },
 {
  "id": 37,
  "name": "Эффект Мейснера",
  "en": "Meisner Effect",
  "base": {
   "spell": 8,
   "prop": 426,
   "propName": "ЭМИ"
  },
  "donor": {
   "spell": 13,
   "prop": 472,
   "propName": "Сверхпроводимость"
  },
  "mods": [
   {
    "stat": "dmg",
    "op": "mul",
    "v": 6.0,
    "text": "Урон области электротока х6"
   },
   {
    "stat": "size",
    "op": "pct",
    "v": 100.0,
    "text": "Размер области электротока +100%"
   },
   {
    "stat": "amp",
    "op": "pct",
    "v": 25.0,
    "text": "Приумножение атаки на 25%"
   }
  ],
  "mechanics": [
   "При активации оглушения ЭМИ жертва отбрасывается и получает 10-кратный дополнительный урон."
  ],
  "effIds": [
   [
    293,
    100.0
   ],
   [
    16,
    25.0
   ],
   [
    991,
    6.0
   ]
  ],
  "ultimate": {
   "name": "Локдаун",
   "en": "Lockdown",
   "classId": 16,
   "className": "Электромант",
   "text": "Область электротока создаётся в виде волн, а интервал срабатывания ускоряется пропорционально [перезарядке]."
  }
 },
 {
  "id": 38,
  "name": "Энергетическая насыщенность",
  "en": "Energy Bombardment",
  "base": {
   "spell": 18,
   "prop": 516,
   "propName": "Разрушительный луч"
  },
  "donor": {
   "spell": 21,
   "prop": 543,
   "propName": "Рагнарок"
  },
  "mods": [
   {
    "stat": "dmg",
    "op": "mul",
    "v": 20.0,
    "text": "Урон таинственных лучей х20"
   },
   {
    "stat": "size",
    "op": "mul",
    "v": 5.0,
    "text": "Размер таинственных лучей х5"
   },
   {
    "stat": "duration",
    "op": "pct",
    "v": -75.0,
    "text": "Время действия таинственных лучей -75%"
   }
  ],
  "mechanics": [
   "Таинственные лучи создаются единовременно в хаотичных направлениях.",
   "Таинственные лучи больше не вращаются."
  ],
  "effIds": [
   [
    538,
    75.0
   ],
   [
    1231,
    20.0
   ],
   [
    1239,
    5.0
   ]
  ],
  "ultimate": {
   "name": "Бастер Бим",
   "en": "Buster Beam",
   "classId": 9,
   "className": "Мистик",
   "text": "Таинственный луч периодически наносит урон, @ длительность преобразуется в урон, а его размер постепенно увеличивается."
  }
 },
 {
  "id": 39,
  "name": "Супертайфун",
  "en": "Super Cyclone",
  "base": {
   "spell": 12,
   "prop": 461,
   "propName": "Штормовое предупреждение"
  },
  "donor": {
   "spell": 8,
   "prop": 427,
   "propName": "Огненная аура"
  },
  "mods": [
   {
    "stat": "cd",
    "op": "pct",
    "v": 100.0,
    "text": "Продолжительность вихря и время перезарядки +100%"
   }
  ],
  "mechanics": [
   "Вихри объединяются в один.",
   "Вихрь закрепляется за персонажем, и множитель урона",
   "увеличивается пропорционально времени следования за персонажем.",
   "Когда действие вихря заканчивается, начинается перезарядка.",
   "Размер вихрей увеличивается на 20% за каждый вихрь."
  ],
  "effIds": [
   [
    395,
    100.0
   ],
   [
    407,
    100.0
   ],
   [
    1112,
    100.0
   ]
  ],
  "ultimate": null
 },
 {
  "id": 40,
  "name": "Телепорт",
  "en": "Teleport",
  "base": {
   "spell": 11,
   "prop": 453,
   "propName": "Искажение пространства"
  },
  "donor": {
   "spell": 36,
   "prop": 36,
   "propName": "Концентрация"
  },
  "mods": [
   {
    "stat": "dmg",
    "op": "mul",
    "v": 3.0,
    "text": "Урон Маскировка х3"
   },
   {
    "stat": "cd",
    "op": "pct",
    "v": -70.0,
    "text": "Время перезарядки маскировки -70%"
   }
  ],
  "mechanics": [
   "Маскировка применяется 7 раз подряд, телепортируя в случайные позиции и в конце возвращая на исходную точку.",
   "Количество применений и множитель урона маскировки увеличиваются пропорционально длительности."
  ],
  "effIds": [
   [
    356,
    70.0
   ],
   [
    1062,
    3.0
   ]
  ],
  "ultimate": {
   "name": "Галлюцинация",
   "en": "Hallucination",
   "classId": 25,
   "className": "",
   "text": "Взрыв Трансформации срабатывает 5 раз подряд."
  }
 },
 {
  "id": 41,
  "name": "Пламенный шторм",
  "en": "Flame Storm",
  "base": {
   "spell": 10,
   "prop": 443,
   "propName": "Извержение вулкана"
  },
  "donor": {
   "spell": 15,
   "prop": 490,
   "propName": "Пламя Цербера"
  },
  "mods": [
   {
    "stat": "dmg",
    "op": "mul",
    "v": 10.0,
    "text": "Урон метеоритов х10"
   }
  ],
  "mechanics": [
   "Кратеры от Падения метеоритов больше не наносят урон.",
   "Падение метеоритов создаётся по пяти направлениям от персонажа, выстраиваясь в линию; при достижении 33%, 66%, 99% размера направление увеличивается на 1, множитель урона — на 5."
  ],
  "effIds": [
   [
    1021,
    10.0
   ]
  ],
  "ultimate": null
 },
 {
  "id": 42,
  "name": "Фейерверк",
  "en": "Pyrotechnics",
  "base": {
   "spell": 1,
   "prop": 363,
   "propName": "Петарда"
  },
  "donor": {
   "spell": 16,
   "prop": 499,
   "propName": "Вспышка"
  },
  "mods": [
   {
    "stat": "dmg",
    "op": "mul",
    "v": 5.0,
    "text": "Урон магических пуль х5"
   },
   {
    "stat": "size",
    "op": "pct",
    "v": 50.0,
    "text": "Размер Магической пули +50%"
   }
  ],
  "mechanics": [
   "Магическая пуля взрывается в случайных точках.",
   "Взрыв Магической пули расширяется и наносит урон от x1 до x9."
  ],
  "effIds": [
   [
    162,
    50.0
   ],
   [
    851,
    5.0
   ]
  ],
  "ultimate": null
 },
 {
  "id": 43,
  "name": "Магическое копье",
  "en": "Mana Spear",
  "base": {
   "spell": 3,
   "prop": 380,
   "propName": "Заколдованная ракета"
  },
  "donor": {
   "spell": 21,
   "prop": 542,
   "propName": "Уничтожение"
  },
  "mods": [
   {
    "stat": "dmg",
    "op": "mul",
    "v": 10.0,
    "text": "Урон духов х10"
   },
   {
    "stat": "size",
    "op": "pct",
    "v": 200.0,
    "text": "Размер духов +200%"
   },
   {
    "stat": "cd",
    "op": "mul",
    "v": 2.0,
    "text": "Время перезарядки духов х2"
   }
  ],
  "mechanics": [
   "Возвращаются стандартные время перезарядки и интервал стрельбы духов.",
   "Скорость зарядов и дальность стрельбы духов значительно увеличиваются."
  ],
  "effIds": [
   [
    276,
    200.0
   ],
   [
    971,
    10.0
   ],
   [
    982,
    2.0
   ]
  ],
  "ultimate": {
   "name": "Валькирия",
   "en": "Valkyrie",
   "classId": 7,
   "className": "Призыватель",
   "text": "Количество Духов удваивается, и они выстреливают одновременно."
  }
 },
 {
  "id": 44,
  "name": "Ворота",
  "en": "Gate",
  "base": {
   "spell": 21,
   "prop": 543,
   "propName": "Рагнарок"
  },
  "donor": {
   "spell": 3,
   "prop": 380,
   "propName": "Заколдованная ракета"
  },
  "mods": [
   {
    "stat": "dmg",
    "op": "mul",
    "v": 12.0,
    "text": "Урон световых вспышек х12"
   },
   {
    "stat": "count",
    "op": "mul",
    "v": 6.0,
    "text": "Число световых вспышек х6"
   },
   {
    "stat": "cd",
    "op": "pct",
    "v": -50.0,
    "text": "Время перезарядки световых вспышек -50%"
   }
  ],
  "mechanics": [
   "Темп увеличения размера Световой вспышки преобразуется в урон."
  ],
  "effIds": [
   [
    609,
    50.0
   ],
   [
    1301,
    12.0
   ],
   [
    1304,
    6.0
   ]
  ],
  "ultimate": {
   "name": "Асенсия",
   "en": "Ascension",
   "classId": 22,
   "className": "Боевой маг",
   "text": "Световая вспышка создаётся без ограничений и ускоряется пропорционально перезарядке и количеству."
  }
 },
 {
  "id": 45,
  "name": "Генерация магнитного поля",
  "en": "Magnetic Field",
  "base": {
   "spell": 4,
   "prop": 389,
   "propName": "Антигравитация"
  },
  "donor": {
   "spell": 8,
   "prop": 425,
   "propName": "Эмиссия заряда"
  },
  "mods": [
   {
    "stat": "dmg",
    "op": "mul",
    "v": 7.0,
    "text": "Урон спутника х7"
   },
   {
    "stat": "size",
    "op": "pct",
    "v": 100.0,
    "text": "Размер спутника +100%"
   }
  ],
  "mechanics": [
   "Бонус скорости вращения Антигравитация фиксирован на 2x."
  ],
  "effIds": [
   [
    313,
    100.0
   ],
   [
    1006,
    7.0
   ]
  ],
  "ultimate": {
   "name": "Ядро",
   "en": "Core",
   "classId": 2,
   "className": "Астроном",
   "text": "Спутник быстро вращается по широкой орбите, увеличивая мощность."
  }
 },
 {
  "id": 46,
  "name": "Чёрная смерть",
  "en": "Black Death",
  "base": {
   "spell": 2,
   "prop": 372,
   "propName": "Ядовитый газ"
  },
  "donor": {
   "spell": 1,
   "prop": 366,
   "propName": "Лихорадка"
  },
  "mods": [
   {
    "stat": "dmg",
    "op": "mul",
    "v": 20.0,
    "text": "Урон огненных шаров х20"
   },
   {
    "stat": "size",
    "op": "pct",
    "v": 100.0,
    "text": "Размер огненных шаров +100%"
   },
   {
    "stat": "cd",
    "op": "mul",
    "v": 2.0,
    "text": "Время перезарядки огненных шаров х2"
   }
  ],
  "mechanics": [
   "Огненный шар немедленно взрывается в случайной позиции, нанося урон 4 раза.",
   "Урон Огненного шара увеличивается пропорционально его размеру.",
   "Пронзающая сила Огненного шара преобразуется из количества на 50%"
  ],
  "effIds": [
   [
    187,
    100.0
   ],
   [
    881,
    20.0
   ],
   [
    895,
    2.0
   ]
  ],
  "ultimate": null
 },
 {
  "id": 47,
  "name": "Дыхание молнии",
  "en": "Lightning Breath",
  "base": {
   "spell": 13,
   "prop": 472,
   "propName": "Сверхпроводимость"
  },
  "donor": {
   "spell": 15,
   "prop": 488,
   "propName": "Пламенный удар"
  },
  "mods": [
   {
    "stat": "dmg",
    "op": "mul",
    "v": 7.0,
    "text": "Урон электрических ударов х7"
   },
   {
    "stat": "count",
    "op": "mul",
    "v": 2.0,
    "text": "Число электрических ударов х2"
   },
   {
    "stat": "cd",
    "op": "pct",
    "v": 50.0,
    "text": "Время перезарядки Электрический удар +50%"
   }
  ],
  "mechanics": [
   "Перед персонажем генерируются три дополнительных электрошока."
  ],
  "effIds": [
   [
    432,
    50.0
   ],
   [
    1121,
    7.0
   ],
   [
    1126,
    2.0
   ]
  ],
  "ultimate": null
 },
 {
  "id": 48,
  "name": "феникс",
  "en": "Phoenix",
  "base": {
   "spell": 9,
   "prop": 436,
   "propName": "Великое извержение"
  },
  "donor": {
   "spell": 17,
   "prop": 508,
   "propName": "Пожар"
  },
  "mods": [
   {
    "stat": "dmg",
    "op": "mul",
    "v": 24.0,
    "text": "Урон цунами х24"
   },
   {
    "stat": "cd",
    "op": "pct",
    "v": -30.0,
    "text": "Время перезарядки цунами -30%"
   },
   {
    "stat": "count",
    "op": "pct",
    "v": -50.0,
    "text": "Число цунами -50%"
   },
   {
    "stat": "revive",
    "op": "add",
    "v": 1.0,
    "text": "Количество возрождений +1"
   }
  ],
  "mechanics": [
   "Цунами создаётся за спиной персонажа.",
   "Цунами оставляет пламя на своём пути."
  ],
  "effIds": [
   [
    259,
    30.0
   ],
   [
    255,
    50.0
   ],
   [
    49,
    1.0
   ],
   [
    951,
    24.0
   ]
  ],
  "ultimate": null
 },
 {
  "id": 49,
  "name": "Брандиш",
  "en": "Brandish",
  "base": {
   "spell": 21,
   "prop": 542,
   "propName": "Уничтожение"
  },
  "donor": {
   "spell": 3,
   "prop": 381,
   "propName": "Магический клинок"
  },
  "mods": [
   {
    "stat": "cd",
    "op": "pct",
    "v": -50.0,
    "text": "Время перезарядки световых вспышек -50%"
   }
  ],
  "mechanics": [
   "Световая вспышка создаётся со всех сторон 7 раз подряд; за каждые 4.5 секунды уменьшения времени перезарядки количество увеличивается на 1.",
   "Световая вспышка наносит урон только в центре.",
   "СКРЫТО в таблице: эффект 603 = 6 (вероятно урон ×6; в тексте не указан)"
  ],
  "effIds": [
   [
    603,
    6.0
   ],
   [
    609,
    50.0
   ]
  ],
  "ultimate": null
 },
 {
  "id": 50,
  "name": "черная дыра",
  "en": "Black Hole",
  "base": {
   "spell": 12,
   "prop": 463,
   "propName": "Космические пустоты"
  },
  "donor": {
   "spell": 4,
   "prop": 391,
   "propName": "Термоядерная реакция"
  },
  "mods": [
   {
    "stat": "dmg",
    "op": "mul",
    "v": 8.0,
    "text": "Урон вихря х8"
   }
  ],
  "mechanics": [
   "Вихрь объединяется в один.",
   "Враги, получившие урон от Вихря, ошеломляются.",
   "Время перезарядки Вихря начинается после окончания его действия.",
   "Множитель урона увеличивается на x3 от темпа увеличения длительности Вихря.",
   "Множитель урона увеличивается на 3 за каждый Вихрь."
  ],
  "effIds": [
   [
    1091,
    8.0
   ]
  ],
  "ultimate": null
 },
 {
  "id": 51,
  "name": "Бытие",
  "en": "Genesis",
  "base": {
   "spell": 17,
   "prop": 507,
   "propName": "Падающая звезда"
  },
  "donor": {
   "spell": 2,
   "prop": 373,
   "propName": "Созвездие"
  },
  "mods": [
   {
    "stat": "dmg",
    "op": "mul",
    "v": 30.0,
    "text": "Урон метели х30"
   },
   {
    "stat": "cd",
    "op": "pct",
    "v": -30.0,
    "text": "Время перезарядки метели -30%"
   }
  ],
  "mechanics": [
   "Время перезарядки Метели уменьшается пропорционально количеству,",
   "а интервал создания становится равным времени перезарядки."
  ],
  "effIds": [
   [
    519,
    30.0
   ],
   [
    1211,
    30.0
   ]
  ],
  "ultimate": {
   "name": "Космос",
   "en": "Cosmos",
   "classId": 21,
   "className": "Маг",
   "text": "Метель возникает одновременно на широкой области."
  }
 },
 {
  "id": 52,
  "name": "Астрапе",
  "en": "Astrape",
  "base": {
   "spell": 7,
   "prop": 418,
   "propName": "Суд"
  },
  "donor": {
   "spell": 10,
   "prop": 445,
   "propName": "Астероид"
  },
  "mods": [
   {
    "stat": "dmg",
    "op": "mul",
    "v": 7.0,
    "text": "Урон молний х7"
   },
   {
    "stat": "size",
    "op": "pct",
    "v": 25.0,
    "text": "Размер удара молнии увеличен на 25%."
   },
   {
    "stat": "cd",
    "op": "pct",
    "v": 25.0,
    "text": "Время восстановления молнии увеличено на 25%."
   }
  ],
  "mechanics": [
   "Когда взрывается молния, вокруг области испускается ударная волна, нанося половину урона ближайшим врагам и заставляя их терять сознание."
  ],
  "effIds": [
   [
    216,
    25.0
   ],
   [
    220,
    25.0
   ],
   [
    911,
    7.0
   ]
  ],
  "ultimate": null
 },
 {
  "id": 53,
  "name": "сверхновая",
  "en": "Supernova",
  "base": {
   "spell": 3,
   "prop": 382,
   "propName": "Фамильяр"
  },
  "donor": {
   "spell": 16,
   "prop": 499,
   "propName": "Вспышка"
  },
  "mods": [
   {
    "stat": "dmg",
    "op": "mul",
    "v": 24.0,
    "text": "Урон духов х24"
   },
   {
    "stat": "size",
    "op": "pct",
    "v": 100.0,
    "text": "Размер духов +100%"
   },
   {
    "stat": "count",
    "op": "pct",
    "v": 75.0,
    "text": "Количество выстрелов духа уменьшено на 75%."
   },
   {
    "stat": "cd",
    "op": "mul",
    "v": 2.0,
    "text": "Время перезарядки духов х2"
   }
  ],
  "mechanics": [
   "Дух воспламеняется сразу."
  ],
  "effIds": [
   [
    276,
    100.0
   ],
   [
    971,
    24.0
   ],
   [
    975,
    75.0
   ],
   [
    982,
    2.0
   ]
  ],
  "ultimate": null
 },
 {
  "id": 54,
  "name": "Бластер",
  "en": "Blaster",
  "base": {
   "spell": 1,
   "prop": 362,
   "propName": "Магическая стрела"
  },
  "donor": {
   "spell": 21,
   "prop": 542,
   "propName": "Уничтожение"
  },
  "mods": [
   {
    "stat": "dmg",
    "op": "mul",
    "v": 5.0,
    "text": "Урон магических пуль х5"
   },
   {
    "stat": "size",
    "op": "pct",
    "v": 50.0,
    "text": "Размер Магической пули +50%"
   }
  ],
  "mechanics": [
   "Мощность 6-й Магической пули x7"
  ],
  "effIds": [
   [
    162,
    50.0
   ],
   [
    851,
    5.0
   ]
  ],
  "ultimate": null
 },
 {
  "id": 55,
  "name": "Адское пламя",
  "en": "Hellfire",
  "base": {
   "spell": 15,
   "prop": 489,
   "propName": "Пироман"
  },
  "donor": {
   "spell": 17,
   "prop": 508,
   "propName": "Пожар"
  },
  "mods": [
   {
    "stat": "dmg",
    "op": "mul",
    "v": 12.0,
    "text": "Урон испепеления х12"
   },
   {
    "stat": "size",
    "op": "pct",
    "v": 100.0,
    "text": "Размер испепеления +100%"
   },
   {
    "stat": "cd",
    "op": "pct",
    "v": 50.0,
    "text": "Время перезарядки Испепеления +50%"
   }
  ],
  "mechanics": [
   "Испепеление создаётся в x2 количестве.",
   "Пламя Испепеления взрывается 2~3 раза подряд."
  ],
  "effIds": [
   [
    468,
    100.0
   ],
   [
    473,
    50.0
   ],
   [
    1161,
    12.0
   ]
  ],
  "ultimate": {
   "name": "Бримстоун",
   "en": "Brimstone",
   "classId": 23,
   "className": "Полководец",
   "text": "Испепеление применяется постоянно, а урон увеличивается пропорционально времени перезарядки и количеству."
  }
 },
 {
  "id": 56,
  "name": "Эра Солнца",
  "en": "Age of the Sun",
  "base": {
   "spell": 20,
   "prop": 534,
   "propName": "Кратер"
  },
  "donor": {
   "spell": 4,
   "prop": 391,
   "propName": "Термоядерная реакция"
  },
  "mods": [
   {
    "stat": "dmg",
    "op": "mul",
    "v": 15.0,
    "text": "Урон лавовой области х15"
   },
   {
    "stat": "cd",
    "op": "pct",
    "v": -30.0,
    "text": "Время перезарядки лавовой области -30%"
   }
  ],
  "mechanics": [
   "Лавовая область создаётся одновременно во всех направлениях и движется.",
   "Множитель урона Лавовой области преобразуется из длительности со скоростью 3 за 1 сек.."
  ],
  "effIds": [
   [
    590,
    30.0
   ],
   [
    1281,
    15.0
   ]
  ],
  "ultimate": {
   "name": "Оверлорд",
   "en": "Overload",
   "classId": 15,
   "className": "Ведьма",
   "text": "Лавовая область усиливается и создаётся быстрее."
  }
 },
 {
  "id": 57,
  "name": "Разрушитель",
  "en": "Destroyer",
  "base": {
   "spell": 8,
   "prop": 425,
   "propName": "Эмиссия заряда"
  },
  "donor": {
   "spell": 6,
   "prop": 409,
   "propName": "Поле разрушения"
  },
  "mods": [
   {
    "stat": "dmg",
    "op": "mul",
    "v": 99.0,
    "text": "Урон области электротока х99"
   },
   {
    "stat": "size",
    "op": "pct",
    "v": 99.0,
    "text": "Размер области электротока +99%"
   },
   {
    "stat": "cd",
    "op": "pct",
    "v": -0.1,
    "text": "Доля восстановления здоровья в сек. -0,1%"
   }
  ],
  "mechanics": [
   "Область электротока получает время перезарядки 5 сек..",
   "Область электротока получает длительность 3 сек.."
  ],
  "effIds": [
   [
    293,
    99.0
   ],
   [
    24,
    -10.0
   ],
   [
    991,
    99.0
   ],
   [
    724,
    10.0
   ]
  ],
  "ultimate": {
   "name": "Терминатор",
   "en": "Terminator",
   "classId": 16,
   "className": "Электромант",
   "text": "Область электротока кастуется с высокой разрушительной силой и более коротким интервалом."
  }
 },
 {
  "id": 58,
  "name": "Геноцид",
  "en": "Genocide",
  "base": {
   "spell": 18,
   "prop": 516,
   "propName": "Разрушительный луч"
  },
  "donor": {
   "spell": 3,
   "prop": 382,
   "propName": "Фамильяр"
  },
  "mods": [
   {
    "stat": "dmg",
    "op": "add",
    "v": 4.0,
    "text": "Множитель урона увеличивается на 4 за каждую единицу Таинственного луча."
   },
   {
    "stat": "duration",
    "op": "pct",
    "v": -33.0,
    "text": "Время действия таинственных лучей -33%"
   },
   {
    "stat": "cd",
    "op": "pct",
    "v": 33.0,
    "text": "Время перезарядки таинственных лучей +33%"
   }
  ],
  "mechanics": [
   "Таинственный луч объединяется в один и вращается быстрее.",
   "Темп увеличения размера Таинственного луча преобразуется в урон."
  ],
  "effIds": [
   [
    538,
    33.0
   ],
   [
    543,
    33.0
   ]
  ],
  "ultimate": null
 },
 {
  "id": 59,
  "name": "Эксидиум",
  "en": "Exidium",
  "base": {
   "spell": 21,
   "prop": 542,
   "propName": "Уничтожение"
  },
  "donor": {
   "spell": 14,
   "prop": 480,
   "propName": "Вознесение"
  },
  "mods": [
   {
    "stat": "dmg",
    "op": "mul",
    "v": 7.0,
    "text": "Урон световых вспышек х7"
   },
   {
    "stat": "size",
    "op": "pct",
    "v": 100.0,
    "text": "Размер световых вспышек +100%"
   },
   {
    "stat": "cd",
    "op": "pct",
    "v": -50.0,
    "text": "Время перезарядки световых вспышек -50%"
   }
  ],
  "mechanics": [
   "Размер центральной части Световой вспышки увеличивается."
  ],
  "effIds": [
   [
    606,
    100.0
   ],
   [
    609,
    50.0
   ],
   [
    1301,
    7.0
   ]
  ],
  "ultimate": null
 },
 {
  "id": 60,
  "name": "Деус экс махина",
  "en": "Deus Ex Machina",
  "base": {
   "spell": 0,
   "prop": 0,
   "propName": "Name"
  },
  "donor": {
   "spell": 0,
   "prop": 0,
   "propName": "Name"
  },
  "mods": [
   {
    "stat": "dmg",
    "op": "add",
    "v": 0.01,
    "text": "Множитель урона всех заклинаний +0.01"
   },
   {
    "stat": "cd",
    "op": "pct",
    "v": -0.1,
    "text": "Время перезарядки всех заклинаний -0,1%"
   }
  ],
  "mechanics": [
   "Дальнейшая комбинация заклинаний невозможна.",
   "Максимальный уровень увеличивается на 10.",
   "За каждый уровень полученного активного заклинания улучшаются следующие характеристики."
  ],
  "effIds": [
   [
    106,
    10.0
   ]
  ],
  "ultimate": null
 },
 {
  "id": 61,
  "name": "Глейсиум",
  "en": "Glacium",
  "base": {
   "spell": 9,
   "prop": 434,
   "propName": "Полюс"
  },
  "donor": {
   "spell": 5,
   "prop": 399,
   "propName": "Ледниковый период"
  },
  "mods": [
   {
    "stat": "dmg",
    "op": "mul",
    "v": 30.0,
    "text": "Урон цунами х30"
   },
   {
    "stat": "count",
    "op": "pct",
    "v": 25.0,
    "text": "Число цунами +25%"
   },
   {
    "stat": "cd",
    "op": "pct",
    "v": 25.0,
    "text": "Время перезарядки цунами +25%"
   }
  ],
  "mechanics": [
   "Цунами распространяется во все стороны от персонажа."
  ],
  "effIds": [
   [
    254,
    25.0
   ],
   [
    260,
    25.0
   ],
   [
    951,
    30.0
   ]
  ],
  "ultimate": null
 },
 {
  "id": 62,
  "name": "Соул Блейд",
  "en": "Soul Blade",
  "base": {
   "spell": 4,
   "prop": 390,
   "propName": "Блуждающие огоньки"
  },
  "donor": {
   "spell": 3,
   "prop": 381,
   "propName": "Магический клинок"
  },
  "mods": [
   {
    "stat": "dmg",
    "op": "mul",
    "v": 5.0,
    "text": "Урон спутника х5"
   }
  ],
  "mechanics": [
   "Спутник принимает форму лезвия и вращается ещё быстрее.",
   "Множитель урона и скорость вращения Спутника увеличиваются пропорционально шансу критического удара."
  ],
  "effIds": [
   [
    1006,
    5.0
   ]
  ],
  "ultimate": null
 },
 {
  "id": 63,
  "name": "Дисчардж",
  "en": "Discharge",
  "base": {
   "spell": 13,
   "prop": 471,
   "propName": "Высокая производительность"
  },
  "donor": {
   "spell": 7,
   "prop": 417,
   "propName": "Грозовой взрыв"
  },
  "mods": [
   {
    "stat": "dmg",
    "op": "mul",
    "v": 12.0,
    "text": "Урон электрических ударов х12"
   },
   {
    "stat": "cd",
    "op": "pct",
    "v": 33.0,
    "text": "Время перезарядки Электрический удар +33%"
   }
  ],
  "mechanics": [
   "При взрыве Электрического удара размер увеличивается и выпускаются снаряды."
  ],
  "effIds": [
   [
    432,
    33.0
   ],
   [
    1121,
    12.0
   ]
  ],
  "ultimate": null
 }
];

export const SPELL_BY_ID: Record<number, SpellData> = Object.fromEntries(SPELLS.map((s) => [s.id, s]));
/** id свойства → id заклинания-владельца */
export const PROP_OWNER: Record<number, number> = Object.fromEntries(SPELLS.flatMap((s) => Object.values(s.props).flat().map((p) => [p.id, s.id])));
/** Слияния, которые открывает данное свойство (как основа или донор) */
export function combosForProp(propId: number): ComboData[] { return COMBOS.filter((c) => c.base.prop === propId || c.donor.prop === propId); }
