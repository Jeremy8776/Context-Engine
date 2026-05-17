// @ts-check

const { checkOllamaEmbeddings, DEFAULT_EMBED_MODEL } = require('../server/lib/embeddings');

checkOllamaEmbeddings({ timeoutMs: 1000 })
  .then((result) => {
    if (result.ok) {
      console.log(`ollama embeddings ok: ${result.model}`);
      return;
    }
    console.log(`ollama embeddings unavailable: ${result.error || DEFAULT_EMBED_MODEL}`);
  })
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
