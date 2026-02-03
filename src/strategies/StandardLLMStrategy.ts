import { BaseChatStrategy } from "./BaseChatStrategy.js";
import OpenAI from "openai";
import { Message } from "../entities/Message.js";
import { globalLogger } from "../utils/logger.js";
import { Pinecone } from "@pinecone-database/pinecone";

const SYSTEM_PROMPT = `

You are a helpful chatbot for Emirates NBD that specializes in answering questions about the bank's credit cards. Your job is to give accurate, fact‑based, concise answers using only the information provided in the retrieved context (vector store, metadata, and linked documents). Do not invent information.

High‑level behavior
- You are focused on Emirates NBD credit cards only.
- You know card features, fees, eligibility, required documents, rewards programs, benefits, and linked PDFs or help pages.
- You always stay grounded in the provided context chunks and their URLs.
- If you do not have enough information in the retrieved context, say you are not sure and suggest what the customer can do next.

Tone and style
- Be friendly, clear, and straightforward.
- Use simple language. No flowery or fancy sentences.
- Keep answers as short as possible while still being complete.
- Use bullet points for lists (fees, benefits, required documents, steps, etc.).
- Do not repeat yourself. Do not add marketing fluff.

Using retrieved data
You will receive one or more "context chunks" with metadata for each user query. Each chunk may contain:
- text content (a piece of the page or document)
- metadata such as:
  - \`card_name\`
  - \`card_slug\`
  - \`card_id\`
  - \`chunk_type\` (examples: \`card_list\`, \`card_info\`, \`benefits_list\`, \`card_benefits_detail\`, \`requirements\`, \`important_links\`, \`pdf_manifest\`)
  - \`url\` (official card page or help page)
  - \`source_type\` (examples: \`db_cards\`, \`db_documents\`, \`ui_json\`)
  - \`source\`

General rules for grounding
1. Only use facts that appear in the context. Do not guess or invent numbers, limits, or conditions.
2. If two chunks conflict, prefer:
   - Newer / more specific card‑level chunks over generic ones.
   - \`requirements\` or \`card_info\` chunks for documents/eligibility.
   - \`card_benefits_detail\` or \`benefits_list\` for benefits/rewards.
3. Always keep the answer consistent with the metadata:
   - If you mention a card, use its \`card_name\` from metadata.
   - If you summarize a benefit or document, ensure it exists in the text you see.

Card‑specific handling
When the user clearly mentions a specific card (by name, partial name, or slug), you must:
1. Identify the target card (for example: "SHARE Visa Infinite Credit Card" → \`card_slug = share-visa-infinite-credit-card\`).
2. Prefer or restrict your reasoning to chunks where:
   - \`card_slug\` matches the target card, or
   - \`card_name\` matches the target card, or
   - the chunk clearly refers to that card in its text.
3. Ignore chunks about other cards, even if their similarity score is higher.
4. If you see multiple SHARE variants (Infinite, Signature, Platinum), make sure you pick the one that matches exactly what the user asked for.

Examples of card‑specific questions:
- "Documents required to apply for SHARE Visa Infinite Credit Card"
- "Does Voyager World Elite have airport transfers?"
- "Annual fee of Manchester United Credit Card"

For these questions:
- Use \`requirements\` chunks for "documents required", "eligibility", "what documents do I need", etc.
- Use \`card_info\`, \`benefits_list\`, and \`card_benefits_detail\` for features, rewards, and benefits.

Comparisons between cards
If the user asks to compare cards (for example, "Voyager World Elite vs dnata World"):
1. Identify each requested card.
2. For each card, pull facts from its own chunks only.
3. Present the comparison clearly, usually as:
   - A short intro.
   - Then bullet lists under each card name.
4. If you do not have enough data for one of the cards, say that openly.

Handling URLs and linked PDFs
Some chunks will include URLs to PDFs or help pages in:
- \`url\`
- \`important_links\`
- text that references terms like "Key Facts Statement (KFS)", "Fees and charges", "Terms and Conditions".

Rules:
1. Treat these URLs as trusted sources that you "know". If the text clearly describes what the linked document contains, you can summarize that description.
2. You cannot see the full PDF content unless it is already included in the provided text. Do not make up details that are not shown to you.
3. When relevant, tell the user that a more detailed document is available and provide the URL you see in the context. Example:
   - "You can find the full Key Facts Statement here: <URL from context>."
4. If a question clearly needs detailed legal wording or full terms, and you only see a link, say something like:
   - "For full legal terms, please read the Key Facts Statement at this link: <URL>."

Chunk‑type–specific behavior
- \`card_list\`:
  - Use when the user wants an overview of all cards or wants to know what cards exist.
  - Give a short list of card names, not the full raw list, unless explicitly asked.
- \`card_info\`:
  - Use for summaries: card type, annual fee, minimum salary, basic positioning.
- \`benefits_list\`:
  - Use for a short bullet list of benefit titles.
- \`card_benefits_detail\`:
  - Use to explain what each benefit actually offers, including coverage, conditions, or limits when they are explicitly written.
- \`requirements\`:
  - Use for questions about required documents, eligibility criteria, or application checklists.
- \`important_links\`:
  - Use to answer questions like "where can I find the KFS / fee sheet / terms and conditions".
  - Provide the URLs and briefly describe each link.
- \`pdf_manifest\`:
  - Use to let the user know which PDFs are available for that card and what they are called.

When information is missing
If the context does not contain the answer:
- Be honest and say you do not have that detail.
- Offer a helpful next step, such as:
  - Visit the card's official page (if you have the \`url\`).
  - Review the KFS or Terms and Conditions PDF (if you have the link).
Use wording like:
- "I don't have that exact detail in my data."
- "Please check the Key Facts Statement at this link for the latest information: <URL>."

Safety and scope
- Do not give personal financial advice, only describe features, fees, and requirements.
- Do not guess about future changes, promotions, or internal bank decisions.
- If a question is outside Emirates NBD credit cards (for example, other banks, investments, politics), briefly say it is out of scope and guide the user back to card‑related topics.

### Very Important ###
Citations and links:

-When you use information from a context chunk, and that chunk has a url in its metadata, include that URL in your answer so the user can verify or read more.

-If multiple chunks for the same card share the same url, you only need to mention that URL once in the answer (for example: at the end as “Official card page: ”).

-When you summarize something that comes from a specific linked PDF or help page listed in important_links, mention its title and URL (for example: “Key Facts Statement (KFS): ”).

-Do not invent URLs. Only use URLs you actually see in the metadata or context text.

Use the retrieved content only as reference.
Write a concise, original answer in your own words.
Do not copy bullet lists verbatim; summarize them in 3–5 sentences.



### End of System Prompt ###
Answer format

-Start with 1–2 short sentences that directly answer the user’s question.

-Follow with concise bullet points for details (fees, benefits, documents, steps, etc.).

-For a single card, put the card name as a short heading or lead‑in, then list its details underneath.

-For comparisons, group bullets under each card name so it’s easy to scan the differences.

-When you state a fact that comes from a context chunk with a url, mention that URL close to where the fact is used (for example: “Official card page: <url>” or “KFS: <url>”) so the user can verify the information.


Always remember: you are a friendly, factual assistant focused on Emirates NBD credit cards, grounded strictly in the retrieved content and connected URLs.
`;

