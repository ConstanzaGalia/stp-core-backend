import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import type {
  DerivedVariables,
  EvaluationRuleConfig,
  ParsedClause,
  RulesConfigFile,
  TriggeredRule,
} from './analysis.types';

const CLAUSE_RE = /^(\w+)\s*(<=|>=|<|>|==)\s*([\d.]+)$/;

function parseClauses(condition: string): ParsedClause[] {
  const parts = condition.split(/\s+AND\s+/i);
  const clauses: ParsedClause[] = [];
  for (const part of parts) {
    const trimmed = part.trim();
    const m = CLAUSE_RE.exec(trimmed);
    if (!m) {
      throw new Error(`Cannot parse condition clause: "${trimmed}"`);
    }
    clauses.push({
      variable: m[1],
      operator: m[2] as ParsedClause['operator'],
      value: Number(m[3]),
    });
  }
  return clauses;
}

function evaluateClause(clause: ParsedClause, actual: number): boolean {
  switch (clause.operator) {
    case '<':
      return actual < clause.value;
    case '>':
      return actual > clause.value;
    case '<=':
      return actual <= clause.value;
    case '>=':
      return actual >= clause.value;
    case '==':
      return actual === clause.value;
  }
}

@Injectable()
export class RulesEngineService {
  private readonly logger = new Logger(RulesEngineService.name);
  private rules: EvaluationRuleConfig[] = [];
  private parsedConditions = new Map<string, ParsedClause[]>();
  private config: RulesConfigFile | null = null;

  constructor() {
    this.loadRules();
  }

  private resolveRulesPath(): string {
    const candidates = [
      path.join(__dirname, 'rules', 'evaluation-rules.json'),
      path.resolve(__dirname, '..', '..', '..', '..', '..', 'src', 'modules', 'physical-evaluation', 'analysis', 'rules', 'evaluation-rules.json'),
    ];
    for (const p of candidates) {
      if (fs.existsSync(p)) return p;
    }
    return candidates[0];
  }

  private loadRules() {
    const filePath = this.resolveRulesPath();
    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      this.config = JSON.parse(raw) as RulesConfigFile;
      this.rules = this.config.rules;

      for (const rule of this.rules) {
        this.parsedConditions.set(rule.id, parseClauses(rule.condition));
      }

      this.logger.log(
        `Loaded ${this.rules.length} evaluation rules (v${this.config.version})`,
      );
    } catch (err) {
      this.logger.error('Failed to load evaluation rules', (err as Error).stack);
      this.rules = [];
    }
  }

  getConfig(): RulesConfigFile | null {
    return this.config;
  }

  evaluate(derived: DerivedVariables): TriggeredRule[] {
    const vars = derived as unknown as Record<string, number | null>;
    const triggered: TriggeredRule[] = [];

    for (const rule of this.rules) {
      const clauses = this.parsedConditions.get(rule.id);
      if (!clauses?.length) continue;

      let allMatch = true;
      const actualValues: Record<string, number> = {};

      for (const clause of clauses) {
        const val = vars[clause.variable];
        if (val == null) {
          allMatch = false;
          break;
        }
        actualValues[clause.variable] = val;
        if (!evaluateClause(clause, val)) {
          allMatch = false;
          break;
        }
      }

      if (allMatch) {
        triggered.push({ rule, actualValues });
      }
    }

    return triggered;
  }
}
