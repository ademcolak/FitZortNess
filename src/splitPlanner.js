const DEFAULT_SPLITS = {
  3: ["Full Body A", "Full Body B", "Full Body C"],
  4: ["Upper A", "Lower A", "Upper B", "Lower B"],
  5: ["Upper", "Lower", "Push", "Pull", "Legs"]
};

export function createWeeklySplit(daysPerWeek, preferredSplit = "") {
  const days = Math.max(3, Math.min(5, Number(daysPerWeek) || 3));
  const preference = String(preferredSplit || "").toLocaleLowerCase("tr-TR");

  if (preference.includes("full")) {
    return Array.from({ length: days }, (_, index) => `Full Body ${letter(index)}`);
  }

  if (preference.includes("upper") || preference.includes("lower")) {
    const counts = { Upper: 0, Lower: 0 };
    return Array.from({ length: days }, (_, index) => {
      const kind = index % 2 === 0 ? "Upper" : "Lower";
      return `${kind} ${letter(counts[kind]++)}`;
    });
  }

  if (preference.includes("push") || preference.includes("pull") || preference.includes("ppl")) {
    return uniqueRepeatedDays(Array.from({ length: days }, (_, index) => ["Push", "Pull", "Legs"][index % 3]));
  }

  return [...DEFAULT_SPLITS[days]];
}

function uniqueRepeatedDays(dayNames) {
  const totals = dayNames.reduce((result, name) => ({ ...result, [name]: (result[name] || 0) + 1 }), {});
  const seen = {};
  return dayNames.map((name) => {
    if (totals[name] === 1) return name;
    seen[name] = (seen[name] || 0) + 1;
    return `${name} ${letter(seen[name] - 1)}`;
  });
}

function letter(index) {
  return String.fromCharCode(65 + index);
}
