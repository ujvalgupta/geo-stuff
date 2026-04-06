export interface RobotsEvaluation {
  allowed: boolean;
  matchedRule?: string;
}

interface Rule {
  pattern: string;
  allow: boolean;
}

export function parseRobotsForUserAgent(
  content: string,
  requestedUserAgent: string,
): Rule[] {
  const lines = content.split(/\r?\n/);
  const rules: Rule[] = [];
  let applies = false;

  for (const rawLine of lines) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) {
      continue;
    }

    const separatorIndex = line.indexOf(":");
    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim().toLowerCase();
    const value = line.slice(separatorIndex + 1).trim();
    if (!value) {
      continue;
    }

    if (key === "user-agent") {
      const normalized = value.toLowerCase();
      applies =
        normalized === "*" ||
        requestedUserAgent.toLowerCase().includes(normalized);
      continue;
    }

    if (!applies) {
      continue;
    }

    if (key === "allow" || key === "disallow") {
      rules.push({
        pattern: value,
        allow: key === "allow",
      });
    }
  }

  return rules;
}

export function evaluateRobotsAccess(
  content: string,
  requestedUserAgent: string,
  path: string,
): RobotsEvaluation {
  const rules = parseRobotsForUserAgent(content, requestedUserAgent).filter(
    (rule) => rule.pattern !== "",
  );

  let bestMatch: Rule | undefined;
  for (const rule of rules) {
    if (path.startsWith(rule.pattern)) {
      if (!bestMatch || rule.pattern.length > bestMatch.pattern.length) {
        bestMatch = rule;
      }
    }
  }

  if (!bestMatch) {
    return { allowed: true };
  }

  return {
    allowed: bestMatch.allow,
    matchedRule: `${bestMatch.allow ? "Allow" : "Disallow"}: ${bestMatch.pattern}`,
  };
}
