import { ChatCompletion } from '../../core/types/messages';

export interface TokenUsage {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    provider?: string;
    metadata?: Record<string, unknown>;
}

export class TokenTracker {
    private readonly budgets = new Map<string, number>();
    private readonly usage = new Map<string, TokenUsage[]>();

    constructor(private defaultBudget?: number) {}

    setBudget(scope: string, tokens: number): void {
        this.budgets.set(scope, tokens);
    }

    record(scope: string, usage: TokenUsage): void {
        if (!this.usage.has(scope)) this.usage.set(scope, []);
        this.usage.get(scope)!.push(usage);
    }

    getTotal(scope: string): number {
        const entries = this.usage.get(scope) || [];
        return entries.reduce((acc, u) => acc + (u.totalTokens || 0), 0);
    }

    withinBudget(scope: string): boolean {
        const budget = this.budgets.get(scope) ?? this.defaultBudget;
        if (budget === undefined) return true;
        return this.getTotal(scope) <= budget;
    }

    applyHook(provider: string, scope: string) {
        return (usage: ChatCompletion['usage']) => {
            if (!usage) return;
            this.record(scope, {
                promptTokens: usage.promptTokens ?? 0,
                completionTokens: usage.completionTokens ?? 0,
                totalTokens: usage.totalTokens ?? 0,
                provider,
                metadata: usage.metadata,
            });
        };
    }
}
