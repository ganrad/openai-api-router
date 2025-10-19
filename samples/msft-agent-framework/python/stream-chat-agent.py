import asyncio
from agent_framework.azure import AzureOpenAIChatClient
from azure.identity import AzureCliCredential

async def main():
    # Set the 'base_url' to the AI Application Gateway load balancer URI
    # https://{host}:{API_GATEWAY_PORT}/api/v1/{API_GATEWAY_ENV}/aigateway/lb

    agent = AzureOpenAIChatClient(
        base_url="https://{host}:{port}/api/v1/dev/aigateway/lb",
        deployment_name="ai-gk-chatbot",
        credential=AzureCliCredential()
    ).create_agent(
        instructions="You are good at telling great stories.",
        name="StoryTeller",
        max_tokens=1000,
        temperature=0.7
    )

    print("Agent: ", end="", flush=True)
    async for chunk in agent.run_stream("Tell me a short story about a robot"):
      if chunk.text:
        print(chunk.text, end="", flush=True)
    print()

asyncio.run(main())