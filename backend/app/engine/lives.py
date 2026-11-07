"""What makes a synthetic agent live like a person: a job and weekly routine, a household, friends, and memories of visits.

Every value here is a behavioural assumption, not a measurement. Routines average to 1 for each person and experiences
average to 0, so this layer changes who buys and when, without moving total demand by itself.
"""
from __future__ import annotations

import zlib
from dataclasses import dataclass

import numpy as np

OCCUPATIONS = ["student", "office worker", "shift worker", "at home", "retired"]
STUDENT, OFFICE, SHIFT, HOME, RETIRED = range(5)
FRIENDS = 6
LEARNING_RATE = 0.3
EXPERIENCE_SD = 0.8
OPINION_LIMIT = 1.5
OPINION_THRESHOLD = 0.3  # how strongly someone must feel before they talk about it
TALK_RATE = 0.05  # daily chance that a person with a strong opinion raises it with a friend
TALK_EFFECT = 0.1

# Relative visit rate, Monday to Sunday.
_LEISURE = {STUDENT: (.9, .9, .9, 1, 1.2, 1.2, 1), OFFICE: (.7, .7, .75, .85, 1.2, 1.5, 1.3), SHIFT: (1, 1, 1, 1, 1, 1, 1),
            HOME: (1, 1, 1, 1, 1, 1.05, 1), RETIRED: (1.1, 1.1, 1.1, 1.1, 1, .85, .75)}
_ERRAND = {STUDENT: (1, 1, 1, 1, 1, 1.1, 1), OFFICE: (.8, .8, .8, .85, .95, 1.6, 1.2), SHIFT: (1, 1, 1, 1, 1, 1, 1),
           HOME: (1.1, 1.1, 1.1, 1.05, 1, .9, .75), RETIRED: (1.2, 1.2, 1.2, 1.1, 1, .7, .6)}
ROUTINES = {"dine_in": _LEISURE, "takeaway": _LEISURE, "lodging": _LEISURE, "membership": _ERRAND, "retail": _ERRAND, "appointment": _ERRAND}


@dataclass
class Lives:
    occupation: np.ndarray  # [N] index into OCCUPATIONS
    routine: np.ndarray  # [N, 7] personal visit-rate multiplier by weekday, mean 1 per person
    household: np.ndarray  # [N] household id
    friends: np.ndarray  # [N, FRIENDS] agent indices


def assign_occupations(rng: np.random.Generator, age: np.ndarray) -> np.ndarray:
    r = rng.random(age.size)
    return np.select(
        [age < 18, (age < 25) & (r < 0.55), age >= 70, (age >= 62) & (r < 0.6), r < 0.14, r < 0.34],
        [STUDENT, STUDENT, RETIRED, RETIRED, HOME, SHIFT], OFFICE)


def build_routines(rng: np.random.Generator, occupation: np.ndarray, arch_key: str) -> np.ndarray:
    table = ROUTINES.get(arch_key, _ERRAND)
    base = np.array([table[k] for k in range(len(OCCUPATIONS))], float)[occupation]
    r = base * np.exp(rng.normal(0, 0.15, base.shape))  # nobody's week is exactly the template
    return r / r.mean(1, keepdims=True)


def build_households(rng: np.random.Generator, zi: np.ndarray, sizes: np.ndarray) -> np.ndarray:
    """Group the agents of each zone into households, using each first member's household size."""
    household = np.empty(zi.size, int)
    next_id = 0
    for z in np.unique(zi):
        members = rng.permutation(np.flatnonzero(zi == z))
        i = 0
        while i < members.size:
            n = max(1, int(sizes[members[i]]))
            household[members[i:i + n]] = next_id
            next_id += 1
            i += n
    return household


def _pick_within(rng: np.random.Generator, groups: np.ndarray, who: np.ndarray) -> np.ndarray:
    """A random other member of each agent's group, or the agent itself when alone in it."""
    order = np.argsort(groups, kind="stable")
    keys, start, count = np.unique(groups[order], return_index=True, return_counts=True)
    g = np.searchsorted(keys, groups[who])
    pick = order[start[g] + rng.integers(0, count[g])]
    clash = pick == who
    if clash.any():  # step to the next member, wrapping inside the group
        pos = np.empty(groups.size, int)
        pos[order] = np.arange(groups.size)
        offset = (pos[who[clash]] - start[g[clash]] + 1) % count[g[clash]]
        pick[clash] = order[start[g[clash]] + offset]
    return pick


def build_friends(rng: np.random.Generator, zi: np.ndarray, household: np.ndarray) -> np.ndarray:
    """Two ties at home, three in the neighbourhood, and one anywhere in the catchment."""
    n = zi.size
    who = np.arange(n)
    home = [_pick_within(rng, household, who) for _ in range(2)]
    near = [_pick_within(rng, zi, who) for _ in range(3)]
    return np.stack([*home, *near, rng.integers(0, n, n)], 1)


def build(rng: np.random.Generator, zi: np.ndarray, age: np.ndarray, household_size: np.ndarray, arch_key: str) -> Lives:
    occupation = assign_occupations(rng, age)
    household = build_households(rng, zi, household_size)
    return Lives(occupation, build_routines(rng, occupation, arch_key), household, build_friends(rng, zi, household))


def remember_visit(rng: np.random.Generator, opinion: np.ndarray, idx: np.ndarray, business: np.ndarray, crowding: float = 0.0) -> None:
    """Each visit nudges this person's opinion of that business. Crowding at your business makes visits worse."""
    if idx.size == 0:
        return
    felt = rng.normal(0, EXPERIENCE_SD, idx.size) - crowding * (business == 0)
    now = opinion[idx, business]
    opinion[idx, business] = np.clip(now + LEARNING_RATE * (felt - now), -OPINION_LIMIT, OPINION_LIMIT)


def share_opinions(rng: np.random.Generator, opinion: np.ndarray, friends: np.ndarray, talkative: np.ndarray, listening: np.ndarray, customers: np.ndarray) -> None:
    """Customers with strong views tell a friend, so praise and warnings about your business travel person to person."""
    strong = np.abs(opinion[:, 0]) >= OPINION_THRESHOLD
    talkers = np.flatnonzero(customers & strong & (rng.random(customers.size) < TALK_RATE * talkative))
    if talkers.size == 0:
        return
    heard = friends[talkers, rng.integers(0, friends.shape[1], talkers.size)]
    np.add.at(opinion[:, 0], heard, TALK_EFFECT * np.sign(opinion[talkers, 0]) * listening[heard])
    opinion[:, 0] = np.clip(opinion[:, 0], -OPINION_LIMIT, OPINION_LIMIT)


def competitor_spread(names: list[str]) -> tuple[np.ndarray, np.ndarray]:
    """Price multiplier and quality shift for each competitor with no recorded figures, so they are not identical clones.

    Assumption: prices spread about 18% and pricier places tend to be better. Seeded by name, so a business keeps its
    position between runs. The averages are unchanged, which keeps the market's overall price level.
    """
    if not names:
        return np.ones(0), np.zeros(0)
    draws = np.array([np.random.default_rng(zlib.crc32(n.encode("utf-8"))).standard_normal(2) for n in names])
    z_price, z_quality = draws[:, 0], 0.5 * draws[:, 0] + np.sqrt(0.75) * draws[:, 1]
    price = np.exp(0.18 * z_price)
    quality = 0.1 * z_quality
    return price / price.mean(), quality - quality.mean()
