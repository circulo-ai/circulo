#!/usr/bin/env node
/**
 * Production-ready CLI tool demonstrating all SDK features
 * Place in: examples/cli/cli.ts
 */

import { Command } from "commander";
import * as readline from "readline";
import * as fs from "fs/promises";
import * as path from "path";
import chalk from "chalk";
import ora from "ora";
import "dotenv/config";

import { AgentOrchestrator } from "./orchestrator";
import { StorageManager } from "./storage";
import { setupMCPServers } from "./mcp-setup";
import { ConversationManager } from "./conversation";
import { SchedulerManager } from "./scheduler";
import { ApprovalServer } from "./approval-server";

const CONFIG_DIR = path.join(
  process.env.HOME || process.env.USERPROFILE || ".",
  ".ai-cli"
);
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");
const DATA_DIR = path.join(CONFIG_DIR, "data");

interface CLIConfig {
  openaiKey?: string;
  anthropicKey?: string;
  geminiKey?: string;
  defaultModel: string;
  defaultProvider: "openai" | "anthropic" | "gemini" | "google";
  dataDir: string;
  approvalRequired: boolean;
  maxRetries: number;
}

class AICli {
  private orchestrator?: AgentOrchestrator;
  private storage?: StorageManager;
  private conversation?: ConversationManager;
  private scheduler?: SchedulerManager;
  private approvalServer?: ApprovalServer;
  private config: CLIConfig;

  constructor() {
    this.config = {
      defaultModel: "gemini-2.5-flash",
      defaultProvider: "gemini",
      dataDir: DATA_DIR,
      approvalRequired: false,
      maxRetries: 3,
    };
  }

  async initialize(): Promise<void> {
    await this.ensureConfigDir();
    await this.loadConfig();

    // Initialize storage
    this.storage = new StorageManager(this.config.dataDir);
    await this.storage.initialize();

    // Initialize conversation manager
    this.conversation = new ConversationManager(this.storage);

    // Initialize scheduler
    this.scheduler = new SchedulerManager(this.storage);

    // Initialize approval server if required
    if (this.config.approvalRequired) {
      this.approvalServer = new ApprovalServer(this.storage, 3001);
      await this.approvalServer.start();
      console.log(
        chalk.yellow("✓ Approval server started on http://localhost:3001")
      );
    }

    // Initialize orchestrator with all agents and tools
    this.orchestrator = new AgentOrchestrator({
      storage: this.storage,
      config: this.config,
      approvalManager: this.approvalServer?.getApprovalManager(),
    });

    await this.orchestrator.initialize();

    // Setup MCP servers
    await setupMCPServers(this.orchestrator);

    console.log(chalk.green("✓ AI CLI initialized successfully"));
  }

  private async ensureConfigDir(): Promise<void> {
    await fs.mkdir(CONFIG_DIR, { recursive: true });
    await fs.mkdir(DATA_DIR, { recursive: true });
  }

  private async loadConfig(): Promise<void> {
    try {
      const data = await fs.readFile(CONFIG_FILE, "utf-8");
      this.config = { ...this.config, ...JSON.parse(data) };
    } catch {
      await this.saveConfig();
    }
  }

  private async saveConfig(): Promise<void> {
    await fs.writeFile(CONFIG_FILE, JSON.stringify(this.config, null, 2));
  }

  async configure(options: Partial<CLIConfig>): Promise<void> {
    this.config = { ...this.config, ...options };
    await this.saveConfig();
    console.log(chalk.green("✓ Configuration saved"));
  }





