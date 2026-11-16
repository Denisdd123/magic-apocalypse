import type { Player } from '../../Player';
import { W } from '../../World';

/**
 * Перехват удара по магу для утилитарных заклинаний (Щит, Маскировка) без правки Player.ts.
 * Player.hurt() вызывает единственный крючок onBeforeHurt (его раньше занимала старая Фаза).
 * Здесь он превращается в цепочку: стражи опрашиваются по приоритету (меньше — раньше),
 * первый вернувший true отменяет урон. Чужой крючок (если он был) сохраняется и зовётся последним.
 * Состояние хранится на конкретном маге (WeakMap) — новый забег начинает с чистого листа.
 */
export type GuardFn = () => boolean;

interface Chain { guards: { prio: number; fn: GuardFn }[]; prev: GuardFn | null; handler: GuardFn }

const chains = new WeakMap<Player, Chain>();

function chainOf(P: Player): Chain {
  let c = chains.get(P);
  if (!c) {
    const ch: Chain = {
      guards: [], prev: null,
      handler: () => {
        for (const g of ch.guards) if (g.fn()) return true;
        return ch.prev ? ch.prev() : false;
      },
    };
    chains.set(P, (c = ch));
  }
  // кто-то перезаписал крючок — встаём впереди, его сохраняем как запасной
  if (P.onBeforeHurt !== c.handler) { c.prev = P.onBeforeHurt; P.onBeforeHurt = c.handler; }
  return c;
}

/** Зарегистрировать стража (повторный вызов с тем же fn безопасен) */
export function addGuard(fn: GuardFn, prio: number) {
  const c = chainOf(W.player);
  if (c.guards.some((g) => g.fn === fn)) return;
  c.guards.push({ prio, fn });
  c.guards.sort((a, b) => a.prio - b.prio);
}

/** Проверить, что крючок всё ещё наш (звать в update — дёшево) */
export function keepGuard() { if (W.player) chainOf(W.player); }

export function removeGuard(fn: GuardFn) {
  const P = W.player;
  if (!P) return;
  const c = chains.get(P);
  if (!c) return;
  c.guards = c.guards.filter((g) => g.fn !== fn);
  if (!c.guards.length && P.onBeforeHurt === c.handler) { P.onBeforeHurt = c.prev; chains.delete(P); }
}

/** Итоговая перезарядка утилиты с глобальными сокращениями (как в Spell.ready) */
export function effCd(baseCd: number, id: string) {
  return Math.max(0.05, baseCd * W.stats.cdMul * (1 - (W.stats.spellCdr[id] ?? 0)));
}
