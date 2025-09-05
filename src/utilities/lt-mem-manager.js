/**
 * Name: LongTermMemoryManager
 * Description: This script contains a set of functions for managing the lifecycle of long term memory for 
 * an AI Application.
 *
 * Author: Ganesh Radhakrishnan (ganrad01@gmail.com)
 * Date: 05-14-2025
 * Version (Introduced): 2.3.8
 *
 * Notes:
 *
*/
const path = require('path');
const scriptName = path.basename(__filename);
const logger = require('./logger');
const { MessageRoleTypes } = require('./app-gtwy-constants.js');

const DEF_FOLLOWUP_PROMPT = "\nAfter your response, suggest a couple of relevant questions to keep the conversation alive.";
// works: const DEF_EXTRACTION_PROMPT = "Extract pertinent info. or facts about the user's interests from the conversation.";

const DEF_EXTRACTION_PROMPT_USER = 
  "Glean and extract pertinent information or facts about the user from the 'Query'. Infer information such as user's topics of interest, hobbies, passions, demographics, skills, occupation or areas of expertise, life style indicators & any other useful contextual signals. Keep inferences **reasonable and grounded**, not speculative.";

const DEF_EXTRACTION_PROMPT_ASSISTANT =
  "From the AI Assistant's response, infer information about the user's interests, hobbies, passions, demographics, skills, occupation or areas of expertise, life style indicators & any other useful contextual signals. Keep inferences **reasonable and grounded**, not speculative.";

const DEF_EXTRACTION_PROMPT_UA = 
  `You are an AI assistant that extracts useful facts about a user from a chatbot interaction. Your goal is to infer the user’s interests, background, preferences, and demographics using both explicit and implicit cues.
Given a user message and a chatbot (assistant) reply, output an unordered list of facts about the user. Use clear, neutral language. Extract both clearly stated information and reasonable inferences based on context or repeated topics.

Guidelines for inference:
- If a user repeatedly asks about a topic (e.g., mountaineering, movies, sports, motorcycles, hiking), infer that they are interested in it.
- If they mention a specific region (e.g., Washington trails), infer a possible location or travel interest.
- If they ask detailed product or technical questions, infer some familiarity or expertise.
- Keep inferences **reasonable and grounded**, not speculative or overly personal.
Extract facts in these categories when possible:
- Interests or hobbies
- Location or likely region
- Technical familiarity or skills
- Occupation or area of expertise
- Preferred topics or products
- Personality traits (if strongly implied)
- Lifestyle indicators (e.g., travel, fitness)
- Any other useful contextual signals`;

// works: const EXTRACTION_PROMPT_SUFFIX = "\nIf no relevant information is found, return: 'No facts found'.\nOtherwise return the extracted facts as an unordered list.";
const EXTRACTION_PROMPT_SUFFIX = `\nOutput format: An unordered list using dashes (-). Each fact should be a single bullet point, phrased clearly and concisely. Avoid repetition. Do not include any commentary or explanation. If no facts can be extracted, output: "No extractable facts."`;

function getExtractionPrompt(user, userInput, assistantReply, userMemConfig) {
  const extPrompt = userMemConfig.extractionPrompt;

  let userObject;
  let systemObject;
  switch ( userMemConfig.extractRoles ) {
    case MessageRoleTypes.User:
      systemObject = {
        role: 'system',
        content: (!extPrompt || extPrompt.trim().length === 0) ? DEF_EXTRACTION_PROMPT_USER + EXTRACTION_PROMPT_SUFFIX : extPrompt + EXTRACTION_PROMPT_SUFFIX
      };
      userObject = 
        {
          role: 'user',
          content: `Query: ${userInput}`
        };
      break;
    case MessageRoleTypes.Assistant:
      systemObject = {
        role: 'system',
        content: (!extPrompt || extPrompt.trim().length === 0) ? DEF_EXTRACTION_PROMPT_ASSISTANT + EXTRACTION_PROMPT_SUFFIX : extPrompt + EXTRACTION_PROMPT_SUFFIX
      };
      userObject = 
        {
          role: 'user',
          content: `AI Assistant: ${assistantReply}`
        };
      break;
    case MessageRoleTypes.UserAssistant:
    default: // Default - UserAssistant
      systemObject = {
        role: 'system',
        content: (!extPrompt || extPrompt.trim().length === 0) ? DEF_EXTRACTION_PROMPT_UA + EXTRACTION_PROMPT_SUFFIX : extPrompt + EXTRACTION_PROMPT_SUFFIX
      };
      userObject = 
        {
          role: 'user',
          content: `Input:\nUser: ${userInput}\nAI Assistant: ${assistantReply}`
        };
      break;
  };

  return {
    messages: [
      systemObject,
      userObject
    ],
    max_tokens: 500,
    user: user,
  };
}

async function updateSystemMessage(req, appId, userMemConfig, userMemDao) {
  // Iterate thru the messages array and retrieve the user's query/prompt
  let userInput = req.body.messages.find(msg => msg.role === "user")?.content;

  const userFacts = await userMemDao.queryUserFactsFromDB(req, appId, userInput);
  if ( !userFacts || userFacts.errors )
    return;

  // Retrieve the system prompt
  let systemInput = req.body.messages.find(msg => msg.role === "system")?.content;
  let userPrompt = '';
  if ( userFacts.rCount >= 1 ) {
    // Retrieve user related facts for this AI Application
    const memory = userFacts.data.map(item => item.content).join('\n');;
    logger.log({ level: "info", message: "[%s] updateSystemMessage():\n  Request ID: %s\n  Application ID: %s\n  User Facts:\n%s", splat: [scriptName, req.id, appId, memory] });


    if ( !memory || (memory.length === 0) )
      return;

    // Retrieve the user facts to be added to the system prompt
    userPrompt = `Here is some background info (facts) about the user:\n${memory}`.trim();
    userPrompt += "\nUse only the facts that are directly relevant and necessary to provide an accurate and helpful response.";
    userPrompt += "Do not include or reference any user facts that are unrelated to the query. If no user-specific facts are";
    userPrompt += " relevant, respond as if you had no access to them. Always prioritize user intent and context over personalization.";
    userPrompt += "\n\nDo not respond to questions about personal information such as what do you know about me or what have you learnt about me.";
    userPrompt += "Politely say - My apologies but I am not at liberty of sharing personal information about you or others."
  };

  if ( userMemConfig.genFollowupMsgs ) // Should the LLM generate follow up questions?
    if ( userMemConfig.followupPrompt ) {
      userPrompt += "\n";
      userPrompt += userMemConfig.followupPrompt;
    }
    else
      userPrompt += DEF_FOLLOWUP_PROMPT;

  if ( !systemInput )
    systemInput = "You are a helpful assistant.\n" + userPrompt;
  else {
    systemInput += "\n";
    systemInput += userPrompt;
  };

  // Find the index of the system message
  const systemIndex = req.body.messages.findIndex(msg => msg.role === "system");

  // Update the content if found
  if ( systemIndex !== -1 )
    req.body.messages[systemIndex].content = systemInput;
  else
    req.body.messages.unshift({ role: "system", content: systemInput });

  logger.log({ level: "info", message: "[%s] updateSystemMessage():\n  Request ID: %s\n  Application ID: %s\n  Messages:\n%s", splat: [scriptName, req.id, appId, JSON.stringify(req.body.messages, null, 2)] });
}

async function storeUserFacts(req, appId, facts, userMemDao) {
  for ( const fact of facts )
    await userMemDao.storeUserFactInDB(req, appId, fact);
}

module.exports = {
  getExtractionPrompt,
  updateSystemMessage,
  storeUserFacts,
};