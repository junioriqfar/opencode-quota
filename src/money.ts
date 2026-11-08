export function allocateIdr(
  totalIdr: number,
  members: Array<{ userId: string; cost: number }>,
  totalCost: number,
): Map<string, number> {
  const result = new Map<string, number>();
  if (totalIdr <= 0 || totalCost <= 0) {
    for (const member of members) result.set(member.userId, 0);
    return result;
  }
  const raw = members.map((member) => (member.cost / totalCost) * totalIdr);
  const floors = raw.map((value) => Math.floor(value));
  let remainder = totalIdr - floors.reduce((sum, value) => sum + value, 0);
  const order = raw
    .map((value, index) => ({ index, remainder: value - Math.floor(value) }))
    .sort((a, b) => b.remainder - a.remainder);
  for (const item of order) {
    if (remainder <= 0) break;
    floors[item.index] += 1;
    remainder -= 1;
  }
  members.forEach((member, index) => result.set(member.userId, floors[index] ?? 0));
  return result;
}
