import asyncio
import httpx
from a2a.client import A2ACardResolver
from agent_framework.a2a import A2AAgent
from agent_framework import ChatMessage

async def main():
   # Create httpx client for HTTP communication
   async with httpx.AsyncClient(timeout=60.0) as http_client:
      resolver = A2ACardResolver(httpx_client=http_client, base_url="http://localhost:8080/api/v1/dev/aigateway/agents")

      # Get agent card from the well-known location
      agent_card = await resolver.get_agent_card(relative_card_path="/.well-known/{agent-name}.json")

      # Create A2A agent instance
      agent = A2AAgent(
         name=agent_card.name,
         description=agent_card.description,
         agent_card=agent_card
      )

      # Create a message with text
      user_msg = ChatMessage(message_id="test1234", role="user", text="Tell me a story about boats")
      print("User message: ", user_msg.text)

      print("Agent Response: ", end="", flush=True)
      async for chunk in agent.run_stream(messages=user_msg):
         if chunk.text:
            print(chunk.text, end="", flush=True)
      print()

asyncio.run(main())