export class StandardLLMStrategy extends BaseChatStrategy {
  private openai: OpenAI;
  private pinecone: any;
  private pineconeIndex: any;

  constructor(userId: string, memory: Message[], dbSession: any) {
    super(userId, memory, dbSession);
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    try {
      this.pinecone = new Pinecone({
        apiKey: process.env.PINECONE_API_KEY!,
      });
      this.pineconeIndex = this.pinecone.index("credit-card").namespace("");
      globalLogger.info("Pinecone client initialized successfully");
    } catch (error) {
      globalLogger.error("Failed to initialize Pinecone client", {
        error: (error as Error).message,
      });
      throw error;
    }
  }

  /**
   * Step 1: Detect card name/slug from user query using LLM
   */
  private async detectCard(query: string): Promise<{
    cardName?: string;
    cardSlug?: string;
    chunkType?: string;
  } | null> {
    try {
      globalLogger.info("Detecting card from query", { query });

      const detectionPrompt = `You are a card detection assistant for Emirates NBD credit cards.

Your task: Analyze the user's query and extract:
1. The specific credit card name mentioned (if any)
2. The card slug (kebab-case version of the name)
3. The type of information being requested (chunk_type)

Common card names include:
- Voyager World Elite Credit Card → voyager-world-elite-credit-card
- SHARE Visa Infinite Credit Card → share-visa-infinite-credit-card
- SHARE Visa Signature Credit Card → share-visa-signature-credit-card
- SHARE Visa Platinum Credit Card → share-visa-platinum-credit-card
- Skywards Infinite Credit Card → skywards-infinite-credit-card
- Skywards Signature Credit Card → skywards-signature-credit-card
- Manchester United Credit Card → manchester-united-credit-card
- Darna Visa Infinite Credit Card → darna-visa-infinite-credit-card
- Darna Visa Signature Credit Card → darna-visa-signature-credit-card
- Darna Select Visa Credit Card → darna-select-visa-credit-card
- U by Emaar Infinite Credit Card → u-by-emaar-infinite-credit-card
- U by Emaar Signature Credit Card → u-by-emaar-signature-credit-card
- Etihad Guest Visa Inspire → etihad-guest-visa-inspire
- Etihad Guest Visa Elevate → etihad-guest-visa-elevate
- dnata World Credit Card → dnata-world-credit-card
- dnata Platinum Credit Card → dnata-platinum-credit-card

Chunk types based on query intent:
- "documents required", "eligibility", "what documents" → requirements
- "links", "KFS", "fees and charges PDF", "terms and conditions" → important_links
- "key features", "annual fee", "minimum salary", "basic info" → card_info
- "benefits", "rewards", "coverage", "insurance" → card_benefits_detail or benefits_list
- "list all cards", "all cards" → card_list

Respond in JSON format only:
{
  "cardName": "Full Card Name" or null,
  "cardSlug": "kebab-case-slug" or null,
  "chunkType": "chunk_type" or null
}

User query: "${query}"`;

      const response = await this.openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: detectionPrompt }],
        temperature: 0,
        max_tokens: 150,
      });

      const content = response.choices[0]?.message?.content?.trim();
      if (!content) {
        globalLogger.warn("No card detection response from LLM");
        return null;
      }

      // Parse JSON response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        globalLogger.warn(
          "Could not extract JSON from card detection response",
          { content },
        );
        return null;
      }

      const detected = JSON.parse(jsonMatch[0]);
      globalLogger.info("Card detection result", { detected });

      // Return null if no card detected
      if (!detected.cardName && !detected.cardSlug && !detected.chunkType) {
        return null;
      }

      return {
        cardName: detected.cardName || undefined,
        cardSlug: detected.cardSlug || undefined,
        chunkType: detected.chunkType || undefined,
      };
    } catch (error) {
      globalLogger.error("Failed to detect card from query", {
        error: (error as Error).message,
        query,
      });
      return null;
    }
  }

  /**
   * Extract card names from content (used for card_list chunks)
   */
  private extractCardNames(content: string): string[] {
    const cardNames: string[] = [];
    // Look for lines that start with "- " followed by card name
    const lines = content.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
        const cardName = trimmed.substring(2).trim();
        if (cardName && cardName.length > 5) { // Filter out very short names
          cardNames.push(cardName);
        }
      }
    }
    return cardNames;
  }

  /**
   * Fetch URLs for specific card names
   */
  private async fetchCardUrls(
    cardNames: string[],
    embedding: number[],
  ): Promise<Map<string, string>> {
    const cardUrlMap = new Map<string, string>();
    
    globalLogger.info("Fetching URLs for card names", { 
      count: cardNames.length,
      cardNames: cardNames.slice(0, 5), // Log first 5 to avoid clutter
    });

    for (const cardName of cardNames) {
      try {
        // Generate card slug from name
        const cardSlug = cardName
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '');

        // Query for card_info with this slug to get URL
        const filter = {
          $and: [{ card_slug: cardSlug }, { chunk_type: "card_info" }],
        };

        const queryResponse = await this.pineconeIndex.query({
          vector: embedding,
          topK: 1,
          includeMetadata: true,
          filter,
        });

        if (queryResponse.matches && queryResponse.matches.length > 0) {
          const match = queryResponse.matches[0];
          const url = match.metadata?.url;
          if (url) {
            cardUrlMap.set(cardName, url as string);
            globalLogger.info(`Found URL for card: ${cardName}`, { url });
          }
        }
      } catch (error) {
        globalLogger.warn(`Failed to fetch URL for card: ${cardName}`, {
          error: (error as Error).message,
        });
      }
    }

    return cardUrlMap;
  }

  /**
   * Check if query needs important_links (KFS, PDFs, terms, etc.)
   */
  private needsImportantLinks(query: string): boolean {
    const linksKeywords = [
      "kfs",
      "key facts statement",
      "fees",
      "charges",
      "terms",
      "conditions",
      "pdf",
      "document",
      "full details",
      "link",
      "where can i find",
      "download",
      "statement",
      "agreement",
    ];

    const lowerQuery = query.toLowerCase();
    return linksKeywords.some((keyword) => lowerQuery.includes(keyword));
  }

  /**
   * Per-type top-K retrieval: Query Pinecone separately for each chunk type
   */
  private async fetchContextPerType(
    query: string,
    cardSlug: string,
  ): Promise<{ context: string; matchCount: number; links: string[] }> {
    try {
      globalLogger.info("Starting per-type retrieval", { query, cardSlug });

      // Generate embedding once for all queries
      const embeddingResponse = await this.openai.embeddings.create({
        model: "text-embedding-3-small",
        input: [query],
        dimensions: 512,
      });

      const embedding = embeddingResponse.data[0].embedding;
      globalLogger.info("Embedding generated for per-type queries", {
        embeddingLength: embedding.length,
      });

      // Define the base chunk types we always want to query
      const chunkTypes = ["card_info", "benefits_list", "card_benefits_detail"];

      // Check if we should also query for important_links
      const shouldFetchLinks = this.needsImportantLinks(query);
      if (shouldFetchLinks) {
        chunkTypes.push("important_links");
        globalLogger.info(
          "Query contains link-related keywords, will fetch important_links",
        );
      } else {
        globalLogger.info("Query does not need important_links, skipping");
      }

      const allMatches: any[] = [];
      const matchesByType: Record<string, number> = {};
      const allLinks = new Set<string>();

      // Run separate query for each chunk type
      for (const chunkType of chunkTypes) {
        const filter = {
          $and: [{ card_slug: cardSlug }, { chunk_type: chunkType }],
        };

        try {
          const queryResponse = await this.pineconeIndex.query({
            vector: embedding,
            topK: 1,
            includeMetadata: true,
            filter,
          });

          const matches = queryResponse.matches || [];
          matchesByType[chunkType] = matches.length;

          if (matches.length > 0) {
            allMatches.push(...matches);
            globalLogger.info(
              `Query for ${chunkType} returned ${matches.length} match(es)`,
              {
                chunkType,
                matchCount: matches.length,
                firstMatch: matches[0]
                  ? {
                      id: matches[0].id,
                      score: matches[0].score,
                      contentPreview: matches[0].metadata?.content
                        ? String(matches[0].metadata.content).substring(0, 100)
                        : "N/A",
                    }
                  : null,
              },
            );

            // Extract links from all chunks
            for (const match of matches) {
              if (match.metadata?.url) {
                allLinks.add(match.metadata.url);
              }
            }
          } else {
            globalLogger.info(`Query for ${chunkType} returned 0 matches`, {
              chunkType,
            });
          }
        } catch (error) {
          globalLogger.error(`Failed to query for ${chunkType}`, {
            error: (error as Error).message,
            chunkType,
          });
        }
      }

      globalLogger.info("Per-type retrieval summary", {
        totalMatches: allMatches.length,
        matchesByType,
        uniqueLinks: allLinks.size,
        queriedImportantLinks: shouldFetchLinks,
      });

      // Deduplicate by id
      const seenIds = new Set<string>();
      const uniqueMatches = allMatches.filter((match) => {
        if (seenIds.has(match.id)) {
          return false;
        }
        seenIds.add(match.id);
        return true;
      });

      // Sort by score descending
      uniqueMatches.sort((a, b) => b.score - a.score);

      // Build context string
      const contextChunks: string[] = [];

      for (const match of uniqueMatches) {
        const metadata = match.metadata as any;

        // Log what we're including
        globalLogger.info("Including chunk in context", {
          id: match.id,
          score: match.score,
          card_slug: metadata.card_slug,
          chunk_type: metadata.chunk_type,
          contentPreview: metadata.content
            ? String(metadata.content).substring(0, 100) + "..."
            : "N/A",
        });

        // Special formatting for important_links
        if (metadata.chunk_type === "important_links") {
          const linksContent = metadata.content || "";
          const chunkText = `
Chunk ID: ${match.id}
Score: ${match.score}
Card Name: ${metadata.card_name || "N/A"}
Card Slug: ${metadata.card_slug || "N/A"}
Chunk Type: important_links
Source Type: ${metadata.source_type || "N/A"}

Important Links and Documents:
${linksContent}
---
`;
          contextChunks.push(chunkText);
        } else {
          // Standard formatting for other chunk types
          const chunkText = `
Chunk ID: ${match.id}
Score: ${match.score}
Card Name: ${metadata.card_name || "N/A"}
Card Slug: ${metadata.card_slug || "N/A"}
Chunk Type: ${metadata.chunk_type || "N/A"}
Source Type: ${metadata.source_type || "N/A"}
URL: ${metadata.url || "N/A"}
Content: ${metadata.content || "N/A"}
---
`;
          contextChunks.push(chunkText);
        }
      }

      // Add all collected links summary at the end (for additional reference)
      if (allLinks.size > 0) {
        contextChunks.push(
          `\nAdditional Relevant URLs:\n${Array.from(allLinks).join("\n")}\n---\n`,
        );
      }

      const finalContext = contextChunks.join("\n");
      const matchCount = uniqueMatches.length;

      globalLogger.info("Per-type context build completed", {
        contextLength: finalContext.length,
        numberOfChunks: uniqueMatches.length,
        matchCount,
      });

      return {
        context: finalContext,
        matchCount,
        links: Array.from(allLinks),
      };
    } catch (error) {
      globalLogger.error("Failed per-type context fetch", {
        error: (error as Error).message,
        stack: (error as Error).stack,
      });
      return { context: "", matchCount: 0, links: [] };
    }
  }

  /**
   * Fallback: Broad query without filters
   */
  private async fetchContextBroad(
    query: string,
    topK: number = 10,
  ): Promise<{ context: string; matchCount: number }> {
    try {
      globalLogger.info("Starting broad context fetch (no filter)", {
        query,
        topK,
      });

      // Generate embedding for the query
      const embeddingResponse = await this.openai.embeddings.create({
        model: "text-embedding-3-small",
        input: [query],
        dimensions: 512,
      });

      const embedding = embeddingResponse.data[0].embedding;

      // Query Pinecone without filter
      const queryResponse = await this.pineconeIndex.query({
        vector: embedding,
        topK,
        includeMetadata: true,
      });

      globalLogger.info("Broad Pinecone query completed", {
        matchCount: queryResponse.matches?.length || 0,
      });

      // Log detailed match information
      if (queryResponse.matches && queryResponse.matches.length > 0) {
        globalLogger.info("Retrieved matches from broad query:", {
          matches: queryResponse.matches.map((match: any) => ({
            id: match.id,
            score: match.score,
            card_name: match.metadata?.card_name || "N/A",
            card_slug: match.metadata?.card_slug || "N/A",
            chunk_type: match.metadata?.chunk_type || "N/A",
            text_preview: match.metadata?.content
              ? String(match.metadata.content).substring(0, 100) + "..."
              : "N/A",
          })),
        });
      }

      // Format the context chunks
      const contextChunks: string[] = [];

      for (const match of queryResponse.matches || []) {
        const metadata = match.metadata as any;
        const chunkText = `
Chunk ID: ${match.id}
Score: ${match.score}
Card Name: ${metadata.card_name || "N/A"}
Card Slug: ${metadata.card_slug || "N/A"}
Chunk Type: ${metadata.chunk_type || "N/A"}
Source Type: ${metadata.source_type || "N/A"}
URL: ${metadata.url || "N/A"}
Content: ${metadata.content || "N/A"}
---
`;
        contextChunks.push(chunkText);
      }

      const finalContext = contextChunks.join("\n");
      const matchCount = queryResponse.matches?.length || 0;

      globalLogger.info("Broad context fetch completed", {
        contextLength: finalContext.length,
        numberOfChunks: contextChunks.length,
        matchCount,
      });

      return { context: finalContext, matchCount };
    } catch (error) {
      globalLogger.error("Failed to fetch broad context from Pinecone", {
        error: (error as Error).message,
        stack: (error as Error).stack,
      });
      return { context: "", matchCount: 0 };
    }
  }

  /**
   * Build Pinecone filter based on detected card and chunk type
   */
  private buildPineconeFilter(detected: {
    cardName?: string;
    cardSlug?: string;
    chunkType?: string;
  }): Record<string, any> | undefined {
    const conditions: any[] = [];

    // Add card filter (prefer card_slug)
    if (detected.cardSlug) {
      conditions.push({ card_slug: detected.cardSlug });
    } else if (detected.cardName) {
      conditions.push({ card_name: detected.cardName });
    }

    // Add chunk type filter
    if (detected.chunkType) {
      conditions.push({ chunk_type: detected.chunkType });
    }

    // Return combined filter
    if (conditions.length === 0) {
      return undefined;
    } else if (conditions.length === 1) {
      return conditions[0];
    } else {
      return { $and: conditions };
    }
  }

  async *generateResponse(
    userQuery: string,
  ): AsyncGenerator<string, void, unknown> {
    try {
      // Signal start
      yield "[CALL_TO]\n\n";
      yield "data: STANDARD_STRATEGY\n\n";

      // STEP 1: Detect card from user query
      const detected = await this.detectCard(userQuery);

      let context = "";
      let matchCount = 0;

      if (detected && detected.cardSlug) {
        // STEP 2a: Use per-type retrieval for detected card
        globalLogger.info("Using per-type retrieval for detected card", {
          cardSlug: detected.cardSlug,
          detected,
        });

        const result = await this.fetchContextPerType(
          userQuery,
          detected.cardSlug,
        );
        context = result.context;
        matchCount = result.matchCount;

        // STEP 2b: Fallback to broad query if no results from per-type queries
        if (matchCount === 0) {
          globalLogger.warn(
            "Per-type queries returned 0 total matches, falling back to broad query",
            {
              cardSlug: detected.cardSlug,
            },
          );
          const broadResult = await this.fetchContextBroad(userQuery, 10);
          context = broadResult.context;
          matchCount = broadResult.matchCount;
        } else {
          globalLogger.info("Per-type retrieval successful", {
            matchCount,
            contextLength: context.length,
          });
        }
      } else {
        // STEP 2c: No card detected or no slug, use broad query
        globalLogger.info("No card slug detected, using broad query");
        const result = await this.fetchContextBroad(userQuery, 10);
        context = result.context;
        matchCount = result.matchCount;
      }

      // Log if context is empty
      if (!context || context.trim() === "") {
        globalLogger.warn("No context retrieved from Pinecone", { userQuery });
      }

      // Build system prompt with context
      const systemPromptWithContext = `${SYSTEM_PROMPT}\n\nRetrieved Context:\n${context}`;

      // Log the full system prompt to verify context is included
      globalLogger.info("System prompt prepared", {
        systemPromptLength: systemPromptWithContext.length,
        contextIncluded: context.length > 0,
        contextPreview: context.substring(0, 500) + "...",
      });

      // Build messages
      const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
        { role: "system", content: systemPromptWithContext },
      ];

      // Add conversation history
      // Note: The current user message is already in 'this.memory' because ChatOrchestrator saves it before calling this strategy.

      for (const msg of this.memory) {
        messages.push({
          role: msg.sender === "user" ? "user" : "assistant",
          content: msg.content,
        });
      }

      globalLogger.debug("Sending messages to OpenAI", {
        messageCount: messages.length,
        conversationId:
          this.memory.length > 0 ? this.memory[0].conversationId : "unknown",
        systemPromptLength: messages[0].content
          ? String(messages[0].content).length
          : 0,
        memoryLength: this.memory.length,
        lastUserMessage:
          this.memory.length > 0
            ? this.memory[this.memory.length - 1].content
            : "N/A",
      });

      // Stream from OpenAI with timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 seconds timeout

      const stream = await this.openai.chat.completions.create(
        {
          model: "gpt-4o",
          messages,
          stream: true,
          max_tokens: 500,
        },
        { signal: controller.signal },
      );

      try {
        for await (const chunk of stream) {
          const content = chunk.choices[0]?.delta?.content;
          if (content) {
            yield `data: ${content}\n\n`;
          }
        }
        clearTimeout(timeoutId);
      } catch (error: any) {
        clearTimeout(timeoutId);
        if (error.name === "AbortError") {
          throw new Error("Request timed out");
        }
        throw error;
      }

      // Signal completion
      yield "[DONE]\n\n";
    } catch (error: any) {
      globalLogger.error("OpenAI API error", {
        error: error.message,
        status: error.status,
        code: error.code,
      });
      let errorMessage = "Failed to generate response. Please try again.";
      if (error?.status === 429) {
        errorMessage = "Rate limit exceeded. Please wait and try again.";
      } else if (error?.status === 401) {
        errorMessage = "Invalid API key. Please check your configuration.";
      } else if (error?.code === "ECONNRESET" || error?.code === "ETIMEDOUT") {
        errorMessage = "Request timed out. Please try again.";
      }
      yield "[ERROR]\n\n";
      yield `data: ${JSON.stringify({ message: errorMessage })}\n\n`;
      yield "[DONE]\n\n";
    }
  }
}
