const { TOOL_PLAN_SCHEMA } = require("./tool-execution-engine");

function buildToolPlanningPrompt({
  userQuery,
  tools,
  toolPlanSchema = TOOL_PLAN_SCHEMA
}) {
  if (
    typeof userQuery !== "string" ||
    userQuery.trim().length === 0
  ) {
    throw new Error(
      "userQuery must be a non-empty string."
    );
  }

  if (!Array.isArray(tools)) {
    throw new Error(
      "tools must be an array."
    );
  }

  const systemPrompt = `
You are a tool planner for an enterprise AI agent.

Your sole responsibility is to generate a Tool Execution Plan.

You DO NOT execute tools.
You DO NOT answer the user.
You ONLY return a JSON Tool Execution Plan.

The generated plan MUST conform exactly to the provided Tool Execution Plan JSON Schema.

All tool identifiers are provided in the form:

remote_server_name|tool_name

Use these identifiers exactly as supplied.

Each plan node must have a unique planner-generated node ID:

tool-1
tool-2
tool-3

A node ID is NOT a tool identifier.

Planning Rules

1. Select only tools necessary to answer the user request.

2. Use dependsOn to express dependencies.

3. Use literal JSON values whenever possible.

4. Never embed references inside strings.

INCORRECT:

{
  "customerId": "{tool-1.output.customerId}"
}

CORRECT:

{
  "customerId": {
    "$from": "tool-1",
    "path": "customerId"
  }
}

5. Use "$from" references for dependency outputs.

Example:

{
  "$from": "tool-1",
  "path": "matches[0].customerId"
}

6. Use forEach for fan-out execution.

Example:

{
  "source": {
    "$from": "tool-2",
    "path": "accounts"
  },
  "as": "account",
  "maxConcurrency": 20
}

7. Use "$var" for loop variables.

Example:

{
  "accountId": {
    "$var": "account.accountId"
  }
}

8. If referencing results from a fanned-out node outside a forEach context, collect is required.

Example:

{
  "$from": "tool-5",
  "path": "customerId",
  "collect": "list"
}

9. Do not invent parameter names or values.

10. Use input schemas to construct parameters.  Double check and validate parameters.

11. Use output schemas to determine valid paths. Double check and validate paths.

12. CRITICAL: Only include the absolute minimum required tools to satisfy the request. Do not include optional, predictive, or speculative tool steps.

13. If no suitable tools exist, return:

{
  "planVersion": "1.0",
  "reason": "No suitable tools found.",
  "nodes": []
}

Return JSON only.
Do not emit markdown.
Do not emit explanations.
Do not emit code fences.
`.trim();

  const userPrompt = `
USER QUERY

${userQuery}

AVAILABLE TOOLS

${JSON.stringify(tools, null, 2)}

TOOL EXECUTION PLAN JSON SCHEMA

${JSON.stringify(toolPlanSchema, null, 2)}

Generate the smallest valid execution plan.
`.trim();

  return {
    systemPrompt,
    userPrompt
  };
}

function buildOpenAIPlannerRequest({
  model,
  systemPrompt,
  userPrompt,
  toolPlanSchema = TOOL_PLAN_SCHEMA
}) {
  return {
    model,
    input: [
      {
        role: "system",
        content: [
          {
            type: "input_text",
            text: systemPrompt
          }
        ]
      },
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: userPrompt
          }
        ]
      }
    ],
    reasoning: {
      effort: "medium"
    },
    text: {
      verbosity: "low",
      format: {
        type: "json_schema",
        name: "tool_execution_plan",
        strict: true,
        schema: toolPlanSchema
      }
    },
    max_output_tokens: 16000
  };
}

function buildAnthropicPlannerRequest({
  model,
  systemPrompt,
  userPrompt,
  toolPlanSchema = TOOL_PLAN_SCHEMA
}) {
  return {
    model,
    max_tokens: 16000,
    system: systemPrompt,
    messages: [
      {
        role: "user",
        content: userPrompt
      }
    ],
    thinking: {
      type: "adaptive"
    },
    output_config: {
      effort: "medium",
      format: {
        type: "json_schema",
        schema: toolPlanSchema
      }
    }
  };
}

// Provider neutral planner flow
async function createAndValidateToolPlan({
  provider,
  model,
  userQuery,
  tools,
  openai,
  anthropic,
  executor
}) {
  const {
    systemPrompt,
    userPrompt
  } = buildToolPlanningPrompt({
    userQuery,
    tools,
    toolPlanSchema: TOOL_PLAN_SCHEMA
  });

  let toolPlan;

  if (provider === "openai") {
    const response = await openai.responses.create(
      buildOpenAIPlannerRequest({
        model,
        systemPrompt,
        userPrompt,
        toolPlanSchema: TOOL_PLAN_SCHEMA
      })
    );

    toolPlan = JSON.parse(response.output_text);
  } else if (provider === "anthropic") {
    const response =
      await anthropic.messages.create(
        buildAnthropicPlannerRequest({
          model,
          systemPrompt,
          userPrompt,
          toolPlanSchema: TOOL_PLAN_SCHEMA
        })
      );

    const textBlock = response.content.find(
      (block) => block.type === "text"
    );

    if (!textBlock) {
      throw new Error(
        "Anthropic planner response did not contain JSON text."
      );
    }

    toolPlan = JSON.parse(textBlock.text);
  } else {
    throw new Error(
      `Unsupported planner provider '${provider}'.`
    );
  }

  executor.validatePlan(toolPlan);
  executor.validatePlanSemantics(toolPlan);

  return toolPlan;
}

module.exports = {
  buildToolPlanningPrompt
}