import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCapabilityRegistryFromModelsDev,
  resolveModelLimitsFromCapabilityRegistry,
} from "../model-capability-registry.js";

test("resolveModelLimitsFromCapabilityRegistry prefers provider alias matches", () => {
  const registry = buildCapabilityRegistryFromModelsDev({
    data: {
      "ollama-cloud": {
        name: "Ollama Cloud",
        models: {
          "minimax-m2.7": {
            limit: {
              context: 204800,
              output: 131072,
            },
          },
        },
      },
      openai: {
        name: "OpenAI",
        models: {},
      },
    } as never,
  });

  const limits = resolveModelLimitsFromCapabilityRegistry({
    registry,
    provider: {
      flavor: "ollama",
    },
    modelId: "minimax-m2.7",
  });

  assert.equal(limits?.context, 204800);
  assert.equal(limits?.output, 131072);
});

test("resolveModelLimitsFromCapabilityRegistry falls back to global model match when provider bucket misses", () => {
  const registry = buildCapabilityRegistryFromModelsDev({
    data: {
      openrouter: {
        name: "OpenRouter",
        models: {
          "gpt-5": {
            limit: {
              context: 400000,
              output: 128000,
            },
          },
        },
      },
    } as never,
  });

  const limits = resolveModelLimitsFromCapabilityRegistry({
    registry,
    provider: {
      flavor: "requesty",
    },
    modelId: "gpt-5",
  });

  assert.equal(limits?.context, 400000);
  assert.equal(limits?.output, 128000);
});

test("resolveModelLimitsFromCapabilityRegistry infers minimax provider from baseURL and normalizes model aliases", () => {
  const registry = buildCapabilityRegistryFromModelsDev({
    data: {
      minimax: {
        name: "MiniMax (minimax.io)",
        models: {
          "MiniMax-M2.5": {
            limit: {
              context: 204800,
              output: 131072,
            },
          },
        },
      },
    } as never,
  });

  const limits = resolveModelLimitsFromCapabilityRegistry({
    registry,
    provider: {
      flavor: "openai-compatible",
      baseURL: "https://api.minimax.io/v1",
    },
    modelId: "minimax-m2.5-free",
  });

  assert.equal(limits?.context, 204800);
  assert.equal(limits?.output, 131072);
});

test("resolveModelLimitsFromCapabilityRegistry matches provider-prefixed model ids", () => {
  const registry = buildCapabilityRegistryFromModelsDev({
    data: {
      openai: {
        name: "OpenAI",
        models: {
          "gpt-4.1": {
            limit: {
              context: 1047576,
              output: 32768,
            },
          },
        },
      },
    } as never,
  });

  const limits = resolveModelLimitsFromCapabilityRegistry({
    registry,
    provider: {
      flavor: "openrouter",
    },
    modelId: "openai/gpt-4.1:latest",
  });

  assert.equal(limits?.context, 1047576);
  assert.equal(limits?.output, 32768);
});
