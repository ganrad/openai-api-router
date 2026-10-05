# curl https://oai-gr-dev.openai.azure.com/openai/deployments/dev-gpt35-turbo-vnstruct/completions?api-version=2023-05-15 \
# -H "api-key: 9eca9ec" \

i=1
while [ $i -le 5 ]
do
  curl -v http://$1:$2/api/v1/dev/apirouter/lb/aidocusearchapp -H "Content-Type: application/json" -d "{\"prompt\": \"Give me a summary of Alice in wonderland\", \"max_tokens\": 500, \"user\": \"ganeshra\"}" | jq .
  curl -v http://$1:$2/api/v1/dev/apirouter/lb/aidocusearchapp -H "Content-Type: application/json" -d "{\"prompt\": \"Who is the current world record holder for 100 meters field event?\", \"max_tokens\": 500, \"user\": \"ganeshra\"}" | jq .
  curl -v http://$1:$2/api/v1/dev/apirouter/lb/aidocusearchapp -H "Content-Type: application/json" -d "{\"prompt\": \"How does a television work?\", \"max_tokens\": 500}" | jq .
  curl -v http://$1:$2/api/v1/dev/apirouter/lb/aidocusearchapp -H "Content-Type: application/json" -d "{\"prompt\": \"What is the basic principal of an aircraft engine\", \"max_tokens\": 500}" | jq .
  curl -v http://$1:$2/api/v1/dev/apirouter/lb/aidocusearchapp -H "Content-Type: application/json" -d "{\"prompt\": \"What is the story behind the discovery of oil?\", \"max_tokens\": 500}" | jq .
  curl -v http://$1:$2/api/v1/dev/apirouter/lb/aidocusearchapp -H "Content-Type: application/json" -d "{\"prompt\": \"who are the top philanthropists?\", \"max_tokens\": 500}" | jq .
  #sleep 25
  curl -v http://$1:$2/api/v1/dev/apirouter/lb/aidocusearchapp -H "Content-Type: application/json" -d "{\"prompt\": \"Is Windows or Mac better for doing software development work?  What do developers prefer in general?\", \"max_tokens\": 500}" | jq .
  curl -v http://$1:$2/api/v1/dev/apirouter/lb/aidocusearchapp -H "Content-Type: application/json" -d "{\"prompt\": \"What are the key differences between a gasoline and diesel engine\", \"max_tokens\": 500}" | jq .
  curl -v http://$1:$2/api/v1/dev/apirouter/lb/aidocusearchapp -H "Content-Type: application/json" -d "{\"prompt\": \"How is cement manufactured and what chemicals are used in its manufacturing?\", \"max_tokens\": 500}" | jq .
  curl -v http://$1:$2/api/v1/dev/apirouter/lb/aidocusearchapp -H "Content-Type: application/json" -d "{\"prompt\": \"Is a Honda Accord or Toyota Camry better?\", \"max_tokens\": 500}" | jq .
  #sleep 15
  curl -v http://$1:$2/api/v1/dev/apirouter/lb/aidocusearchapp -H "Content-Type: application/json" -d "{\"prompt\": \"How does a rocket enginer work?\", \"max_tokens\": 500}" | jq .
  curl -v http://$1:$2/api/v1/dev/apirouter/lb/aidocusearchapp -H "Content-Type: application/json" -d "{\"prompt\": \"Who are the super powers in the world today?\", \"max_tokens\": 500}" | jq .
  curl -v http://$1:$2/api/v1/dev/apirouter/lb/aidocusearchapp -H "Content-Type: application/json" -d "{\"prompt\": \"Who are the top IT system integrators in the world?\", \"max_tokens\": 500}" | jq .
  curl -v http://$1:$2/api/v1/dev/apirouter/lb/aidocusearchapp -H "Content-Type: application/json" -d "{\"prompt\": \"Top programming language for systems programming?\", \"max_tokens\": 500}" | jq .
  #sleep 25
  curl -v http://$1:$2/api/v1/dev/apirouter/lb/aidocusearchapp -H "Content-Type: application/json" -d "{\"prompt\": \"Summarize the reason for world war II.  Who or which country was responsible to ignite the war?\", \"max_tokens\": 500}" | jq .
  curl -v http://$1:$2/api/v1/dev/apirouter/lb/aidocusearchapp -H "Content-Type: application/json" -d "{\"prompt\": \"Who was Mahatma Gandhi?\", \"max_tokens\": 500}" | jq .
  curl -v http://$1:$2/api/v1/dev/apirouter/lb/aidocusearchapp -H "Content-Type: application/json" -d "{\"prompt\": \"Are Mahatma Gandhi and Indira Gandhi related?  If so how?\", \"max_tokens\": 500}" | jq .
  curl -v http://$1:$2/api/v1/dev/apirouter/lb/aidocusearchapp -H "Content-Type: application/json" -d "{\"prompt\": \"Where is Amristsar in India?\", \"max_tokens\": 500}" | jq .
  curl -v http://$1:$2/api/v1/dev/apirouter/lb/aidocusearchapp -H "Content-Type: application/json" -d "{\"prompt\": \"Highest motorable road in the world?\", \"max_tokens\": 500}" | jq .
  curl -v http://$1:$2/api/v1/dev/apirouter/lb/aidocusearchapp -H "Content-Type: application/json" -d "{\"prompt\": \"Who was the defense secretary during George W Bush Junior's presidency?\", \"max_tokens\": 500}" | jq .
  #sleep 25
  curl -v http://$1:$2/api/v1/dev/apirouter/lb/aidocusearchapp -H "Content-Type: application/json" -d "{\"prompt\": \"Who was the founder of Tata Motors?\", \"max_tokens\": 500}" | jq .
  curl -v http://$1:$2/api/v1/dev/apirouter/lb/aidocusearchapp -H "Content-Type: application/json" -d "{\"prompt\": \"Write a poem on flowers\", \"max_tokens\": 500}" | jq .
  curl -v http://$1:$2/api/v1/dev/apirouter/lb/aidocusearchapp -H "Content-Type: application/json" -d "{\"prompt\": \"Explain the game of Cricket?\", \"max_tokens\": 500}" | jq .
  curl -v http://$1:$2/api/v1/dev/apirouter/lb/aidocusearchapp -H "Content-Type: application/json" -d "{\"prompt\": \"Who are the GOATs of Soccer?\", \"max_tokens\": 500}" | jq .
  curl -v http://$1:$2/api/v1/dev/apirouter/lb/aidocusearchapp -H "Content-Type: application/json" -d "{\"prompt\": \"Who was the inventor of the automobile\", \"max_tokens\": 500}" | jq .
  #sleep 25
  curl -v http://$1:$2/api/v1/dev/apirouter/lb/aidocusearchapp -H "Content-Type: application/json" -d "{\"prompt\": \"What does the company Tesla do?\", \"max_tokens\": 500}" | jq .
  curl -v http://$1:$2/api/v1/dev/apirouter/lb/aidocusearchapp -H "Content-Type: application/json" -d "{\"prompt\": \"Name the first presient of India\", \"max_tokens\": 500}" | jq .
  curl -v http://$1:$2/api/v1/dev/apirouter/lb/aidocusearchapp -H "Content-Type: application/json" -d "{\"prompt\": \"What happened to MH370?\", \"max_tokens\": 500}" | jq .
  curl -v http://$1:$2/api/v1/dev/apirouter/lb/aidocusearchapp -H "Content-Type: application/json" -d "{\"prompt\": \"Describe solitude\", \"max_tokens\": 500}" | jq .
  curl -v http://$1:$2/api/v1/dev/apirouter/lb/aidocusearchapp -H "Content-Type: application/json" -d "{\"prompt\": \"What is color blindness?\", \"max_tokens\": 500}" | jq .
  #sleep 25
  curl -v http://$1:$2/api/v1/dev/apirouter/lb/aidocusearchapp -H "Content-Type: application/json" -d "{\"prompt\": \"Where is Honda Type R manufactured?\", \"max_tokens\": 500}" | jq .
  curl -v http://$1:$2/api/v1/dev/apirouter/lb/aidocusearchapp -H "Content-Type: application/json" -d "{\"prompt\": \"Talk about life a little bit\", \"max_tokens\": 500}" | jq .
  curl -v http://$1:$2/api/v1/dev/apirouter/lb/aidocusearchapp -H "Content-Type: application/json" -d "{\"prompt\": \"Is the game of Cricket the same as Baseball or are they different?\", \"max_tokens\": 500}" | jq .
  curl -v http://$1:$2/api/v1/dev/apirouter/lb/aidocusearchapp -H "Content-Type: application/json" -d "{\"prompt\": \"Is Lionel Messi a better player than Killian MBappe?\", \"max_tokens\": 500}" | jq .
  curl -v http://$1:$2/api/v1/dev/apirouter/lb/aidocusearchapp -H "Content-Type: application/json" -d "{\"prompt\": \"Is Porsche a good brand?\", \"max_tokens\": 500}" | jq .
  #sleep 25
  curl -v http://$1:$2/api/v1/dev/apirouter/lb/aidocusearchapp -H "Content-Type: application/json" -d "{\"prompt\": \"What does the company ABB do?What business are they in?\", \"max_tokens\": 500}" | jq .
  curl -v http://$1:$2/api/v1/dev/apirouter/lb/aidocusearchapp -H "Content-Type: application/json" -d "{\"prompt\": \"Why did India and Pakistan split?\", \"max_tokens\": 500}" | jq .
  curl -v http://$1:$2/api/v1/dev/apirouter/lb/aidocusearchapp -H "Content-Type: application/json" -d "{\"prompt\": \"What is the major airline in Russia?\", \"max_tokens\": 500}" | jq .
  curl -v http://$1:$2/api/v1/dev/apirouter/lb/aidocusearchapp -H "Content-Type: application/json" -d "{\"prompt\": \"Was Ukraine part of the Soviet Union at one point? If so why are they now in a conflict?  Why is Ukraine saying they want to join NATO?\", \"max_tokens\": 500}" | jq .
  curl -v http://$1:$2/api/v1/dev/apirouter/lb/aidocusearchapp -H "Content-Type: application/json" -d "{\"prompt\": \"Why is US helping Ukraine fingt the war with Russia?\", \"max_tokens\": 500}" | jq .
  #sleep 25
  curl -v http://$1:$2/api/v1/dev/apirouter/lb/aidocusearchapp -H "Content-Type: application/json" -d "{\"prompt\": \"Who was the founder of Toyota company?\", \"max_tokens\": 500}" | jq .
  curl -v http://$1:$2/api/v1/dev/apirouter/lb/aidocusearchapp -H "Content-Type: application/json" -d "{\"prompt\": \"What is space?\", \"max_tokens\": 500}" | jq .
  curl -v http://$1:$2/api/v1/dev/apirouter/lb/aidocusearchapp -H "Content-Type: application/json" -d "{\"prompt\": \"Explain the game of Lacrosse\", \"max_tokens\": 500}" | jq .
  curl -v http://$1:$2/api/v1/dev/apirouter/lb/aidocusearchapp -H "Content-Type: application/json" -d "{\"prompt\": \"Name a hit of Lionel Ritchie\", \"max_tokens\": 500}" | jq .
  curl -v http://$1:$2/api/v1/dev/apirouter/lb/aidocusearchapp -H "Content-Type: application/json" -d "{\"prompt\": \"Fastest car in the world?\", \"max_tokens\": 500}" | jq .
  #sleep 20
  curl -v http://$1:$2/api/v1/dev/apirouter/lb/aidocusearchapp -H "Content-Type: application/json" -d "{\"prompt\": \"What does the company Siemens do? Do they have a presence in the US?\", \"max_tokens\": 500}" | jq .
  curl -v http://$1:$2/api/v1/dev/apirouter/lb/aidocusearchapp -H "Content-Type: application/json" -d "{\"prompt\": \"What's the history of Bangladesh\", \"max_tokens\": 500}" | jq .
  curl -v http://$1:$2/api/v1/dev/apirouter/lb/aidocusearchapp -H "Content-Type: application/json" -d "{\"prompt\": \"Who has the maximum nuclear stockpiles in the world?\", \"max_tokens\": 500}" | jq .
  curl -v http://$1:$2/api/v1/dev/apirouter/lb/aidocusearchapp -H "Content-Type: application/json" -d "{\"prompt\": \"Are palestinians harassed in Israel?\", \"max_tokens\": 500}" | jq .
  curl -v http://$1:$2/api/v1/dev/apirouter/lb/aidocusearchapp -H "Content-Type: application/json" -d "{\"prompt\": \"Which are the major countries in the middleeast?\", \"max_tokens\": 500}" | jq .
  echo "******* Made 50 API Calls *******"
  #sleep 25
  curl -v http://$1:$2/api/v1/dev/apirouter/lb/aidocusearchapp -H "Content-Type: application/json" -d "{\"prompt\": \"who is the largest online retailer in the world?\", \"max_tokens\": 500}" | jq .
  curl -v http://$1:$2/api/v1/dev/apirouter/lb/aidocusearchapp -H "Content-Type: application/json" -d "{\"prompt\": \"Top 10 billionaires\", \"max_tokens\": 500}" | jq .
  curl -v http://$1:$2/api/v1/dev/apirouter/lb/aidocusearchapp -H "Content-Type: application/json" -d "{\"prompt\": \"Which power steering fluid is used in 2008 Mazda Miata MX-5?\", \"max_tokens\": 500}" | jq .
  curl -v http://$1:$2/api/v1/dev/apirouter/lb/aidocusearchapp -H "Content-Type: application/json" -d "{\"prompt\": \"Name a hit song of Michael Jackson\", \"max_tokens\": 500}" | jq .
  curl -v http://$1:$2/api/v1/dev/apirouter/lb/aidocusearchapp -H "Content-Type: application/json" -d "{\"prompt\": \"Who sang the Fast car song?\", \"max_tokens\": 500}" | jq .
  #sleep 20
  curl -v http://$1:$2/api/v1/dev/apirouter/lb/aidocusearchapp -H "Content-Type: application/json" -d "{\"prompt\": \"Who won the grammy in 1989?\", \"max_tokens\": 500}" | jq .
  curl -v http://$1:$2/api/v1/dev/apirouter/lb/aidocusearchapp -H "Content-Type: application/json" -d "{\"prompt\": \"Who won the oscar for Platoon and in which year?\", \"max_tokens\": 500}" | jq .
  curl -v http://$1:$2/api/v1/dev/apirouter/lb/aidocusearchapp -H "Content-Type: application/json" -d "{\"prompt\": \"Who starred in Silence of the Lambs movie and won an Oscar?\", \"max_tokens\": 500}" | jq .
  curl -v http://$1:$2/api/v1/dev/apirouter/lb/aidocusearchapp -H "Content-Type: application/json" -d "{\"prompt\": \"Is half full and half empty the same?\", \"max_tokens\": 500}" | jq .
  curl -v http://$1:$2/api/v1/dev/apirouter/lb/aidocusearchapp -H "Content-Type: application/json" -d "{\"prompt\": \"Which countries are part of Scandinavia?\", \"max_tokens\": 500}" | jq .
  #sleep 25
  curl -v http://$1:$2/api/v1/dev/apirouter/lb/aidocusearchapp -H "Content-Type: application/json" -d "{\"prompt\": \"What's the function of a spark plug in a car?\", \"max_tokens\": 500}" | jq .
  curl -v http://$1:$2/api/v1/dev/apirouter/lb/aidocusearchapp -H "Content-Type: application/json" -d "{\"prompt\": \"What's the foundational principles of nuclear physics\", \"max_tokens\": 500}" | jq .
  curl -v http://$1:$2/api/v1/dev/apirouter/lb/aidocusearchapp -H "Content-Type: application/json" -d "{\"prompt\": \"State Newton's 3 laws\", \"max_tokens\": 500}" | jq .
  curl -v http://$1:$2/api/v1/dev/apirouter/lb/aidocusearchapp -H "Content-Type: application/json" -d "{\"prompt\": \"Who coined the term co-pilot in AI?\", \"max_tokens\": 500}" | jq .
  curl -v http://$1:$2/api/v1/dev/apirouter/lb/aidocusearchapp -H "Content-Type: application/json" -d "{\"prompt\": \"Describe fluid dynamics\", \"max_tokens\": 500}" | jq .
  #sleep 20
  curl -v http://$1:$2/api/v1/dev/apirouter/lb/aidocusearchapp -H "Content-Type: application/json" -d "{\"prompt\": \"What role did Ludacris play in fast and furious movies?\", \"max_tokens\": 500}" | jq .
  curl -v http://$1:$2/api/v1/dev/apirouter/lb/aidocusearchapp -H "Content-Type: application/json" -d "{\"prompt\": \"How many strands do electric guitars have?\", \"max_tokens\": 500}" | jq .
  curl -v http://$1:$2/api/v1/dev/apirouter/lb/aidocusearchapp -H "Content-Type: application/json" -d "{\"prompt\": \"Who invented the keyboard and mouse?\", \"max_tokens\": 500}" | jq .
  curl -v http://$1:$2/api/v1/dev/apirouter/lb/aidocusearchapp -H "Content-Type: application/json" -d "{\"prompt\": \"Summarize the last of the mohicans\", \"max_tokens\": 500}" | jq .
  curl -v http://$1:$2/api/v1/dev/apirouter/lb/aidocusearchapp -H "Content-Type: application/json" -d "{\"prompt\": \"Write a light weight http web server in Go language. The code should support Protobuf for input and output messages.\", \"max_tokens\": 500}" | jq .
  ((i++))
done
