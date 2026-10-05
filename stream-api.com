https://github.com/openai/openai-node/issues/18

// https://2ality.com/2018/04/async-iter-nodejs.html#generator-%231%3A-from-chunks-to-lines
async function* chunksToLines(chunksAsync) {
  let previous = "";
  for await (const chunk of chunksAsync) {
    const bufferChunk = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    previous += bufferChunk;
    let eolIndex;
    while ((eolIndex = previous.indexOf("\n")) >= 0) {
      // line includes the EOL
      const line = previous.slice(0, eolIndex + 1).trimEnd();
      if (line === "data: [DONE]") break;
      if (line.startsWith("data: ")) yield line;
      previous = previous.slice(eolIndex + 1);
    }
  }
}

async function* linesToMessages(linesAsync) {
  for await (const line of linesAsync) {
    const message = line.substring("data :".length);

    yield message;
  }
}

async function* streamCompletion(data) {
  yield* linesToMessages(chunksToLines(data));
}

try {
  const completion = await openai.createCompletion(
    {
      model: "text-davinci-003",
      max_tokens: 100,
      prompt: "It was the best of times",
      stream: true,
    },
    { responseType: "stream" }
  );

  for await (const message of streamCompletion(completion.data)) {
    try {
      const parsed = JSON.parse(message);
      const { text } = parsed.choices[0];

      process.stdout.write(text);
    } catch (error) {
      console.error("Could not JSON parse stream message", message, error);
    }
  }

  process.stdout.write("\n");
} catch (error) {
  if (error.response?.status) {
    console.error(error.response.status, error.message);

    for await (const data of error.response.data) {
      const message = data.toString();

      try {
        const parsed = JSON.parse(message);

        console.error("An error occurred during OpenAI request: ", parsed);
      } catch (error) {
        console.error("An error occurred during OpenAI request: ", message);
      }
    }
  } else {
    console.error("An error occurred during OpenAI request", error);
  }
}

		/* const parsedLines = lines.foreach((line) => {
		  let retArray = new Array();
		  line = line.replace(/^data: /,"").trim();
		  if ( (line !== "") && (line !== "[Done]") ) {
		    console.log(`Chunk Count: ${chunkCount}; Line: ${line}`);
		    retArray.push(JSON.parse(line));
		  };
		  return(retArray);
		}); */