  async chat(options: {
    model?: string;
    stream?: boolean;
    agent?: string;
  }): Promise<void> {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    console.log(
      chalk.blue("\n?? AI Chat Mode (type \"exit\" to quit, \"clear\" to clear history)\n")
    );

    const conversationId = await this.conversation!.createConversation(
      "CLI Chat"
    );

    await new Promise<void>((resolve) => {
      const prompt = () => {
        rl.question(chalk.cyan("You: "), async (input) => {
          const trimmed = input.trim().toLowerCase();
          if (trimmed === "exit") {
            rl.close();
            return;
          }

          if (trimmed === "clear") {
            await this.conversation!.clearHistory(conversationId);
            console.log(chalk.yellow("Conversation history cleared\n"));
            prompt();
            return;
          }

          if (!trimmed) {
            prompt();
            return;
          }

          await this.conversation!.addMessage(conversationId, {
            role: "user",
            content: input,
          });

          const spinner = ora("Thinking...").start();

          try {
            if (options.stream) {
              spinner.stop();
              process.stdout.write(chalk.green("AI: "));

              const response = await this.orchestrator!.executeStream({
                conversationId,
                input,
                agentId: options.agent,
              });

              let fullResponse = "";
              for await (const chunk of response) {
                process.stdout.write(chunk);
                fullResponse += chunk;
              }
              console.log("\n");

              await this.conversation!.addMessage(conversationId, {
                role: "assistant",
                content: fullResponse,
              });
            } else {
              const response = await this.orchestrator!.execute({
                conversationId,
                input,
                agentId: options.agent,
              });

              spinner.stop();
              console.log(chalk.green(`AI: ${response.content}\n`));

              if (response.toolCalls && response.toolCalls.length > 0) {
                console.log(
                  chalk.gray(
                    `Used tools: ${response.toolCalls
                      .map((t) => t.name)
                      .join(", ")}\n`
                  )
                );
              }

              await this.conversation!.addMessage(conversationId, {
                role: "assistant",
                content: response.content,
              });
            }
          } catch (error) {
            spinner.stop();
            console.error(
              chalk.red(
                `Error: ${
                  error instanceof Error ? error.message : String(error)
                }\n`
              )
            );
          }

          prompt();
        });
      };

      rl.on("close", () => resolve());
      prompt();
    });
  }

async executeTask(
    taskDescription: string,
    options: {
      strategy?: "sequential" | "parallel" | "consensus";
      agents?: string[];
      approval?: boolean;
      output?: string;
    }
  ): Promise<void> {
    console.log(chalk.blue(`\n🎯 Executing task: ${taskDescription}\n`));

    const spinner = ora("Processing...").start();

    try {
      const result = await this.orchestrator!.executeMultiAgent({
        goal: taskDescription,
        strategy: options.strategy || "sequential",
        agentIds: options.agents,
        requiresApproval: options.approval || this.config.approvalRequired,
      });

      spinner.succeed("Task completed");

      console.log(chalk.green("\n📊 Results:\n"));
      result.results.forEach((r, i) => {
        console.log(chalk.bold(`Agent ${i + 1} (${r.agentId}):`));
        console.log(`  Success: ${r.success ? "✓" : "✗"}`);
        console.log(`  Duration: ${r.durationMs}ms`);
        if (r.result) {
          console.log(`  Output: ${r.result.completion.substring(0, 200)}...`);
        }
        if (r.error) {
          console.log(chalk.red(`  Error: ${r.error}`));
        }
        console.log();
      });

      if (options.output) {
        const outputData = {
          task: taskDescription,
          timestamp: new Date().toISOString(),
          results: result.results,
        };
        await fs.writeFile(options.output, JSON.stringify(outputData, null, 2));
        console.log(chalk.green(`✓ Results saved to ${options.output}`));
      }
    } catch (error) {
      spinner.fail("Task failed");
      console.error(
        chalk.red(
          `Error: ${error instanceof Error ? error.message : String(error)}`
        )
      );
      throw error;
    }
  }

  async scheduleTask(
    taskDescription: string,
    options: {
      cron?: string;
      at?: string;
      interval?: number;
      agent?: string;
    }
  ): Promise<void> {
    console.log(chalk.blue(`\n⏰ Scheduling task: ${taskDescription}\n`));

    const taskId = await this.scheduler!.schedule({
      description: taskDescription,
      cron: options.cron,
      at: options.at,
      intervalMs: options.interval,
      agentId: options.agent,
    });

    console.log(chalk.green(`✓ Task scheduled with ID: ${taskId}`));

    if (options.cron) {
      console.log(chalk.gray(`  Cron: ${options.cron}`));
    }
    if (options.at) {
      console.log(chalk.gray(`  Execute at: ${options.at}`));
    }
    if (options.interval) {
      console.log(chalk.gray(`  Interval: ${options.interval}ms`));
    }
  }

  async listScheduledTasks(): Promise<void> {
    const tasks = await this.scheduler!.listTasks();

    if (tasks.length === 0) {
      console.log(chalk.yellow("No scheduled tasks"));
      return;
    }

    console.log(chalk.blue("\n📅 Scheduled Tasks:\n"));
    tasks.forEach((task) => {
      console.log(chalk.bold(`${task.id}:`));
      console.log(`  Description: ${task.description}`);
      console.log(`  Status: ${task.status}`);
      if (task.cron) console.log(`  Cron: ${task.cron}`);
      if (task.nextRun)
        console.log(`  Next run: ${new Date(task.nextRun).toLocaleString()}`);
      console.log();
    });
  }

  async listAgents(): Promise<void> {
    const agents = this.orchestrator!.listAgents();

    console.log(chalk.blue("\n🤖 Available Agents:\n"));
    agents.forEach((agent) => {
      console.log(chalk.bold(`${agent.id}:`));
      console.log(`  Name: ${agent.name}`);
      console.log(`  Description: ${agent.description}`);
      console.log(`  Tools: ${agent.toolNames?.join(", ") || "none"}`);
      console.log();
    });
  }

  async listTools(): Promise<void> {
    const tools = this.orchestrator!.listTools();

    console.log(chalk.blue("\n🔧 Available Tools:\n"));
    tools.forEach((tool) => {
      console.log(chalk.bold(`${tool.name}:`));
      console.log(`  Description: ${tool.description}`);
      console.log();
    });
  }

