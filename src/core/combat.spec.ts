import { describe, it, expect } from 'vitest';
import {
    applyAttack,
    createEnemy,
    createPartyMember,
    getAttackDamage,
    getBasicAttack,
    getBattleOutcome,
    getMaxHp,
    isDefeated,
    isLoss,
    setHp,
    type PartyMember,
} from './combat';
import { ATTACKS, ENEMY_SHEETS, PLAYER_SHEETS } from './combatSheets';

const newCircle = () => createPartyMember(PLAYER_SHEETS.circle);
const newGoatee = () => createEnemy(ENEMY_SHEETS.goatee_circle);

describe('sheets and attacks', () => {
    it('circle is a 20 HP player with a 2 damage basic attack', () => {
        expect(PLAYER_SHEETS.circle).toEqual({
            kind: 'player', id: 'circle', maxHp: 20, basicAttackId: 'circle_basic',
        });
        expect(ATTACKS.circle_basic.power).toBe(2);
    });

    it('goatee circle is a 10 HP enemy with a 2 damage basic attack', () => {
        expect(ENEMY_SHEETS.goatee_circle).toEqual({
            kind: 'enemy', id: 'goatee_circle', maxHp: 10, basicAttackId: 'goatee_basic',
        });
        expect(ATTACKS.goatee_basic.power).toBe(2);
    });
});

describe('creating characters', () => {
    it('starts at full HP, read from the sheet', () => {
        const circle = newCircle();
        const goatee = newGoatee();

        expect(circle).toEqual({ kind: 'player', sheetId: 'circle', hp: 20 });
        expect(goatee).toEqual({ kind: 'enemy', sheetId: 'goatee_circle', hp: 10 });
        expect(getMaxHp(circle)).toBe(20);
        expect(getMaxHp(goatee)).toBe(10);
    });

    it('changing HP leaves the sheet untouched', () => {
        const goatee = newGoatee();
        setHp(goatee, 0);

        expect(ENEMY_SHEETS.goatee_circle.maxHp).toBe(10);
        expect(newGoatee().hp).toBe(10);
    });

    it('looks up each character\'s own basic attack', () => {
        expect(getBasicAttack(newCircle())).toBe(ATTACKS.circle_basic);
        expect(getBasicAttack(newGoatee())).toBe(ATTACKS.goatee_basic);
    });
});

describe('setHp', () => {
    it('clamps above max to max', () => {
        const circle = newCircle();
        setHp(circle, 25);
        expect(circle.hp).toBe(20);
    });

    it('clamps below 0 to 0', () => {
        const circle = newCircle();
        setHp(circle, -3);
        expect(circle.hp).toBe(0);
    });

    it('floors fractions to whole HP', () => {
        const circle = newCircle();
        setHp(circle, 7.9);
        expect(circle.hp).toBe(7);
    });

    it('keeps in-range values', () => {
        const circle = newCircle();
        setHp(circle, 13);
        expect(circle.hp).toBe(13);
    });
});

describe('attacks', () => {
    it('basic attacks do 2 damage without changing anything', () => {
        const circle = newCircle();
        const goatee = newGoatee();

        expect(getAttackDamage(getBasicAttack(circle))).toBe(2);
        expect(getAttackDamage(getBasicAttack(goatee))).toBe(2);
        expect(circle.hp).toBe(20);
        expect(goatee.hp).toBe(10);
    });

    it('one goatee basic attack takes the circle from 20 to 18', () => {
        const circle = newCircle();
        applyAttack(getBasicAttack(newGoatee()), circle);
        expect(circle.hp).toBe(18);
    });

    it('attacking a defeated target keeps it at 0', () => {
        const goatee = newGoatee();
        setHp(goatee, 0);
        applyAttack(ATTACKS.circle_basic, goatee);
        expect(goatee.hp).toBe(0);
    });

    it('negative power does no damage instead of healing', () => {
        const circle = newCircle();
        setHp(circle, 10);
        applyAttack({ id: 'goatee_basic', power: -5 }, circle);

        expect(getAttackDamage({ id: 'goatee_basic', power: -5 })).toBe(0);
        expect(circle.hp).toBe(10);
    });
});

describe('a fight played out by hand', () => {
    it('the circle wins on its 5th hit', () => {
        const circle = newCircle();
        const goatee = newGoatee();
        const attack = getBasicAttack(circle);

        for (let i = 0; i < 4; i += 1) applyAttack(attack, goatee);
        expect(goatee.hp).toBe(2);
        expect(getBattleOutcome([circle], [goatee])).toBe('ongoing');

        applyAttack(attack, goatee);
        expect(goatee.hp).toBe(0);
        expect(isDefeated(goatee)).toBe(true);
        expect(getBattleOutcome([circle], [goatee])).toBe('won');
    });

    it('the circle loses after 10 goatee hits', () => {
        const circle = newCircle();
        const goatee = newGoatee();
        const attack = getBasicAttack(goatee);

        for (let i = 0; i < 9; i += 1) applyAttack(attack, circle);
        expect(getBattleOutcome([circle], [goatee])).toBe('ongoing');

        applyAttack(attack, circle);
        expect(circle.hp).toBe(0);
        expect(getBattleOutcome([circle], [goatee])).toBe('lost');
    });
});

describe('getBattleOutcome', () => {
    it('both sides down is mutual_defeat', () => {
        const circle = newCircle();
        const goatee = newGoatee();
        setHp(circle, 0);
        setHp(goatee, 0);
        expect(getBattleOutcome([circle], [goatee])).toBe('mutual_defeat');
    });

    it('an empty side counts as defeated', () => {
        expect(getBattleOutcome([newCircle()], [])).toBe('won');
        expect(getBattleOutcome([], [newGoatee()])).toBe('lost');
        expect(getBattleOutcome([], [])).toBe('mutual_defeat');
    });

    it('a side with anyone standing is not defeated', () => {
        const downed = newCircle();
        setHp(downed, 0);
        expect(getBattleOutcome([downed, newCircle()], [newGoatee()])).toBe('ongoing');
    });

    it('rejects an enemy on the party side at compile time', () => {
        const party: PartyMember[] = [newCircle()];
        // @ts-expect-error an Enemy is not a PartyMember (kind tag)
        party.push(newGoatee());
        expect(party).toHaveLength(2);
    });
});

describe('isLoss', () => {
    it('lost and mutual_defeat are losses, won and ongoing are not', () => {
        expect(isLoss('lost')).toBe(true);
        expect(isLoss('mutual_defeat')).toBe(true);
        expect(isLoss('won')).toBe(false);
        expect(isLoss('ongoing')).toBe(false);
    });
});
