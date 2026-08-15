export function formatProgram(program, analysis) {
  const lines = [];
  lines.push(`Program: haftada ${program.days_per_week || program.days?.length || "?"} gun`);
  lines.push("");

  for (const day of program.days || []) {
    lines.push(`${day.name}${day.estimated_duration_min ? ` (~${day.estimated_duration_min} dk)` : ""}`);
    for (const item of day.exercises || []) {
      lines.push(`- ${item.exercise.name}: ${item.sets} set x ${item.reps}, dinlenme ${item.rest_sec || 90} sn`);
    }
    lines.push("");
  }

  if (analysis?.issues?.length) {
    lines.push("Analiz notlari:");
    for (const issue of analysis.issues.slice(0, 5)) {
      lines.push(`- ${issue.muscle}: ${issue.type}, mevcut ${issue.current}, hedef min ${issue.recommended_min}`);
    }
  } else {
    lines.push("Analiz: ana kas gruplari icin belirgin hacim/frekans eksigi bulunmadi.");
  }

  lines.push("");
  const durations = (program.days || []).map((day) => day.estimated_duration_min).filter(Boolean);
  if (durations.length) lines.push(`Ortalama sure: ${Math.round(durations.reduce((sum, item) => sum + item, 0) / durations.length)} dk`);
  lines.push("");
  lines.push("Not: Agri veya sakatlik varsa hareketi durdurup profesyonele danis.");
  return lines.join("\n");
}

export function formatAnalysis(result) {
  const lines = ["Program analiz sonucu:"];
  const issues = result.analysis.issues || [];
  if (!issues.length) {
    lines.push("- Belirgin hacim/frekans eksigi bulunmadi.");
  } else {
    const prioritized = [...issues].sort((a, b) => (b.recommended_min - b.current) - (a.recommended_min - a.current)).slice(0, 4);
    for (const issue of prioritized) {
      const muscle = muscleLabel(issue.muscle);
      lines.push(issue.type === "low_frequency"
        ? `- ${muscle}: haftada ${issue.current} kez calisiyor, en az ${issue.recommended_min} oneriliyor.`
        : `- ${muscle}: haftalik ${issue.current} set, en az ${issue.recommended_min} oneriliyor.`);
    }
  }
  return lines.join("\n");
}

function muscleLabel(muscle) {
  return {
    chest: "Gogus",
    back: "Sirt",
    quads: "On bacak",
    hamstrings: "Arka bacak",
    glutes: "Kalca",
    shoulders: "Omuz",
    biceps: "On kol",
    triceps: "Arka kol",
    abs: "Karin"
  }[muscle] || muscle;
}
