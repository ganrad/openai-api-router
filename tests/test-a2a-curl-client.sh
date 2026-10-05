curl -X POST http://localhost:8080/api/v1/test/aigateway/agents/ai-multi-domain-agent/invoke \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "message/send",
    "params": {
      "message": {
        "messageId": "test-request-001",
        "role": "user",
        "parts": [
          {
	    "kind": "text",
	    "text": "Get me the account balance and due date for customer 'Ava'. Is there any outage in their area?  Get me this customers billing info. as well."
    	  }
        ],
	"metadata": {
	  "modelParams": {
	    "model": "gpt-5.2"
          }
        }
      }
    },
    "id": 1
  }' | jq .

