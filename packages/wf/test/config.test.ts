import { describe, expect, it } from "vitest";
import { InMemoryWorkflowStepRegistry } from "../src";
import { WfConfigError, defineWfConfig } from "../src/config";

interface NameEnvironment {
  name: string;
}

interface RegionEnvironment {
  region: string;
}

describe("defineWfConfig", () => {
  it("creates a single lazy runtime and closes it exactly once", async () => {
    const created: string[] = [];
    const closed: unknown[] = [];
    const config = defineWfConfig<NameEnvironment, { name: string }>({
      createRuntime: ({ profile, env }) => {
        created.push(`${profile}:${env.name}`);
        return { name: env.name };
      },
    });

    expect(created).toEqual([]);
    expect(config.defaultProfile).toBe("default");
    expect(config.profiles).toEqual(["default"]);

    const handle = await config.createRuntime({
      env: { name: "application" },
    });
    expect(created).toEqual(["default:application"]);
    expect(handle.runtime).toEqual({ name: "application" });

    await handle.close();
    await handle.close();
    expect(closed).toEqual([]);
  });

  it("exposes the shared workflow catalog without creating runtime resources", () => {
    const registry = new InMemoryWorkflowStepRegistry();
    const workflows = { orders: { id: "orders", version: 1 } };
    const config = defineWfConfig<
      NameEnvironment,
      { name: string },
      typeof workflows
    >({
      registry,
      workflows,
      createRuntime: () => ({ name: "application" }),
    });

    expect(config.registry).toBe(registry);
    expect(config.workflows).toBe(workflows);
  });

  it("supports named profiles and explicit disposal", async () => {
    const disposed: string[] = [];
    const config = defineWfConfig<
      RegionEnvironment,
      { profile: string; region: string }
    >({
      defaultProfile: "production",
      profiles: {
        development: ({ profile }) => ({ profile, region: "development" }),
        production: {
          create: ({ profile, env }) => ({ profile, region: env.region }),
          dispose: (runtime) => {
            disposed.push(`${runtime.profile}:${runtime.region}`);
          },
        },
      },
    });

    const handle = await config.createRuntime({
      env: { region: "eu-west-1" },
    });
    expect(handle.profile).toBe("production");
    expect(handle.runtime).toEqual({
      profile: "production",
      region: "eu-west-1",
    });

    await handle.close();
    await handle.close();
    expect(disposed).toEqual(["production:eu-west-1"]);
  });

  it("passes an abort signal to factories and rejects an aborted runtime", async () => {
    const controller = new AbortController();
    controller.abort();
    const config = defineWfConfig({
      createRuntime: () => ({ ok: true }),
    });

    await expect(
      config.createRuntime({ signal: controller.signal }),
    ).rejects.toMatchObject({
      name: "WfConfigError",
      code: "WF_RUNTIME_ABORTED",
    });
  });

  it("cleans up a runtime when cancellation arrives during creation", async () => {
    const controller = new AbortController();
    const disposed: string[] = [];
    const config = defineWfConfig({
      profiles: {
        production: {
          create: async () => {
            await Promise.resolve();
            controller.abort();
            return { connection: "postgres" };
          },
          dispose: (runtime) => {
            disposed.push(runtime.connection);
          },
        },
      },
    });

    await expect(
      config.createRuntime({
        profile: "production",
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ code: "WF_RUNTIME_ABORTED" });
    expect(disposed).toEqual(["postgres"]);
  });

  it("rejects invalid configurations and unknown profiles", async () => {
    expect(() => defineWfConfig({})).toThrow(WfConfigError);
    expect(() =>
      defineWfConfig({
        createRuntime: () => ({}),
        profiles: { development: () => ({}) },
      }),
    ).toThrow("exactly one of createRuntime or profiles");
    expect(() =>
      defineWfConfig({
        profiles: { development: () => ({}) },
        defaultProfile: "production",
      }),
    ).toThrow("Unknown default workflow runtime profile");

    const config = defineWfConfig({
      profiles: { development: () => ({}) },
    });
    await expect(
      config.createRuntime({ profile: "production" }),
    ).rejects.toMatchObject({
      code: "WF_PROFILE_NOT_FOUND",
    });

    expect(() =>
      defineWfConfig({
        profiles: { broken: null as never },
      }),
    ).toThrow(WfConfigError);
  });

  it("does not create a connection when a factory rejects", async () => {
    const config = defineWfConfig({
      createRuntime: async () => {
        throw new Error("connection refused");
      },
    });

    await expect(config.createRuntime()).rejects.toThrow("connection refused");
  });
});