  async showStats(): Promise<void> {
    const stats = await this.storage!.getStats();

    console.log(chalk.blue("\n📊 Statistics:\n"));
    console.log(`Conversations: ${stats.conversations}`);
    console.log(`Messages: ${stats.messages}`);
    console.log(`Tasks Completed: ${stats.tasksCompleted}`);
    console.log(`Total Tokens Used: ${stats.totalTokens}`);
    console.log(
      `Storage Size: ${(stats.storageBytes / 1024 / 1024).toFixed(2)} MB`
    );
  }

  async exportConversation(
    conversationId: string,
    outputPath: string
  ): Promise<void> {
    const messages = await this.conversation!.getMessages(conversationId);
    const data = {
      conversationId,
      exportedAt: new Date().toISOString(),
      messages,
    };

    await fs.writeFile(outputPath, JSON.stringify(data, null, 2));
    console.log(chalk.green(`✓ Conversation exported to ${outputPath}`));
  }

  async cleanup(): Promise<void> {
    if (this.approvalServer) {
      await this.approvalServer.stop();
    }
    if (this.scheduler) {
      await this.scheduler.stop();
    }
    console.log(chalk.green("\n✓ Cleanup complete"));
  }
}

// CLI Commands Setup
const program = new Command();

program
  .name("ai-cli")
  .description("Production-ready AI CLI with multi-agent orchestration")
  .version("1.0.0");

// Configure command
program
  .command("configure")
  .description("Configure the CLI tool")
  .option("--openai-key <key>", "OpenAI API key")
  .option("--anthropic-key <key>", "Anthropic API key")
  .option("--gemini-key <key>", "Gemini API key")
  .option("--model <model>", "Default model")
  .option("--provider <provider>", "Default provider (gemini|openai|anthropic)")
  .option("--approval", "Require approval for all tasks")
  .action(async (options) => {
    const cli = new AICli();
    await cli.initialize();
    await cli.configure(options);
    await cli.cleanup();
  });

// Chat command
program
  .command("chat")
  .description("Start interactive chat session")
  .option("-m, --model <model>", "Model to use")
  .option("-s, --stream", "Stream responses")
  .option("-a, --agent <agent>", "Use specific agent")
  .action(async (options) => {
    const cli = new AICli();
    await cli.initialize();
    await cli.chat(options);
    await cli.cleanup();
  });

// Execute command
program
  .command("execute <task>")
  .description("Execute a task with multi-agent orchestration")
  .option(
    "-s, --strategy <strategy>",
    "Orchestration strategy (sequential|parallel|consensus)",
    "sequential"
  )
  .option("-a, --agents <agents...>", "Specific agents to use")
  .option("--approval", "Require approval")
  .option("-o, --output <file>", "Output file for results")
  .action(async (task, options) => {
    const cli = new AICli();
    await cli.initialize();
    await cli.executeTask(task, options);
    await cli.cleanup();
  });

// Schedule command
program
  .command("schedule <task>")
  .description("Schedule a task for later execution")
  .option("--cron <expression>", "Cron expression")
  .option("--at <datetime>", "Execute at specific time")
  .option("--interval <ms>", "Repeat interval in milliseconds", parseInt)
  .option("-a, --agent <agent>", "Agent to use")
  .action(async (task, options) => {
    const cli = new AICli();
    await cli.initialize();
    await cli.scheduleTask(task, options);
    await cli.cleanup();
  });

// List commands
program
  .command("list <type>")
  .description("List agents, tools, or scheduled tasks")
  .action(async (type) => {
    const cli = new AICli();
    await cli.initialize();

    switch (type) {
      case "agents":
        await cli.listAgents();
        break;
      case "tools":
        await cli.listTools();
        break;
      case "tasks":
        await cli.listScheduledTasks();
        break;
      default:
        console.error(chalk.red(`Unknown type: ${type}`));
    }

    await cli.cleanup();
  });

// Stats command
program
  .command("stats")
  .description("Show usage statistics")
  .action(async () => {
    const cli = new AICli();
    await cli.initialize();
    await cli.showStats();
    await cli.cleanup();
  });

// Export command
program
  .command("export <conversationId> <outputPath>")
  .description("Export conversation to file")
  .action(async (conversationId, outputPath) => {
    const cli = new AICli();
    await cli.initialize();
    await cli.exportConversation(conversationId, outputPath);
    await cli.cleanup();
  });

// Error handling
process.on("uncaughtException", (error) => {
  console.error(chalk.red("\n❌ Uncaught exception:"), error);
  process.exit(1);
});

process.on("unhandledRejection", (error) => {
  console.error(chalk.red("\n❌ Unhandled rejection:"), error);
  process.exit(1);
});

// Run CLI
program.parse();




