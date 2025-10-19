import asyncio
from agent_framework.a2a import A2AAgent
from agent_framework import ChatMessage

async def main():
   # Create a message with text
   user_msg = ChatMessage(message_id="test1234", role="user", text="Tell me a joke about rain")
   print("User message: ", user_msg.text)

   # Create A2A agent instance
   agent = A2AAgent(
      name="test-agent",
      description="test-agent-description",
      url="http://localhost:8080/api/v1/dev/aigateway/agents/ai-gk-chatbot/invoke"
   )

   result = await agent.run(messages=user_msg)
   print("Agent Response:\n", result.text)

asyncio.run(main())