import asyncio
from agent_framework.azure import AzureOpenAIChatClient
from azure.identity import AzureCliCredential

async def main():
    # Set the 'base_url' to the AI Application Gateway load balancer URI
    # https://{host}:{API_GATEWAY_PORT}/api/v1/{API_GATEWAY_ENV}/aigateway/lb
    agent = AzureOpenAIChatClient(
        base_url="https://{host}:{port}/api/v1/dev/aigateway/lb",
        deployment_name="{model-deployment-name}",
        credential=AzureCliCredential()
    ).create_agent(
        instructions="You are good at telling jokes.",
        name="Joker"
    )

    result = await agent.run("Tell me a joke about a pirate.")
    print(result.text)

asyncio.run(main())