# Run the flow
pf flow test --flow .

# Run the flow with an input
pf flow test --flow . --inputs topic="grass"

# Run the flow node with an input
pf flow test --flow . --node llm --inputs prompt="Tell me a joke about anything"
